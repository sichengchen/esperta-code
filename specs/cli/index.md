# CLI

The CLI is split between operator commands and thread-scoped agent helpers.

## Operator Commands

```text
esperta-code start
esperta-code init
esperta-code stop
esperta-code status

esperta-code config validate
esperta-code config show

esperta-code project list
esperta-code project add
esperta-code project remove <name>

esperta-code agent list
esperta-code auth linear

esperta-code e2e doctor
esperta-code e2e smoke
```

## Agent Commands

```text
esperta-code thread read
esperta-code thread write <message>
```

The legacy `feliz` CLI alias remains supported for compatibility, but `esperta-code` is the primary command name.

These commands are intended for use during active thread execution. They rely on:

- `FELIZ_DATA_DIR`
- `FELIZ_THREAD_ID`

## `esperta-code thread read`

Renders a thread-centric context view including:

- thread metadata
- ordered jobs
- repo memory
- repo specs

## `esperta-code thread write`

Appends a new agent-authored job to the current thread.

Use it for:

- review findings
- failure summaries
- follow-up instructions
- important handoff notes

## `esperta-code status`

Shows basic daemon status and the count of currently running agent threads.

## `esperta-code auth linear`

Performs Linear OAuth for the Esperta Code app identity:

1. Build the authorization URL.
2. Wait for the callback.
3. Exchange the authorization code for a token.
4. Verify the token with `viewer`.
5. Save `linear.oauth_token` and `linear.app_user_id`.

## E2E Commands

- `esperta-code e2e doctor` checks local prerequisites.
- `esperta-code e2e smoke` validates config, DB readiness, and scenario scaffolding.
