# Agents

Esperta Code runs exactly one agent per job. Agent adapters live under `src/agents/` and translate the platform’s execution contract into concrete CLI invocations.

Local agent clients are a separate concern. Tools such as Esperta Base can interact with Esperta Code through `esperta-code json`, which lives in the CLI layer rather than the adapter layer.

## Supported Adapters

### Codex

```bash
codex exec --json -s <sandbox> "<prompt>"
```

### Claude Code

```bash
claude --dangerously-skip-permissions --output-format json --max-turns <N> --print -p "<prompt>"
```

### OpenCode

```bash
opencode run --format json --agent <build|plan> "<prompt>"
```

## Availability

```bash
esperta-code agent list
```

This checks whether each adapter’s CLI is installed and runnable.

## Where Agents Are Selected

Agents are chosen in two places:

1. Central `job_types` in `esperta-code.yml`
2. Repo-local workflow assets in `.esperta-code/pipeline.yml` when a repo uses scaffolded pipeline steps

## Adapter Contract

```ts
interface AgentAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(params: AgentRunParams): Promise<AgentRunResult>;
  cancel(runId: string): Promise<void>;
}
```

`AgentRunParams` includes:

- `runId`
- `workDir`
- `prompt`
- `timeout_ms`
- `maxTurns`
- `approvalPolicy`
- `env`

`AgentRunResult` returns structured status, exit code, stdout/stderr, changed files, and optional summary/token usage.

## Sandbox Mapping

For adapters that support sandbox or permission selection, Esperta Code maps approval policy to the appropriate mode.

| Policy | Typical Sandbox |
|---|---|
| `auto` | full write access |
| `suggest` | workspace-write |
| `gated` | read-only |

For OpenCode specifically, Esperta Code uses the documented `build`/`plan` agents and passes permissions through `OPENCODE_CONFIG_CONTENT`.

## Adding a New Adapter

1. Add a new adapter file under `src/agents/`.
2. Implement the `AgentAdapter` interface.
3. Register the adapter where adapters are assembled, currently in `src/server.ts`.
4. Reference the adapter name from `job_types` or repo-local workflow assets.

## Local Agent Clients

Use the JSON CLI when a local tool needs to drive Esperta Code as a platform:

```bash
echo '{"version":"v1","action":"capabilities"}' | esperta-code json
```

That interface is documented in [Local Agents](local-agents.md). It supports thread creation, continuation, inspection, job control, worktree inspection, and external-event attachment.
