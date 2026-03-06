---
name: feliz-setup
description: Use this skill when setting up Feliz for the first time or repairing local setup. It guides environment checks, `feliz init`, config validation, daemon start, project add/remove, and common git auth/workspace pitfalls.
---

# Feliz Setup

Use this workflow to set up Feliz correctly and avoid common local failures.

## When to use

- Fresh Feliz install
- Local environment not starting
- `project add` / clone / auth issues
- Rebuilding setup after config drift

## Setup workflow

1. Preflight checks
- Ensure required tools are present: `bun`, `git`.
- Confirm access credentials:
  - `LINEAR_API_KEY` for Linear API.
  - Git auth for repository access.
- Choose git transport intentionally:
  - SSH URL (`git@github.com:...`) uses SSH agent.
  - HTTPS URL (`https://github.com/...`) uses git credential manager / `gh` auth.

2. Initialize Feliz config
- Run `feliz init` (or `bun run src/cli/index.ts init` in source checkout).
- Provide Linear API key and first project mapping.
- If config already exists, do not overwrite; inspect first.

3. Validate configuration
- Run `feliz config validate`.
- Run `feliz config show` and confirm:
  - `linear.api_key` resolves correctly.
  - `storage.workspace_root` is writable.
  - Project entries are correct.

4. Start and verify daemon
- Run `feliz start`.
- Run `feliz status` and verify daemon + project count.

5. Add project safely
- Run `feliz project add`.
- If repo already contains `.feliz/config.yml`, skip scaffold and use existing repo config.
- If scaffold is needed, generate default `.feliz` files and optionally commit/push.

## Repair workflow

1. `project add` fails because repo path already exists
- Remove project cleanly first: `feliz project remove <project-name>`.
- Confirm workspace path is deleted under `~/.feliz/workspaces/<project-name>`.
- Retry `feliz project add`.

2. Clone/push uses wrong auth method
- If using SSH URL, ensure SSH agent is available and key has repo access.
- If using HTTPS URL, ensure credentials are configured (`gh auth login` / credential helper).

3. Config validation fails
- Fix schema errors in `feliz.yml` first.
- Re-run `feliz config validate` until clean.

## Execution guardrails

- Prefer deterministic CLI checks over assumptions.
- Stop on first failing prerequisite and fix it before continuing.
- Keep changes minimal and focused on setup correctness.
