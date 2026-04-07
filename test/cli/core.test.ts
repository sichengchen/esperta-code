import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "../../src/cli/commands.ts";
import { handleCoreCliCommand } from "../../src/cli/core.ts";
import { Database } from "../../src/db/database.ts";

const TEST_ROOT = "/tmp/feliz-cli-core-test";
const CONFIG_PATH = join(TEST_ROOT, "feliz.yml");

function captureLogs<T>(fn: () => Promise<T> | T): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };

  return Promise.resolve(fn()).then(
    (result) => {
      console.log = originalLog;
      return { result, lines };
    },
    (error) => {
      console.log = originalLog;
      throw error;
    }
  );
}

function writeConfig() {
  mkdirSync(TEST_ROOT, { recursive: true });
  writeFileSync(
    CONFIG_PATH,
    `runtime:
  data_dir: ${TEST_ROOT}
  max_concurrent_jobs: 4

projects:
  - name: repo-a
    repo: git@github.com:org/repo-a.git
    base_branch: main
    worktrees:
      retain_on_success_minutes: 30
      retain_on_failure_hours: 24
      prune_after_days: 7
    concurrency:
      max_jobs: 2
    job_types:
      implement:
        agent: codex
        system_prompt: .feliz/prompts/implement.md
        verify:
          - bun test
        publish: draft_pr
`,
    "utf-8"
  );
}

function openDb(): Database {
  return new Database(join(TEST_ROOT, "db", "feliz.db"));
}

describe("core CLI commands", () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    writeConfig();
  });

  afterEach(() => {
    if (existsSync(join(TEST_ROOT, "feliz.db"))) unlinkSync(join(TEST_ROOT, "feliz.db"));
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
  });

  test("submit creates a thread with an initial job", async () => {
    const { result, lines } = await captureLogs(() =>
      handleCoreCliCommand(
        parseArgs([
          "submit",
          "--project",
          "repo-a",
          "--title",
          "Implement queue runner",
          "--goal",
          "Build the queue runner",
        ]),
        CONFIG_PATH
      )
    );

    expect(result).toBe(true);
    expect(lines[0]).toContain("Created thread");

    const db = openDb();
    expect(db.listThreads()).toHaveLength(1);
    expect(db.listJobs()).toHaveLength(1);
    db.close();
  });

  test("continue appends a job to an existing thread", async () => {
    await handleCoreCliCommand(
      parseArgs([
        "submit",
        "--project",
        "repo-a",
        "--title",
        "Implement queue runner",
        "--goal",
        "Build the queue runner",
      ]),
      CONFIG_PATH
    );

    const db = openDb();
    const thread = db.listThreads()[0]!;
    db.close();

    const { result, lines } = await captureLogs(() =>
      handleCoreCliCommand(
        parseArgs([
          "continue",
          thread.id,
          "--title",
          "Address review feedback",
          "--goal",
          "Add the requested tests",
        ]),
        CONFIG_PATH
      )
    );

    expect(result).toBe(true);
    expect(lines[0]).toContain("Queued job");

    const reopened = openDb();
    expect(reopened.listJobsForThread(thread.id)).toHaveLength(2);
    reopened.close();
  });

  test("job retry moves a failed job back to retry_queued", async () => {
    await handleCoreCliCommand(
      parseArgs([
        "submit",
        "--project",
        "repo-a",
        "--title",
        "Implement queue runner",
        "--goal",
        "Build the queue runner",
      ]),
      CONFIG_PATH
    );

    const db = openDb();
    const job = db.listJobs()[0]!;
    db.updateJob(job.id, { status: "failed" });
    db.close();

    const { result, lines } = await captureLogs(() =>
      handleCoreCliCommand(parseArgs(["job", "retry", job.id]), CONFIG_PATH)
    );

    expect(result).toBe(true);
    expect(lines[0]).toContain("Queued");

    const reopened = openDb();
    expect(reopened.getJob(job.id)?.status).toBe("retry_queued");
    reopened.close();
  });
});
