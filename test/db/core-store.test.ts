import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { Database } from "../../src/db/database.ts";

const TEST_DB = "/tmp/feliz-core-store-test.db";

describe("Database core store", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test("creates core thread/job/worktree tables", () => {
    const tables = db.listTables();
    expect(tables).toContain("threads");
    expect(tables).toContain("jobs");
    expect(tables).toContain("artifacts");
    expect(tables).toContain("approvals");
    expect(tables).toContain("worktrees");
    expect(tables).toContain("external_events");
    expect(tables).toContain("thread_links");
  });

  test("stores and retrieves a core project and thread", () => {
    db.upsertCoreProject({
      id: "proj-1",
      name: "repo-a",
      repo_url: "git@github.com:org/repo-a.git",
      default_branch: "main",
      runtime_config: {
        env: {
          NODE_ENV: "test",
        },
      },
      concurrency: {
        max_jobs: 2,
      },
      worktree_policy: {
        retain_on_success_minutes: 30,
        retain_on_failure_hours: 24,
        prune_after_days: 7,
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

    db.createThread({
      id: "thread-1",
      project_id: "proj-1",
      title: "Implement queue runner",
      base_branch: "main",
      branch_name: "feliz/thread/thread-1",
      current_pr_url: null,
      status: "open",
      metadata: {
        source: "manual",
      },
    });

    const project = db.getCoreProject("proj-1");
    const thread = db.getThread("thread-1");

    expect(project?.default_branch).toBe("main");
    expect(project?.worktree_policy.retain_on_failure_hours).toBe(24);
    expect(thread?.branch_name).toBe("feliz/thread/thread-1");
    expect(thread?.status).toBe("open");
  });

  test("stores jobs, runs, worktrees, artifacts, approvals, and external references", () => {
    db.upsertCoreProject({
      id: "proj-1",
      name: "repo-a",
      repo_url: "git@github.com:org/repo-a.git",
      default_branch: "main",
      runtime_config: {},
      concurrency: {
        max_jobs: 2,
      },
      worktree_policy: {},
      job_types: {},
    });

    db.createThread({
      id: "thread-1",
      project_id: "proj-1",
      title: "Implement queue runner",
      base_branch: "main",
      branch_name: "feliz/thread/thread-1",
      current_pr_url: null,
      status: "active",
      metadata: {},
    });

    db.createJob({
      id: "job-1",
      thread_id: "thread-1",
      job_type: "implement",
      agent_adapter: "codex",
      title: "Implement queue runner",
      goal: "Build the queue runner",
      prompt_payload: {
        prompt: "Implement the queue runner",
      },
      approval_policy: "never",
      publish_policy: "draft_pr",
      verification_commands: ["bun test"],
      priority: 10,
      requested_by: {
        type: "user",
        id: "alice",
      },
      write_mode: "workspace_write",
      status: "queued",
      timeout_ms: 600000,
      retry_limit: 2,
      metadata: {},
    });

    db.createRunRecord({
      id: "run-1",
      job_id: "job-1",
      thread_id: "thread-1",
      project_id: "proj-1",
      worktree_id: "wt-1",
      agent_adapter: "codex",
      attempt: 1,
      status: "created",
      verification_status: "pending",
      branch_name: "feliz/thread/thread-1",
      base_branch: "main",
    });

    db.createWorktreeRecord({
      id: "wt-1",
      project_id: "proj-1",
      thread_id: "thread-1",
      run_id: "run-1",
      path: "/tmp/feliz/repo-a/worktrees/thread-1/run-1",
      branch_name: "feliz/thread/thread-1",
      base_branch: "main",
      state: "active",
      lease_owner: "job-1",
      pinned: false,
      retention_reason: null,
      retained_until: null,
    });

    db.addArtifact({
      id: "artifact-1",
      thread_id: "thread-1",
      job_id: "job-1",
      run_id: "run-1",
      kind: "summary",
      path: "/tmp/feliz/artifacts/run-1/summary.md",
      summary: "Implemented queue runner",
      metadata: {},
    });

    db.createApproval({
      id: "approval-1",
      thread_id: "thread-1",
      job_id: "job-1",
      status: "pending",
      policy: "manual",
      request_payload: {
        reason: "Confirm publish",
      },
      resolved_by: null,
    });

    db.createExternalEvent({
      id: "event-1",
      thread_id: "thread-1",
      source_kind: "github",
      source_id: "review-1",
      event_type: "review_feedback",
      payload: {
        comment_count: 2,
      },
    });

    db.createThreadLink({
      id: "link-1",
      thread_id: "thread-1",
      source_kind: "github",
      external_id: "123",
      label: "pull_request",
      url: "https://github.com/org/repo/pull/123",
      metadata: {},
    });

    expect(db.getJob("job-1")?.status).toBe("queued");
    expect(db.getRunRecord("run-1")?.status).toBe("created");
    expect(db.getWorktreeRecord("wt-1")?.state).toBe("active");
    expect(db.listArtifactsForThread("thread-1")).toHaveLength(1);
    expect(db.listApprovalsForThread("thread-1")).toHaveLength(1);
    expect(db.listExternalEventsForThread("thread-1")).toHaveLength(1);
    expect(db.listThreadLinks("thread-1")).toHaveLength(1);
  });

  test("tracks active write jobs per thread", () => {
    db.upsertCoreProject({
      id: "proj-1",
      name: "repo-a",
      repo_url: "git@github.com:org/repo-a.git",
      default_branch: "main",
      runtime_config: {},
      concurrency: {},
      worktree_policy: {},
      job_types: {},
    });

    db.createThread({
      id: "thread-1",
      project_id: "proj-1",
      title: "Implement queue runner",
      base_branch: "main",
      branch_name: "feliz/thread/thread-1",
      current_pr_url: null,
      status: "active",
      metadata: {},
    });

    db.createJob({
      id: "job-write",
      thread_id: "thread-1",
      job_type: "implement",
      agent_adapter: "codex",
      title: "Write",
      goal: "Write code",
      prompt_payload: {},
      approval_policy: "never",
      publish_policy: "none",
      verification_commands: [],
      priority: 1,
      requested_by: {
        type: "user",
        id: "alice",
      },
      write_mode: "workspace_write",
      status: "running",
      timeout_ms: 600000,
      retry_limit: 0,
      metadata: {},
    });

    db.createJob({
      id: "job-read",
      thread_id: "thread-1",
      job_type: "review",
      agent_adapter: "codex",
      title: "Review",
      goal: "Review code",
      prompt_payload: {},
      approval_policy: "never",
      publish_policy: "none",
      verification_commands: [],
      priority: 1,
      requested_by: {
        type: "user",
        id: "alice",
      },
      write_mode: "read_only",
      status: "running",
      timeout_ms: 600000,
      retry_limit: 0,
      metadata: {},
    });

    expect(db.countActiveWriteJobsForThread("thread-1")).toBe(1);
    expect(db.listJobsForThread("thread-1")).toHaveLength(2);
  });
});
