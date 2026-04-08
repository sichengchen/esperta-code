# CLI Reference

## Global Flags

| Flag | Description |
|---|---|
| `--config <path>` | Path to `feliz.yml` (default: `~/.feliz/feliz.yml`) |
| `--json` | JSON output for E2E commands |
| `--out <path>` | Write E2E JSON output to a file |
| `--help`, `-h` | Show help |

## Core Workflow

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

esperta-code event attach <thread-id> --type <type> --source <kind> --source-id <id>
```

## Setup and Operations

```bash
esperta-code init
esperta-code start
esperta-code stop
esperta-code status

esperta-code config validate
esperta-code config show

esperta-code project list
esperta-code project add
esperta-code project remove <name>
```

## Runtime Inspection

```bash
esperta-code run list
esperta-code run show <run-id>
esperta-code run retry <work-item-identifier>

esperta-code agent list
```

## Context Helpers

These commands are primarily for operators and for agents running inside the execution environment.

```bash
esperta-code context history <project>
esperta-code context show <work-item-identifier>
esperta-code context read
esperta-code context write <message>
```

## Linear Authentication

```bash
esperta-code auth linear
esperta-code auth linear --client-id <id> --client-secret <secret>
esperta-code auth linear --callback-url https://my-host.com/auth/callback
```

| Flag | Description |
|---|---|
| `--client-id <id>` | Linear OAuth app client ID |
| `--client-secret <secret>` | Linear OAuth app client secret |
| `--port <port>` | Callback server port, default `3421` |
| `--callback-url <url>` | Public callback URL for the OAuth redirect |

## E2E Helpers

```bash
esperta-code e2e doctor
esperta-code e2e smoke
esperta-code e2e smoke --json --out /tmp/report.json
```

Helper scripts:

```bash
bun run e2e:doctor
bun run e2e:smoke
bun run e2e:real
```
