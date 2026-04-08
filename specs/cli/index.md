# CLI

The CLI exposes the durable thread/job/worktree model directly.

## Core commands

```bash
esperta-code submit --project <name> --title <title> --goal <goal>
esperta-code continue <thread-id> --title <title> --goal <goal>

esperta-code thread create --project <name> --title <title>
esperta-code thread list
esperta-code thread show <thread-id>

esperta-code job list
esperta-code job show <job-id>
esperta-code job logs <job-id>
esperta-code job retry <job-id>
esperta-code job cancel <job-id>
esperta-code job approve <job-id>

esperta-code worktree list
esperta-code worktree inspect <id>
esperta-code worktree prune

esperta-code event attach <thread-id> --type ci_failed --source github --source-id 123
```

## Operational commands

Legacy daemon-oriented commands still exist during the transition:

- `esperta-code start`
- `esperta-code stop`
- `esperta-code status`
- `esperta-code config validate`
- `esperta-code config show`

## Behavioral expectations

- `submit` creates a new thread and queues the first job
- `continue` appends a new job to an existing thread
- `job retry` re-queues a failed job
- `worktree prune` deletes expired retained worktrees
