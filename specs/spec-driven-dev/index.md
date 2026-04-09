# Spec-Driven Development

Specs remain optional repo-owned design documents. They are not a separate orchestration mode.

## What Specs Are

Specs are markdown documents stored in the repo, usually under `specs/`, that describe:

- system design
- constraints and invariants
- behavioral scenarios

When specs are enabled, they become part of thread context through `esperta-code thread read`.

## How Specs Fit the Thread Model

The simplified model does not create separate spec-drafting states or approval commands.

Instead:

1. A human asks for a feature or change in the thread.
2. The agent may update or author specs in the repo if needed.
3. Questions, clarifications, and approvals appear as jobs in the same thread.
4. The next agent pass reads the revised specs from the thread worktree.

## Recommended Spec Structure

```text
specs/
  index.md
  feature-area/
    index.md
    specific-flow.md
```

Each spec should cover:

- overview
- design
- data/API shape
- behavioral scenarios

## Large Features

Large features are still discussed inside the same thread model.

If decomposition or planning is needed:

- the human expresses that need as a job
- the agent can respond with a plan or spec revision
- follow-up adjustments are more jobs on the same thread

No separate decomposition command or decomposition state is required by the model.
