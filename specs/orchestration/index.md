# Orchestration

The orchestrator is responsible for selecting runnable threads, creating worktrees when needed, invoking the pipeline executor, and maintaining `thread.status`.

## Thread Lifecycle

```
pending -> running -> completed
        -> running -> failed
        -> running -> running_dirty -> pending
pending/running/* -> stopped
```

### Status Semantics

| Status | Meaning |
|---|---|
| `pending` | Thread is ready to be dispatched |
| `running` | Agent pipeline is currently executing |
| `running_dirty` | New jobs arrived while execution was in flight |
| `completed` | Latest execution completed with no queued follow-up |
| `failed` | Latest execution failed and no concurrent follow-up re-queue was needed |
| `stopped` | Execution was interrupted by external control |

`running_dirty` is the only special transitional status. It means the thread already has fresh work queued while the current execution is still draining.

## Entry Point

Linear webhook handling is the only entry point for new work.

1. Find the matching project from the Linear project name.
2. Create or resume the thread for the Linear issue.
3. Append a new human job if the event carries comment guidance.
4. Mark the thread `pending`, unless it is already `running`, in which case mark it `running_dirty`.

## Dispatch Rules

Dispatch occurs on the periodic server tick.

A thread is eligible when all of the following are true:

- `thread.status === "pending"`
- global running thread count is below `agent.max_concurrent`
- per-issue-state concurrency limit is not exceeded, if configured
- all blocker issues known to Feliz are already in terminal thread states

Selection order is:

1. `priority ASC`
2. `created_at ASC`

## Execution Semantics

When a thread is selected:

1. Create the worktree if it does not already exist.
2. Persist the worktree path and branch name on the thread.
3. Run `hooks.after_create` once when the worktree is first created.
4. Mark the thread `running`.
5. Execute `.feliz/pipeline.yml` against the thread worktree.

The executor works on the whole thread, not on per-step persisted sub-records.

## Review and Failure Feedback

The simplified model does not create separate review or failure channels.

- If a review step fails and the reviewer produced actionable text, append that text as an agent job.
- If the overall pipeline fails, append a concise failure summary as an agent job.

This keeps all actionable follow-up inside the same thread job stream.

## Completion Rules

On successful execution:

- if the thread is still `running`, mark it `completed`
- if the thread became `running_dirty`, mark it back to `pending`

On failed execution:

- if the thread is still `running`, mark it `failed`
- if the thread became `running_dirty`, mark it back to `pending`

This allows follow-up work to win over a terminal failure state when new jobs arrived during execution.

## Stop Handling

When a stop signal is received:

1. If the thread is active, ask the adapter to cancel by `thread.id`.
2. Mark the thread `stopped`.
3. Append a `thread.stopped` history entry.

## History

The orchestrator records operational events such as:

- `thread.started`
- `thread.completed`
- `thread.requeued`
- `thread.failed`
- `thread.stopped`

History supports audit and debugging, while jobs remain the clean thread-facing work record.
