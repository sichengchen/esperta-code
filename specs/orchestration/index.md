# Orchestration

## Scheduling model

Feliz schedules jobs, not pipeline phases.

Rules:

- one active write job per thread
- multiple threads may run in parallel
- per-project and global concurrency limits apply
- read-only jobs may run without taking the thread write lease

## State machines

### Thread states

- `open`
- `active`
- `waiting_input`
- `blocked`
- `idle`
- `archived`

### Job states

- `queued`
- `preparing`
- `running`
- `waiting_approval`
- `retry_queued`
- `succeeded`
- `failed`
- `cancelled`

### Run states

- `created`
- `running`
- `succeeded`
- `failed`
- `timed_out`
- `cancelled`

### Worktree states

- `provisioning`
- `active`
- `retained`
- `deleting`
- `deleted`
- `orphaned`

## Execution envelope

Every job executes inside the same outer envelope:

1. Resolve thread state and branch.
2. Create a run record.
3. Create a fresh isolated worktree.
4. Invoke exactly one agent in that worktree.
5. Capture logs, summary, changed files, and other artifacts.
6. Run verification commands for the job type.
7. Optionally publish branch or PR metadata.
8. Update run, job, thread, and worktree state.
9. Retain or delete the worktree according to policy.

## Continuation model

Continuation happens by appending a new job to the same thread.

Examples:

- follow-up user instructions
- retry after failure
- continue after CI failure
- continue after review feedback
- publish after implementation

“Review then fix” is two jobs on one thread, not one job with internal phases.

## Approvals

Approvals are explicit durable records. When a job needs approval:

- the job moves to `waiting_approval`
- an approval record is created
- execution resumes only after approval is resolved

## External events

External events attach to threads and can drive follow-up jobs.

Examples:

- CI failed
- PR review requested changes
- merge conflict detected
- new webhook instruction
