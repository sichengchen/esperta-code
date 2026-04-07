# CLI

The CLI exposes the durable thread/job/worktree model directly.

## Core commands

```bash
feliz submit --project <name> --title <title> --goal <goal>
feliz continue <thread-id> --title <title> --goal <goal>

feliz thread create --project <name> --title <title>
feliz thread list
feliz thread show <thread-id>

feliz job list
feliz job show <job-id>
feliz job logs <job-id>
feliz job retry <job-id>
feliz job cancel <job-id>
feliz job approve <job-id>

feliz worktree list
feliz worktree inspect <id>
feliz worktree prune

feliz event attach <thread-id> --type ci_failed --source github --source-id 123
```

## Operational commands

Legacy daemon-oriented commands still exist during the transition:

- `feliz start`
- `feliz stop`
- `feliz status`
- `feliz config validate`
- `feliz config show`

## Behavioral expectations

- `submit` creates a new thread and queues the first job
- `continue` appends a new job to an existing thread
- `job retry` re-queues a failed job
- `worktree prune` deletes expired retained worktrees
