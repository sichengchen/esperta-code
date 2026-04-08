# Agent Dispatch

## Adapter Interface

Feliz dispatches coding agents through a small adapter interface keyed to the thread model.

```typescript
interface AgentAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(params: AgentRunParams): Promise<AgentRunResult>;
  cancel(threadId: string): Promise<void>;
}

interface AgentRunParams {
  threadId: string;
  workDir: string;
  prompt: string;
  timeout_ms: number;
  maxTurns: number;
  approvalPolicy: "auto" | "gated" | "suggest";
  env: Record<string, string>;
}

interface AgentRunResult {
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  exitCode: number;
  stdout: string;
  stderr: string;
  tokenUsage?: { input: number; output: number };
  filesChanged: string[];
  summary?: string;
}
```

`cancel(threadId)` is thread-scoped because the active unit of execution is the thread, not a separate run record.

## Built-In Adapters

Feliz currently ships with adapters for:

- Claude Code
- Codex

Both execute inside the thread worktree and return normalized structured output.

## Pipeline Model

Every pipeline step is an agent call with a prompt.

Typical steps include:

- implementation
- testing/fixing
- review
- final checks
- publishing

There are no persisted per-step execution records in the simplified system.

## Success Conditions

Optional post-agent validation remains supported:

| Type | Schema | Meaning |
|---|---|---|
| Shell command | `{ command: "bun test" }` | Step succeeds when the command exits 0 |
| Agent verdict | `{ agent_verdict: "approved" }` | Step succeeds when the agent output includes the verdict |
| File exists | `{ file_exists: "path/to/file" }` | Step succeeds when the file exists |
| Always pass | `{ always: true }` | Step always succeeds |

If no success condition is defined, the step succeeds when the adapter returns a successful exit.

## Execution Semantics

For each phase in `.feliz/pipeline.yml`:

1. Render the step prompt.
2. Run `hooks.before_run` if configured.
3. Invoke the selected adapter in the thread worktree.
4. Run `hooks.after_run` if configured.
5. Evaluate the success condition.
6. Retry the same step if `max_attempts` allows it.
7. Repeat the phase if `repeat` is configured and needed.

The shared worktree is the handoff channel between steps.

## Thread-Aware Prompting

Prompts should rely on:

- `feliz thread read` to inspect thread jobs, memory, and specs
- `feliz thread write` to append follow-up jobs when the agent discovers actionable work

Prompt authors should not depend on dedicated template variables for previous failures or previous reviews.
