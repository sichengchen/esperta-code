import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { DecompositionEngine } from "../../src/orchestrator/decomposition.ts";
import { Database } from "../../src/db/database.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "fs";

const TEST_DB = "/tmp/feliz-decomp-test.db";
const TEST_WORK_DIR = "/tmp/feliz-decomp-workdir";

function makeAdapter(
  breakdownJson = JSON.stringify({
    sub_issues: [
      {
        title: "Database schema",
        description: "Create tables",
        dependencies: [],
      },
      {
        title: "API endpoints",
        description: "Create REST endpoints",
        dependencies: ["Database schema"],
      },
    ],
  })
): AgentAdapter {
  return {
    name: "test-agent",
    isAvailable: async () => true,
    execute: mock(async () => ({
      status: "succeeded" as const,
      exitCode: 0,
      stdout: breakdownJson,
      stderr: "",
      filesChanged: [],
      summary: "Proposed breakdown",
    })),
    cancel: mock(async () => {}),
  };
}

describe("DecompositionEngine", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_WORK_DIR)) rmSync(TEST_WORK_DIR, { recursive: true });
    mkdirSync(TEST_WORK_DIR, { recursive: true });
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
      title: "Build payments service",
      description: "Full payments system with credit cards, subscriptions",
      state: "Todo",
      priority: 1,
      labels: ["epic"],
      blocker_ids: [],
      orchestration_state: "decomposing",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_WORK_DIR)) rmSync(TEST_WORK_DIR, { recursive: true });
  });

  test("detects large feature by epic label", () => {
    const engine = new DecompositionEngine(db, makeAdapter());
    expect(engine.isLargeFeature(["epic"])).toBe(true);
  });

  test("detects large feature by feliz:decompose label", () => {
    const engine = new DecompositionEngine(db, makeAdapter());
    expect(engine.isLargeFeature(["feliz:decompose"])).toBe(false);
    expect(engine.isLargeFeature(["epic"])).toBe(true);
  });

  test("not large feature without epic label", () => {
    const engine = new DecompositionEngine(db, makeAdapter());
    expect(engine.isLargeFeature(["bug", "feliz"])).toBe(false);
  });

  test("builds decomposition prompt", () => {
    const engine = new DecompositionEngine(db, makeAdapter());
    const prompt = engine.buildDecompositionPrompt({
      identifier: "T-1",
      title: "Build payments",
      description: "Full system",
    });
    expect(prompt).toContain("T-1");
    expect(prompt).toContain("Build payments");
    expect(prompt).toContain("sub-issues");
  });

  test("proposes decomposition via agent", async () => {
    const adapter = makeAdapter();
    const engine = new DecompositionEngine(db, adapter);
    const result = await engine.proposeDecomposition({
      workItemId: "wi-1",
      workDir: TEST_WORK_DIR,
    });

    expect(result.success).toBe(true);
    expect(result.subIssues).toHaveLength(2);
    expect(result.subIssues![0]!.title).toBe("Database schema");
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });

  test("transitions to decompose_review after proposal", async () => {
    const engine = new DecompositionEngine(db, makeAdapter());
    await engine.proposeDecomposition({
      workItemId: "wi-1",
      workDir: TEST_WORK_DIR,
    });

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("decompose_review");
  });

  test("creates sub work items on approval", () => {
    db.updateWorkItemOrchestrationState("wi-1", "decompose_review");
    const engine = new DecompositionEngine(db, makeAdapter());

    const subItemIds = engine.approveDecomposition("wi-1", [
      { title: "Schema", description: "Create tables", dependencies: [] },
      {
        title: "Endpoints",
        description: "REST API",
        dependencies: ["Schema"],
      },
    ]);

    expect(subItemIds).toHaveLength(2);
    const sub1 = db.getWorkItem(subItemIds[0]!);
    expect(sub1).not.toBeNull();
    expect(sub1!.parent_work_item_id).toBe("wi-1");
    expect(sub1!.orchestration_state).toBe("unclaimed");
  });

  test("records decomposition history events", async () => {
    const engine = new DecompositionEngine(db, makeAdapter());
    await engine.proposeDecomposition({
      workItemId: "wi-1",
      workDir: TEST_WORK_DIR,
    });

    const history = db.getHistory("proj-1", "wi-1");
    expect(
      history.some((h) => h.event_type === "decomposition.proposed")
    ).toBe(true);
  });
});
