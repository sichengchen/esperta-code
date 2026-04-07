# Usage

## Submit work

```bash
feliz submit --project repo-a --title "Implement cache invalidation" --goal "Build cache invalidation for user updates"
```

This creates a thread and queues its first job.

## Continue work on a thread

```bash
feliz continue <thread-id> --title "Address review feedback" --goal "Apply requested changes"
```

This appends a new job to the same thread.

## Inspect state

```bash
feliz thread list
feliz thread show <thread-id>
feliz job list
feliz job show <job-id>
feliz job logs <job-id>
feliz worktree list
feliz worktree inspect <id>
```

## Handle failures

```bash
feliz job retry <job-id>
feliz job cancel <job-id>
feliz worktree prune
```

## Attach external events

```bash
feliz event attach <thread-id> --type ci_failed --source github --source-id 123
```
