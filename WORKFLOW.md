# System Prompt

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Instructions

- Read the relevant spec before writing any code
- Follow TDD (red-green-refactor): write a failing test first, then the minimum implementation to pass, then refactor
- Use conventional commits: type(scope): description
- Commit frequently at meaningful milestones
- Keep it simple — no premature abstractions
- Run `bun test` and `bun run lint` before finishing
