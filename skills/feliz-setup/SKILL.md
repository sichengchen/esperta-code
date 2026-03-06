---
name: feliz-setup
description: Use this skill when setting up or repairing Feliz. The agent must run `/interview` first, collect user preferences, write central `feliz.yml`, and configure `.feliz/*` correctly inside the managed project repository in the Feliz workspace.
---

# Feliz Setup

Use this skill to configure Feliz from user preferences, not from blind defaults.

## Hard requirement

Before editing any config, run `/interview` and collect preferences.

Minimum interview topics:
- Deployment mode: local CLI or Docker
- Central config location: `/data/feliz/feliz.yml` (Docker default) or `~/.feliz/feliz.yml` (local default)
- Workspace root: `/data/feliz/workspaces` (Docker default) or `~/.feliz/workspaces` (local default)
- Linear API key source: env var reference or literal key
- Git auth mode: SSH or HTTPS token/credential helper
- Default agent adapter: `claude-code` or `codex`
- Repo workflow defaults:
  - `specs.enabled`
  - `specs.directory`
  - `specs.approval_required`
  - `gates.test_command`
  - `gates.lint_command`
- Project mappings to register in `projects[]`:
  - project `name`
  - git `repo`
  - Linear `linear_project`
  - base `branch`
- Target repository path for repo config:
  - usually `<workspace_root>/<project-name>/repo`

If any required field is missing, continue the interview before generating files.

## Output contract

After interview, write appropriate configs in the correct locations.

Required files:
- Central config:
  - `feliz.yml` at selected central config path
- Repo config inside target project repo:
  - `<repo_path>/.feliz/config.yml`
  - `<repo_path>/.feliz/pipeline.yml`
  - `<repo_path>/WORKFLOW.md`

Config rules:
- Prefer env var reference for secrets, e.g. `linear.api_key: $LINEAR_API_KEY`.
- Match `agent.default` and repo `agent.adapter` to user choice.
- Include only necessary fields; avoid unrelated options.
- Keep YAML valid and schema-aligned with Feliz specs.
- Use test/lint/spec settings from interview answers.

## Repository target requirement

`.feliz` must be configured in the managed project repository, not in the Feliz service repository.

Default target in Docker:
- `/data/feliz/workspaces/<project-name>/repo/.feliz/`

Default target in local setup:
- `~/.feliz/workspaces/<project-name>/repo/.feliz/`

Always resolve the repo path from `storage.workspace_root` + project name before writing repo config files.

## Recommended generation flow

1. Preflight
- Verify `bun` and `git` are installed.
- Verify chosen auth mode is workable (SSH agent or HTTPS credentials).

2. Write central config
- Generate `feliz.yml` with:
  - `linear`
  - `storage` (if user specified)
  - `agent`
  - `projects[]` from interview

3. Resolve target repo path
- Compute target path: `<workspace_root>/<project-name>/repo`.
- In Docker, expect it under `/data/feliz/workspaces/...`.
- Verify the target repo exists (or document that it must be cloned first).

4. Write repo config in target repo
- Generate `<repo_path>/.feliz/config.yml` from interview preferences.
- Generate `<repo_path>/.feliz/pipeline.yml` using a sensible default execute pipeline.
- Generate `<repo_path>/WORKFLOW.md` with standard Feliz prompt structure.

5. Validate
- Run `bun run src/cli/index.ts --config <path> config validate`.
- Fix any reported schema/format issues immediately.

6. Confirm and proceed
- Summarize what was written and why it matches user preferences.
- Offer next commands: `start`, `status`, `project add/remove`.

## Repair mode

When fixing an existing setup:
- Read current config first.
- Preserve intentional user values unless they conflict with explicit interview answers.
- On `project add` path collisions, remove stale workspace path safely after `project remove`.

## Guardrails

- Do not skip `/interview`.
- Do not rely on one-size-fits-all templates.
- Do not leave partially written config files.
- Prefer deterministic CLI validation over assumptions.
