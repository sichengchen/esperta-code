# Esperta Code

Esperta Code is a self-hosted remote coding job runner. It accepts coding jobs from multiple sources, executes them in isolated git worktrees, and keeps durable state for threads, jobs, runs, worktrees, artifacts, approvals, and external events.

## Principles

- Remote-first: runs continue without an attached terminal session.
- Thread-centric: a thread is the durable unit of work; new instructions append jobs to that thread.
- One-agent-per-job: each job is a single agent invocation with one purpose.
- Worktree-first: every run gets a fresh isolated worktree.
- Connector-neutral: CLI, Linear, webhooks, and future integrations map onto the same core model.

## Core Model

| Type | Responsibility |
|---|---|
| `Project` | Repo URL, base branch, runtime policy, job type definitions |
| `Thread` | Durable work identity, branch lineage, PR link, timeline, latest state |
| `Job` | One request on a thread with one agent and one execution intent |
| `Run` | One attempt to execute a job |
| `Worktree` | One isolated workspace for a run |
| `Artifact` | Logs, summaries, verification output, review notes, PR metadata |
| `Approval` | Human gate that can pause execution |
| `ExternalEvent` | CI failure, review feedback, new instruction, webhook signal |

## Source Layout

| Path | Responsibility |
|---|---|
| `src/core/` | Durable thread/job/run/worktree types and services |
| `src/db/` | SQLite persistence |
| `src/workspace/` | Canonical repos, worktrees, branch naming, retention helpers |
| `src/connectors/` | External-system integrations |
| `src/connectors/linear/` | Linear client, webhook mapping, and command parsing |
| `src/agents/` | Agent adapters such as Codex and Claude Code |
| `src/cli/` | Human and machine-facing CLI commands |
| `src/context/` | Context assembly and scratchpad handling |
| `src/orchestrator/` | Scheduling, retry logic, decomposition, spec drafting |
| `src/pipeline/` | Repo-local workflow execution helpers |

## Quick Start

```bash
bun install
bun test
bun run lint
bun run build
```

Create `~/.esperta-code/esperta-code.yml`:

```yaml
runtime:
  data_dir: ~/.esperta-code
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
        system_prompt: .esperta-code/prompts/implement.md
        verify:
          - bun test
        publish: draft_pr
```

Start work and inspect the resulting thread:

```bash
esperta-code thread start --project repo-a --instruction "Build cache invalidation for user updates"
esperta-code thread list
esperta-code thread show <thread-id>
esperta-code thread continue <thread-id> --instruction "Apply requested changes from review feedback"
esperta-code worktree list
```

Local agent clients can also use a JSON request/response interface over stdin/stdout:

```bash
echo '{"version":"v1","action":"capabilities"}' | esperta-code json
```

## Docs

- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Usage](docs/usage.md)
- [CLI Reference](docs/cli.md)
- [Local Agents](docs/local-agents.md)
- [Agents](docs/agents.md)
- [Skills](docs/skills.md)
- [Repo Workflow Assets](docs/pipelines.md)

## Specs

The source of truth for the platform model lives in [`specs/`](specs/index.md).
