# Usage

Day-to-day operation of Feliz after setup is complete.

## Start the daemon

```bash
bun run src/cli/index.ts start
```

Keep this terminal running. Feliz polls Linear on the configured interval (default: 30s).

## Create work in Linear

In your mapped Linear project:

1. Create an issue with clear acceptance criteria.
2. Feliz picks it up on the next poll cycle, creates a worktree, and runs the pipeline.

No labels, commands, or special formatting needed — just write the issue.

## Monitor

```bash
bun run src/cli/index.ts status          # daemon health
bun run src/cli/index.ts run list        # recent runs
bun run src/cli/index.ts run show <id>   # run details + step results
```

## Verify delivery

A successful run produces:

- A pull request on the target repo
- A PR URL in `run show` output
- Status updates posted to the Linear issue

## Handle failures

```bash
bun run src/cli/index.ts run retry <LINEAR_ID>
```

The retry carries failure context from the previous attempt so the agent can correct course.

## Inspect context

```bash
bun run src/cli/index.ts context history <project>   # past events
bun run src/cli/index.ts context show <LINEAR_ID>     # snapshot for a work item
```

## Stop

```bash
bun run src/cli/index.ts stop
```

## Related

- [Getting Started](getting-started.md) — first-time setup
- [Configuration](configuration.md) — config reference
- [CLI](cli.md) — full command reference
