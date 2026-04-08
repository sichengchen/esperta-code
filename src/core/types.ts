export type ThreadState =
  | "open"
  | "active"
  | "waiting_input"
  | "blocked"
  | "idle"
  | "archived";

export type JobState =
  | "queued"
  | "preparing"
  | "running"
  | "waiting_approval"
  | "retry_queued"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RunState =
  | "created"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";

export type WorktreeState =
  | "provisioning"
  | "active"
  | "retained"
  | "deleting"
  | "deleted"
  | "orphaned";

export type ApprovalState = "pending" | "approved" | "rejected" | "cancelled";

export type WriteMode = "workspace_write" | "read_only";

export type PublishBehavior =
  | "none"
  | "branch"
  | "update_pr"
  | "draft_pr"
  | "pull_request";

export interface JobTypeProfile {
  agent: string;
  system_prompt: string;
  prompt_template?: string;
  write_mode?: WriteMode;
  verify?: string[];
  publish?: PublishBehavior;
  artifact_expectations?: string[];
  timeout_ms?: number;
  retry_limit?: number;
}

export interface CoreProject {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  runtime_config: Record<string, unknown>;
  concurrency: Record<string, unknown>;
  worktree_policy: Record<string, unknown>;
  job_types: Record<string, JobTypeProfile>;
  created_at: Date;
  updated_at: Date;
}

export interface Thread {
  id: string;
  project_id: string;
  title: string;
  base_branch: string;
  branch_name: string;
  current_pr_url: string | null;
  status: ThreadState;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface Job {
  id: string;
  thread_id: string;
  job_type: string;
  agent_adapter: string;
  title: string;
  goal: string;
  prompt_payload: Record<string, unknown>;
  approval_policy: string;
  publish_policy: PublishBehavior | string;
  verification_commands: string[];
  priority: number;
  requested_by: Record<string, unknown>;
  write_mode: WriteMode;
  status: JobState;
  timeout_ms: number;
  retry_limit: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface RunRecord {
  id: string;
  job_id: string;
  thread_id: string;
  project_id: string;
  worktree_id: string | null;
  agent_adapter: string;
  attempt: number;
  status: RunState;
  summary: string | null;
  failure_reason: string | null;
  verification_status: "pending" | "passed" | "failed";
  branch_name: string;
  base_branch: string;
  pr_url: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface WorktreeRecord {
  id: string;
  project_id: string;
  thread_id: string;
  run_id: string | null;
  path: string;
  branch_name: string;
  base_branch: string;
  state: WorktreeState;
  lease_owner: string | null;
  pinned: boolean;
  retention_reason: string | null;
  retained_until: Date | null;
  created_at: Date;
  last_activity_at: Date;
  deleted_at: Date | null;
}

export interface Artifact {
  id: string;
  thread_id: string;
  job_id: string | null;
  run_id: string | null;
  kind: string;
  path: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface Approval {
  id: string;
  thread_id: string;
  job_id: string;
  status: ApprovalState;
  policy: string;
  request_payload: Record<string, unknown>;
  requested_at: Date;
  resolved_at: Date | null;
  resolved_by: Record<string, unknown> | null;
}

export interface ExternalEvent {
  id: string;
  thread_id: string;
  source_kind: string;
  source_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

export interface ThreadLink {
  id: string;
  thread_id: string;
  source_kind: string;
  external_id: string;
  label: string;
  url: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}
