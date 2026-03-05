# Feliz

Self-hosted cloud agents platform.

Feliz turns Linear issues into merged pull requests. It orchestrates coding agents to implement, test, review, and ship code — autonomously.

Write an issue. Feliz writes the code.

## How it works

```
Linear Issue ──▶ Feliz ──▶ Pull Request
```

1. You create an issue in Linear
2. Feliz picks it up, assembles context, and dispatches a coding agent
3. The agent implements the change in an isolated git worktree
4. Feliz runs tests, creates a PR, and posts the result back to Linear

No context switching. No prompting. Linear is your interface — Feliz is the engine.

## Key features

**Linear as the control surface** — Interact through issue states, comments, and labels. `@feliz start` to begin, `@feliz approve` to proceed, `@feliz retry` on failure.

**Multi-step pipelines** — Define execution phases: implement tests, write code, run a review cycle with a different agent, fix issues, repeat until done.

**Pluggable agents** — Ship with Claude Code. Add Codex, Aider, or any CLI agent through a simple adapter interface.

**Persistent context** — History, memory, and scratchpad layers ensure agents learn from prior runs. Conventions and decisions accumulate in the repo, not in ephemeral chat.

**Spec-driven development** *(optional)* — Feliz drafts behavior specs with Given/When/Then scenarios before coding. Approve in Linear, then the agent implements against the spec.

**Feature decomposition** — Describe a large feature in one issue. Feliz breaks it into sub-issues with dependencies, creates them in Linear, and works through them in order.

## Quick start

```bash
# Start Feliz
docker compose up -d

# Run the setup wizard
docker compose exec feliz feliz init

# Add your first project
docker compose exec feliz feliz project add
```

```yaml
# docker-compose.yml
services:
  feliz:
    image: feliz
    volumes:
      - ${SSH_AUTH_SOCK}:/ssh-agent:ro
      - ~/.ssh/known_hosts:/root/.ssh/known_hosts:ro
      - feliz-data:/data/feliz
      - feliz-agent-creds:/root
    environment:
      - SSH_AUTH_SOCK=/ssh-agent
      - LINEAR_API_KEY
      - GITHUB_TOKEN
      - GIT_AUTHOR_NAME=Feliz Bot
      - GIT_AUTHOR_EMAIL=feliz@example.com
volumes:
  feliz-data:
  feliz-agent-creds:
```

## Pipeline example

Define multi-step workflows in `.feliz/pipeline.yml`:

```yaml
phases:
  - name: implement
    steps:
      - name: write_tests
        agent: claude-code
        prompt: .feliz/prompts/write_tests.md
        success: { command: "bun test --bail" }
      - name: write_code
        agent: claude-code
        prompt: .feliz/prompts/write_code.md
        success: { command: "bun test" }
        max_attempts: 5

  - name: review_cycle
    repeat: { max: 3, on_exhaust: pass }
    steps:
      - name: review
        agent: codex
        prompt: .feliz/prompts/review.md
        success: { agent_verdict: approved }
      - name: fix_issues
        agent: claude-code
        prompt: .feliz/prompts/fix_review.md
        success: { command: "bun test" }

  - name: publish
    steps:
      - name: final_check
        success: { command: "bun run lint && bun test" }
      - name: create_pr
        builtin: publish
```

## Architecture

```
┌──────────────────────────────────────────────┐
│                Feliz Server                   │
│                                               │
│  Issue Poller ◄──── Linear GraphQL API        │
│  Chat SDK    ◄──── @feliz mentions/commands   │
│       │                                       │
│       ▼                                       │
│  Orchestrator (state machine, concurrency)    │
│       │                                       │
│       ├── Workspace Manager (git worktrees)   │
│       ├── Context Store (history/memory/pad)  │
│       ├── Spec Engine (optional)              │
│       │                                       │
│       ▼                                       │
│  Agent Dispatch ──▶ Claude Code / Codex / ... │
│       │                                       │
│       ▼                                       │
│  Publisher ──▶ PR + Linear update             │
└──────────────────────────────────────────────┘
```

- **Bun** runtime, **TypeScript**
- **SQLite** for history and run state
- **Git repo** for persistent memory (conventions, specs, decisions)
- **Vercel Chat SDK** for messaging across platforms

## Documentation

Full specification: **[specs/index.md](specs/index.md)**

| | |
|---|---|
| [Architecture](specs/architecture/index.md) | System design and domain model |
| [Configuration](specs/configuration/index.md) | Server config, repo config, pipelines |
| [Linear Integration](specs/linear/index.md) | Polling, Chat SDK, commands |
| [Context Management](specs/context/index.md) | History, Memory, Scratchpad |
| [Orchestration](specs/orchestration/index.md) | State machine, retry, concurrency |
| [Agent Dispatch](specs/agents/index.md) | Adapter interface, pipeline execution |
| [User Journey](specs/user-journey/index.md) | Full project lifecycle walkthrough |

## License

MIT
