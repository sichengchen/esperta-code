# Workspace Management

Worktree management is a first-class subsystem.

## Per-project layout

Each project maintains:

- one canonical local clone
- a worktree root
- branch leases enforced at the thread/job level

Suggested layout:

```text
~/.feliz/
  repos/<project>/
  workspaces/<project>/worktrees/<thread-id>/<run-id>/
  artifacts/<thread-id>/<run-id>/
```

The current implementation stores canonical repos and worktrees under the configured workspace root and records the absolute worktree path in SQLite.

## Per-run lifecycle

For each run:

1. resolve the thread branch or base branch
2. create a fresh worktree
3. execute the job inside that worktree
4. capture metadata and last activity time
5. retain or delete the worktree after completion

## Retention policies

Supported policies:

- delete immediately on success
- retain briefly on success for inspection
- retain longer on failure
- pin retained worktrees manually
- prune retained worktrees by age

## Administrative commands

- `esperta-code worktree list`
- `esperta-code worktree inspect <id>`
- `esperta-code worktree prune`

## Garbage collection responsibilities

Garbage collection must handle:

- expired retained worktrees
- orphaned worktrees after crash
- stale branch leases
- archived threads
- merged or deleted branches
