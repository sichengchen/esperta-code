import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "../../src/db/database.ts";
import {
  WebhookHandler,
  type AgentSessionEvent,
} from "../../src/connectors/linear/webhook.ts";

describe("WebhookHandler", () => {
  let db: Database;
  let handler: WebhookHandler;
  let emitThought: ReturnType<typeof mock>;

  beforeEach(() => {
    db = new Database(":memory:");
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend",
      base_branch: "main",
    });

    emitThought = mock(async () => {});
    handler = new WebhookHandler(db, {
      emitThought,
      emitComment: mock(async () => {}),
      emitError: mock(async () => {}),
    } as any);
  });

  function buildEvent(body?: string): AgentSessionEvent {
    return {
      action: "created",
      type: "AgentSession",
      agentSession: {
        id: "session-1",
        issueId: "lin-1",
        issue: {
          id: "lin-1",
          identifier: "BAC-1",
          title: "Fix auth flow",
          description: "Repair the login callback handling.",
          priority: 2,
          state: { name: "Todo" },
          labels: { nodes: [{ name: "bug" }] },
          project: { name: "Backend" },
          team: { name: "Backend", key: "BAC" },
          url: "https://linear.app/acme/issue/BAC-1/fix-auth-flow",
        },
        promptContext: "",
        comment: body ? { body } : undefined,
      },
    };
  }

  test("creates a thread for a new issue", async () => {
    const result = await handler.handleEvent(buildEvent(), "proj-1");

    const thread = db.getThread(result.threadId);

    expect(thread).not.toBeNull();
    expect(thread!.linear_issue_id).toBe("lin-1");
    expect(thread!.status).toBe("pending");
    expect(emitThought).toHaveBeenCalledWith("session-1", "Looking into this...");
  });

  test("strips the leading mention and appends the initial job", async () => {
    const result = await handler.handleEvent(
      buildEvent("@Feliz please keep the fix minimal"),
      "proj-1"
    );

    const jobs = db.listJobs(result.threadId);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.body).toBe("please keep the fix minimal");
    expect(jobs[0]!.author).toBe("human");
  });

  test("reuses the existing thread for follow-up comments", async () => {
    const first = await handler.handleEvent(buildEvent(), "proj-1");
    const followUp = buildEvent("The callback also needs a regression test.");
    followUp.agentSession.id = "session-2";
    followUp.action = "prompted";

    const second = await handler.handleEvent(followUp, "proj-1");

    const thread = db.getThread(first.threadId);
    const jobs = db.listJobs(first.threadId);

    expect(second.threadId).toBe(first.threadId);
    expect(thread!.linear_session_id).toBe("session-2");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.body).toContain("regression test");
  });

  test("marks a completed thread pending when a new job arrives", async () => {
    const result = await handler.handleEvent(buildEvent(), "proj-1");
    db.updateThreadStatus(result.threadId, "completed");

    const followUp = buildEvent("Handle expired OAuth state too.");
    followUp.agentSession.id = "session-2";
    followUp.action = "prompted";

    await handler.handleEvent(followUp, "proj-1");

    const thread = db.getThread(result.threadId);
    expect(thread!.status).toBe("pending");
  });
});
