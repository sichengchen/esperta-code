import { Database as BunSqlite } from "bun:sqlite";
import type {
  HistoryEntry,
  Job,
  JobAuthor,
  Project,
  Thread,
  ThreadStatus,
} from "../domain/types.ts";

export class Database {
  private db: BunSqlite;

  constructor(dbPath: string) {
    this.db = new BunSqlite(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        repo_url TEXT NOT NULL,
        linear_project_name TEXT NOT NULL,
        base_branch TEXT NOT NULL DEFAULT 'main',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        linear_issue_id TEXT NOT NULL UNIQUE,
        linear_identifier TEXT NOT NULL,
        linear_session_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        issue_state TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        labels TEXT NOT NULL DEFAULT '[]',
        blocker_ids TEXT NOT NULL DEFAULT '[]',
        worktree_path TEXT,
        branch_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_threads_linear_identifier
        ON threads(linear_identifier);
      CREATE INDEX IF NOT EXISTS idx_threads_project_status
        ON threads(project_id, status, priority, created_at);

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        body TEXT NOT NULL,
        author TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (thread_id) REFERENCES threads(id)
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_thread_created
        ON jobs(thread_id, created_at);

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        thread_id TEXT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_history_project_thread
        ON history(project_id, thread_id, created_at);
    `);
  }

  listTables(): string[] {
    const rows = this.db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    return rows.map((row) => row.name);
  }

  insertProject(project: {
    id: string;
    name: string;
    repo_url: string;
    linear_project_name: string;
    base_branch: string;
  }) {
    this.db
      .query(
        `INSERT INTO projects (id, name, repo_url, linear_project_name, base_branch)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .run(
        project.id,
        project.name,
        project.repo_url,
        project.linear_project_name,
        project.base_branch
      );
  }

  getProject(id: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    return row ? this.rowToProject(row) : null;
  }

  getProjectByName(name: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE name = ?1")
      .get(name) as Record<string, unknown> | null;
    return row ? this.rowToProject(row) : null;
  }

  listProjects(): Project[] {
    const rows = this.db
      .query("SELECT * FROM projects ORDER BY name")
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToProject(row));
  }

  deleteProject(id: string) {
    this.db.query("DELETE FROM projects WHERE id = ?1").run(id);
  }

  upsertThread(thread: {
    id: string;
    project_id: string;
    linear_issue_id: string;
    linear_identifier: string;
    linear_session_id?: string | null;
    title: string;
    description: string;
    issue_state: string;
    priority: number;
    labels: string[];
    blocker_ids: string[];
    worktree_path?: string | null;
    branch_name?: string | null;
    status: ThreadStatus;
  }) {
    this.db
      .query(
        `INSERT INTO threads (
          id, project_id, linear_issue_id, linear_identifier, linear_session_id,
          title, description, issue_state, priority, labels, blocker_ids,
          worktree_path, branch_name, status
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(id) DO UPDATE SET
          linear_session_id = excluded.linear_session_id,
          title = excluded.title,
          description = excluded.description,
          issue_state = excluded.issue_state,
          priority = excluded.priority,
          labels = excluded.labels,
          blocker_ids = excluded.blocker_ids,
          worktree_path = excluded.worktree_path,
          branch_name = excluded.branch_name,
          status = excluded.status,
          updated_at = datetime('now')`
      )
      .run(
        thread.id,
        thread.project_id,
        thread.linear_issue_id,
        thread.linear_identifier,
        thread.linear_session_id ?? null,
        thread.title,
        thread.description,
        thread.issue_state,
        thread.priority,
        JSON.stringify(thread.labels),
        JSON.stringify(thread.blocker_ids),
        thread.worktree_path ?? null,
        thread.branch_name ?? null,
        thread.status
      );
  }

  getThread(id: string): Thread | null {
    const row = this.db
      .query("SELECT * FROM threads WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    return row ? this.rowToThread(row) : null;
  }

  getThreadByLinearIssueId(linearIssueId: string): Thread | null {
    const row = this.db
      .query("SELECT * FROM threads WHERE linear_issue_id = ?1")
      .get(linearIssueId) as Record<string, unknown> | null;
    return row ? this.rowToThread(row) : null;
  }

  getThreadByLinearIdentifier(identifier: string): Thread | null {
    const row = this.db
      .query("SELECT * FROM threads WHERE linear_identifier = ?1")
      .get(identifier) as Record<string, unknown> | null;
    return row ? this.rowToThread(row) : null;
  }

  listThreadsByProject(projectId: string): Thread[] {
    const rows = this.db
      .query(
        `SELECT * FROM threads
         WHERE project_id = ?1
         ORDER BY priority ASC, created_at ASC`
      )
      .all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToThread(row));
  }

  listThreadsByStatus(projectId: string, status: ThreadStatus): Thread[] {
    const rows = this.db
      .query(
        `SELECT * FROM threads
         WHERE project_id = ?1 AND status = ?2
         ORDER BY priority ASC, created_at ASC`
      )
      .all(projectId, status) as Record<string, unknown>[];
    return rows.map((row) => this.rowToThread(row));
  }

  updateThreadStatus(id: string, status: ThreadStatus) {
    this.db
      .query(
        "UPDATE threads SET status = ?1, updated_at = datetime('now') WHERE id = ?2"
      )
      .run(status, id);
  }

  updateThreadSessionId(id: string, sessionId: string) {
    this.db
      .query(
        `UPDATE threads
         SET linear_session_id = ?1, updated_at = datetime('now')
         WHERE id = ?2`
      )
      .run(sessionId, id);
  }

  updateThreadWorkspace(
    id: string,
    worktreePath: string,
    branchName: string
  ) {
    this.db
      .query(
        `UPDATE threads
         SET worktree_path = ?1, branch_name = ?2, updated_at = datetime('now')
         WHERE id = ?3`
      )
      .run(worktreePath, branchName, id);
  }

  appendJob(job: {
    id: string;
    thread_id: string;
    body: string;
    author?: JobAuthor | null;
  }) {
    this.db
      .query(
        `INSERT INTO jobs (id, thread_id, body, author)
         VALUES (?1, ?2, ?3, ?4)`
      )
      .run(job.id, job.thread_id, job.body, job.author ?? null);
  }

  listJobs(threadId: string, limit = 100): Job[] {
    const rows = this.db
      .query(
        `SELECT * FROM jobs
         WHERE thread_id = ?1
         ORDER BY created_at ASC, rowid ASC
         LIMIT ?2`
      )
      .all(threadId, limit) as Record<string, unknown>[];
    return rows.map((row) => this.rowToJob(row));
  }

  appendHistory(entry: {
    id: string;
    project_id: string;
    thread_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO history (id, project_id, thread_id, event_type, payload)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .run(
        entry.id,
        entry.project_id,
        entry.thread_id,
        entry.event_type,
        JSON.stringify(entry.payload)
      );
  }

  getHistory(projectId: string, threadId?: string | null): HistoryEntry[] {
    if (threadId) {
      const rows = this.db
        .query(
          `SELECT * FROM history
           WHERE project_id = ?1 AND thread_id = ?2
           ORDER BY created_at ASC, rowid ASC`
        )
        .all(projectId, threadId) as Record<string, unknown>[];
      return rows.map((row) => this.rowToHistory(row));
    }

    const rows = this.db
      .query(
        `SELECT * FROM history
         WHERE project_id = ?1
         ORDER BY created_at ASC, rowid ASC`
      )
      .all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToHistory(row));
  }

  countRunningThreads(): number {
    const row = this.db
      .query(
        "SELECT COUNT(*) as count FROM threads WHERE status IN ('running', 'running_dirty')"
      )
      .get() as { count: number };
    return row.count;
  }

  countRunningThreadsByProject(projectId: string): number {
    const row = this.db
      .query(
        `SELECT COUNT(*) as count
         FROM threads
         WHERE project_id = ?1 AND status IN ('running', 'running_dirty')`
      )
      .get(projectId) as { count: number };
    return row.count;
  }

  close() {
    this.db.close();
  }

  private rowToProject(row: Record<string, unknown>): Project {
    return {
      ...row,
      created_at: new Date(row.created_at as string),
    } as unknown as Project;
  }

  private rowToThread(row: Record<string, unknown>): Thread {
    return {
      ...row,
      labels: JSON.parse(String(row.labels ?? "[]")),
      blocker_ids: JSON.parse(String(row.blocker_ids ?? "[]")),
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
    } as unknown as Thread;
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return {
      ...row,
      created_at: new Date(row.created_at as string),
    } as unknown as Job;
  }

  private rowToHistory(row: Record<string, unknown>): HistoryEntry {
    return {
      ...row,
      payload: JSON.parse(String(row.payload ?? "{}")),
      created_at: new Date(row.created_at as string),
    } as unknown as HistoryEntry;
  }
}
