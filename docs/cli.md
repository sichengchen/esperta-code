# CLI Reference

## Global flags

| Flag | Description |
|---|---|
| `--config <path>` | Central config path (default: `~/.feliz/feliz.yml`) |
| `--json` | JSON output (E2E commands) |
| `--out <path>` | Write JSON report to file (E2E commands) |
| `--help`, `-h` | Show help |

## Commands

### Daemon

**`start`** — Start the Esperta Code daemon. Scaffolds a template config and exits if none exists.

```bash
esperta-code start
esperta-code start --config /path/to/feliz.yml
```

**`stop`** — Stop the daemon via PID file.

```bash
esperta-code stop
```

**`status`** — Show daemon and project status.

```bash
esperta-code status
```

### Setup

**`init`** — Interactive setup wizard. Creates `feliz.yml` with Linear token, webhook port, storage paths, agent defaults, and an empty projects list. Add projects separately with `esperta-code project add`.

```bash
esperta-code init
```

### Config

**`config validate`** — Validate central and repo configs.

```bash
esperta-code config validate
```

**`config show`** — Print resolved config with environment variables expanded.

```bash
esperta-code config show
```

### Projects

**`project list`** — List project mappings.

```bash
esperta-code project list
```

**`project add`** — Interactive project onboarding.

```bash
esperta-code project add
```

**`project remove <name>`** — Remove a project mapping.

```bash
esperta-code project remove backend-api
```

### Runs

**`run list`** — List recent runs.

```bash
esperta-code run list
```

**`run show <run_id>`** — Show run details and step executions.

```bash
esperta-code run show abc123
```

**`run retry <identifier>`** — Retry a failed work item.

```bash
esperta-code run retry BAC-123
```

### Agents

**`agent list`** — Show installed agent adapters and availability.

```bash
esperta-code agent list
```

### Context

**`context history <project>`** — Show history events for a project.

```bash
esperta-code context history backend-api
```

**`context show <identifier>`** — Show context snapshot for a work item.

```bash
esperta-code context show BAC-123
```

### Authentication

**`auth linear`** — Authenticate with Linear via OAuth2. Starts a temporary local server on the webhook port, opens the browser for authorization, exchanges the code for a token, verifies the bot identity, and writes the token to `feliz.yml`.

```bash
esperta-code auth linear
esperta-code auth linear --client-id <id> --client-secret <secret>
esperta-code auth linear --callback-url https://my-host.com/auth/callback
```

| Flag | Description |
|---|---|
| `--client-id <id>` | Linear OAuth app client ID (or prompt interactively) |
| `--client-secret <secret>` | Linear OAuth app client secret (or prompt interactively) |
| `--port <port>` | Callback server port (default: `3421`, same as webhook port) |
| `--callback-url <url>` | Public callback URL for Linear redirect (default: `http://localhost:<port>/auth/callback`). Use this when exposing Esperta Code to the internet, since Linear blocks `localhost` callback URLs. |

After authentication, the command prints next steps for configuring Linear webhooks.

### E2E Testing

**`e2e doctor`** — Check prerequisites (tools, auth, config).

```bash
esperta-code e2e doctor
```

**`e2e smoke`** — Run preflight smoke checks.

```bash
esperta-code e2e smoke
esperta-code e2e smoke --json --out /tmp/report.json
```

## Helper scripts

```bash
bun run e2e:doctor    # runs esperta-code e2e doctor
bun run e2e:smoke     # runs scripts/e2e-smoke.sh
bun run e2e:real      # runs scripts/e2e-real.sh
```
