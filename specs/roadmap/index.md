# Roadmap

The clean-slate thread model is now the baseline:

- `Project`
- `Thread`
- `Job`

Future work should build on that baseline rather than reintroducing legacy orchestration layers.

## Near-Term Areas

1. Improve Linear writeback quality and richer activity summaries.
2. Harden worktree lifecycle management and cleanup policies.
3. Expand adapter support and adapter-specific observability.
4. Improve repo memory authoring and spec maintenance workflows.
5. Add better operational introspection for thread queues and failures.

## Explicit Anti-Goals

Do not reintroduce:

- `WorkItem`
- `Run`
- `StepExecution`
- command-driven thread control for planning, retry, or approval
