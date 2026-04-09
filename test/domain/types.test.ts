import { describe, expect, test } from "bun:test";
import type { Job, Project, Thread } from "../../src/domain/types.ts";

describe("domain types", () => {
  test("Project has the durable repo-level fields", () => {
    const project: Project = {
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend",
      base_branch: "main",
      created_at: new Date(),
    };

    expect(project.name).toBe("backend");
    expect(project.base_branch).toBe("main");
  });

  test("Thread stores workspace linkage and current status", () => {
    const thread: Thread = {
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
      worktree_path: "/tmp/esperta-code/backend/worktrees/BAC-1",
      branch_name: "esperta-code/BAC-1",
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    };

    expect(thread.linear_identifier).toBe("BAC-1");
    expect(thread.status).toBe("pending");
    expect(thread.worktree_path).toContain("BAC-1");
  });

  test("Job is the only unit of guidance in a thread", () => {
    const job: Job = {
      id: "job-1",
      thread_id: "thread-1",
      body: "Retry this with a simpler schema change.",
      author: "human",
      created_at: new Date(),
    };

    expect(job.thread_id).toBe("thread-1");
    expect(job.author).toBe("human");
    expect(job.body).toContain("simpler schema");
  });
});
