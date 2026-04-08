# CLI

The CLI is split between operator commands and thread-scoped agent helpers.

## Operator Commands

```text
feliz start
feliz init
feliz stop
feliz status

feliz config validate
feliz config show

feliz project list
feliz project add
feliz project remove <name>

feliz agent list
feliz auth linear

feliz e2e doctor
feliz e2e smoke
```

## Agent Commands

```text
feliz thread read
feliz thread write <message>
```

These commands are intended for use during active thread execution. They rely on:

- `FELIZ_DATA_DIR`
- `FELIZ_THREAD_ID`

## `feliz thread read`

Renders a thread-centric context view including:

- thread metadata
- ordered jobs
- repo memory
- repo specs

## `feliz thread write`

Appends a new agent-authored job to the current thread.

Use it for:

- review findings
- failure summaries
- follow-up instructions
- important handoff notes

## `feliz status`

Shows basic daemon status and the count of currently running agent threads.

## `feliz auth linear`

Performs Linear OAuth for the Feliz app identity:

1. Build the authorization URL.
2. Wait for the callback.
3. Exchange the authorization code for a token.
4. Verify the token with `viewer`.
5. Save `linear.oauth_token` and `linear.app_user_id`.

## E2E Commands

- `feliz e2e doctor` checks local prerequisites.
- `feliz e2e smoke` validates config, DB readiness, and scenario scaffolding.
