# Context Management

Esperta Code assembles context around the thread, not around a run record.

## Context Assembly

Before an agent step runs, Esperta Code builds context from four sources:

1. The current `Thread`
2. The ordered `Job` list for that thread
3. Repo memory from `.esperta-code/context/memory/`
4. Optional specs from the configured spec directory

The result is a thread-centric context bundle. There is no context snapshot model in the simplified system.

## Storage

| Layer | Storage | Purpose |
|---|---|---|
| Thread | SQLite `threads` | Current mutable execution state and workspace linkage |
| Jobs | SQLite `jobs` | Ordered guidance and agent follow-up |
| History | SQLite `history` | Operational audit trail |
| Memory | Repo `.esperta-code/context/memory/` | Durable project knowledge |
| Specs | Repo `specs/` or configured directory | Optional design context |

## Assembly Rules

- Jobs are read in chronological order.
- Memory and specs are read from the thread worktree so the agent sees the branch-local repo state.
- History is not the main agent-facing context channel; it exists for observability and audit.
- Prompt authors should rely on `esperta-code thread read` rather than special template variables for prior failures or prior reviews.

## Behavioral Scenario

### Scenario: Thread Read

- Given a thread with jobs, memory, and specs
- When an agent runs `esperta-code thread read`
- Then Esperta Code renders the current thread, job stream, memory, and specs as one thread-centric context view
