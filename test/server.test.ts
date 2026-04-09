import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FelizServer } from "../src/server.ts";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { AUTH_CODE_FILE, clearAuthCode } from "../src/cli/auth.ts";

const TEST_ROOT = "/tmp/esperta-code-server-test";

function makeConfig() {
  return {
    linear: {
      oauth_token: "test-token",
    },
    webhook: {
      port: 0,
    },
    tick: {
      interval_ms: 100,
    },
    storage: {
      data_dir: join(TEST_ROOT, "data"),
      workspace_root: join(TEST_ROOT, "workspaces"),
    },
    agent: {
      default: "claude-code",
      max_concurrent: 2,
    },
    projects: [
      {
        name: "backend",
        repo: "git@github.com:org/backend.git",
        linear_project: "Backend",
        branch: "main",
      },
    ],
  };
}

describe("EspertaCodeServer", () => {
  beforeEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    clearAuthCode();
  });

  test("constructs and creates required directories", () => {
    const server = new FelizServer(makeConfig() as any);
    const anyServer = server as any;

    expect(anyServer.db).toBeDefined();
    expect(anyServer.workspace).toBeDefined();
  });

  test("handles /auth/callback by writing the code file", async () => {
    const server = new FelizServer(makeConfig() as any);
    const response = await server.handleRequest(
      new Request("http://localhost/auth/callback?code=test-code")
    );

    expect(response.status).toBe(200);
    expect(readFileSync(AUTH_CODE_FILE, "utf-8")).toBe("test-code");
  });

  test("tickCycle dispatches pending threads", async () => {
    const server = new FelizServer(makeConfig() as any);
    const anyServer = server as any;
    const db = anyServer.db;

    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend",
      base_branch: "main",
    });
    db.upsertThread({
      id: "thread-1",
      project_id: "proj-1",
      linear_issue_id: "lin-1",
      linear_identifier: "BAC-1",
      linear_session_id: "session-1",
      title: "Fix auth flow",
      description: "Repair the login callback handling.",
      issue_state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "pending",
    });

    const repoPath = join(TEST_ROOT, "workspaces", "backend", "repo");
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(join(repoPath, "WORKFLOW.md"), "Fix {{ issue.title }}");

    anyServer.adapters = {
      "claude-code": {
        name: "claude-code",
        isAvailable: async () => true,
        execute: async () => ({
          status: "succeeded",
          exitCode: 0,
          stdout: "done",
          stderr: "",
          filesChanged: [],
        }),
        cancel: async () => {},
      },
      codex: {
        name: "codex",
        isAvailable: async () => true,
        execute: async () => ({
          status: "succeeded",
          exitCode: 0,
          stdout: "done",
          stderr: "",
          filesChanged: [],
        }),
        cancel: async () => {},
      },
    };
    anyServer.workspace = {
      getRepoPath: () => repoPath,
      createWorktree: async () => repoPath,
      getBranchName: (identifier: string) => `esperta-code/${identifier}`,
    };

    await anyServer.tickCycle();

    expect(db.getThread("thread-1").status).toBe("completed");
  });

  test("stop signal stops the active thread and emits an error activity", async () => {
    const server = new FelizServer(makeConfig() as any);
    const anyServer = server as any;
    const db = anyServer.db;

    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend",
      base_branch: "main",
    });
    db.upsertThread({
      id: "thread-1",
      project_id: "proj-1",
      linear_issue_id: "lin-1",
      linear_identifier: "BAC-1",
      linear_session_id: "session-1",
      title: "Fix auth flow",
      description: "Repair the login callback handling.",
      issue_state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "running",
    });

    anyServer.linearClient = {
      emitThought: mock(async () => {}),
      emitComment: mock(async () => {}),
      emitError: mock(async () => {}),
    };
    anyServer.webhookHandler = {
      handleEvent: mock(async () => ({
        threadId: "thread-1",
        signal: "stop",
      })),
    };

    const response = await server.handleRequest(
      new Request("http://localhost/webhook/linear", {
        method: "POST",
        body: JSON.stringify({
          type: "AgentSession",
          action: "prompted",
          agentSession: {
            id: "session-2",
            issueId: "lin-1",
            issue: {
              id: "lin-1",
              identifier: "BAC-1",
              title: "Fix auth flow",
              description: "",
              priority: 1,
              state: { name: "Todo" },
              labels: { nodes: [] },
              project: { name: "Backend" },
              team: { name: "Backend", key: "BAC" },
              url: "https://linear.app/acme/issue/BAC-1",
            },
            promptContext: "",
            signal: "stop",
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(db.getThread("thread-1").status).toBe("stopped");
    expect(anyServer.linearClient.emitError).toHaveBeenCalledWith(
      "session-1",
      "Cancelled by user"
    );
  });
});
