# Usage

Esperta Code is thread-centric. A thread is the durable identity for a unit of work, and each new instruction becomes a new job on that thread.

## Start New Work

```bash
esperta-code submit \
  --project repo-a \
  --title "Implement cache invalidation" \
  --goal "Build cache invalidation for user updates"
```

This creates:

- a thread
- an initial job
- a queued run candidate for the scheduler

## Continue Existing Work

```bash
esperta-code continue <thread-id> \
  --title "Address review feedback" \
  --goal "Apply requested changes"
```

Use this when:

- review feedback arrives
- CI fails
- a previous run only partially completed
- the user wants to change direction without losing thread history

## Inspect Threads and Jobs

```bash
esperta-code thread list
esperta-code thread show <thread-id>
esperta-code job list
esperta-code job show <job-id>
esperta-code job logs <job-id>
```

## Worktrees

Every run executes in its own isolated worktree.

```bash
esperta-code worktree list
esperta-code worktree inspect <id>
esperta-code worktree prune
```

Use retained worktrees to inspect failures, verify branch state, or resume work quickly.

## Approvals, Retries, and Cancellation

```bash
esperta-code job approve <job-id>
esperta-code job retry <job-id>
esperta-code job cancel <job-id>
```

## Attach External Events

External events let you keep using the same thread after outside signals arrive.

```bash
esperta-code event attach <thread-id> \
  --type ci_failed \
  --source github \
  --source-id 123
```

Typical external events:

- CI failures
- requested review changes
- merge conflicts
- webhook-driven follow-up instructions
