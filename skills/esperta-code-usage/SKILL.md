---
name: esperta-code-usage
description: Use this skill when operating Esperta Code after setup. Covers the human CLI for submitting and continuing work, inspecting threads/jobs/worktrees, retries and approvals, attaching external events, and the JSON stdin/stdout CLI for local agent clients such as Esperta Base.
---

# Esperta Code Usage

Use this skill when the user wants to drive Esperta Code as an operator or as a local agent client.

## Decide the interface first

Choose between:

- human/operator CLI commands
- machine-facing JSON CLI via `esperta-code json`

Do not mix them unless the user explicitly wants both.

## Human CLI workflow

### Start new work

```bash
esperta-code submit --project <name> --title <title> --goal <goal>
```

### Continue a thread

```bash
esperta-code continue <thread-id> --title <title> --goal <goal>
```

### Inspect state

```bash
esperta-code project list
esperta-code thread list
esperta-code thread show <thread-id>
esperta-code job list
esperta-code job show <job-id>
esperta-code job logs <job-id>
esperta-code run list
esperta-code run show <run-id>
esperta-code worktree list
esperta-code worktree inspect <id>
```

### Control lifecycle

```bash
esperta-code job retry <job-id>
esperta-code job cancel <job-id>
esperta-code job approve <job-id>
esperta-code worktree prune
```

### Attach external events

```bash
esperta-code event attach <thread-id> --type ci_failed --source github --source-id 123
```

Use this to keep the same thread moving after CI failures, review feedback, merge conflicts, or webhook-originated follow-up.

## JSON CLI workflow

Use one process per request:

```bash
echo '{"version":"v1","action":"capabilities"}' | esperta-code json
```

Protocol rules:

- one JSON request on stdin
- one JSON response on stdout
- request version is `v1`
- failures return `ok: false` inside JSON

### Request envelope

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

### Response envelope

```json
{
  "version": "v1",
  "id": "req-123",
  "action": "submit",
  "ok": true,
  "result": {}
}
```

### Recommended action order for local agents

1. `capabilities`
2. `project.list`
3. `submit` or `continue`
4. `thread.get` for polling and state refresh
5. `event.attach` when outside systems produce new signals

### Most useful actions

- `submit`
- `continue`
- `thread.get`
- `job.get`
- `event.attach`

Prefer `thread.get` when the caller needs the current thread snapshot in one round-trip.

## Current action set

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

## Guardrails

- Use `esperta-code`, not old Feliz command names, unless the user explicitly asks for the alias.
- Do not tell callers to mutate the database directly.
- For machine integrations, use the JSON CLI instead of scraping plain-text output.
- Treat `thread` as the durable identity and append jobs with `continue` instead of starting over.

## Read next if needed

- `docs/usage.md` for the operator workflow
- `docs/cli.md` for command syntax
- `docs/local-agents.md` for the JSON protocol
