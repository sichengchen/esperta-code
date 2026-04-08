# Architecture

## System diagram

```text
┌──────────────────────────────────────────────────────────────┐
│                        Esperta Code                          │
│                                                              │
│  Sources                 Core                    Sinks        │
│  ┌──────────────┐       ┌────────────────────┐   ┌─────────┐ │
│  │ CLI / API    │──────▶│ Threads            │──▶│ CLI/API │ │
│  │ GitHub       │──────▶│ Jobs               │──▶│ Webhook │ │
│  │ Linear       │──────▶│ Runs               │──▶│ GitHub  │ │
│  │ Webhooks     │──────▶│ Worktrees          │──▶│ Linear  │ │
│  │ Automation   │──────▶│ Artifacts          │──▶│ Email   │ │
│  └──────────────┘       │ Approvals          │   └─────────┘ │
│                         │ External Events    │               │
│                         │ Thread Links       │               │
│                         └─────────┬──────────┘               │
│                                   │                          │
│                         ┌─────────▼──────────┐               │
│                         │ Job Executor        │               │
│                         │ - fresh worktree    │               │
│                         │ - one agent         │               │
│                         │ - verification      │               │
│                         │ - artifact capture  │               │
│                         └─────────┬──────────┘               │
│                                   │                          │
│                         ┌─────────▼──────────┐               │
│                         │ Agent Adapters      │               │
│                         │ Codex / Claude /    │               │
│                         │ other CLI agents    │               │
│                         └─────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

Runtime: Bun (TypeScript)

Persistence:

- SQLite for metadata
- Filesystem for artifacts
- Filesystem for canonical repos and worktrees

## Core domain model

```text
Project 1:N Thread 1:N Job 1:N Run
                    │        │
                    │        └──1:1 Worktree
                    │
                    ├──N Artifact
                    ├──N Approval
                    ├──N ExternalEvent
                    └──N ThreadLink
```

### Project

A tracked repository plus runtime policy.

Fields:

- repo URL
- default branch
- runtime config
- concurrency limits
- job type definitions

### Thread

The durable unit of work.

Owns:

- project context
- base branch
- thread branch
- current PR link
- job history
- artifact history
- external references
- latest thread status

### Job

One request attached to a thread.

Properties:

- exactly one agent
- exactly one job type
- one execution intent
- independent approval and publish policies

### Run

One attempt to execute a job.

Tracks:

- attempt number
- worktree used
- adapter used
- verification result
- branch and PR metadata
- summary and failure reason

### Worktree

One isolated execution workspace for a run.

Tracks:

- filesystem path
- base branch and thread branch
- lease owner
- state and retention window
- last activity time

### Artifact

Durable execution outputs.

Examples:

- stdout/stderr logs
- verification logs
- summaries
- test output
- review notes
- PR metadata

### Approval

Optional gate that blocks a job until a human resolves it.

### ExternalEvent

An external signal attached to a thread, such as CI failure, review feedback, merge conflict, or a follow-up instruction.

### ThreadLink

External references attached to a thread, such as GitHub PRs, issue IDs, or connector-specific resource IDs.
