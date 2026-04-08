---
name: esperta-code-setup
description: Use this skill when installing or setting up Esperta Code on a machine, container, or dev environment. Covers prerequisites, bun install, central config at `~/.feliz/feliz.yml`, optional Linear connector authentication, project registration, validation, and service startup.
---

# Esperta Code Setup

Use this skill for fresh installs, reconfiguration, or setup troubleshooting.

## When to use

- Installing Esperta Code from a repo checkout
- Creating or repairing `~/.feliz/feliz.yml`
- Enabling the Linear connector
- Adding the first project
- Validating startup, storage paths, or agent availability

## First step

Determine how the user plans to run Esperta Code:

- local checkout with `bun run src/cli/index.ts`
- installed CLI with `esperta-code`
- Docker / `docker compose`

Use the user’s chosen invocation form consistently.

## Preflight

Verify the required tools before writing config:

- `bun --version`
- `git --version`
- `gh auth status` or confirm `GITHUB_TOKEN`
- one agent CLI: `codex --version` or `claude --version`

If the user wants the Linear connector, also prepare:

- a Linear OAuth app or token
- `esperta-code auth linear`

If they do not need Linear, do not force that setup.

## Setup workflow

### 1. Install dependencies

From the repo root:

```bash
bun install
bun run build
```

### 2. Create or review central config

Default path:

```text
~/.feliz/feliz.yml
```

Prefer `esperta-code init` for an initial config. If the user needs a hand-written config, use the current runtime/project schema from `docs/configuration.md`.

Minimum shape:

```yaml
runtime:
  data_dir: ~/.feliz
  max_concurrent_jobs: 4

projects: []
```

Keep secrets in env vars, not as hardcoded literals, when possible.

### 3. Configure the Linear connector if needed

Use:

```bash
esperta-code auth linear
```

Or pass explicit credentials:

```bash
esperta-code auth linear --client-id <id> --client-secret <secret>
```

This is connector setup, not core setup. Skip it if the user is only using manual CLI/API submission.

### 4. Add at least one project

Use:

```bash
esperta-code project add
```

This can register the project and scaffold repo-local `.feliz/` assets when appropriate.

### 5. Validate and start

Use:

```bash
esperta-code config validate
esperta-code status
esperta-code start
esperta-code status
```

For repo-checkout usage, replace `esperta-code` with `bun run src/cli/index.ts`.

## What to verify

Before calling setup complete, confirm:

- config file exists at the expected path
- at least one project is configured if the user expects to submit work
- the selected agent CLI is available
- `config validate` passes
- `status` shows the expected state

## Guardrails

- Do not overwrite an existing `feliz.yml` without checking first.
- Do not assume the Linear connector is required.
- Do not use old Feliz product wording in newly written setup instructions.
- Do not edit SQLite state directly for setup tasks; use the CLI.

## Read next if needed

- `docs/getting-started.md` for operator setup flow
- `docs/configuration.md` for config fields
- `docs/cli.md` for command details
