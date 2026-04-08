import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from "fs";
import { join } from "path";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import { ThreadService } from "../../src/core/service.ts";
import { JobExecutor } from "../../src/core/executor.ts";
import { Database } from "../../src/db/database.ts";
import { WorkspaceManager } from "../../src/workspace/manager.ts";

const TEST_DB = "/tmp/feliz-job-executor-test.db";
const TEST_ROOT = "/tmp/feliz-job-executor";

function initTestRepo(repoPath: string) {
  mkdirSync(repoPath, { recursive: true });
  Bun.spawnSync(["git", "init", "-b", "main"], { cwd: repoPath });
  Bun.spawnSync(["git", "config", "user.email", "test@test.com"], {
    cwd: repoPath,
  });
  Bun.spawnSync(["git", "config", "user.name", "Test"], {
    cwd: repoPath,
  });
  Bun.spawnSync(["git", "commit", "--allow-empty", "--no-gpg-sign", "-m", "init"], {
    cwd: repoPath,
  });
}

describe("JobExecutor", () => {
  let db: Database;
  let workspace: WorkspaceManager;
  let threadService: ThreadService;
  let idCounter: number;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    mkdirSync(TEST_ROOT, { recursive: true });

    db = new Database(TEST_DB);
    workspace = new WorkspaceManager(TEST_ROOT);
    idCounter = 0;
    threadService = new ThreadService(db, {
      newId: () => {
        idCounter += 1;
        return `id-${idCounter}`;
      },
    });

    db.upsertCoreProject({
      id: "proj-1",
      name: "repo-a",
      repo_url: "git@github.com:org/repo-a.git",
      default_branch: "main",
      runtime_config: {},
      concurrency: {
        max_jobs: 2,
      },
      worktree_policy: {
        retain_on_success_minutes: 30,
        retain_on_failure_hours: 24,
      },
      job_types: {
        implement: {
          agent: "codex",
          system_prompt: ".feliz/prompts/implement.md",
          verify: ["bun test"],
          publish: "draft_pr",
          timeout_ms: 600000,
        },
      },
    });

    initTestRepo(workspace.getRepoPath("repo-a"));
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
  });

  test("executes a queued job in a fresh worktree and stores artifacts", async () => {
    const created = threadService.createThread({
      project_id: "proj-1",
      title: "Implement queue runner",
      requested_by: {
        type: "user",
        id: "alice",
      },
      initial_job: {
        job_type: "implement",
        title: "Implement queue runner",
        goal: "Build the queue runner",
        prompt_payload: {
          prompt: "Implement the queue runner",
        },
      },
    });

    const adapter: AgentAdapter = {
      name: "codex",
      isAvailable: async () => true,
      execute: async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: "implemented",
        stderr: "",
        filesChanged: ["src/index.ts"],
        summary: "Implemented queue runner",
      }),
      cancel: async () => {},
    };

    const executor = new JobExecutor({
      artifactRoot: join(TEST_ROOT, "artifacts"),
      db,
      workspace,
      adapters: {
        codex: adapter,
      },
      verifyCommand: async (workDir, command) => ({
        command,
        exitCode: 0,
        stdout: `ok in ${workDir}`,
        stderr: "",
      }),
      newId: () => {
        idCounter += 1;
        return `id-${idCounter}`;
      },
    });

    const run = await executor.executeJob(created.job!.id);

    expect(run.status).toBe("succeeded");
    expect(db.getJob(created.job!.id)?.status).toBe("succeeded");
    expect(db.getThread(created.thread.id)?.status).toBe("idle");
    expect(db.listArtifactsForThread(created.thread.id).length).toBeGreaterThanOrEqual(3);
    expect(db.getWorktreeRecord(run.worktree_id!)?.state).toBe("retained");

    const summaryArtifact = db
      .listArtifactsForThread(created.thread.id)
      .find((artifact) => artifact.kind === "summary");
    expect(summaryArtifact).toBeDefined();
    expect(readFileSync(summaryArtifact!.path, "utf-8")).toContain(
      "Implemented queue runner"
    );
  });

  test("marks the thread blocked when verification fails", async () => {
    const created = threadService.createThread({
      project_id: "proj-1",
      title: "Implement queue runner",
      requested_by: {
        type: "user",
        id: "alice",
      },
      initial_job: {
        job_type: "implement",
        title: "Implement queue runner",
        goal: "Build the queue runner",
        prompt_payload: {
          prompt: "Implement the queue runner",
        },
      },
    });

    const adapter: AgentAdapter = {
      name: "codex",
      isAvailable: async () => true,
      execute: async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: "implemented",
        stderr: "",
        filesChanged: ["src/index.ts"],
        summary: "Implemented queue runner",
      }),
      cancel: async () => {},
    };

    const executor = new JobExecutor({
      artifactRoot: join(TEST_ROOT, "artifacts"),
      db,
      workspace,
      adapters: {
        codex: adapter,
      },
      verifyCommand: async () => ({
        command: "bun test",
        exitCode: 1,
        stdout: "",
        stderr: "tests failed",
      }),
      newId: () => {
        idCounter += 1;
        return `id-${idCounter}`;
      },
    });

    const run = await executor.executeJob(created.job!.id);

    expect(run.status).toBe("failed");
    expect(db.getJob(created.job!.id)?.status).toBe("failed");
    expect(db.getThread(created.thread.id)?.status).toBe("blocked");
    expect(db.getWorktreeRecord(run.worktree_id!)?.state).toBe("retained");
  });

  test("rejects a second active write job on the same thread", async () => {
    const created = threadService.createThread({
      project_id: "proj-1",
      title: "Implement queue runner",
      requested_by: {
        type: "user",
        id: "alice",
      },
    });

    db.createJob({
      id: "write-running",
      thread_id: created.thread.id,
      job_type: "implement",
      agent_adapter: "codex",
      title: "Already running",
      goal: "Write code",
      prompt_payload: {},
      approval_policy: "never",
      publish_policy: "none",
      verification_commands: [],
      priority: 1,
      requested_by: {
        type: "user",
        id: "alice",
      },
      write_mode: "workspace_write",
      status: "running",
      timeout_ms: 600000,
      retry_limit: 0,
      metadata: {},
    });

    const queued = threadService.continueThread(created.thread.id, {
      job_type: "implement",
      title: "Queued write",
      goal: "Write more code",
      prompt_payload: {},
      requested_by: {
        type: "user",
        id: "alice",
      },
    });

    const adapter: AgentAdapter = {
      name: "codex",
      isAvailable: async () => true,
      execute: async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: "implemented",
        stderr: "",
        filesChanged: [],
      }),
      cancel: async () => {},
    };

    const executor = new JobExecutor({
      artifactRoot: join(TEST_ROOT, "artifacts"),
      db,
      workspace,
      adapters: {
        codex: adapter,
      },
      verifyCommand: async () => ({
        command: "bun test",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      }),
      newId: () => {
        idCounter += 1;
        return `id-${idCounter}`;
      },
    });

    await expect(executor.executeJob(queued.id)).rejects.toThrow(
      "already has an active write job"
    );
  });
});
