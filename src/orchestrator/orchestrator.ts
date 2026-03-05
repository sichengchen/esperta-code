import type { Database } from "../db/database.ts";
import type { AgentAdapter } from "../agents/adapter.ts";
import type { RepoConfig, PipelineDefinition } from "../config/types.ts";
import { PipelineExecutor } from "../pipeline/executor.ts";
import { ContextAssembler } from "../context/assembler.ts";
import { canTransition, nextStateForNewIssue } from "./state-machine.ts";
import { renderTemplate } from "../config/template.ts";
import { newId } from "../id.ts";
import type { OrchestrationState, WorkItem } from "../domain/types.ts";

const MAX_RETRY_BACKOFF_MS = 300000;
const DEFAULT_MAX_RETRIES = 3;
const TERMINAL_STATES: OrchestrationState[] = ["completed", "failed", "cancelled"];

export class Orchestrator {
  private db: Database;
  private adapters: Record<string, AgentAdapter>;
  private repoConfig: RepoConfig;
  private scratchpadRoot: string;
  private maxConcurrent: number;

  constructor(
    db: Database,
    adapters: Record<string, AgentAdapter>,
    repoConfig: RepoConfig,
    scratchpadRoot: string,
    maxConcurrent: number
  ) {
    this.db = db;
    this.adapters = adapters;
    this.repoConfig = repoConfig;
    this.scratchpadRoot = scratchpadRoot;
    this.maxConcurrent = maxConcurrent;
  }

  processNewIssue(workItemId: string): void {
    const wi = this.db.getWorkItem(workItemId);
    if (!wi || wi.orchestration_state !== "unclaimed") return;

    const isLargeFeature = wi.labels.includes("epic");
    const nextState = nextStateForNewIssue(
      this.repoConfig.specs.enabled,
      isLargeFeature
    );

    this.transition(wi, nextState);
  }

  async dispatchQueued(
    projectId: string,
    pipeline: PipelineDefinition,
    workDir: string
  ): Promise<string[]> {
    const running = this.db.countRunningItems();
    if (running >= this.maxConcurrent) return [];

    const available = this.maxConcurrent - running;
    const queued = this.db.listWorkItemsByState(projectId, "queued");

    // Filter out items with non-terminal blockers
    const eligible = queued.filter((wi) => this.areBlockersResolved(wi));

    const toDispatch = eligible.slice(0, available);
    const dispatched: string[] = [];

    for (const wi of toDispatch) {
      await this.executeWorkItem(wi, pipeline, workDir);
      dispatched.push(wi.id);
    }

    return dispatched;
  }

  checkParentCompletion(parentWorkItemId: string): void {
    const parent = this.db.getWorkItem(parentWorkItemId);
    if (!parent) return;

    // Only check parents that are in decompose_review state
    if (parent.orchestration_state !== "decompose_review") return;

    const children = this.db.listChildWorkItems(parentWorkItemId);
    if (children.length === 0) return;

    // All children must be in "completed" state
    const allCompleted = children.every(
      (child) => child.orchestration_state === "completed"
    );

    if (allCompleted) {
      this.db.updateWorkItemOrchestrationState(parent.id, "completed");
      this.db.appendHistory({
        id: newId(),
        project_id: parent.project_id,
        work_item_id: parent.id,
        run_id: null,
        event_type: "parent.auto_completed",
        payload: {
          child_count: children.length,
          child_ids: children.map((c) => c.id),
        },
      });
    }
  }

  cancelWorkItem(workItemId: string): void {
    const wi = this.db.getWorkItem(workItemId);
    if (!wi) return;
    this.transition(wi, "cancelled");
  }

  computeRetryDelay(attempt: number): number {
    const baseDelay = 10000 * Math.pow(2, attempt - 1);
    const delay = Math.min(baseDelay, MAX_RETRY_BACKOFF_MS);
    const jitter = Math.random() * 2000;
    return delay + jitter;
  }

  private areBlockersResolved(wi: WorkItem): boolean {
    if (wi.blocker_ids.length === 0) return true;

    for (const blockerId of wi.blocker_ids) {
      const blocker = this.db.getWorkItem(blockerId);
      if (!blocker) continue; // unknown blocker, treat as resolved
      if (!TERMINAL_STATES.includes(blocker.orchestration_state)) {
        return false;
      }
    }
    return true;
  }

  private async executeWorkItem(
    wi: WorkItem,
    pipeline: PipelineDefinition,
    workDir: string
  ): Promise<void> {
    this.transition(wi, "running");

    const contextAssembler = new ContextAssembler(this.db, this.scratchpadRoot);
    const context = contextAssembler.assemble(
      wi.project_id,
      wi.id,
      workDir
    );
    const snapshotId = contextAssembler.createSnapshot("", wi.id, context);

    const latestRun = this.db.getLatestRunForWorkItem(wi.id);
    const attempt = latestRun ? latestRun.attempt + 1 : 1;

    const runId = newId();
    this.db.insertRun({
      id: runId,
      work_item_id: wi.id,
      attempt,
      current_phase: pipeline.phases[0]?.name ?? "",
      current_step: pipeline.phases[0]?.steps[0]?.name ?? "",
      context_snapshot_id: snapshotId,
    });

    this.db.appendHistory({
      id: newId(),
      project_id: wi.project_id,
      work_item_id: wi.id,
      run_id: runId,
      event_type: "run.started",
      payload: { attempt, agent_adapter: this.repoConfig.agent.adapter },
    });

    const executor = new PipelineExecutor(
      this.db,
      this.adapters,
      {
        approval_policy: this.repoConfig.agent.approval_policy,
        timeout_ms: this.repoConfig.agent.timeout_ms,
        max_turns: this.repoConfig.agent.max_turns,
      },
      {
        before_run: this.repoConfig.hooks.before_run,
        after_run: this.repoConfig.hooks.after_run,
      }
    );
    const result = await executor.execute({
      runId,
      workDir,
      pipeline,
      promptRenderer: (phaseName, stepName, cycle) => {
        return renderTemplate("{{ issue.title }}\n{{ issue.description }}", {
          project: { name: wi.project_id },
          issue: {
            identifier: wi.linear_identifier,
            title: wi.title,
            description: wi.description,
            labels: wi.labels,
            priority: wi.priority,
          },
          phase: { name: phaseName },
          step: { name: stepName },
          cycle: cycle > 1 ? cycle : null,
          attempt: attempt > 1 ? attempt : null,
        });
      },
      onBuiltin: async (name) => {
        if (name === "publish") {
          return true;
        }
        return false;
      },
    });

    if (result.success) {
      this.db.updateRunResult(runId, "succeeded", null, null);
      this.db.appendHistory({
        id: newId(),
        project_id: wi.project_id,
        work_item_id: wi.id,
        run_id: runId,
        event_type: "run.completed",
        payload: { result: "succeeded" },
      });
      const updatedWi = this.db.getWorkItem(wi.id)!;
      this.transition(updatedWi, "completed");
    } else {
      this.db.updateRunResult(
        runId,
        "failed",
        result.failureReason ?? "Unknown failure",
        null
      );
      this.db.appendHistory({
        id: newId(),
        project_id: wi.project_id,
        work_item_id: wi.id,
        run_id: runId,
        event_type: "run.failed",
        payload: {
          failure_reason: result.failureReason,
          attempt,
        },
      });

      const updatedWi = this.db.getWorkItem(wi.id)!;
      if (attempt < DEFAULT_MAX_RETRIES) {
        this.transition(updatedWi, "retry_queued");
      } else {
        this.transition(updatedWi, "failed");
      }
    }
  }

  private transition(wi: WorkItem, to: OrchestrationState): void {
    if (!canTransition(wi.orchestration_state, to)) {
      throw new Error(
        `Invalid transition: ${wi.orchestration_state} → ${to} for work item ${wi.id}`
      );
    }
    this.db.updateWorkItemOrchestrationState(wi.id, to);
  }
}
