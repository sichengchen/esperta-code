import { Database as BunSqlite } from "bun:sqlite";
import type {
  Project,
  WorkItem,
  Run,
  StepExecution,
  HistoryEntry,
  ContextSnapshot,
  RunResult,
  StepResult,
} from "../domain/types.ts";
import type {
  Approval,
  Artifact,
  CoreProject,
  ExternalEvent,
  Job,
  RunRecord,
  Thread,
  ThreadLink,
  WorktreeRecord,
} from "../core/types.ts";

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
        linear_project_name TEXT NOT NULL DEFAULT '',
        base_branch TEXT NOT NULL DEFAULT 'main',
        runtime_config TEXT NOT NULL DEFAULT '{}',
        concurrency_config TEXT NOT NULL DEFAULT '{}',
        worktree_policy TEXT NOT NULL DEFAULT '{}',
        job_types TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        linear_id TEXT NOT NULL UNIQUE,
        linear_identifier TEXT NOT NULL,
        project_id TEXT NOT NULL,
        parent_work_item_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        labels TEXT NOT NULL DEFAULT '[]',
        blocker_ids TEXT NOT NULL DEFAULT '[]',
        orchestration_state TEXT NOT NULL DEFAULT 'unclaimed',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_work_items_linear_identifier
        ON work_items(linear_identifier);

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        work_item_id TEXT,
        job_id TEXT,
        thread_id TEXT,
        project_id TEXT,
        worktree_id TEXT,
        agent_adapter TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        current_phase TEXT NOT NULL DEFAULT '',
        current_step TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT,
        result TEXT,
        summary TEXT,
        failure_reason TEXT,
        verification_status TEXT NOT NULL DEFAULT 'pending',
        branch_name TEXT,
        base_branch TEXT,
        context_snapshot_id TEXT NOT NULL DEFAULT '',
        pr_url TEXT,
        token_usage TEXT,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      );

      CREATE TABLE IF NOT EXISTS step_executions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        phase_name TEXT NOT NULL,
        step_name TEXT NOT NULL,
        cycle INTEGER NOT NULL DEFAULT 1,
        step_attempt INTEGER NOT NULL DEFAULT 1,
        agent_adapter TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        result TEXT,
        exit_code INTEGER,
        failure_reason TEXT,
        token_usage TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        work_item_id TEXT,
        run_id TEXT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_history_project_item
        ON history(project_id, work_item_id, created_at);

      CREATE TABLE IF NOT EXISTS context_snapshots (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        work_item_id TEXT NOT NULL,
        artifact_refs TEXT NOT NULL DEFAULT '[]',
        token_budget TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS scratchpad (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        work_item_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        step_execution_id TEXT,
        kind TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        file_path TEXT NOT NULL,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        promoted_to_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_scratchpad_run
        ON scratchpad(run_id, status);

      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        current_pr_url TEXT,
        status TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        latest_job_id TEXT,
        latest_run_id TEXT,
        latest_artifact_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        archived_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_threads_project_status
        ON threads(project_id, status, created_at);

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        agent_adapter TEXT NOT NULL,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        prompt_payload TEXT NOT NULL DEFAULT '{}',
        approval_policy TEXT NOT NULL,
        publish_policy TEXT NOT NULL,
        verification_commands TEXT NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        requested_by TEXT NOT NULL DEFAULT '{}',
        write_mode TEXT NOT NULL DEFAULT 'workspace_write',
        status TEXT NOT NULL DEFAULT 'queued',
        timeout_ms INTEGER NOT NULL DEFAULT 600000,
        retry_limit INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}',
        latest_run_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        finished_at TEXT,
        FOREIGN KEY (thread_id) REFERENCES threads(id)
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_thread_status
        ON jobs(thread_id, status, created_at);

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        job_id TEXT,
        run_id TEXT,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        summary TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (thread_id) REFERENCES threads(id)
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_thread_created
        ON artifacts(thread_id, created_at);

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        policy TEXT NOT NULL,
        request_payload TEXT NOT NULL DEFAULT '{}',
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        resolved_by TEXT,
        FOREIGN KEY (thread_id) REFERENCES threads(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_thread_status
        ON approvals(thread_id, status, requested_at);

      CREATE TABLE IF NOT EXISTS worktrees (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        run_id TEXT,
        path TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        state TEXT NOT NULL,
        lease_owner TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        retention_reason TEXT,
        retained_until TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (thread_id) REFERENCES threads(id)
      );
      CREATE INDEX IF NOT EXISTS idx_worktrees_thread_state
        ON worktrees(thread_id, state, created_at);

      CREATE TABLE IF NOT EXISTS external_events (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (thread_id) REFERENCES threads(id)
      );
      CREATE INDEX IF NOT EXISTS idx_external_events_thread_created
        ON external_events(thread_id, created_at);

      CREATE TABLE IF NOT EXISTS thread_links (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        external_id TEXT NOT NULL,
        label TEXT NOT NULL,
        url TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (thread_id) REFERENCES threads(id)
      );
      CREATE INDEX IF NOT EXISTS idx_thread_links_thread_label
        ON thread_links(thread_id, label, created_at);
    `);

    try {
      this.db.exec(`ALTER TABLE work_items ADD COLUMN linear_session_id TEXT`);
    } catch {
      // Column already exists
    }

    const alterStatements = [
      `ALTER TABLE projects ADD COLUMN runtime_config TEXT NOT NULL DEFAULT '{}'`,
      `ALTER TABLE projects ADD COLUMN concurrency_config TEXT NOT NULL DEFAULT '{}'`,
      `ALTER TABLE projects ADD COLUMN worktree_policy TEXT NOT NULL DEFAULT '{}'`,
      `ALTER TABLE projects ADD COLUMN job_types TEXT NOT NULL DEFAULT '{}'`,
      `ALTER TABLE projects ADD COLUMN updated_at TEXT`,
      `ALTER TABLE runs ADD COLUMN job_id TEXT`,
      `ALTER TABLE runs ADD COLUMN thread_id TEXT`,
      `ALTER TABLE runs ADD COLUMN project_id TEXT`,
      `ALTER TABLE runs ADD COLUMN worktree_id TEXT`,
      `ALTER TABLE runs ADD COLUMN agent_adapter TEXT`,
      `ALTER TABLE runs ADD COLUMN created_at TEXT`,
      `ALTER TABLE runs ADD COLUMN status TEXT`,
      `ALTER TABLE runs ADD COLUMN summary TEXT`,
      `ALTER TABLE runs ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE runs ADD COLUMN branch_name TEXT`,
      `ALTER TABLE runs ADD COLUMN base_branch TEXT`,
    ];

    for (const statement of alterStatements) {
      try {
        this.db.exec(statement);
      } catch {
        // Column already exists
      }
    }
  }

  listTables(): string[] {
    const rows = this.db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  // Projects
  insertProject(p: {
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
      .run(p.id, p.name, p.repo_url, p.linear_project_name, p.base_branch);
  }

  getProject(id: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      ...row,
      created_at: new Date(row.created_at as string),
    } as unknown as Project;
  }

  getProjectByName(name: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE name = ?1")
      .get(name) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      ...row,
      created_at: new Date(row.created_at as string),
    } as unknown as Project;
  }

  listProjects(): Project[] {
    const rows = this.db
      .query("SELECT * FROM projects ORDER BY name")
      .all() as Record<string, unknown>[];
    return rows.map(
      (row) =>
        ({
          ...row,
          created_at: new Date(row.created_at as string),
        }) as unknown as Project
    );
  }

  deleteProject(id: string) {
    this.db.query("DELETE FROM projects WHERE id = ?1").run(id);
  }

  // Core projects
  upsertCoreProject(project: {
    id: string;
    name: string;
    repo_url: string;
    default_branch: string;
    runtime_config: Record<string, unknown>;
    concurrency: Record<string, unknown>;
    worktree_policy: Record<string, unknown>;
    job_types: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO projects (
          id, name, repo_url, linear_project_name, base_branch,
          runtime_config, concurrency_config, worktree_policy, job_types, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          repo_url = excluded.repo_url,
          base_branch = excluded.base_branch,
          runtime_config = excluded.runtime_config,
          concurrency_config = excluded.concurrency_config,
          worktree_policy = excluded.worktree_policy,
          job_types = excluded.job_types,
          updated_at = datetime('now')`
      )
      .run(
        project.id,
        project.name,
        project.repo_url,
        project.name,
        project.default_branch,
        JSON.stringify(project.runtime_config),
        JSON.stringify(project.concurrency),
        JSON.stringify(project.worktree_policy),
        JSON.stringify(project.job_types)
      );
  }

  getCoreProject(id: string): CoreProject | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToCoreProject(row);
  }

  private rowToCoreProject(row: Record<string, unknown>): CoreProject {
    return {
      id: row.id as string,
      name: row.name as string,
      repo_url: row.repo_url as string,
      default_branch: (row.base_branch as string) || "main",
      runtime_config: this.parseJsonObject(row.runtime_config, {}),
      concurrency: this.parseJsonObject(row.concurrency_config, {}),
      worktree_policy: this.parseJsonObject(row.worktree_policy, {}),
      job_types: this.parseJsonObject(row.job_types, {}),
      created_at: new Date(row.created_at as string),
      updated_at: row.updated_at
        ? new Date(row.updated_at as string)
        : new Date(row.created_at as string),
    };
  }

  // Threads
  createThread(thread: {
    id: string;
    project_id: string;
    title: string;
    base_branch: string;
    branch_name: string;
    current_pr_url: string | null;
    status: string;
    metadata: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO threads (
          id, project_id, title, base_branch, branch_name, current_pr_url, status, metadata
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .run(
        thread.id,
        thread.project_id,
        thread.title,
        thread.base_branch,
        thread.branch_name,
        thread.current_pr_url,
        thread.status,
        JSON.stringify(thread.metadata)
      );
  }

  getThread(id: string): Thread | null {
    const row = this.db
      .query("SELECT * FROM threads WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToThread(row);
  }

  listThreads(projectId?: string): Thread[] {
    const rows = projectId
      ? (this.db
          .query(
            "SELECT * FROM threads WHERE project_id = ?1 ORDER BY updated_at DESC, rowid DESC"
          )
          .all(projectId) as Record<string, unknown>[])
      : (this.db
          .query("SELECT * FROM threads ORDER BY updated_at DESC, rowid DESC")
          .all() as Record<string, unknown>[]);
    return rows.map((row) => this.rowToThread(row));
  }

  updateThreadStatus(id: string, status: string) {
    this.db
      .query("UPDATE threads SET status = ?1, updated_at = datetime('now') WHERE id = ?2")
      .run(status, id);
  }

  private rowToThread(row: Record<string, unknown>): Thread {
    return {
      id: row.id as string,
      project_id: row.project_id as string,
      title: row.title as string,
      base_branch: row.base_branch as string,
      branch_name: row.branch_name as string,
      current_pr_url: (row.current_pr_url as string | null) ?? null,
      status: row.status as Thread["status"],
      metadata: this.parseJsonObject(row.metadata, {}),
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
      archived_at: row.archived_at ? new Date(row.archived_at as string) : null,
    };
  }

  // Jobs
  createJob(job: {
    id: string;
    thread_id: string;
    job_type: string;
    agent_adapter: string;
    title: string;
    goal: string;
    prompt_payload: Record<string, unknown>;
    approval_policy: string;
    publish_policy: string;
    verification_commands: string[];
    priority: number;
    requested_by: Record<string, unknown>;
    write_mode: string;
    status: string;
    timeout_ms: number;
    retry_limit: number;
    metadata: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO jobs (
          id, thread_id, job_type, agent_adapter, title, goal, prompt_payload,
          approval_policy, publish_policy, verification_commands, priority,
          requested_by, write_mode, status, timeout_ms, retry_limit, metadata
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`
      )
      .run(
        job.id,
        job.thread_id,
        job.job_type,
        job.agent_adapter,
        job.title,
        job.goal,
        JSON.stringify(job.prompt_payload),
        job.approval_policy,
        job.publish_policy,
        JSON.stringify(job.verification_commands),
        job.priority,
        JSON.stringify(job.requested_by),
        job.write_mode,
        job.status,
        job.timeout_ms,
        job.retry_limit,
        JSON.stringify(job.metadata)
      );
  }

  getJob(id: string): Job | null {
    const row = this.db
      .query("SELECT * FROM jobs WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToJob(row);
  }

  listJobsForThread(threadId: string): Job[] {
    const rows = this.db
      .query("SELECT * FROM jobs WHERE thread_id = ?1 ORDER BY created_at ASC, rowid ASC")
      .all(threadId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToJob(row));
  }

  countActiveWriteJobsForThread(threadId: string): number {
    const row = this.db
      .query(
        `SELECT COUNT(*) as count
         FROM jobs
         WHERE thread_id = ?1
           AND write_mode != 'read_only'
           AND status IN ('preparing', 'running', 'waiting_approval')`
      )
      .get(threadId) as { count: number };
    return row.count;
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      thread_id: row.thread_id as string,
      job_type: row.job_type as string,
      agent_adapter: row.agent_adapter as string,
      title: row.title as string,
      goal: row.goal as string,
      prompt_payload: this.parseJsonObject(row.prompt_payload, {}),
      approval_policy: row.approval_policy as string,
      publish_policy: row.publish_policy as string,
      verification_commands: this.parseJsonArray(row.verification_commands),
      priority: Number(row.priority),
      requested_by: this.parseJsonObject(row.requested_by, {}),
      write_mode: row.write_mode as Job["write_mode"],
      status: row.status as Job["status"],
      timeout_ms: Number(row.timeout_ms),
      retry_limit: Number(row.retry_limit),
      metadata: this.parseJsonObject(row.metadata, {}),
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
      started_at: row.started_at ? new Date(row.started_at as string) : null,
      finished_at: row.finished_at ? new Date(row.finished_at as string) : null,
    };
  }

  // WorkItems
  upsertWorkItem(wi: {
    id: string;
    linear_id: string;
    linear_identifier: string;
    project_id: string;
    parent_work_item_id: string | null;
    title: string;
    description: string;
    state: string;
    priority: number;
    labels: string[];
    blocker_ids: string[];
    orchestration_state: string;
    linear_session_id?: string | null;
  }) {
    this.db
      .query(
        `INSERT INTO work_items (id, linear_id, linear_identifier, project_id,
          parent_work_item_id, title, description, state, priority, labels,
          blocker_ids, orchestration_state, linear_session_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          state = excluded.state,
          priority = excluded.priority,
          labels = excluded.labels,
          blocker_ids = excluded.blocker_ids,
          orchestration_state = excluded.orchestration_state,
          updated_at = datetime('now')`
      )
      .run(
        wi.id,
        wi.linear_id,
        wi.linear_identifier,
        wi.project_id,
        wi.parent_work_item_id,
        wi.title,
        wi.description,
        wi.state,
        wi.priority,
        JSON.stringify(wi.labels),
        JSON.stringify(wi.blocker_ids),
        wi.orchestration_state,
        wi.linear_session_id ?? null
      );
  }

  updateWorkItemSessionId(id: string, sessionId: string) {
    this.db
      .query(
        "UPDATE work_items SET linear_session_id = ?1, updated_at = datetime('now') WHERE id = ?2"
      )
      .run(sessionId, id);
  }

  getWorkItem(id: string): WorkItem | null {
    const row = this.db
      .query("SELECT * FROM work_items WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToWorkItem(row);
  }

  getWorkItemByLinearId(linearId: string): WorkItem | null {
    const row = this.db
      .query("SELECT * FROM work_items WHERE linear_id = ?1")
      .get(linearId) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToWorkItem(row);
  }

  listWorkItemsByProject(projectId: string): WorkItem[] {
    const rows = this.db
      .query(
        "SELECT * FROM work_items WHERE project_id = ?1 ORDER BY priority ASC, created_at ASC"
      )
      .all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToWorkItem(row));
  }

  listWorkItemsByState(projectId: string, state: string): WorkItem[] {
    const rows = this.db
      .query(
        "SELECT * FROM work_items WHERE project_id = ?1 AND orchestration_state = ?2 ORDER BY priority ASC, created_at ASC"
      )
      .all(projectId, state) as Record<string, unknown>[];
    return rows.map((row) => this.rowToWorkItem(row));
  }

  updateWorkItemOrchestrationState(id: string, state: string) {
    this.db
      .query(
        "UPDATE work_items SET orchestration_state = ?1, updated_at = datetime('now') WHERE id = ?2"
      )
      .run(state, id);
  }

  private rowToWorkItem(row: Record<string, unknown>): WorkItem {
    return {
      ...row,
      labels: JSON.parse(row.labels as string),
      blocker_ids: JSON.parse(row.blocker_ids as string),
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
    } as unknown as WorkItem;
  }

  // History
  appendHistory(entry: {
    id: string;
    project_id: string;
    work_item_id: string | null;
    run_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO history (id, project_id, work_item_id, run_id, event_type, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .run(
        entry.id,
        entry.project_id,
        entry.work_item_id,
        entry.run_id,
        entry.event_type,
        JSON.stringify(entry.payload)
      );
  }

  getHistory(
    projectId: string,
    workItemId?: string | null,
    limit = 100
  ): HistoryEntry[] {
    let sql = "SELECT * FROM history WHERE project_id = ?1";
    const params: unknown[] = [projectId];
    if (workItemId) {
      sql += " AND work_item_id = ?2";
      params.push(workItemId);
    }
    sql += ` ORDER BY created_at ASC, rowid ASC LIMIT ?${params.length + 1}`;
    params.push(limit);

    const rows = this.db.query(sql).all(...(params as [string, ...string[]])) as Record<
      string,
      unknown
    >[];
    return rows.map(
      (row) =>
        ({
          ...row,
          payload: JSON.parse(row.payload as string),
          created_at: new Date(row.created_at as string),
        }) as unknown as HistoryEntry
    );
  }

  // Runs
  insertRun(run: {
    id: string;
    work_item_id: string;
    attempt: number;
    current_phase: string;
    current_step: string;
    context_snapshot_id: string;
  }) {
    this.db
      .query(
        `INSERT INTO runs (id, work_item_id, attempt, current_phase, current_step, context_snapshot_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .run(
        run.id,
        run.work_item_id,
        run.attempt,
        run.current_phase,
        run.current_step,
        run.context_snapshot_id
      );
  }

  getRun(id: string): Run | null {
    const row = this.db
      .query("SELECT * FROM runs WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToRun(row);
  }

  updateRunResult(
    id: string,
    result: RunResult,
    failureReason: string | null,
    prUrl: string | null
  ) {
    this.db
      .query(
        `UPDATE runs SET result = ?1, failure_reason = ?2, pr_url = ?3,
         finished_at = datetime('now') WHERE id = ?4`
      )
      .run(result, failureReason, prUrl, id);
  }

  updateRunProgress(id: string, phase: string, step: string) {
    this.db
      .query(
        "UPDATE runs SET current_phase = ?1, current_step = ?2 WHERE id = ?3"
      )
      .run(phase, step, id);
  }

  getLatestRunForWorkItem(workItemId: string): Run | null {
    const row = this.db
      .query(
        "SELECT * FROM runs WHERE work_item_id = ?1 ORDER BY attempt DESC LIMIT 1"
      )
      .get(workItemId) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToRun(row);
  }

  private rowToRun(row: Record<string, unknown>): Run {
    return {
      ...row,
      started_at: new Date(row.started_at as string),
      finished_at: row.finished_at
        ? new Date(row.finished_at as string)
        : null,
      token_usage: row.token_usage
        ? JSON.parse(row.token_usage as string)
        : null,
    } as unknown as Run;
  }

  createRunRecord(run: {
    id: string;
    job_id: string;
    thread_id: string;
    project_id: string;
    worktree_id: string | null;
    agent_adapter: string;
    attempt: number;
    status: string;
    verification_status: string;
    branch_name: string;
    base_branch: string;
  }) {
    this.db
      .query(
        `INSERT INTO runs (
          id, work_item_id, job_id, thread_id, project_id, worktree_id, agent_adapter,
          attempt, current_phase, current_step, context_snapshot_id, status,
          verification_status, branch_name, base_branch
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', '', '', ?9, ?10, ?11, ?12)`
      )
      .run(
        run.id,
        null,
        run.job_id,
        run.thread_id,
        run.project_id,
        run.worktree_id,
        run.agent_adapter,
        run.attempt,
        run.status,
        run.verification_status,
        run.branch_name,
        run.base_branch
      );
  }

  getRunRecord(id: string): RunRecord | null {
    const row = this.db
      .query("SELECT * FROM runs WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToRunRecord(row);
  }

  updateRunRecord(
    id: string,
    updates: {
      status?: string;
      summary?: string | null;
      failure_reason?: string | null;
      verification_status?: string;
      pr_url?: string | null;
      worktree_id?: string | null;
    }
  ) {
    this.db
      .query(
        `UPDATE runs SET
          status = COALESCE(?1, status),
          summary = COALESCE(?2, summary),
          failure_reason = COALESCE(?3, failure_reason),
          verification_status = COALESCE(?4, verification_status),
          pr_url = COALESCE(?5, pr_url),
          worktree_id = COALESCE(?6, worktree_id),
          finished_at = CASE
            WHEN ?1 IN ('succeeded', 'failed', 'timed_out', 'cancelled') THEN datetime('now')
            ELSE finished_at
          END
         WHERE id = ?7`
      )
      .run(
        updates.status ?? null,
        updates.summary ?? null,
        updates.failure_reason ?? null,
        updates.verification_status ?? null,
        updates.pr_url ?? null,
        updates.worktree_id ?? null,
        id
      );
  }

  private rowToRunRecord(row: Record<string, unknown>): RunRecord {
    return {
      id: row.id as string,
      job_id: (row.job_id as string) || "",
      thread_id: (row.thread_id as string) || "",
      project_id: (row.project_id as string) || "",
      worktree_id: (row.worktree_id as string | null) ?? null,
      agent_adapter: (row.agent_adapter as string) || "",
      attempt: Number(row.attempt),
      status: ((row.status as string) || row.result || "created") as RunRecord["status"],
      summary: (row.summary as string | null) ?? null,
      failure_reason: (row.failure_reason as string | null) ?? null,
      verification_status: ((row.verification_status as string) || "pending") as RunRecord["verification_status"],
      branch_name: (row.branch_name as string) || "",
      base_branch: (row.base_branch as string) || "",
      pr_url: (row.pr_url as string | null) ?? null,
      created_at: row.created_at
        ? new Date(row.created_at as string)
        : new Date(row.started_at as string),
      started_at: row.started_at ? new Date(row.started_at as string) : null,
      finished_at: row.finished_at ? new Date(row.finished_at as string) : null,
    };
  }

  // StepExecutions
  insertStepExecution(se: {
    id: string;
    run_id: string;
    phase_name: string;
    step_name: string;
    cycle: number;
    step_attempt: number;
    agent_adapter: string | null;
  }) {
    this.db
      .query(
        `INSERT INTO step_executions (id, run_id, phase_name, step_name, cycle, step_attempt, agent_adapter)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(
        se.id,
        se.run_id,
        se.phase_name,
        se.step_name,
        se.cycle,
        se.step_attempt,
        se.agent_adapter
      );
  }

  getStepExecution(id: string): StepExecution | null {
    const row = this.db
      .query("SELECT * FROM step_executions WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToStepExecution(row);
  }

  updateStepResult(
    id: string,
    result: StepResult,
    exitCode: number | null,
    failureReason: string | null
  ) {
    this.db
      .query(
        `UPDATE step_executions SET result = ?1, exit_code = ?2, failure_reason = ?3,
         finished_at = datetime('now') WHERE id = ?4`
      )
      .run(result, exitCode, failureReason, id);
  }

  listStepExecutionsForRun(runId: string): StepExecution[] {
    const rows = this.db
      .query(
        "SELECT * FROM step_executions WHERE run_id = ?1 ORDER BY started_at ASC"
      )
      .all(runId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToStepExecution(row));
  }

  private rowToStepExecution(row: Record<string, unknown>): StepExecution {
    return {
      ...row,
      started_at: new Date(row.started_at as string),
      finished_at: row.finished_at
        ? new Date(row.finished_at as string)
        : null,
      token_usage: row.token_usage
        ? JSON.parse(row.token_usage as string)
        : null,
    } as unknown as StepExecution;
  }

  listChildWorkItems(parentWorkItemId: string): WorkItem[] {
    const rows = this.db
      .query(
        "SELECT * FROM work_items WHERE parent_work_item_id = ?1 ORDER BY priority ASC, created_at ASC"
      )
      .all(parentWorkItemId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToWorkItem(row));
  }

  listRuns(limit = 50): Run[] {
    const rows = this.db
      .query("SELECT * FROM runs ORDER BY started_at DESC, rowid DESC LIMIT ?1")
      .all(limit) as Record<string, unknown>[];
    return rows.map((row) => this.rowToRun(row));
  }

  getWorkItemByLinearIdentifier(identifier: string): WorkItem | null {
    const row = this.db
      .query("SELECT * FROM work_items WHERE linear_identifier = ?1")
      .get(identifier) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToWorkItem(row);
  }

  // Context snapshots
  insertContextSnapshot(snap: {
    id: string;
    run_id: string;
    work_item_id: string;
    artifact_refs: unknown[];
    token_budget: { max_input: number; reserved_system: number };
  }) {
    this.db
      .query(
        `INSERT INTO context_snapshots (id, run_id, work_item_id, artifact_refs, token_budget)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .run(
        snap.id,
        snap.run_id,
        snap.work_item_id,
        JSON.stringify(snap.artifact_refs),
        JSON.stringify(snap.token_budget)
      );
  }

  getContextSnapshot(id: string): ContextSnapshot | null {
    const row = this.db
      .query("SELECT * FROM context_snapshots WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToContextSnapshot(row);
  }

  getLatestSnapshotForWorkItem(workItemId: string): ContextSnapshot | null {
    const row = this.db
      .query(
        "SELECT * FROM context_snapshots WHERE work_item_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT 1"
      )
      .get(workItemId) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToContextSnapshot(row);
  }

  private rowToContextSnapshot(row: Record<string, unknown>): ContextSnapshot {
    return {
      ...row,
      artifact_refs: JSON.parse(row.artifact_refs as string),
      token_budget: JSON.parse(row.token_budget as string),
      created_at: new Date(row.created_at as string),
    } as unknown as ContextSnapshot;
  }

  // Concurrency helpers
  countRunningItems(): number {
    const row = this.db
      .query(
        "SELECT COUNT(*) as count FROM work_items WHERE orchestration_state = 'running'"
      )
      .get() as { count: number };
    return row.count;
  }

  countRunningItemsByProject(projectId: string): number {
    const row = this.db
      .query(
        "SELECT COUNT(*) as count FROM work_items WHERE project_id = ?1 AND orchestration_state = 'running'"
      )
      .get(projectId) as { count: number };
    return row.count;
  }

  createWorktreeRecord(worktree: {
    id: string;
    project_id: string;
    thread_id: string;
    run_id: string | null;
    path: string;
    branch_name: string;
    base_branch: string;
    state: string;
    lease_owner: string | null;
    pinned: boolean;
    retention_reason: string | null;
    retained_until: string | Date | null;
  }) {
    this.db
      .query(
        `INSERT INTO worktrees (
          id, project_id, thread_id, run_id, path, branch_name, base_branch,
          state, lease_owner, pinned, retention_reason, retained_until
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      )
      .run(
        worktree.id,
        worktree.project_id,
        worktree.thread_id,
        worktree.run_id,
        worktree.path,
        worktree.branch_name,
        worktree.base_branch,
        worktree.state,
        worktree.lease_owner,
        worktree.pinned ? 1 : 0,
        worktree.retention_reason,
        this.dateParam(worktree.retained_until)
      );
  }

  getWorktreeRecord(id: string): WorktreeRecord | null {
    const row = this.db
      .query("SELECT * FROM worktrees WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToWorktreeRecord(row);
  }

  listWorktrees(threadId?: string): WorktreeRecord[] {
    const rows = threadId
      ? (this.db
          .query("SELECT * FROM worktrees WHERE thread_id = ?1 ORDER BY created_at DESC, rowid DESC")
          .all(threadId) as Record<string, unknown>[])
      : (this.db
          .query("SELECT * FROM worktrees ORDER BY created_at DESC, rowid DESC")
          .all() as Record<string, unknown>[]);
    return rows.map((row) => this.rowToWorktreeRecord(row));
  }

  updateWorktreeRecord(
    id: string,
    updates: {
      state?: string;
      lease_owner?: string | null;
      pinned?: boolean;
      retention_reason?: string | null;
      retained_until?: string | Date | null;
      deleted_at?: string | Date | null;
    }
  ) {
    this.db
      .query(
        `UPDATE worktrees SET
          state = COALESCE(?1, state),
          lease_owner = COALESCE(?2, lease_owner),
          pinned = COALESCE(?3, pinned),
          retention_reason = COALESCE(?4, retention_reason),
          retained_until = COALESCE(?5, retained_until),
          deleted_at = COALESCE(?6, deleted_at),
          last_activity_at = datetime('now')
         WHERE id = ?7`
      )
      .run(
        updates.state ?? null,
        updates.lease_owner ?? null,
        updates.pinned === undefined ? null : updates.pinned ? 1 : 0,
        updates.retention_reason ?? null,
        this.dateParam(updates.retained_until),
        this.dateParam(updates.deleted_at),
        id
      );
  }

  private rowToWorktreeRecord(row: Record<string, unknown>): WorktreeRecord {
    return {
      id: row.id as string,
      project_id: row.project_id as string,
      thread_id: row.thread_id as string,
      run_id: (row.run_id as string | null) ?? null,
      path: row.path as string,
      branch_name: row.branch_name as string,
      base_branch: row.base_branch as string,
      state: row.state as WorktreeRecord["state"],
      lease_owner: (row.lease_owner as string | null) ?? null,
      pinned: Boolean(row.pinned),
      retention_reason: (row.retention_reason as string | null) ?? null,
      retained_until: row.retained_until
        ? new Date(row.retained_until as string)
        : null,
      created_at: new Date(row.created_at as string),
      last_activity_at: new Date(row.last_activity_at as string),
      deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    };
  }

  addArtifact(artifact: {
    id: string;
    thread_id: string;
    job_id: string | null;
    run_id: string | null;
    kind: string;
    path: string;
    summary: string | null;
    metadata: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO artifacts (id, thread_id, job_id, run_id, kind, path, summary, metadata)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .run(
        artifact.id,
        artifact.thread_id,
        artifact.job_id,
        artifact.run_id,
        artifact.kind,
        artifact.path,
        artifact.summary,
        JSON.stringify(artifact.metadata)
      );
  }

  listArtifactsForThread(threadId: string): Artifact[] {
    const rows = this.db
      .query("SELECT * FROM artifacts WHERE thread_id = ?1 ORDER BY created_at ASC, rowid ASC")
      .all(threadId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as string,
      thread_id: row.thread_id as string,
      job_id: (row.job_id as string | null) ?? null,
      run_id: (row.run_id as string | null) ?? null,
      kind: row.kind as string,
      path: row.path as string,
      summary: (row.summary as string | null) ?? null,
      metadata: this.parseJsonObject(row.metadata, {}),
      created_at: new Date(row.created_at as string),
    }));
  }

  createApproval(approval: {
    id: string;
    thread_id: string;
    job_id: string;
    status: string;
    policy: string;
    request_payload: Record<string, unknown>;
    resolved_by: Record<string, unknown> | null;
  }) {
    this.db
      .query(
        `INSERT INTO approvals (id, thread_id, job_id, status, policy, request_payload, resolved_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(
        approval.id,
        approval.thread_id,
        approval.job_id,
        approval.status,
        approval.policy,
        JSON.stringify(approval.request_payload),
        approval.resolved_by ? JSON.stringify(approval.resolved_by) : null
      );
  }

  listApprovalsForThread(threadId: string): Approval[] {
    const rows = this.db
      .query("SELECT * FROM approvals WHERE thread_id = ?1 ORDER BY requested_at ASC, rowid ASC")
      .all(threadId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as string,
      thread_id: row.thread_id as string,
      job_id: row.job_id as string,
      status: row.status as Approval["status"],
      policy: row.policy as string,
      request_payload: this.parseJsonObject(row.request_payload, {}),
      requested_at: new Date(row.requested_at as string),
      resolved_at: row.resolved_at ? new Date(row.resolved_at as string) : null,
      resolved_by: row.resolved_by
        ? this.parseJsonObject(row.resolved_by, {})
        : null,
    }));
  }

  createExternalEvent(event: {
    id: string;
    thread_id: string;
    source_kind: string;
    source_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO external_events (id, thread_id, source_kind, source_id, event_type, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .run(
        event.id,
        event.thread_id,
        event.source_kind,
        event.source_id,
        event.event_type,
        JSON.stringify(event.payload)
      );
  }

  listExternalEventsForThread(threadId: string): ExternalEvent[] {
    const rows = this.db
      .query("SELECT * FROM external_events WHERE thread_id = ?1 ORDER BY created_at ASC, rowid ASC")
      .all(threadId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as string,
      thread_id: row.thread_id as string,
      source_kind: row.source_kind as string,
      source_id: row.source_id as string,
      event_type: row.event_type as string,
      payload: this.parseJsonObject(row.payload, {}),
      created_at: new Date(row.created_at as string),
    }));
  }

  createThreadLink(link: {
    id: string;
    thread_id: string;
    source_kind: string;
    external_id: string;
    label: string;
    url: string | null;
    metadata: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO thread_links (id, thread_id, source_kind, external_id, label, url, metadata)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(
        link.id,
        link.thread_id,
        link.source_kind,
        link.external_id,
        link.label,
        link.url,
        JSON.stringify(link.metadata)
      );
  }

  listThreadLinks(threadId: string): ThreadLink[] {
    const rows = this.db
      .query("SELECT * FROM thread_links WHERE thread_id = ?1 ORDER BY created_at ASC, rowid ASC")
      .all(threadId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as string,
      thread_id: row.thread_id as string,
      source_kind: row.source_kind as string,
      external_id: row.external_id as string,
      label: row.label as string,
      url: (row.url as string | null) ?? null,
      metadata: this.parseJsonObject(row.metadata, {}),
      created_at: new Date(row.created_at as string),
    }));
  }

  private parseJsonObject<T extends Record<string, unknown>>(
    value: unknown,
    fallback: T
  ): T {
    if (typeof value !== "string" || value.length === 0) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private parseJsonArray(value: unknown): string[] {
    if (typeof value !== "string" || value.length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }

  private dateParam(value: string | Date | null | undefined): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : value;
  }

  close() {
    this.db.close();
  }
}
