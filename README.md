# Esperta Code

Esperta Code is a self-hosted remote coding job runner. It accepts jobs from multiple sources, executes them remotely in isolated git worktrees, and stores durable thread, job, run, worktree, and artifact state in SQLite plus the filesystem.

## Core ideas

- Remote-first: jobs are queued and can keep running while the user is away.
- Thread-centric: work continues by appending new jobs to the same thread.
- One-agent-per-job: each job is a single agent invocation with one intent.
- Worktree-first: every run gets a fresh isolated git worktree.
- Connector-neutral: Linear, GitHub, CLI, webhooks, and automations all map into the same internal model.

Linear support still exists in `src/linear/`, but it is now a connector concern rather than the core architecture.

## Current implementation

The repository now includes:

- Durable core types for `project`, `thread`, `job`, `run`, `worktree`, `artifact`, `approval`, `external_event`, and `thread_link`
- SQLite storage for the new core model
- A single-agent execution path that creates a fresh run worktree, executes one adapter, captures artifacts, runs verification commands, and updates thread/job state
- New CLI commands for thread, job, worktree, submit, continue, and event flows

The legacy Linear-first orchestration path is still present during the transition.

## Quick start

```bash
bun install
bun test
bun run lint
```

Create a config at `~/.feliz/feliz.yml`:

The default config path remains `~/.feliz/feliz.yml` during the compatibility window.

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

Then use the new CLI flow:

```bash
esperta-code submit --project repo-a --title "Implement cache invalidation" --goal "Build cache invalidation for user updates"
esperta-code thread list
esperta-code thread show <thread-id>
esperta-code continue <thread-id> --title "Address review feedback" --goal "Apply requested changes"
esperta-code job list
esperta-code worktree list
```

The legacy `feliz` CLI name still works as an alias.

## CLI

```bash
esperta-code submit
esperta-code continue <thread-id>
esperta-code thread create
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
esperta-code event attach <thread-id> --type ci_failed --source github --source-id 123
```

## Specs

The source of truth lives in [`specs/`](specs/index.md).
