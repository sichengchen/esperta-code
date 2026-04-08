# Result Publishing

Publishing is just another agent step inside the thread pipeline.

## Expected Behavior

The publish step typically:

1. checks git status in the thread worktree
2. stages and commits any remaining changes
3. pushes the thread branch
4. creates a pull request
5. reports the PR link back through Linear activity and/or a thread job

## Why Publishing Stays in the Agent

Keeping publishing inside the agent step allows the same recovery loop to handle:

- missing commits
- rejected pushes
- branch drift
- PR creation failures

The system does not need a separate publishing subsystem model.

## Thread Relationship

Publishing operates on:

- the thread's worktree
- the thread's branch
- the thread's existing job history

It does not create a separate execution object.
