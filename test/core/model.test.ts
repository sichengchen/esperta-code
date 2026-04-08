import { describe, expect, test } from "bun:test";
import type {
  Approval,
  Artifact,
  CoreProject,
  ExternalEvent,
  Job,
  JobState,
  RunRecord,
  Thread,
  ThreadLink,
  WorktreeRecord,
} from "../../src/core/types.ts";

describe("Core model types", () => {
  test("CoreProject captures runtime job configuration", () => {
    const project: CoreProject = {
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
      created_at: new Date(),
      updated_at: new Date(),
    };

    expect(project.default_branch).toBe("main");
    expect(project.job_types.implement?.agent).toBe("codex");
  });

  test("Thread is the durable unit of work", () => {
    const thread: Thread = {
      id: "thread-1",
      project_id: "proj-1",
      title: "Implement new queue model",
      base_branch: "main",
      branch_name: "feliz/thread/thread-1",
      current_pr_url: null,
      status: "open",
      metadata: {
        source: "manual",
      },
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
    };

    expect(thread.status).toBe("open");
    expect(thread.branch_name).toContain("thread-1");
  });

  test("Job status covers durable execution lifecycle", () => {
    const states: JobState[] = [
      "queued",
      "preparing",
      "running",
      "waiting_approval",
      "retry_queued",
      "succeeded",
      "failed",
      "cancelled",
    ];

    expect(states).toHaveLength(8);
  });

  test("RunRecord, WorktreeRecord, Artifact, Approval, ExternalEvent, and ThreadLink are durable records", () => {
    const job: Job = {
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
      created_at: new Date(),
      updated_at: new Date(),
      started_at: null,
      finished_at: null,
    };

    const run: RunRecord = {
      id: "run-1",
      job_id: job.id,
      thread_id: job.thread_id,
      project_id: "proj-1",
      worktree_id: "wt-1",
      agent_adapter: "codex",
      attempt: 1,
      status: "created",
      summary: null,
      failure_reason: null,
      verification_status: "pending",
      branch_name: "feliz/thread/thread-1",
      base_branch: "main",
      pr_url: null,
      created_at: new Date(),
      started_at: null,
      finished_at: null,
    };

    const worktree: WorktreeRecord = {
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
      created_at: new Date(),
      last_activity_at: new Date(),
      deleted_at: null,
    };

    const artifact: Artifact = {
      id: "artifact-1",
      thread_id: "thread-1",
      job_id: "job-1",
      run_id: "run-1",
      kind: "summary",
      path: "/tmp/feliz/artifacts/run-1/summary.md",
      summary: "Implemented the queue runner",
      metadata: {},
      created_at: new Date(),
    };

    const approval: Approval = {
      id: "approval-1",
      thread_id: "thread-1",
      job_id: "job-1",
      status: "pending",
      policy: "manual",
      request_payload: {
        reason: "Needs confirmation before publish",
      },
      requested_at: new Date(),
      resolved_at: null,
      resolved_by: null,
    };

    const event: ExternalEvent = {
      id: "event-1",
      thread_id: "thread-1",
      source_kind: "github",
      source_id: "pr-review-1",
      event_type: "review_feedback",
      payload: {
        comments: 2,
      },
      created_at: new Date(),
    };

    const link: ThreadLink = {
      id: "link-1",
      thread_id: "thread-1",
      source_kind: "github",
      external_id: "123",
      label: "pull_request",
      url: "https://github.com/org/repo/pull/123",
      metadata: {},
      created_at: new Date(),
    };

    expect(run.status).toBe("created");
    expect(worktree.state).toBe("active");
    expect(artifact.kind).toBe("summary");
    expect(approval.status).toBe("pending");
    expect(event.event_type).toBe("review_feedback");
    expect(link.label).toBe("pull_request");
  });
});
