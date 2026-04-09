# Esperta Code Specification

Esperta Code is a long-running service that turns Linear issues into agent work on a git worktree. The product model is intentionally small:

- `Project`
- `Thread`
- `Job`

A Linear issue maps to a thread. A thread owns one worktree and one branch. Jobs are the ordered history of work and guidance for that thread. Human requests, clarifications, approvals, review feedback, and agent-written next steps are all jobs.

The only control behavior outside the model is Linear's `stop` signal, which interrupts active execution for a thread.

## Core Principles

1. Linear is the primary user interface.
2. The thread is the unit of execution and collaboration.
3. Jobs are the only first-class work record.
4. Current execution state lives on the thread.
5. Specs, memory, and prompts are repo-owned context.
6. Agent pipeline steps operate on the whole thread worktree.

## Specification Documents

| Section | Description |
|---|---|
| [Architecture](architecture/index.md) | System architecture, persistence, and the `Project -> Thread -> Job` model |
| [Configuration](configuration/index.md) | Central config, repo config, pipeline definition, and prompt variables |
| [Linear Integration](linear/index.md) | Agent sessions, thread creation/resume, job ingestion, and stop handling |
| [Context Management](context/index.md) | Thread context assembly from jobs, memory, specs, and history |
| [Context Lifecycle](context/lifecycle.md) | How threads, jobs, history, and memory evolve over time |
| [Orchestration](orchestration/index.md) | Thread status transitions, dispatch rules, and stop semantics |
| [Spec-Driven Development](spec-driven-dev/index.md) | Optional repo specs as context, authored inside the same thread model |
| [Workspace Management](workspace/index.md) | Repo clone and thread worktree lifecycle |
| [Agent Dispatch](agents/index.md) | Adapter interface and pipeline execution against a thread |
| [Publishing](publishing/index.md) | Agent-handled commit, push, and PR creation inside a thread |
| [CLI](cli/index.md) | Operator and agent-facing CLI commands |
| [Testing](testing/index.md) | Validation plan for the thread/job model |
| [Security](security/index.md) | Secrets, logging, isolation, and trust model |
| [User Journey](user-journey/index.md) | End-to-end walkthrough for the simplified model |
| [Roadmap](roadmap/index.md) | Forward-looking areas beyond the clean-slate thread model |
