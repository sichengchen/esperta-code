# CLI

The CLI exposes the durable thread/job/worktree model directly.

## Core commands

```bash
esperta-code json

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

Operational commands:

- `esperta-code start`
- `esperta-code stop`
- `esperta-code status`
- `esperta-code config validate`
- `esperta-code config show`

## JSON command

`esperta-code json` is the machine-facing CLI for local agent clients.

- Reads one JSON request from stdin
- Writes one JSON response to stdout
- Uses protocol version `v1`
- Reports application-level failures inside the JSON envelope instead of plain-text stderr

Request envelope:

```json
{
  "version": "v1",
  "id": "req-123",
  "client": {
    "name": "esperta-base",
    "cwd": "~/src/sa"
  },
  "action": "submit",
  "input": {}
}
```

Response envelope:

```json
{
  "version": "v1",
  "id": "req-123",
  "action": "submit",
  "ok": true,
  "result": {}
}
```

Supported actions:

- `capabilities`
- `project.list`
- `submit`
- `continue`
- `thread.list`
- `thread.get`
- `job.list`
- `job.get`
- `job.retry`
- `job.cancel`
- `job.approve`
- `worktree.list`
- `worktree.get`
- `event.attach`

## Behavioral expectations

- `submit` creates a new thread and queues the first job
- `continue` appends a new job to an existing thread
- `job retry` re-queues a failed job
- `worktree prune` deletes expired retained worktrees
- `json` provides a stable request/response contract for local clients without exposing internal modules
