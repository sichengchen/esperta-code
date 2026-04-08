import { newId as defaultNewId } from "../id.ts";
import type { Database } from "../db/database.ts";
import type { ExternalEvent, Job, Thread } from "./types.ts";
import { sanitizeIdentifier } from "../workspace/manager.ts";

interface ThreadServiceOptions {
  newId?: () => string;
}

interface RequestedBy {
  type: string;
  id: string;
  [key: string]: unknown;
}

interface JobDraft {
  job_type: string;
  title: string;
  goal: string;
  prompt_payload: Record<string, unknown>;
  requested_by: RequestedBy;
  agent_adapter?: string;
  approval_policy?: string;
  publish_policy?: string;
  verification_commands?: string[];
  priority?: number;
  write_mode?: "workspace_write" | "read_only";
  timeout_ms?: number;
  retry_limit?: number;
  metadata?: Record<string, unknown>;
}

interface CreateThreadInput {
  project_id: string;
  title: string;
  requested_by: RequestedBy;
  metadata?: Record<string, unknown>;
  initial_job?: Omit<JobDraft, "requested_by">;
}

export class ThreadService {
  private readonly db: Database;
  private readonly newId: () => string;

  constructor(db: Database, options: ThreadServiceOptions = {}) {
    this.db = db;
    this.newId = options.newId ?? defaultNewId;
  }

  createThread(input: CreateThreadInput): { thread: Thread; job: Job | null } {
    const project = this.db.getCoreProject(input.project_id);
    if (!project) {
      throw new Error(`Project not found: ${input.project_id}`);
    }

    const threadId = this.newId();
    const branchName = `feliz/thread/${sanitizeIdentifier(threadId)}`;

    this.db.createThread({
      id: threadId,
      project_id: input.project_id,
      title: input.title,
      base_branch: project.default_branch,
      branch_name: branchName,
      current_pr_url: null,
      status: "open",
      metadata: input.metadata ?? {},
    });

    let job: Job | null = null;
    if (input.initial_job) {
      job = this.submitJob(threadId, {
        ...input.initial_job,
        requested_by: input.requested_by,
      });
    }

    return {
      thread: this.db.getThread(threadId)!,
      job,
    };
  }

  continueThread(threadId: string, draft: JobDraft): Job {
    return this.submitJob(threadId, draft);
  }

  attachExternalEvent(
    threadId: string,
    input: {
      source_kind: string;
      source_id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }
  ): ExternalEvent {
    const thread = this.db.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const eventId = this.newId();
    this.db.createExternalEvent({
      id: eventId,
      thread_id: thread.id,
      source_kind: input.source_kind,
      source_id: input.source_id,
      event_type: input.event_type,
      payload: input.payload,
    });

    return this.db.listExternalEventsForThread(thread.id).find((event) => event.id === eventId)!;
  }

  private submitJob(threadId: string, draft: JobDraft): Job {
    const thread = this.db.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const project = this.db.getCoreProject(thread.project_id);
    if (!project) {
      throw new Error(`Project not found: ${thread.project_id}`);
    }

    const profile = project.job_types[draft.job_type] ?? null;
    const jobId = this.newId();

    this.db.createJob({
      id: jobId,
      thread_id: thread.id,
      job_type: draft.job_type,
      agent_adapter: draft.agent_adapter ?? profile?.agent ?? "codex",
      title: draft.title,
      goal: draft.goal,
      prompt_payload: draft.prompt_payload,
      approval_policy: draft.approval_policy ?? "never",
      publish_policy: draft.publish_policy ?? profile?.publish ?? "none",
      verification_commands:
        draft.verification_commands ?? profile?.verify ?? [],
      priority: draft.priority ?? 0,
      requested_by: draft.requested_by,
      write_mode: draft.write_mode ?? profile?.write_mode ?? "workspace_write",
      status: "queued",
      timeout_ms: draft.timeout_ms ?? profile?.timeout_ms ?? 600000,
      retry_limit: draft.retry_limit ?? profile?.retry_limit ?? 0,
      metadata: draft.metadata ?? {},
    });

    this.db.updateThreadStatus(thread.id, "active");
    return this.db.getJob(jobId)!;
  }
}
