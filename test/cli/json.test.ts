import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { handleJsonCliCommand } from "../../src/cli/json.ts";
import { Database } from "../../src/db/database.ts";
import { parseArgs } from "../../src/cli/commands.ts";

const TEST_ROOT = "/tmp/feliz-cli-json-test";
const CONFIG_PATH = join(TEST_ROOT, "feliz.yml");

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
      continue:
        agent: codex
        system_prompt: .feliz/prompts/continue.md
        verify: []
        publish: update_pr
`,
    "utf-8"
  );
}

function openDb(): Database {
  return new Database(join(TEST_ROOT, "db", "feliz.db"));
}

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

function parseJsonLine<T>(lines: string[]): T {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]!) as T;
}

describe("JSON CLI interface", () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    writeConfig();
  });

  afterEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
  });

  test("capabilities returns supported actions for local agents", async () => {
    const { result, lines } = await captureLogs(() =>
      handleJsonCliCommand(
        parseArgs(["json"]),
        CONFIG_PATH,
        JSON.stringify({
          version: "v1",
          id: "req-1",
          client: {
            name: "esperta-base",
            cwd: "~/src/sa",
          },
          action: "capabilities",
        })
      )
    );

    expect(result).toBe(true);
    const response = parseJsonLine<{
      ok: boolean;
      id: string;
      result: {
        actions: string[];
      };
    }>(lines);
    expect(response.ok).toBe(true);
    expect(response.id).toBe("req-1");
    expect(response.result.actions).toContain("thread.start");
    expect(response.result.actions).toContain("thread.continue");
    expect(response.result.actions).toContain("thread.get");
    expect(response.result.actions).toContain("worktree.get");
  });

  test("thread.start creates a thread and job with local-agent metadata", async () => {
    const { result, lines } = await captureLogs(() =>
      handleJsonCliCommand(
        parseArgs(["json"]),
        CONFIG_PATH,
        JSON.stringify({
          version: "v1",
          id: "req-2",
          client: {
            name: "esperta-base",
            cwd: "~/src/sa",
          },
          action: "thread.start",
          input: {
            project: "repo-a",
            job_type: "implement",
            instruction: "Build the queue runner",
          },
        })
      )
    );

    expect(result).toBe(true);
    const response = parseJsonLine<{
      ok: boolean;
      result: {
        thread: {
          id: string;
          summary: string;
        };
        job: {
          id: string;
          summary: string;
          instruction: string;
          requested_by: {
            type: string;
            id: string;
            client: {
              cwd: string;
            };
          };
        };
      };
    }>(lines);
    expect(response.ok).toBe(true);
    expect(response.result.thread.summary).toBe("Build the queue runner");
    expect(response.result.job.summary).toBe("Build the queue runner");
    expect(response.result.job.instruction).toBe("Build the queue runner");
    expect(response.result.job.requested_by.type).toBe("local_agent");
    expect(response.result.job.requested_by.id).toBe("esperta-base");
    expect(response.result.job.requested_by.client.cwd).toBe("~/src/sa");

    const db = openDb();
    expect(db.listThreads()).toHaveLength(1);
    expect(db.listJobs()).toHaveLength(1);
    db.close();
  });

  test("thread.continue appends a job to an existing thread", async () => {
    const submit = await captureLogs(() =>
      handleJsonCliCommand(
        parseArgs(["json"]),
        CONFIG_PATH,
        JSON.stringify({
          version: "v1",
          action: "thread.start",
          input: {
            project: "repo-a",
            instruction: "Build the queue runner",
          },
        })
      )
    );
    const submitResponse = parseJsonLine<{
      result: {
        thread: {
          id: string;
        };
      };
    }>(submit.lines);

    const { result, lines } = await captureLogs(() =>
      handleJsonCliCommand(
        parseArgs(["json"]),
        CONFIG_PATH,
        JSON.stringify({
          version: "v1",
          action: "thread.continue",
          input: {
            thread_id: submitResponse.result.thread.id,
            summary: "Address review feedback",
            instruction: "Add the requested tests",
          },
        })
      )
    );

    expect(result).toBe(true);
    const response = parseJsonLine<{
      ok: boolean;
      result: {
        job: {
          thread_id: string;
          summary: string;
          instruction: string;
          job_type: string;
        };
      };
    }>(lines);
    expect(response.ok).toBe(true);
    expect(response.result.job.thread_id).toBe(submitResponse.result.thread.id);
    expect(response.result.job.summary).toBe("Address review feedback");
    expect(response.result.job.instruction).toBe("Add the requested tests");
    expect(response.result.job.job_type).toBe("continue");

    const db = openDb();
    expect(db.listJobsForThread(submitResponse.result.thread.id)).toHaveLength(2);
    db.close();
  });

  test("thread.get returns the thread timeline snapshot", async () => {
    const submit = await captureLogs(() =>
      handleJsonCliCommand(
        parseArgs(["json"]),
        CONFIG_PATH,
        JSON.stringify({
          version: "v1",
          action: "thread.start",
          input: {
            project: "repo-a",
            instruction: "Build the queue runner",
          },
        })
      )
    );
    const submitResponse = parseJsonLine<{
      result: {
        thread: {
          id: string;
        };
        job: {
          id: string;
        };
      };
    }>(submit.lines);

    const db = openDb();
    db.createExternalEvent({
      id: "event-1",
      thread_id: submitResponse.result.thread.id,
      source_kind: "github",
      source_id: "pr-123",
      event_type: "ci_failed",
      payload: {
        check: "test",
      },
    });
    db.createThreadLink({
      id: "link-1",
      thread_id: submitResponse.result.thread.id,
      source_kind: "github",
      external_id: "123",
      label: "pull_request",
      url: "https://example.com/pr/123",
      metadata: {},
    });
    db.close();

    const { result, lines } = await captureLogs(() =>
      handleJsonCliCommand(
        parseArgs(["json"]),
        CONFIG_PATH,
        JSON.stringify({
          version: "v1",
          action: "thread.get",
          input: {
            thread_id: submitResponse.result.thread.id,
          },
        })
      )
    );

    expect(result).toBe(true);
    const response = parseJsonLine<{
      ok: boolean;
      result: {
        thread: {
          id: string;
          summary: string;
        };
        jobs: Array<{ id: string; summary: string; instruction: string }>;
        events: Array<{ id: string; event_type: string }>;
        links: Array<{ id: string; label: string }>;
      };
    }>(lines);
    expect(response.ok).toBe(true);
    expect(response.result.thread.id).toBe(submitResponse.result.thread.id);
    expect(response.result.thread.summary).toBe("Build the queue runner");
    expect(response.result.jobs).toHaveLength(1);
    expect(response.result.jobs[0]?.id).toBe(submitResponse.result.job.id);
    expect(response.result.jobs[0]?.summary).toBe("Build the queue runner");
    expect(response.result.jobs[0]?.instruction).toBe("Build the queue runner");
    expect(response.result.events[0]?.event_type).toBe("ci_failed");
    expect(response.result.links[0]?.label).toBe("pull_request");
  });

  test("unknown actions return a structured error", async () => {
    const { result, lines } = await captureLogs(() =>
      handleJsonCliCommand(
        parseArgs(["json"]),
        CONFIG_PATH,
        JSON.stringify({
          version: "v1",
          action: "thread.merge",
        })
      )
    );

    expect(result).toBe(true);
    const response = parseJsonLine<{
      ok: boolean;
      error: {
        code: string;
      };
    }>(lines);
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("unknown_action");
  });

  test("invalid request versions return a validation error", async () => {
    const { result, lines } = await captureLogs(() =>
      handleJsonCliCommand(
        parseArgs(["json"]),
        CONFIG_PATH,
        JSON.stringify({
          version: "v2",
          action: "capabilities",
        })
      )
    );

    expect(result).toBe(true);
    const response = parseJsonLine<{
      ok: boolean;
      error: {
        code: string;
      };
    }>(lines);
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("invalid_request");
  });
});
