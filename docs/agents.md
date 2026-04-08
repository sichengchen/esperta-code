# Agents

Esperta Code dispatches coding agents through a pluggable adapter interface.

## Supported agents

### Claude Code

```bash
claude --dangerously-skip-permissions --output-format json --max-turns <N> --print -p "<prompt>"
```

### Codex

```bash
codex exec --json -s <sandbox> "<prompt>"
```

Sandbox mode maps from `approval_policy`:

| Policy | Sandbox |
|---|---|
| `auto` | `danger-full-access` |
| `suggest` | `workspace-write` |
| `gated` | `read-only` |

## Check availability

```bash
esperta-code agent list
```

Reports whether each agent CLI is installed and runnable.

## Per-step agent selection

Override the default agent on any pipeline step:

```yaml
phases:
  - name: implement
    steps:
      - name: code
        agent: claude-code
  - name: review
    steps:
      - name: review
        agent: codex
```

Steps without an explicit `agent` use the default from `.feliz/config.yml`.

## Adapter interface

```ts
interface AgentAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(params: AgentRunParams): Promise<AgentRunResult>;
  cancel(runId: string): Promise<void>;
}
```

Run params include `runId`, `workDir`, `prompt`, `timeout_ms`, `maxTurns`, `approvalPolicy`, and `env`.

## Custom adapters

1. Create a file in `src/agents/` implementing `AgentAdapter`.
2. Register it in `src/server.ts`.
3. Reference the adapter name in config or pipeline steps.

Adapters must return structured status (`succeeded | failed | timed_out | cancelled`), capture stdout/stderr, honor `timeout_ms`, and implement `cancel`.
