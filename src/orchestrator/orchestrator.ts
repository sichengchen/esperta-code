import type { AgentAdapter } from "../agents/adapter.ts";
import type { RepoConfig, PipelineDefinition, PipelineStep } from "../config/types.ts";
import type { Database } from "../db/database.ts";
import type { Thread } from "../domain/types.ts";
import { PipelineExecutor } from "../pipeline/executor.ts";
import { renderTemplate } from "../config/template.ts";
import { newId } from "../id.ts";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PRIMARY_CLI_NAME } from "../branding.ts";

const TERMINAL_THREAD_STATUSES = ["completed", "failed", "stopped"];

interface WorkspaceRuntime {
  createWorktree?: (
    projectName: string,
    identifier: string,
    baseBranch: string
  ) => Promise<string>;
  getBranchName?: (identifier: string) => string;
  runHook?: (
    workDir: string,
    command: string
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

interface LinearActivityClient {
  emitThought(sessionId: string, body: string): Promise<void>;
  emitComment(sessionId: string, body: string): Promise<void>;
  emitError(sessionId: string, body: string): Promise<void>;
}

interface OrchestratorOptions {
  workspace?: WorkspaceRuntime;
  linearClient?: LinearActivityClient;
  dataDir?: string;
}

export class Orchestrator {
  private db: Database;
  private adapters: Record<string, AgentAdapter>;
  private repoConfig: RepoConfig;
  private maxConcurrent: number;
  private options: OrchestratorOptions;

  constructor(
    db: Database,
    adapters: Record<string, AgentAdapter>,
    repoConfig: RepoConfig,
    maxConcurrent: number,
    options: OrchestratorOptions = {}
  ) {
    this.db = db;
    this.adapters = adapters;
    this.repoConfig = repoConfig;
    this.maxConcurrent = maxConcurrent;
    this.options = options;
  }

  async dispatchPending(
    projectId: string,
    pipeline: PipelineDefinition,
    repoPath: string
  ): Promise<string[]> {
    const available = this.maxConcurrent - this.db.countRunningThreads();
    if (available <= 0) return [];

    const stateLimits = this.repoConfig.concurrency.max_per_state ?? {};
    const runningThreads = this.db.listThreadsByStatus(projectId, "running");
    const runningDirtyThreads = this.db.listThreadsByStatus(
      projectId,
      "running_dirty"
    );
    const runningByIssueState = new Map<string, number>();

    for (const thread of [...runningThreads, ...runningDirtyThreads]) {
      runningByIssueState.set(
        thread.issue_state,
        (runningByIssueState.get(thread.issue_state) ?? 0) + 1
      );
    }

    const pending = this.db.listThreadsByStatus(projectId, "pending");
    const selected: Thread[] = [];

    for (const thread of pending) {
      if (!this.areBlockersResolved(thread)) continue;

      const stateLimit = stateLimits[thread.issue_state];
      const runningInState = runningByIssueState.get(thread.issue_state) ?? 0;
      if (stateLimit !== undefined && runningInState >= stateLimit) {
        continue;
      }

      selected.push(thread);
      if (stateLimit !== undefined) {
        runningByIssueState.set(thread.issue_state, runningInState + 1);
      }

      if (selected.length >= available) break;
    }

    const dispatched: string[] = [];
    for (const thread of selected) {
      await this.executeThread(thread, pipeline, repoPath);
      dispatched.push(thread.id);
    }
    return dispatched;
  }

  stopThread(threadId: string): void {
    const thread = this.db.getThread(threadId);
    if (!thread) return;

    if (thread.status === "running" || thread.status === "running_dirty") {
      const adapter = this.adapters[this.repoConfig.agent.adapter];
      if (adapter) {
        void adapter.cancel(thread.id);
      }
    }

    this.db.updateThreadStatus(threadId, "stopped");
    this.db.appendHistory({
      id: newId(),
      project_id: thread.project_id,
      thread_id: thread.id,
      event_type: "thread.stopped",
      payload: {},
    });
  }

  private areBlockersResolved(thread: Thread): boolean {
    if (thread.blocker_ids.length === 0) return true;

    for (const blockerId of thread.blocker_ids) {
      const blocker = this.db.getThreadByLinearIssueId(blockerId);
      if (!blocker) continue;
      if (!TERMINAL_THREAD_STATUSES.includes(blocker.status)) {
        return false;
      }
    }

    return true;
  }

  private async executeThread(
    thread: Thread,
    pipeline: PipelineDefinition,
    repoPath: string
  ): Promise<void> {
    const project = this.db.getProject(thread.project_id);
    if (!project) return;

    this.db.updateThreadStatus(thread.id, "running");
    let executionDir = thread.worktree_path ?? repoPath;
    const workspace = this.options.workspace;

    if (!thread.worktree_path && workspace?.createWorktree) {
      executionDir = await workspace.createWorktree(
        project.name,
        thread.linear_identifier,
        project.base_branch
      );
      const branchName =
        workspace.getBranchName?.(thread.linear_identifier) ??
        `feliz/${thread.linear_identifier}`;
      this.db.updateThreadWorkspace(thread.id, executionDir, branchName);

      if (this.repoConfig.hooks.after_create && workspace.runHook) {
        const hook = await workspace.runHook(
          executionDir,
          this.repoConfig.hooks.after_create
        );
        if (hook.exitCode !== 0) {
          throw new Error(
            `after_create hook failed: ${hook.stderr || hook.stdout}`
          );
        }
      }
    }

    this.db.appendHistory({
      id: newId(),
      project_id: thread.project_id,
      thread_id: thread.id,
      event_type: "thread.started",
      payload: { agent_adapter: this.repoConfig.agent.adapter },
    });

    if (thread.linear_session_id && this.options.linearClient) {
      try {
        await this.options.linearClient.emitThought(
          thread.linear_session_id,
          "Started working on this"
        );
      } catch {}
    }

    const executor = new PipelineExecutor(
      this.adapters,
      {
        approval_policy: this.repoConfig.agent.approval_policy,
        timeout_ms: this.repoConfig.agent.timeout_ms,
        max_turns: this.repoConfig.agent.max_turns,
        defaultAgent: this.repoConfig.agent.adapter,
      },
      {
        before_run: this.repoConfig.hooks.before_run,
        after_run: this.repoConfig.hooks.after_run,
      }
    );
    const promptTemplateCache = new Map<string, string>();

    const result = await executor.execute({
      threadId: thread.id,
      workDir: executionDir,
      pipeline,
      env: {
        FELIZ_DATA_DIR: this.options.dataDir ?? "",
        FELIZ_THREAD_ID: thread.id,
        FELIZ_PROJECT_ID: thread.project_id,
      },
      promptRenderer: (phaseName, stepName, cycle) => {
        const template = this.getStepPromptTemplate(
          executionDir,
          pipeline,
          phaseName,
          stepName,
          promptTemplateCache
        );

        return renderTemplate(template, {
          project: { name: project.name },
          issue: {
            identifier: thread.linear_identifier,
            title: thread.title,
            description: thread.description,
            labels: thread.labels,
            priority: thread.priority,
          },
          phase: { name: phaseName },
          step: { name: stepName },
          cycle: cycle > 1 ? cycle : null,
        });
      },
      afterStep: ({ stepName, success, agentResult }) => {
        if (!success && /review/i.test(stepName) && agentResult?.stdout.trim()) {
          this.appendAgentJob(thread.id, agentResult.stdout.trim());
        }
      },
    });

    const latestThread = this.db.getThread(thread.id);
    const currentStatus = latestThread?.status ?? "running";

    if (result.success) {
      const nextStatus = currentStatus === "running_dirty" ? "pending" : "completed";
      this.db.updateThreadStatus(thread.id, nextStatus);
      this.db.appendHistory({
        id: newId(),
        project_id: thread.project_id,
        thread_id: thread.id,
        event_type: nextStatus === "completed" ? "thread.completed" : "thread.requeued",
        payload: {},
      });

      if (thread.linear_session_id && this.options.linearClient) {
        try {
          await this.options.linearClient.emitComment(
            thread.linear_session_id,
            nextStatus === "completed"
              ? "Completed successfully"
              : "Queued follow-up work from new jobs"
          );
        } catch {}
      }

      return;
    }

    const failureSummary =
      result.lastAgentResult?.summary?.trim() ||
      result.lastAgentResult?.stdout.trim() ||
      result.lastAgentResult?.stderr.trim() ||
      result.failureReason ||
      "Agent execution failed.";
    this.appendAgentJob(thread.id, failureSummary);

    const nextStatus = currentStatus === "running_dirty" ? "pending" : "failed";
    this.db.updateThreadStatus(thread.id, nextStatus);
    this.db.appendHistory({
      id: newId(),
      project_id: thread.project_id,
      thread_id: thread.id,
      event_type: "thread.failed",
      payload: {
        failure_reason: result.failureReason ?? "Unknown failure",
      },
    });

    if (thread.linear_session_id && this.options.linearClient) {
      try {
        await this.options.linearClient.emitComment(
          thread.linear_session_id,
          `Work stalled: ${result.failureReason ?? "Unknown failure"}`
        );
      } catch {}
    }
  }

  private appendAgentJob(threadId: string, body: string) {
    this.db.appendJob({
      id: newId(),
      thread_id: threadId,
      body,
      author: "agent",
    });
  }

  private getStepPromptTemplate(
    workDir: string,
    pipeline: PipelineDefinition,
    phaseName: string,
    stepName: string,
    cache: Map<string, string>
  ): string {
    const step = this.findPipelineStep(pipeline, phaseName, stepName);
    const configuredPromptPath = step?.prompt ?? "WORKFLOW.md";
    const cached = cache.get(configuredPromptPath);
    if (cached !== undefined) {
      return cached;
    }

    const configuredPrompt = this.readPromptTemplate(workDir, configuredPromptPath);
    if (configuredPrompt !== null) {
      cache.set(configuredPromptPath, configuredPrompt);
      return configuredPrompt;
    }

    const workflowPrompt = this.readPromptTemplate(workDir, "WORKFLOW.md");
    if (workflowPrompt !== null) {
      cache.set("WORKFLOW.md", workflowPrompt);
      return workflowPrompt;
    }

    const fallback = `{{ issue.title }}

{{ issue.description }}

## Thread

Run \`${PRIMARY_CLI_NAME} thread read\` to see the project memory, specs, and thread jobs.
Run \`${PRIMARY_CLI_NAME} thread write <message>\` to append new jobs for the thread.`;
    cache.set(configuredPromptPath, fallback);
    return fallback;
  }

  private findPipelineStep(
    pipeline: PipelineDefinition,
    phaseName: string,
    stepName: string
  ): PipelineStep | undefined {
    const phase = pipeline.phases.find((item) => item.name === phaseName);
    if (!phase) return undefined;
    return phase.steps.find((item) => item.name === stepName);
  }

  private readPromptTemplate(workDir: string, promptPath: string): string | null {
    const fullPath = join(workDir, promptPath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, "utf-8");
  }
}
