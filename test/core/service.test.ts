import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { Database } from "../../src/db/database.ts";
import { ThreadService } from "../../src/core/service.ts";

const TEST_DB = "/tmp/feliz-thread-service-test.db";

describe("ThreadService", () => {
  let db: Database;
  let service: ThreadService;
  let idCounter: number;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
    idCounter = 0;
    service = new ThreadService(db, {
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
      },
      job_types: {
        implement: {
          agent: "codex",
          system_prompt: ".feliz/prompts/implement.md",
          verify: ["bun test"],
          publish: "draft_pr",
        },
      },
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test("creates a thread with an initial job", () => {
    const result = service.createThread({
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

    expect(result.thread.branch_name).toBe("feliz/thread/id-1");
    expect(result.job?.status).toBe("queued");
    expect(db.getThread("id-1")?.title).toBe("Implement queue runner");
    expect(db.listJobsForThread("id-1")).toHaveLength(1);
  });

  test("continues an existing thread by appending another job", () => {
    const created = service.createThread({
      project_id: "proj-1",
      title: "Implement queue runner",
      requested_by: {
        type: "user",
        id: "alice",
      },
    });

    const job = service.continueThread(created.thread.id, {
      job_type: "continue",
      title: "Address review feedback",
      goal: "Apply the requested review changes",
      prompt_payload: {
        prompt: "Address the latest review feedback",
      },
      requested_by: {
        type: "github_review",
        id: "review-1",
      },
    });

    expect(job.thread_id).toBe(created.thread.id);
    expect(job.status).toBe("queued");
    expect(db.listJobsForThread(created.thread.id)).toHaveLength(1);
  });

  test("attaches external events to a thread", () => {
    const created = service.createThread({
      project_id: "proj-1",
      title: "Implement queue runner",
      requested_by: {
        type: "user",
        id: "alice",
      },
    });

    const event = service.attachExternalEvent(created.thread.id, {
      source_kind: "github",
      source_id: "review-1",
      event_type: "review_feedback",
      payload: {
        body: "Please add tests",
      },
    });

    expect(event.thread_id).toBe(created.thread.id);
    expect(db.listExternalEventsForThread(created.thread.id)).toHaveLength(1);
  });
});
