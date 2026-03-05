# Result Publishing

## PR Creation

After a successful agent run + passing gates, Feliz:

1. Pushes the worktree branch to the remote
2. Creates a PR via the Git hosting API (GitHub/GitLab -- detected from remote URL)
3. PR title: `[{linear_identifier}] {issue_title}`
4. PR body includes:
   - Link to Linear issue
   - Agent-generated summary of changes
   - Files changed
   - Test results summary
   - Context snapshot reference (which specs/artifacts were used)

## Linear Status Updates

Feliz posts a comment on the Linear issue with:
- PR link
- Summary of changes
- Run duration and token usage
- Link to run artifacts (if a dashboard exists)

Feliz updates the Linear issue state according to the configured mapping (default: -> "In Review").
