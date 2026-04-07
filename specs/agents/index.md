# Agent Dispatch

Feliz dispatches exactly one agent per job.

## Adapter contract

```typescript
interface AgentAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(params: AgentRunParams): Promise<AgentRunResult>;
  cancel(runId: string): Promise<void>;
}

interface AgentRunParams {
  runId: string;
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
  filesChanged: string[];
  summary?: string;
  tokenUsage?: { input: number; output: number };
}
```

## Execution rules

- one adapter invocation per job
- work happens inside the run worktree
- verification commands run outside the agent call as job-level checks
- publish behavior is determined by job type policy, not by an internal pipeline

## Job types

Job types are single-agent profiles such as:

- `implement`
- `fix`
- `fix_ci`
- `review`
- `spec`
- `publish`
- `continue`

The agent is responsible for the job’s single purpose. If the user wants another purpose, Feliz creates another job on the same thread.
