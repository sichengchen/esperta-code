# Configuration

Esperta Code reads its central runtime configuration from `feliz.yml`, typically at `~/.feliz/feliz.yml`.

## Minimal Runtime Config

```yaml
runtime:
  data_dir: ~/.feliz
  max_concurrent_jobs: 4

projects:
  - name: repo-a
    repo: git@github.com:org/repo-a.git
    base_branch: main
```

## Example Project Config

```yaml
projects:
  - name: repo-a
    repo: git@github.com:org/repo-a.git
    base_branch: main

    worktrees:
      retain_on_success_minutes: 30
      retain_on_failure_hours: 24
      prune_after_days: 7

    concurrency:
      max_jobs: 2

    job_types:
      implement:
        agent: codex
        system_prompt: .feliz/prompts/implement.md
        verify:
          - bun test
        publish: draft_pr

      review:
        agent: codex
        system_prompt: .feliz/prompts/review.md
        write_mode: read_only
        publish: none
```

## Runtime Fields

| Field | Meaning |
|---|---|
| `runtime.data_dir` | Root for SQLite data, artifacts, and repo metadata |
| `runtime.worktree_root` | Optional override for where worktrees are created |
| `runtime.max_concurrent_jobs` | Global concurrency limit |

## Project Fields

| Field | Meaning |
|---|---|
| `name` | Internal project identifier |
| `repo` | Git remote URL |
| `base_branch` | Default base branch for new threads |
| `worktrees.*` | Retention and pruning policy |
| `concurrency.max_jobs` | Per-project concurrency limit |
| `job_types` | Named job profiles available for that project |

## Standard Job Types

| Job Type | Typical Use |
|---|---|
| `implement` | New feature work |
| `fix` | Bug fix on an existing thread |
| `fix_ci` | Repair failing CI after a run or PR update |
| `review` | Read-only code review |
| `spec` | Draft or refine design/spec output |
| `publish` | Branch/PR publication work |
| `continue` | Follow-up instructions on an existing thread |

Each job type can define:

- `agent`
- `system_prompt`
- `prompt_template`
- `write_mode`
- `verify`
- `publish`
- `artifact_expectations`
- `timeout_ms`
- `retry_limit`

## Connector Config

Linear settings live alongside the runtime config when you use the Linear connector:

```yaml
linear:
  oauth_token: $LINEAR_OAUTH_TOKEN
```

Connector-specific identifiers belong in connector state and thread links, not in the core thread/job schema.

## Repo Workflow Assets

Projects can also keep repo-local workflow assets:

- `.feliz/config.yml`
- `.feliz/pipeline.yml`
- `.feliz/prompts/`
- `WORKFLOW.md`

These files are scaffolded by `esperta-code project add` and are documented in [Repo Workflow Assets](pipelines.md).
