# Esperta Code Specification

Esperta Code is a neutral remote agent platform. It accepts coding jobs from multiple sources, runs exactly one coding agent per job in a fresh isolated worktree, and preserves durable thread history, branch state, worktree state, artifacts, approvals, and external events across restarts.

## Product definition

- Remote-first: jobs continue without an attached terminal session.
- Neutral: core behavior does not depend on Linear, GitHub Issues, or any one client.
- Thread-centric: a thread is the durable identity; new work is added by appending jobs.
- One-agent-per-job: no internal multi-agent or multi-phase workflow inside a job.
- Worktree-first: every run executes in a fresh isolated worktree.
- Durable: jobs, runs, artifacts, thread links, and worktrees survive process restarts.

## Connectors

Linear remains supported, but as a connector layered on top of the core thread/job model rather than as the core architecture.

## Specification documents

| Section | Description |
|---|---|
| [Architecture](architecture/index.md) | Core domain model, persistence, thread/job/run/worktree relationships |
| [Configuration](configuration/index.md) | Runtime config, project config, job type profiles, retention and concurrency |
| [Orchestration](orchestration/index.md) | Job scheduling, state transitions, execution envelope, approvals |
| [Workspace Management](workspace/index.md) | Canonical repos, isolated worktrees, retention, pruning, branch leases |
| [Agent Dispatch](agents/index.md) | Single-agent execution model and adapter contract |
| [Linear Connector](linear/index.md) | Linear as a source and sink mapped onto threads, jobs, and events |
| [CLI](cli/index.md) | Thread/job/worktree oriented CLI, including the local-agent JSON interface |
| [Security](security/index.md) | Secrets, isolation, permissions, auditability |
| [Testing](testing/index.md) | Validation strategy |
| [Roadmap](roadmap/index.md) | Delivery sequencing |
