import type { Database } from "../../db/database.ts";
import type { LinearClient } from "./client.ts";
import { newId } from "../../id.ts";

export interface AgentSessionEvent {
  action: "created" | "prompted";
  type: "AgentSession" | "AgentSessionEvent";
  agentSession: {
    id: string;
    issueId: string;
    issue: {
      id: string;
      identifier: string;
      title: string;
      description?: string;
      priority?: number;
      state?: { name: string };
      labels?: { nodes: { name: string }[] };
      project?: { name: string };
      team?: { name: string; key: string };
      url: string;
    };
    promptContext: string;
    comment?: { body: string };
    signal?: string;
  };
}

export interface WebhookResult {
  threadId: string;
  signal?: string;
}

export class WebhookHandler {
  private db: Database;
  private linearClient: Pick<
    LinearClient,
    "emitThought" | "emitComment" | "emitError"
  >;

  constructor(
    db: Database,
    linearClient: Pick<LinearClient, "emitThought" | "emitComment" | "emitError">
  ) {
    this.db = db;
    this.linearClient = linearClient;
  }

  async handleEvent(
    event: AgentSessionEvent,
    projectId: string
  ): Promise<WebhookResult> {
    const session = event.agentSession;
    const issue = session.issue;
    const body = normalizeJobBody(session.comment?.body);

    if (event.action === "created") {
      await this.linearClient.emitThought(session.id, "Looking into this...");
    }

    const existing = this.db.getThreadByLinearIssueId(issue.id);
    if (existing) {
      this.db.updateThreadSessionId(existing.id, session.id);
      this.refreshThreadFromIssue(existing.id, issue);

      if (body) {
        this.db.appendJob({
          id: newId(),
          thread_id: existing.id,
          body,
          author: "human",
        });
        this.bumpThreadForNewJob(existing.id);
      }

      return { threadId: existing.id, signal: session.signal };
    }

    const threadId = newId();
    this.db.upsertThread({
      id: threadId,
      project_id: projectId,
      linear_issue_id: issue.id,
      linear_identifier: issue.identifier,
      linear_session_id: session.id,
      title: issue.title,
      description: issue.description || "",
      issue_state: issue.state?.name || "Unknown",
      priority: issue.priority ?? 0,
      labels: issue.labels?.nodes.map((label) => label.name) || [],
      blocker_ids: [],
      worktree_path: null,
      branch_name: null,
      status: "pending",
    });

    this.db.appendHistory({
      id: newId(),
      project_id: projectId,
      thread_id: threadId,
      event_type: "thread.created",
      payload: {
        linear_issue_id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
      },
    });

    if (body) {
      this.db.appendJob({
        id: newId(),
        thread_id: threadId,
        body,
        author: "human",
      });
    }

    return { threadId, signal: session.signal };
  }

  private refreshThreadFromIssue(
    threadId: string,
    issue: AgentSessionEvent["agentSession"]["issue"]
  ) {
    const existing = this.db.getThread(threadId);
    if (!existing) return;

    this.db.upsertThread({
      id: existing.id,
      project_id: existing.project_id,
      linear_issue_id: existing.linear_issue_id,
      linear_identifier: issue.identifier,
      linear_session_id: existing.linear_session_id,
      title: issue.title,
      description: issue.description || "",
      issue_state: issue.state?.name || existing.issue_state,
      priority: issue.priority ?? existing.priority,
      labels: issue.labels?.nodes.map((label) => label.name) || existing.labels,
      blocker_ids: existing.blocker_ids,
      worktree_path: existing.worktree_path,
      branch_name: existing.branch_name,
      status: existing.status,
    });
  }

  private bumpThreadForNewJob(threadId: string) {
    const thread = this.db.getThread(threadId);
    if (!thread) return;

    if (thread.status === "running" || thread.status === "running_dirty") {
      this.db.updateThreadStatus(threadId, "running_dirty");
      return;
    }

    this.db.updateThreadStatus(threadId, "pending");
  }
}

function normalizeJobBody(body?: string): string | null {
  if (!body) return null;

  const normalized = body.replace(/^\s*@feliz\b[\s:,-]*/i, "").trim();
  return normalized.length > 0 ? normalized : null;
}
