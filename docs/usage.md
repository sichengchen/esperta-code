# Usage

## Submit work

```bash
esperta-code submit --project repo-a --title "Implement cache invalidation" --goal "Build cache invalidation for user updates"
```

This creates a thread and queues its first job.

## Continue work on a thread

```bash
esperta-code continue <thread-id> --title "Address review feedback" --goal "Apply requested changes"
```

This appends a new job to the same thread.

## Inspect state

```bash
esperta-code thread list
esperta-code thread show <thread-id>
esperta-code job list
esperta-code job show <job-id>
esperta-code job logs <job-id>
esperta-code worktree list
esperta-code worktree inspect <id>
```

## Handle failures

```bash
esperta-code job retry <job-id>
esperta-code job cancel <job-id>
esperta-code worktree prune
```

## Attach external events

```bash
esperta-code event attach <thread-id> --type ci_failed --source github --source-id 123
```
