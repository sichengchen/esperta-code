# Configuration

## Runtime config (`feliz.yml`)

Feliz is configured from a single runtime file, typically `~/.feliz/feliz.yml`.

```yaml
runtime:
  data_dir: ~/.feliz
  max_concurrent_jobs: 4

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

## Top-level fields

| Field | Description |
|---|---|
| `runtime.data_dir` | Root directory for SQLite, artifacts, repos, and worktrees |
| `runtime.max_concurrent_jobs` | Global job concurrency limit |
| `projects[]` | Tracked repositories and their runtime policy |

## Project fields

| Field | Description |
|---|---|
| `name` | Internal project identifier |
| `repo` | Git remote URL |
| `base_branch` | Default base branch for new threads |
| `worktrees.*` | Retention and pruning policy |
| `concurrency.max_jobs` | Per-project concurrency limit |
| `job_types` | Named job profiles available in that project |

## Job type profile

A job type replaces the old pipeline concept. It is a single-agent profile.

Fields:

- `agent`
- `system_prompt`
- `prompt_template` (optional)
- `write_mode`
- `verify`
- `publish`
- `artifact_expectations`
- `timeout_ms`
- `retry_limit`

Standard job types:

- `implement`
- `fix`
- `fix_ci`
- `review`
- `spec`
- `publish`
- `continue`

## Compatibility

The codebase still accepts the older Linear-first config fields during the transition, but the runtime source of truth is the remote-first shape above.
