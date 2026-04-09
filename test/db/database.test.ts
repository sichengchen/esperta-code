import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { unlinkSync } from "fs";

const TEST_DB = "/tmp/esperta-code-db-test.sqlite";

describe("Database", () => {
  let db: Database;

  beforeEach(() => {
    try {
      unlinkSync(TEST_DB);
    } catch {}
    db = new Database(TEST_DB);
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(TEST_DB);
    } catch {}
  });

  test("creates project, thread, job, and history tables", () => {
    const tables = db.listTables();

    expect(tables).toContain("projects");
    expect(tables).toContain("threads");
    expect(tables).toContain("jobs");
    expect(tables).toContain("history");
    expect(tables).not.toContain("work_items");
    expect(tables).not.toContain("runs");
    expect(tables).not.toContain("step_executions");
  });

  test("inserts and retrieves a thread", () => {
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
      priority: 2,
      labels: ["bug"],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "pending",
    });

    const thread = db.getThread("thread-1");

    expect(thread).not.toBeNull();
    expect(thread!.linear_issue_id).toBe("lin-1");
    expect(thread!.status).toBe("pending");
    expect(thread!.linear_session_id).toBe("session-1");
  });

  test("updates thread session, status, and worktree linkage", () => {
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
      linear_session_id: null,
      title: "Fix auth flow",
      description: "",
      issue_state: "Todo",
      priority: 2,
      labels: [],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "pending",
    });

    db.updateThreadSessionId("thread-1", "session-2");
    db.updateThreadStatus("thread-1", "running");
    db.updateThreadWorkspace(
      "thread-1",
      "/tmp/esperta-code/backend/worktrees/BAC-1",
      "esperta-code/BAC-1"
    );

    const thread = db.getThread("thread-1");

    expect(thread!.linear_session_id).toBe("session-2");
    expect(thread!.status).toBe("running");
    expect(thread!.worktree_path).toContain("BAC-1");
    expect(thread!.branch_name).toBe("esperta-code/BAC-1");
  });

  test("lists pending threads by project and counts running threads", () => {
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
      linear_session_id: null,
      title: "Pending thread",
      description: "",
      issue_state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "pending",
    });

    db.upsertThread({
      id: "thread-2",
      project_id: "proj-1",
      linear_issue_id: "lin-2",
      linear_identifier: "BAC-2",
      linear_session_id: null,
      title: "Running thread",
      description: "",
      issue_state: "Todo",
      priority: 3,
      labels: [],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "running",
    });

    const pending = db.listThreadsByStatus("proj-1", "pending");

    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe("thread-1");
    expect(db.countRunningThreads()).toBe(1);
    expect(db.countRunningThreadsByProject("proj-1")).toBe(1);
  });

  test("appends jobs and lists them in chronological order", () => {
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
      linear_session_id: null,
      title: "Fix auth flow",
      description: "",
      issue_state: "Todo",
      priority: 2,
      labels: [],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "pending",
    });

    db.appendJob({
      id: "job-1",
      thread_id: "thread-1",
      body: "Please keep the migration additive.",
      author: "human",
    });
    db.appendJob({
      id: "job-2",
      thread_id: "thread-1",
      body: "Review note: simplify the query shape.",
      author: "agent",
    });

    const jobs = db.listJobs("thread-1");

    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.body).toContain("migration");
    expect(jobs[1]!.author).toBe("agent");
  });

  test("stores and filters history by thread", () => {
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend",
      base_branch: "main",
    });

    db.appendHistory({
      id: "hist-1",
      project_id: "proj-1",
      thread_id: "thread-1",
      event_type: "thread.created",
      payload: { title: "Fix auth flow" },
    });
    db.appendHistory({
      id: "hist-2",
      project_id: "proj-1",
      thread_id: null,
      event_type: "project.synced",
      payload: {},
    });

    const filtered = db.getHistory("proj-1", "thread-1");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.event_type).toBe("thread.created");
  });
});
