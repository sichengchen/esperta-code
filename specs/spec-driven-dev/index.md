# Spec-Driven Development

## Spec Structure

When `specs.enabled: true`, specs are stored in the repo under `{specs.directory}/` (default: `specs/`).

```
specs/
  index.md              # Master index linking to all specs
  auth/
    index.md            # Auth module overview
    login.md            # Login behavior spec
    registration.md     # Registration behavior spec
  payments/
    index.md
    checkout.md
```

Each spec file follows a structured format:

```markdown
# Login

## System Behavior

The login system authenticates users via email/password or OAuth providers.

## Scenarios

### Successful email login
- **Given** a registered user with email "user@example.com"
- **When** they submit valid credentials
- **Then** they receive a session token
- **And** the token expires in 24 hours

### Failed login - invalid password
- **Given** a registered user with email "user@example.com"
- **When** they submit an incorrect password
- **Then** they receive a 401 error
- **And** the failed attempt is logged

### OAuth login - new user
- **Given** a user authenticating via Google OAuth for the first time
- **When** the OAuth callback succeeds
- **Then** a new user account is created
- **And** they receive a session token
```

## Spec Lifecycle

```
Issue created
    |
    v
Feliz reads issue description
    |
    v
Feliz drafts spec (behavior descriptions + scenarios)
    |
    v
Feliz commits spec to branch, posts summary to Linear
    |
    v
Human reviews, comments with feedback
    |
    v
Feliz revises spec based on feedback
    |
    v
Human approves (@feliz approve)
    |
    v
Spec is committed to worktree, agent uses it as primary context
    |
    v
Agent implements against spec scenarios
    |
    v
Gates verify: do tests cover the spec scenarios?
```

## Spec as Context

When specs are enabled, the agent's context includes:
- The specific spec file(s) relevant to the current issue
- The spec index for broader project understanding
- Spec scenarios serve as implicit acceptance criteria

The agent is instructed to implement behavior matching the spec scenarios and write tests that validate them.

## Feature Decomposition

When a user wants to add many features at once, they create a single high-level Linear issue (or epic) describing the full scope. Feliz detects this as a large feature and enters the `decomposing` state.

**Detection heuristics** (any of):
- Issue has an `epic` label or is a Linear project issue
- Issue description exceeds a complexity threshold (multiple distinct features described)
- User explicitly requests decomposition via `@feliz decompose`

**Decomposition flow**:

When `specs.enabled: true`:

```
User creates high-level Linear issue
    |
    v
Feliz detects large feature -> enters 'decomposing'
    |
    v
Feliz drafts a project-level spec from the issue description
  (behavior descriptions + scenarios for all sub-features)
    |
    v
From the spec, Feliz proposes a breakdown:
  - Individual sub-issues (one per behavior/scenario group)
  - Dependency graph between sub-issues
  - Suggested implementation order
    |
    v
Feliz posts the breakdown to the parent Linear issue as a comment
    |
    v
Human reviews, adjusts, approves (@feliz approve)
    |
    v
Feliz creates sub-issues in Linear with:
  - Titles and descriptions derived from the spec
  - Blocker/dependency relationships set in Linear
  - Labels inherited from parent + 'feliz:sub-issue'
  - Link back to parent issue
    |
    v
Feliz commits the project-level spec to the repo
    |
    v
Sub-issues enter spec_drafting -> spec_review -> queued -> running -> completed
    |
    v
Parent issue auto-completes when all sub-issues are completed
```

When `specs.enabled: false`:

```
User creates high-level Linear issue
    |
    v
Feliz detects large feature -> enters 'decomposing'
    |
    v
Feliz analyzes the description and proposes a breakdown:
  - Individual sub-issues with titles and descriptions
  - Dependency graph between sub-issues
  - (No spec artifacts created)
    |
    v
Feliz posts the breakdown to the parent Linear issue as a comment
    |
    v
Human reviews, adjusts, approves (@feliz approve)
    |
    v
Feliz creates sub-issues in Linear with blocker relationships
    |
    v
Sub-issues enter queued -> running -> completed (no spec phases)
    |
    v
Parent issue auto-completes when all sub-issues are completed
```

**Spec-to-issue mapping** (only when `specs.enabled`): Each sub-issue references specific spec files/scenarios. When Feliz works on a sub-issue, the relevant spec sections are included in context. The spec index (`specs/index.md`) is updated to reflect the full feature structure.

**Dependency enforcement**: Sub-issues with blockers in non-terminal states remain in `queued` but are not dispatched. They become eligible for dispatch only when all blockers reach terminal states (detected during the poll cycle).
