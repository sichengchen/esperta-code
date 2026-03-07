import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { ContextAssembler } from "../../src/context/assembler.ts";
import { contextRead, contextWrite } from "../../src/cli/context-agent.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";

const TEST_DB = "/tmp/feliz-ctx-agent-test.db";
const TEST_SCRATCH = "/tmp/feliz-ctx-agent-scratch";

describe("context read", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_SCRATCH)) rmSync(TEST_SCRATCH, { recursive: true });
    mkdirSync(TEST_SCRATCH, { recursive: true });
    db = new Database(TEST_DB);
    db.insertProject({
      id: "proj-1",
      name: "test",
      repo_url: "u",
      linear_project_name: "T",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Test Issue",
      description: "Fix the bug",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_SCRATCH)) rmSync(TEST_SCRATCH, { recursive: true });
  });

  test("returns history events", () => {
    db.appendHistory({
      id: "h-1",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: null,
      event_type: "issue.discovered",
      payload: { title: "Test Issue" },
    });

    const output = contextRead(db, TEST_SCRATCH, "proj-1", "wi-1", null);
    expect(output).toContain("issue.discovered");
    expect(output).toContain("History");
  });

  test("returns scratchpad from current run", () => {
    const assembler = new ContextAssembler(db, TEST_SCRATCH);
    assembler.writeScratchpad("test", "run-1", "review.md", "Missing edge case");

    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "review",
      current_step: "check",
      context_snapshot_id: "snap-1",
    });

    const output = contextRead(db, TEST_SCRATCH, "proj-1", "wi-1", "run-1");
    expect(output).toContain("Prior Steps");
    expect(output).toContain("Missing edge case");
  });

  test("returns empty context message when no data", () => {
    const output = contextRead(db, TEST_SCRATCH, "proj-1", "wi-1", null);
    expect(output).toContain("No context");
  });

  test("includes both history and scratchpad", () => {
    db.appendHistory({
      id: "h-1",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: "run-1",
      event_type: "run.started",
      payload: { attempt: 1 },
    });

    const assembler = new ContextAssembler(db, TEST_SCRATCH);
    assembler.writeScratchpad("test", "run-1", "implement-run.md", "Wrote auth module");

    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "implement",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });

    const output = contextRead(db, TEST_SCRATCH, "proj-1", "wi-1", "run-1");
    expect(output).toContain("History");
    expect(output).toContain("run.started");
    expect(output).toContain("Prior Steps");
    expect(output).toContain("Wrote auth module");
  });
});

describe("context write", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_SCRATCH)) rmSync(TEST_SCRATCH, { recursive: true });
    mkdirSync(TEST_SCRATCH, { recursive: true });
    db = new Database(TEST_DB);
    db.insertProject({
      id: "proj-1",
      name: "test",
      repo_url: "u",
      linear_project_name: "T",
      base_branch: "main",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_SCRATCH)) rmSync(TEST_SCRATCH, { recursive: true });
  });

  test("writes message to scratchpad", () => {
    contextWrite(db, TEST_SCRATCH, "proj-1", "run-1", "Missing edge case for empty input");

    const filePath = join(TEST_SCRATCH, "test", "run-1");
    expect(existsSync(filePath)).toBe(true);

    // Verify the message is readable via contextRead
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Test",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "review",
      current_step: "check",
      context_snapshot_id: "snap-1",
    });

    const output = contextRead(db, TEST_SCRATCH, "proj-1", "wi-1", "run-1");
    expect(output).toContain("Missing edge case for empty input");
  });

  test("appends multiple messages", () => {
    contextWrite(db, TEST_SCRATCH, "proj-1", "run-1", "First finding");
    contextWrite(db, TEST_SCRATCH, "proj-1", "run-1", "Second finding");

    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Test",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "review",
      current_step: "check",
      context_snapshot_id: "snap-1",
    });

    const output = contextRead(db, TEST_SCRATCH, "proj-1", "wi-1", "run-1");
    expect(output).toContain("First finding");
    expect(output).toContain("Second finding");
  });
});
