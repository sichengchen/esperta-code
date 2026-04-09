import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { Orchestrator } from "../../src/orchestrator/orchestrator.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import type { RepoConfig } from "../../src/config/types.ts";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_ROOT = "/tmp/esperta-code-orchestrator-test";

function makeRepoConfig(): RepoConfig {
  return {
    agent: {
      adapter: "mock-agent",
      approval_policy: "auto",
      max_turns: 20,
      timeout_ms: 600000,
    },
    hooks: {},
    specs: {
      enabled: true,
      directory: "specs",
      approval_required: false,
    },
    gates: {},
    concurrency: {},
  };
}

function makeAdapter(
  execute?: AgentAdapter["execute"],
  cancel?: AgentAdapter["cancel"]
): AgentAdapter {
  return {
    name: "mock-agent",
    isAvailable: async () => true,
    execute:
      execute ??
      (async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: "approved",
        stderr: "",
        filesChanged: [],
      })),
    cancel: cancel ?? (async () => {}),
  };
}

describe("Orchestrator", () => {
  let db: Database;

  beforeEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(TEST_ROOT, { recursive: true });
    db = new Database(":memory:");
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend",
      base_branch: "main",
    });
  });

  function insertThread(id: string, overrides: Record<string, unknown> = {}) {
    db.upsertThread({
      id,
      project_id: "proj-1",
      linear_issue_id: `lin-${id}`,
      linear_identifier: `BAC-${id}`,
      linear_session_id: null,
      title: `Thread ${id}`,
      description: "Handle the task.",
      issue_state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "pending",
      ...overrides,
    } as any);
  }

  test("dispatches a pending thread, creates a worktree, and completes it on success", async () => {
    insertThread("1");
    const repoPath = join(TEST_ROOT, "backend", "repo");
    const worktreePath = join(TEST_ROOT, "backend", "worktrees", "BAC-1");
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(join(repoPath, "WORKFLOW.md"), "Fix {{ issue.title }}");

    const workspace = {
      createWorktree: mock(async () => {
        mkdirSync(worktreePath, { recursive: true });
        writeFileSync(join(worktreePath, "WORKFLOW.md"), "Fix {{ issue.title }}");
        return worktreePath;
      }),
      getBranchName: mock((identifier: string) => `esperta-code/${identifier}`),
    };

    const orchestrator = new Orchestrator(
      db,
      { "mock-agent": makeAdapter() },
      makeRepoConfig(),
      1,
      { workspace, dataDir: TEST_ROOT }
    );

    const dispatched = await orchestrator.dispatchPending(
      "proj-1",
      {
        phases: [
          {
            name: "execute",
            steps: [{ name: "run", agent: "mock-agent" }],
          },
        ],
      },
      repoPath
    );

    const thread = db.getThread("1");
    expect(dispatched).toEqual(["1"]);
    expect(workspace.createWorktree).toHaveBeenCalledTimes(1);
    expect(thread!.status).toBe("completed");
    expect(thread!.worktree_path).toBe(worktreePath);
    expect(thread!.branch_name).toBe("esperta-code/BAC-1");
  });

  test("does not dispatch a pending thread with non-terminal blockers", async () => {
    insertThread("blocker", { status: "pending" });
    insertThread("child", {
      blocker_ids: ["lin-blocker"],
    });

    const orchestrator = new Orchestrator(
      db,
      { "mock-agent": makeAdapter() },
      makeRepoConfig(),
      1,
      { dataDir: TEST_ROOT }
    );

    const dispatched = await orchestrator.dispatchPending(
      "proj-1",
      {
        phases: [
          {
            name: "execute",
            steps: [{ name: "run", agent: "mock-agent" }],
          },
        ],
      },
      TEST_ROOT
    );

    expect(dispatched).toEqual(["blocker"]);
    expect(db.getThread("child")!.status).toBe("pending");
  });

  test("stopThread marks the thread stopped and cancels the active adapter", () => {
    insertThread("1", { status: "running" });
    const cancel = mock(async () => {});
    const orchestrator = new Orchestrator(
      db,
      { "mock-agent": makeAdapter(undefined, cancel) },
      makeRepoConfig(),
      1
    );

    orchestrator.stopThread("1");

    expect(db.getThread("1")!.status).toBe("stopped");
    expect(cancel).toHaveBeenCalledWith("1");
  });

  test("appends a review job when the review step is not approved", async () => {
    insertThread("1");
    const worktreePath = join(TEST_ROOT, "backend", "worktrees", "BAC-1");
    mkdirSync(join(worktreePath, ".esperta-code", "prompts"), { recursive: true });
    writeFileSync(join(worktreePath, ".esperta-code", "prompts", "review.md"), "Review");
    const repoPath = join(TEST_ROOT, "backend", "repo");
    mkdirSync(repoPath, { recursive: true });

    db.updateThreadWorkspace("1", worktreePath, "esperta-code/BAC-1");

    const orchestrator = new Orchestrator(
      db,
      {
        "mock-agent": makeAdapter(async () => ({
          status: "succeeded",
          exitCode: 0,
          stdout: "Needs a regression test.",
          stderr: "",
          filesChanged: [],
        })),
      },
      makeRepoConfig(),
      1,
      { dataDir: TEST_ROOT }
    );

    await orchestrator.dispatchPending(
      "proj-1",
      {
        phases: [
          {
            name: "review",
            steps: [
              {
                name: "review",
                agent: "mock-agent",
                success: { agent_verdict: "approved" },
              },
            ],
          },
        ],
      },
      repoPath
    );

    const jobs = db.listJobs("1");
    expect(db.getThread("1")!.status).toBe("failed");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.body).toContain("Needs a regression test.");
  });

  test("requeues the thread when new jobs arrive during execution", async () => {
    insertThread("1");
    const repoPath = join(TEST_ROOT, "backend", "repo");
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(join(repoPath, "WORKFLOW.md"), "Fix {{ issue.title }}");

    const orchestrator = new Orchestrator(
      db,
      {
        "mock-agent": makeAdapter(async () => {
          db.updateThreadStatus("1", "running_dirty");
          return {
            status: "succeeded",
            exitCode: 0,
            stdout: "done",
            stderr: "",
            filesChanged: [],
          };
        }),
      },
      makeRepoConfig(),
      1,
      { dataDir: TEST_ROOT }
    );

    await orchestrator.dispatchPending(
      "proj-1",
      {
        phases: [
          {
            name: "execute",
            steps: [{ name: "run", agent: "mock-agent" }],
          },
        ],
      },
      repoPath
    );

    expect(db.getThread("1")!.status).toBe("pending");
  });
});
