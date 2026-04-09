# Workspace Management

## Repo Lifecycle

On project registration, Esperta Code:

1. Clones the repo to `{workspace_root}/{project_name}/repo`
2. Tracks the configured base branch
3. Reuses that clone as the source for thread worktrees

## Thread Worktree Lifecycle

Each thread owns one worktree in the normal case.

1. On first dispatch, Esperta Code creates a worktree for the thread.
2. The worktree path and branch name are stored on the thread.
3. The same worktree is reused across follow-up jobs on that thread.
4. Agent steps execute only inside that worktree.

Example shape:

```text
{workspace_root}/{project_name}/worktrees/{linear_identifier}
```

Default branch name:

```text
esperta-code/{linear_identifier}
```

## Hooks

- `hooks.after_create` runs once when the thread worktree is first created.
- `hooks.before_run` and `hooks.after_run` run around each pipeline step.

## Safety Rules

- Thread identifiers are sanitized before becoming filesystem paths.
- Resolved worktree paths must remain under `workspace_root`.
- Concurrent threads do not share a mutable worktree.
