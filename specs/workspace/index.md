# Workspace Management

## Repo Lifecycle

On project registration, Feliz:
1. Clones the repo to `{workspace_root}/{project_name}/repo`
2. Sets up the repo as a bare or regular clone for worktree support
3. Fetches and tracks the configured base branch

## Worktree Lifecycle

Per work item:

1. **Create**: `git worktree add {workspace_root}/{project_name}/worktrees/{identifier} -b feliz/{identifier} {base_branch}`
2. **Hook**: Run `hooks.after_create` in worktree directory (e.g., `npm install`)
3. **Use**: Agent runs exclusively within this worktree
4. **Cleanup**: After completion/failure, run `hooks.before_remove`, then `git worktree remove`

Worktree path safety: identifier is sanitized to `[A-Za-z0-9._-]` (other chars replaced with `_`). The resolved path must remain under `workspace_root` after normalization.

## Branch Naming

Default: `feliz/{linear_identifier}` (e.g., `feliz/BAC-123`)

Configurable via WORKFLOW.md front matter (future extension).

## Behavioral Scenarios

### Scenario: Worktree-Scoped Execution

- **Given** a queued work item is dispatched
- **When** Feliz executes the pipeline
- **Then** the agent runs in that work item's dedicated worktree path

### Scenario: Worktree Hook and Cleanup

- **Given** `hooks.after_create` and/or `hooks.before_remove` are configured
- **When** a worktree is created and later torn down
- **Then** Feliz runs `after_create` in the worktree before agent execution and `before_remove` before `git worktree remove`
