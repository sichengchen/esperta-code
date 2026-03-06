# Orchestration

## Work Item Lifecycle

### State Machine (Specs Enabled)

When `specs.enabled: true`:

```
                    ┌──────────────┐
                    │  unclaimed   │◄──────────────────────┐
                    └──────┬───────┘                       │
                           │                               │
              ┌────────────▼────────────┐                  │
              │  large feature?         │                  │
              └─────┬──────────┬────────┘                  │
                yes │          │ no                         │
                    │          │                            │
           ┌────────▼───────┐  │                           │
           │  decomposing   │  │  (drafts spec + breakdown)│
           └────────┬───────┘  │                           │
                    │          │                           │
           ┌────────▼────────┐ │                           │
           │decompose_review │ │                           │
           └────────┬────────┘ │                           │
                    │ approved │                            │
                    │ (creates │                            │
                    │ sub-issues)                           │
                    │          │                            │
           ┌────────▼──────┐   │                           │
           │ spec_drafting │◄──┘                           │
           └────────┬──────┘                               │
                    │                                      │
           ┌────────▼──────┐                               │
           │  spec_review  │  (if approval_required)       │
           └────────┬──────┘                               │
                    │                                      │
              ┌─────▼──────────┐                           │
              │     queued     │                           │
              └─────────┬─────┘                           │
                        │ (slot available)                 │
              ┌─────────▼────────┐                        │
              │     running      │ (pipeline executes     │
              │                  │  phases/steps serially) │
              └──┬──────────┬────┘                        │
                 │          │                              │
        success  │          │ failure                      │
                 │          │                              │
    ┌────────────▼──┐  ┌────▼─────────┐                   │
    │   completed   │  │ retry_queued │───(retry)─────────┘
    └───────────────┘  └──────┬───────┘
                              │ (max retries exceeded)
                       ┌──────▼───────┐
                       │    failed    │
                       └──────────────┘
```

### State Machine (Specs Disabled)

When `specs.enabled: false` (no spec concept at all):

```
                    ┌──────────────┐
                    │  unclaimed   │◄──────────────────────┐
                    └──────┬───────┘                       │
                           │                               │
              ┌────────────▼────────────┐                  │
              │  large feature?         │                  │
              └─────┬──────────┬────────┘                  │
                yes │          │ no                         │
                    │          │                            │
           ┌────────▼───────┐  │                           │
           │  decomposing   │  │  (breakdown only, no spec)│
           └────────┬───────┘  │                           │
                    │          │                           │
           ┌────────▼────────┐ │                           │
           │decompose_review │ │                           │
           └────────┬────────┘ │                           │
                    │ approved │                            │
                    │ (creates │                            │
                    │ sub-issues)                           │
                    │          │                            │
              ┌─────▼──────────▼──┐                        │
              │      queued       │                        │
              └─────────┬────────┘                        │
                        │ (slot available)                 │
              ┌─────────▼────────┐                        │
              │     running      │                        │
              └──┬──────────┬────┘                        │
                 │          │                              │
        success  │          │ failure                      │
                 │          │                              │
    ┌────────────▼──┐  ┌────▼─────────┐                   │
    │   completed   │  │ retry_queued │───(retry)─────────┘
    └───────────────┘  └──────┬───────┘
                              │ (max retries exceeded)
                       ┌──────▼───────┐
                       │    failed    │
                       └──────────────┘
```

## Entry Point: Mention-Based Discovery

Work items enter the system when a user mentions `@feliz` on a Linear issue (via Chat SDK `onNewMention`). Feliz does **not** poll for issues. See [Linear Integration](../linear/index.md) for details.

When a new mention is received:

1. Feliz reacts with 👀 to acknowledge.
2. Feliz creates a WorkItem in `unclaimed` state.
3. Feliz evaluates the mention context (command, issue description) to determine the first transition.

## Transitions

| From | To | Trigger |
|---|---|---|
| `unclaimed` | `decomposing` | User says `@feliz decompose`, or Feliz judges issue as large feature (epic label, complexity). Decomposition includes spec drafting only if `specs.enabled`. |
| `unclaimed` | `spec_drafting` | `specs.enabled` AND not a large feature |
| `unclaimed` | `queued` | `!specs.enabled` AND not a large feature |
| `decomposing` | `decompose_review` | Feliz drafts breakdown, posts to Linear for approval |
| `decompose_review` | (creates sub-WorkItems) | Human approves decomposition (`@feliz approve`). Parent stays in `decompose_review` until children complete. |
| `spec_drafting` | `spec_review` | `specs.enabled` AND spec draft completed, posted to Linear |
| `spec_review` | `queued` | Human approves (`@feliz approve`) or `!specs.approval_required` |
| `queued` | `running` | Concurrency slot available, pipeline dispatched |
| `running` | `completed` | All pipeline phases/steps succeed (including agent-handled publishing) |
| `running` | `retry_queued` | Pipeline fails, retries remaining |
| `running` | `failed` | Pipeline fails, no retries remaining |
| `retry_queued` | `queued` | Backoff timer expires |
| any | `cancelled` | User cancels via `@feliz cancel` |

**Note**: The states `spec_drafting` and `spec_review` only exist when `specs.enabled: true`. When specs are disabled, these states are never entered and the orchestration state type excludes them.

## Retry Policy

Exponential backoff with jitter:

```
delay = min(10000 * 2^(attempt - 1), max_retry_backoff_ms) + random(0, 2000)
```

Default `max_retry_backoff_ms`: 300000 (5 minutes).
Default max retry attempts: 3.

Normal completion (agent exited 0 but issue still active) uses a fixed 1-second continuation delay.

## Concurrency Control

Two levels:
1. **Global**: `agent.max_concurrent` from central config (default 5).
2. **Per-state**: `concurrency.max_per_state` from `.feliz/config.yml` (optional).

Dispatch eligibility requires:
- Work item is in `queued` state
- Global concurrent count < max
- Per-state concurrent count < max (if configured)
- All blocker issues are in terminal states (if configured with dependencies)

Priority ordering for dispatch queue: `priority ASC` (1=urgent first), then `created_at ASC`.

## Orchestrator Responsibilities

The orchestrator is intentionally thin. It manages:

1. **State machine** — tracking WorkItem orchestration state and transitions
2. **Concurrency** — enforcing global and per-state limits
3. **Dispatch** — selecting eligible work items and invoking agent adapters
4. **Retry** — managing backoff timers and attempt counts
5. **Context assembly** — gathering history, memory, scratchpad for each step
6. **Status updates** — posting results back to Linear (👀 reactions, comments, state changes)

The orchestrator does **not** handle:
- Git operations (cloning, pushing, branching) — handled by workspace manager or agent
- PR creation — handled by agent via publishing prompt
- Test/lint execution — handled by agent or as post-step validation
- Error recovery — agent handles errors within each step

## Tick-Based Progression

Feliz runs a periodic tick (configurable interval, default 5s) that:

1. Processes `decomposing` items via the Decomposition Engine.
2. Processes `spec_drafting` items via the Spec Engine.
3. Promotes retry-ready `retry_queued` items back to `queued`.
4. Dispatches eligible `queued` items to `running`.

New work items enter through the Chat SDK event handler (not the tick).

## Behavioral Scenarios

### Scenario: New Mention Creates Work Item

- **Given** a user mentions `@feliz` on a Linear issue not tracked by Feliz
- **When** the Chat SDK fires `onNewMention`
- **Then** Feliz reacts with 👀, creates a WorkItem in `unclaimed`, and evaluates the first transition

### Scenario: Spec Drafting Progression

- **Given** a work item in `spec_drafting` and `specs.enabled: true`
- **When** a tick runs
- **Then** Feliz invokes the Spec Engine and advances the item to `spec_review` on successful draft generation

### Scenario: Decomposition Progression

- **Given** a work item in `decomposing`
- **When** a tick runs
- **Then** Feliz invokes the Decomposition Engine and advances the item to `decompose_review` on successful proposal generation

### Scenario: Per-State Concurrency Enforcement

- **Given** `concurrency.max_per_state` limits a Linear issue state and running items already consume that limit
- **When** queued items in the same Linear state are considered for dispatch
- **Then** those queued items remain `queued` until capacity is available

### Scenario: Parent Auto-Completion

- **Given** a parent work item in `decompose_review` with child work items
- **When** the final child transitions to `completed`
- **Then** Feliz auto-transitions the parent to `completed` and records `parent.auto_completed`

## Approval Gates

Configurable via `agent.approval_policy` in `.feliz/config.yml`:

| Policy | Behavior |
|---|---|
| `auto` | Agent executes freely. Post-step validation checked after completion. |
| `gated` | Feliz posts the agent's plan to Linear before execution. Requires `@feliz approve` to proceed. |
| `suggest` | Agent produces a diff but doesn't commit. Feliz posts the diff for review. Requires approval to apply. |
