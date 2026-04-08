# Configuration

Esperta Code is configured from `feliz.yml`, usually at `~/.feliz/feliz.yml`. The legacy path and filename remain the default for compatibility.

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
```

Key ideas:

- `runtime` controls storage and global concurrency.
- each `project` maps to one repo and one set of runtime policies.
- `job_types` are single-agent profiles, not multi-step pipelines.
- Linear config is optional connector configuration, not a core requirement.
