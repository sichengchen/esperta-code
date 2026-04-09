# System Prompt

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Context

Run `esperta-code thread read` to see project memory, specs, and thread jobs.
Run `esperta-code thread write <message>` to append new jobs to the current thread.
Project memory is in `.esperta-code/context/memory/` — read and write files there directly.
Specs are in `specs/`.

## Instructions

- Read the relevant spec before writing any code
- Follow TDD (red-green-refactor): write a failing test first, then the minimum implementation to pass, then refactor
- Use conventional commits: type(scope): description
- Commit frequently at meaningful milestones
- Keep it simple — no premature abstractions
- Run `bun test` and `bun run lint` before finishing
