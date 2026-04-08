# Local Agents

Esperta Code exposes a JSON-based CLI for local agent clients such as Esperta Base. This lets a local tool create work, continue existing threads, inspect state, and attach external events without linking directly against Esperta Code internals.

## Transport

Use one process invocation per request:

```bash
echo '{"version":"v1","action":"capabilities"}' | esperta-code json
```

- Input: one JSON object on stdin
- Output: one JSON object on stdout
- Protocol version: `v1`
- Application-level failures are returned as `ok: false`

## Request Envelope

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

Fields:

- `version`: required protocol version, currently `v1`
- `id`: optional request correlation ID, echoed back in the response
- `client`: optional metadata about the calling local agent
- `action`: required operation name
- `input`: optional action-specific payload

If `input.requested_by` is omitted, Esperta Code derives it from `client` and records the caller as a `local_agent`.

## Response Envelope

Success:

```json
{
  "version": "v1",
  "id": "req-123",
  "action": "submit",
  "ok": true,
  "result": {}
}
```

Error:

```json
{
  "version": "v1",
  "id": "req-123",
  "action": "submit",
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Missing required string field: title"
  }
}
```

Error codes:

- `invalid_request`: malformed JSON or invalid/missing input fields
- `unknown_action`: action name is not supported
- `not_found`: referenced thread, job, worktree, or project does not exist
- `internal_error`: unexpected failure while processing the request

## Supported Actions

| Action | Purpose |
|---|---|
| `capabilities` | Discover protocol metadata and supported actions |
| `project.list` | List configured projects and job types |
| `submit` | Create a new thread and initial job |
| `continue` | Append a new job to an existing thread |
| `thread.list` | List threads, optionally filtered by project or status |
| `thread.get` | Fetch the current thread snapshot with jobs, events, links, artifacts, approvals, and worktrees |
| `job.list` | List all jobs or jobs for one thread |
| `job.get` | Fetch one job with latest run, artifacts, and approvals |
| `job.retry` | Requeue a failed or cancelled job |
| `job.cancel` | Mark a job cancelled and block the thread |
| `job.approve` | Release a waiting approval gate |
| `worktree.list` | List tracked worktrees |
| `worktree.get` | Fetch one worktree with thread and latest run context |
| `event.attach` | Attach an external event to a thread |

## Example Flow

List capabilities:

```bash
echo '{"version":"v1","id":"req-1","client":{"name":"esperta-base"},"action":"capabilities"}' | esperta-code json
```

Submit a new thread:

```bash
echo '{
  "version": "v1",
  "id": "req-2",
  "client": { "name": "esperta-base", "cwd": "~/src/sa" },
  "action": "submit",
  "input": {
    "project": "repo-a",
    "job_type": "implement",
    "title": "Implement queue runner",
    "goal": "Build the queue runner",
    "prompt_payload": {
      "prompt": "Build the queue runner"
    }
  }
}' | esperta-code json
```

Continue an existing thread:

```bash
echo '{
  "version": "v1",
  "action": "continue",
  "input": {
    "thread_id": "thread-123",
    "title": "Address review feedback",
    "goal": "Add the requested tests"
  }
}' | esperta-code json
```

Inspect a thread:

```bash
echo '{
  "version": "v1",
  "action": "thread.get",
  "input": {
    "thread_id": "thread-123"
  }
}' | esperta-code json
```

Attach a CI failure:

```bash
echo '{
  "version": "v1",
  "action": "event.attach",
  "input": {
    "thread_id": "thread-123",
    "source_kind": "github",
    "source_id": "check-run-42",
    "event_type": "ci_failed",
    "payload": {
      "check_name": "test",
      "conclusion": "failure"
    }
  }
}' | esperta-code json
```

## Design Notes

- The JSON CLI is a client interface, not an agent adapter. It is for tools that want to drive Esperta Code, not for code-execution backends.
- `thread.get` is the most useful polling call for local agents because it returns the current thread snapshot in one round-trip.
- Dates are serialized as ISO 8601 strings.
- The interface is intentionally request/response and single-shot. Long-running job execution stays inside Esperta Code.
