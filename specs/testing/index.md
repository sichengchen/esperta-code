# Testing & Validation Plan

The test plan validates the simplified `Project -> Thread -> Job` system.

## Exit Criteria

Validation is complete when all of the following are true:

- `bun test` passes
- `bun run lint` passes
- `bun run build` passes
- a Linear issue creates exactly one thread and one worktree
- follow-up comments append jobs to that existing thread
- `stop` interrupts active execution without creating a second thread
- `esperta-code thread read` renders the expected thread job stream and repo context

## Core Scenarios

### Thread Creation

- Assign or mention Esperta Code on a new Linear issue
- Expect one new thread in SQLite
- Expect status `pending`

### Follow-Up Guidance

- Add another Linear comment on the same issue
- Expect one new human job on the same thread
- Expect no new thread

### In-Flight Follow-Up

- While a thread is running, add another Linear comment
- Expect thread status to become `running_dirty`
- Expect completion to re-queue the thread to `pending`

### Failure Feedback

- Force a pipeline failure
- Expect an agent-authored failure summary job on the same thread
- Expect thread status `failed`, unless the thread became dirty and was re-queued

### Review Feedback

- Use a review step with `agent_verdict: approved`
- Force a failed review verdict
- Expect the review text to be appended as an agent-authored job

### Stop Signal

- Send the Linear `stop` signal for a running thread
- Expect adapter cancellation by `thread.id`
- Expect thread status `stopped`

## Harness Commands

```bash
bun run src/cli/index.ts e2e doctor --config /tmp/esperta-code-e2e/esperta-code.yml
bun run src/cli/index.ts e2e smoke --config /tmp/esperta-code-e2e/esperta-code.yml
```

These commands validate prerequisites and projected scenarios, but the core correctness bar remains the thread/job model above.
