# Implementation Roadmap

## Phase 1: Foundation
- Project scaffolding (TypeScript, Docker)
- Configuration loader (`feliz.yml` + `.feliz/config.yml` + `.feliz/pipeline.yml` parsers)
- WORKFLOW.md prompt template parser
- SQLite schema + migrations
- CLI skeleton (`feliz start`, `feliz config validate`)

## Phase 2: Linear Polling + Work Items
- Linear GraphQL client with rate limiting
- Poll loop with issue discovery and change detection
- WorkItem CRUD in SQLite
- History event logging (append-only)

## Phase 3: Workspace + Single-Step Agent Dispatch
- Repo cloning and management
- Git worktree lifecycle
- Agent adapter interface
- Claude Code adapter implementation
- Basic orchestration state machine (unclaimed -> queued -> running -> completed/failed)
- Default single-step pipeline (no `.feliz/pipeline.yml` required)

## Phase 4: Results + Linear Writeback
- PR creation (GitHub API)
- Linear comment posting and state updates
- Verification gates (test/lint commands)
- Comment command parsing (`@feliz start/status/retry/cancel`)

## Phase 5: Multi-Step Pipeline Engine
- Pipeline phase/step executor
- Step success conditions (command, agent_verdict, file_exists, always)
- Phase repeat/loop with cycle tracking
- Step-level retry with failure context
- Per-step agent adapter selection
- StepExecution recording

## Phase 6: Context Layer
- Artifact store (SQLite + filesystem)
- Context assembly and snapshot manifests
- History/Memory/Scratchpad lifecycle
- Scratchpad promotion flow
- Cross-step context (prior step outputs as scratchpad)

## Phase 7: Spec-Driven Development
- Spec drafting engine (agent-generated specs from issue descriptions)
- Spec directory management (index.md + structured files)
- Spec review flow (Linear comment approval)
- Spec-as-context integration

## Phase 8: Feature Decomposition
- Large feature detection heuristics
- Spec-to-issue decomposition engine
- Auto-dependency creation in Linear
- Parent issue lifecycle (tracks children)
- Decomposition review flow

## Phase 9: Hardening
- Concurrency control (global + per-state)
- Approval gates (gated, suggest modes)
- Additional agent adapters (Codex, Aider)
- Dynamic config reload
- Observability improvements
