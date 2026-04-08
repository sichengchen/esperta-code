import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { AgentAdapter } from "../agents/adapter.ts";
import type { Database } from "../db/database.ts";
import { newId as defaultNewId } from "../id.ts";
import {
  WorkspaceManager,
  computeRetentionDeadline,
  type WorktreeRetentionPolicy,
} from "../workspace/manager.ts";
import type { Job, RunRecord } from "./types.ts";

interface VerifyResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface JobExecutorOptions {
  artifactRoot: string;
  db: Database;
  workspace: WorkspaceManager;
  adapters: Record<string, AgentAdapter>;
  newId?: () => string;
  verifyCommand?: (workDir: string, command: string) => Promise<VerifyResult>;
}

export class JobExecutor {
  private readonly artifactRoot: string;
  private readonly db: Database;
  private readonly workspace: WorkspaceManager;
  private readonly adapters: Record<string, AgentAdapter>;
  private readonly newId: () => string;
  private readonly verifyCommand: (workDir: string, command: string) => Promise<VerifyResult>;

  constructor(options: JobExecutorOptions) {
    this.artifactRoot = options.artifactRoot;
    this.db = options.db;
    this.workspace = options.workspace;
    this.adapters = options.adapters;
    this.newId = options.newId ?? defaultNewId;
    this.verifyCommand =
      options.verifyCommand ??
      (async (workDir, command) => {
        const result = await this.workspace.runHook(workDir, command);
        return {
          command,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      });
  }

  async executeJob(jobId: string): Promise<RunRecord> {
    const job = this.db.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (!["queued", "retry_queued"].includes(job.status)) {
      throw new Error(`Job ${job.id} is not runnable from state "${job.status}"`);
    }

    const thread = this.db.getThread(job.thread_id);
    if (!thread) {
      throw new Error(`Thread not found: ${job.thread_id}`);
    }

    const project = this.db.getCoreProject(thread.project_id);
    if (!project) {
      throw new Error(`Project not found: ${thread.project_id}`);
    }

    if (
      job.write_mode !== "read_only" &&
      this.db.countActiveWriteJobsForThread(thread.id) > 0
    ) {
      throw new Error(`Thread ${thread.id} already has an active write job`);
    }

    const projectLimit = Number(project.concurrency.max_jobs ?? 0);
    if (
      projectLimit > 0 &&
      this.db.countActiveJobsForProject(thread.project_id) >= projectLimit
    ) {
      throw new Error(`Project ${thread.project_id} is at its active job limit`);
    }

    const adapter = this.adapters[job.agent_adapter];
    if (!adapter) {
      throw new Error(`Agent adapter not found: ${job.agent_adapter}`);
    }

    const runId = this.newId();
    const worktreeId = this.newId();
    const branchName =
      thread.branch_name || this.workspace.getThreadBranchName(thread.id);

    this.db.updateJob(job.id, { status: "preparing" });
    this.db.updateThreadStatus(thread.id, "active");
    this.db.createRunRecord({
      id: runId,
      job_id: job.id,
      thread_id: thread.id,
      project_id: thread.project_id,
      worktree_id: worktreeId,
      agent_adapter: job.agent_adapter,
      attempt: 1,
      status: "created",
      verification_status: "pending",
      branch_name: branchName,
      base_branch: thread.base_branch,
    });
    this.db.createWorktreeRecord({
      id: worktreeId,
      project_id: thread.project_id,
      thread_id: thread.id,
      run_id: runId,
      path: this.workspace.getRunWorktreePath(project.name, thread.id, runId),
      branch_name: branchName,
      base_branch: thread.base_branch,
      state: "provisioning",
      lease_owner: job.id,
      pinned: false,
      retention_reason: null,
      retained_until: null,
    });

    const worktreePath = await this.workspace.createRunWorktree({
      projectName: project.name,
      threadId: thread.id,
      runId,
      branchName,
      fromRef: thread.base_branch,
    });

    this.db.updateWorktreeRecord(worktreeId, { state: "active" });
    this.db.updateRunRecord(runId, {
      status: "running",
      worktree_id: worktreeId,
    });
    this.db.updateJob(job.id, { status: "running" });

    const prompt = this.buildPrompt(job);
    const agentResult = await adapter.execute({
      runId,
      workDir: worktreePath,
      prompt,
      timeout_ms: job.timeout_ms,
      maxTurns: 40,
      approvalPolicy: this.mapApprovalPolicy(job.approval_policy),
      env: {
        FELIZ_JOB_ID: job.id,
        FELIZ_THREAD_ID: thread.id,
        FELIZ_RUN_ID: runId,
      },
    });

    const artifactDir = join(this.artifactRoot, thread.id, runId);
    mkdirSync(artifactDir, { recursive: true });

    await this.writeArtifact(
      thread.id,
      job.id,
      runId,
      "agent_stdout",
      join(artifactDir, "agent.stdout.log"),
      agentResult.stdout
    );
    await this.writeArtifact(
      thread.id,
      job.id,
      runId,
      "agent_stderr",
      join(artifactDir, "agent.stderr.log"),
      agentResult.stderr
    );

    let verificationFailed = false;
    let verificationFailureReason: string | null = null;

    for (const [index, command] of job.verification_commands.entries()) {
      const result = await this.verifyCommand(worktreePath, command);
      const verificationLogPath = join(artifactDir, `verify-${index + 1}.log`);
      const contents = `# ${result.command}\n\nexit_code=${result.exitCode}\n\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}\n`;
      await this.writeArtifact(
        thread.id,
        job.id,
        runId,
        "verification",
        verificationLogPath,
        contents,
        {
          command: result.command,
          exit_code: result.exitCode,
        }
      );

      if (result.exitCode !== 0) {
        verificationFailed = true;
        verificationFailureReason = `Verification failed: ${result.command}`;
        break;
      }
    }

    const status =
      agentResult.status === "succeeded" && !verificationFailed
        ? "succeeded"
        : agentResult.status === "timed_out"
          ? "timed_out"
          : agentResult.status === "cancelled"
            ? "cancelled"
            : "failed";
    const failureReason =
      verificationFailureReason ??
      (status === "succeeded" ? null : agentResult.stderr || "Job execution failed");
    const summary = agentResult.summary ?? null;

    if (summary) {
      await this.writeArtifact(
        thread.id,
        job.id,
        runId,
        "summary",
        join(artifactDir, "summary.md"),
        `${summary}\n`
      );
    }

    this.db.updateRunRecord(runId, {
      status,
      summary,
      failure_reason: failureReason,
      verification_status:
        agentResult.status === "succeeded" && !verificationFailed
          ? "passed"
          : "failed",
    });
    this.db.updateJob(job.id, {
      status: status === "succeeded" ? "succeeded" : "failed",
    });
    this.db.updateThreadStatus(
      thread.id,
      status === "succeeded" ? "idle" : "blocked"
    );

    await this.finalizeWorktree(
      project.name,
      worktreePath,
      worktreeId,
      project.worktree_policy as WorktreeRetentionPolicy,
      status === "succeeded" ? "success" : "failure"
    );

    return this.db.getRunRecord(runId)!;
  }

  private buildPrompt(job: Job): string {
    const prompt = job.prompt_payload.prompt;
    if (typeof prompt === "string" && prompt.length > 0) {
      return prompt;
    }

    return `${job.title}\n\n${job.goal}`;
  }

  private mapApprovalPolicy(policy: string): "auto" | "gated" | "suggest" {
    if (policy === "manual") return "gated";
    if (policy === "suggest") return "suggest";
    return "auto";
  }

  private async writeArtifact(
    threadId: string,
    jobId: string,
    runId: string,
    kind: string,
    path: string,
    contents: string,
    metadata: Record<string, unknown> = {}
  ) {
    writeFileSync(path, contents, "utf-8");
    this.db.addArtifact({
      id: this.newId(),
      thread_id: threadId,
      job_id: jobId,
      run_id: runId,
      kind,
      path,
      summary: kind === "summary" ? contents.trim() : null,
      metadata,
    });
  }

  private async finalizeWorktree(
    projectName: string,
    worktreePath: string,
    worktreeId: string,
    policy: WorktreeRetentionPolicy,
    outcome: "success" | "failure"
  ) {
    const retainedUntil = computeRetentionDeadline(policy, outcome);
    if (retainedUntil || outcome === "failure") {
      this.db.updateWorktreeRecord(worktreeId, {
        state: "retained",
        lease_owner: null,
        retention_reason: outcome,
        retained_until: retainedUntil,
      });
      return;
    }

    await this.workspace.removeWorktreePath(projectName, worktreePath);
    this.db.updateWorktreeRecord(worktreeId, {
      state: "deleted",
      lease_owner: null,
      deleted_at: new Date(),
    });
  }
}
