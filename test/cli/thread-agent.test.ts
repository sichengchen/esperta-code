import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { threadRead, threadWrite } from "../../src/cli/thread-agent.ts";

const SCRATCH = "/tmp/esperta-code-thread-agent-test";

describe("thread agent CLI helpers", () => {
  let db: Database;

  beforeEach(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
    mkdirSync(SCRATCH, { recursive: true });

    db = new Database(":memory:");
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend",
      base_branch: "main",
    });

    const worktree = join(SCRATCH, "backend", "worktrees", "BAC-1");
    mkdirSync(join(worktree, ".esperta-code", "context", "memory"), { recursive: true });
    mkdirSync(join(worktree, "specs"), { recursive: true });
    writeFileSync(
      join(worktree, ".esperta-code", "context", "memory", "conventions.md"),
      "# Conventions\n\nPrefer explicit types.\n"
    );
    writeFileSync(
      join(worktree, "specs", "index.md"),
      "# Specs\n\nDocument behavior here.\n"
    );

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
      worktree_path: worktree,
      branch_name: "esperta-code/BAC-1",
      status: "pending",
    });
  });

  test("threadRead renders specs, memory, and jobs", () => {
    db.appendJob({
      id: "job-1",
      thread_id: "thread-1",
      body: "Keep the fix minimal.",
      author: "human",
    });
    db.appendJob({
      id: "job-2",
      thread_id: "thread-1",
      body: "Review note: collapse the helper function.",
      author: "agent",
    });

    const output = threadRead(db, "thread-1");

    expect(output).toContain("# Thread");
    expect(output).toContain("Keep the fix minimal.");
    expect(output).toContain("Review note");
    expect(output).toContain("Prefer explicit types.");
    expect(output).toContain("Document behavior here.");
  });

  test("threadWrite appends a human job", () => {
    threadWrite(db, "thread-1", "Please include a regression test.", "human");

    const jobs = db.listJobs("thread-1");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.body).toContain("regression test");
    expect(jobs[0]!.author).toBe("human");
  });
});
