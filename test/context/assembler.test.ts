import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { ContextAssembler } from "../../src/context/assembler.ts";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_ROOT = "/tmp/esperta-code-context-assembler-test";

describe("ContextAssembler", () => {
  let db: Database;
  let worktree: string;

  beforeEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    worktree = join(TEST_ROOT, "backend", "worktrees", "BAC-1");
    mkdirSync(join(worktree, ".esperta-code", "context", "memory"), { recursive: true });
    mkdirSync(join(worktree, "specs"), { recursive: true });

    writeFileSync(
      join(worktree, ".esperta-code", "context", "memory", "conventions.md"),
      "# Conventions\n\nPrefer explicit types.\n"
    );
    writeFileSync(join(worktree, "specs", "index.md"), "# Specs\n\nLogin rules.\n");

    db = new Database(":memory:");
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
      labels: ["bug"],
      blocker_ids: [],
      worktree_path: worktree,
      branch_name: "esperta-code/BAC-1",
      status: "pending",
    });
    db.appendJob({
      id: "job-1",
      thread_id: "thread-1",
      body: "Keep the fix minimal.",
      author: "human",
    });
  });

  test("assembles thread, jobs, memory, and specs", () => {
    const assembler = new ContextAssembler(db);
    const context = assembler.assemble("thread-1");

    expect(context).not.toBeNull();
    expect(context!.thread.linear_identifier).toBe("BAC-1");
    expect(context!.jobs).toHaveLength(1);
    expect(context!.memory[0]!.content).toContain("Prefer explicit types.");
    expect(context!.specs[0]!.content).toContain("Login rules.");
  });

  test("returns null for unknown thread", () => {
    const assembler = new ContextAssembler(db);
    expect(assembler.assemble("missing")).toBeNull();
  });
});
