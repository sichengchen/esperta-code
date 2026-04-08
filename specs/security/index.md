# Security & Observability

## Structured Logging

Log entries should include:

- `timestamp`
- `level`
- `component`
- `project_id` when available
- `thread_id` when available

Log output is JSON lines to stdout.

## Metrics

Useful future metrics:

- running thread count
- pending thread count
- thread completion/failure rate
- dispatch latency
- per-adapter execution duration

## Secrets

- Linear OAuth token: `LINEAR_OAUTH_TOKEN`
- Git hosting token: `GITHUB_TOKEN` or equivalent
- Agent credentials: managed by each agent CLI itself

Feliz should never log these values.

## Workspace Isolation

- each active thread gets its own worktree
- agents operate only inside that worktree
- thread paths are sanitized and constrained under `workspace_root`

## Trust Model

Feliz trusts:

- operator-provided config
- trusted repos configured as projects
- repo hook commands
- installed agent CLIs

Feliz does not trust:

- arbitrary issue text as executable shell input
- agent output without validation or review
