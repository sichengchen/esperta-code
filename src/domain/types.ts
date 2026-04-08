export interface Project {
  id: string;
  name: string;
  repo_url: string;
  linear_project_name: string;
  base_branch: string;
  created_at: Date;
}

export type ThreadStatus =
  | "pending"
  | "running"
  | "running_dirty"
  | "completed"
  | "failed"
  | "stopped";

export interface Thread {
  id: string;
  project_id: string;
  linear_issue_id: string;
  linear_identifier: string;
  linear_session_id: string | null;
  title: string;
  description: string;
  issue_state: string;
  priority: number;
  labels: string[];
  blocker_ids: string[];
  worktree_path: string | null;
  branch_name: string | null;
  status: ThreadStatus;
  created_at: Date;
  updated_at: Date;
}

export type JobAuthor = "human" | "agent";

export interface Job {
  id: string;
  thread_id: string;
  body: string;
  author: JobAuthor | null;
  created_at: Date;
}

export interface HistoryEntry {
  id: string;
  project_id: string;
  thread_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}
