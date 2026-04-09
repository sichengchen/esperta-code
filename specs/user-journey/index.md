# User Journey

## 1. Install and Configure

1. Run `esperta-code init` or write `feliz.yml`.
2. Authenticate Linear with `esperta-code auth linear`.
3. Add a project with `esperta-code project add`.
4. Ensure the repo contains `.feliz/config.yml`, `.feliz/pipeline.yml`, prompts, and optional `specs/`.

## 2. Start Esperta Code

Run:

```bash
esperta-code start
```

Esperta Code begins listening for Linear webhooks and periodically dispatching pending threads.

## 3. Delegate an Issue

In Linear:

1. Assign an issue to Esperta Code or mention `@esperta`
2. Esperta Code creates a thread for that issue
3. Esperta Code stores the latest Linear session ID on the thread
4. If the comment contains guidance, Esperta Code appends it as a human job

## 4. Agent Execution

When the thread is dispatched:

1. Esperta Code creates a worktree if needed
2. Esperta Code marks the thread `running`
3. The pipeline executes in the thread worktree
4. Agents use `esperta-code thread read` for context
5. Agents use `esperta-code thread write` for actionable follow-up

## 5. Follow-Up While Running

If a human adds more guidance while the thread is running:

1. Esperta Code appends another human job
2. Thread status becomes `running_dirty`
3. The current execution finishes
4. The thread returns to `pending`
5. The next dispatch sees the new jobs

## 6. Review and Failure Handling

Review findings and failures are not separate workflows.

- A reviewer writes findings as agent jobs on the thread.
- A failed execution writes a failure summary as an agent job on the thread.
- The human can add more clarification as another job.

Everything stays inside one thread.

## 7. Completion

When work is complete:

1. The publish step commits, pushes, and creates a PR
2. Esperta Code marks the thread `completed`
3. Esperta Code posts the completion result back to Linear

## 8. Stop

If the user presses Stop in Linear:

1. Linear sends the `stop` signal
2. Esperta Code cancels the active adapter for that thread
3. Esperta Code marks the thread `stopped`
