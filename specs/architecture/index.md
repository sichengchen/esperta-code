# Architecture

## System Diagram

```
┌──────────────────────────────────────────────────────────┐
│                       Feliz Server                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │ Linear API   │  │ SQLite                           │  │
│  │ + Webhooks   │  │ projects / threads / jobs        │  │
│  └──────┬───────┘  │ history                           │  │
│         │          └────────────────┬─────────────────┘  │
│  ┌──────▼───────────────────────────▼──────────────────┐ │
│  │                  Orchestrator                       │ │
│  │  - create/resume threads                            │ │
│  │  - dispatch pending threads                         │ │
│  │  - maintain thread.status                           │ │
│  │  - handle Linear stop signal                        │ │
│  └──────┬───────────────────────────────┬──────────────┘ │
│         │                               │                │
│  ┌──────▼─────────┐           ┌────────▼──────────────┐  │
│  │ Workspace      │           │ Pipeline Executor     │  │
│  │ Manager        │           │ + Agent Adapters      │  │
│  │ clone/worktree │           │ Claude / Codex / etc. │  │
│  └──────┬─────────┘           └────────┬──────────────┘  │
│         │                               │                │
│  ┌──────▼───────────────────────────────▼──────────────┐ │
│  │ Repo-Owned Context                                   │ │
│  │ .feliz/config.yml, .feliz/pipeline.yml, prompts,    │ │
│  │ .feliz/context/memory/, specs/                      │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- Runtime: Bun (TypeScript)
- Persistence:
  - SQLite for `projects`, `threads`, `jobs`, and `history`
  - Git repo for memory, prompts, and optional specs
  - Filesystem worktrees for active thread execution

## Domain Model

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│ Project  │──1:N──│ Thread   │──1:N──│ Job      │
└──────────┘       └──────────┘       └──────────┘
```

### Project

A repo-level container that owns configuration and all threads for that repo.

```typescript
interface Project {
  id: string;
  name: string;
  repo_url: string;
  linear_project_name: string;
  base_branch: string;
  created_at: Date;
}
```

### Thread

The unit of work and collaboration. One Linear issue maps to one thread. In the normal case, one thread owns one worktree and one branch.

`thread.status` is the current mutable execution snapshot for that work.

```typescript
type ThreadStatus =
  | "pending"
  | "running"
  | "running_dirty"
  | "completed"
  | "failed"
  | "stopped";

interface Thread {
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
```

### Job

The only first-class work record inside a thread. Jobs are append-only. They carry both human guidance and agent-written follow-up.

```typescript
type JobAuthor = "human" | "agent";

interface Job {
  id: string;
  thread_id: string;
  body: string;
  author: JobAuthor | null;
  created_at: Date;
}
```

### HistoryEntry

Operational audit trail. History is separate from jobs so agent guidance stays clean while runtime events remain queryable.

```typescript
interface HistoryEntry {
  id: string;
  project_id: string;
  thread_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}
```

## Context Layers

| Layer | Source | Purpose |
|---|---|---|
| Jobs | SQLite `jobs` | Ordered thread guidance and agent-written follow-up |
| History | SQLite `history` | Operational audit trail |
| Memory | `.feliz/context/memory/` | Repo-owned long-lived project knowledge |
| Specs | `specs/` or configured spec dir | Optional design context inside the repo |

## Explicit Non-Goals of the Model

The conceptual model does not include:

- `WorkItem`
- `Run`
- `StepExecution`
- a command taxonomy for plan/retry/approve/decompose

Those concepts are either removed or treated as runtime detail outside the product model.
