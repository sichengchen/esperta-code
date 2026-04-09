# Linear Integration

Esperta Code connects to Linear as an agent using Linear's Agent API. Linear is the main user interface: users assign issues to Esperta Code, mention it in comments, and stop it through the agent session UI.

## Authentication

Esperta Code uses Linear OAuth with `actor=app`.

Required scopes:

| Scope | Purpose |
|---|---|
| `app:mentionable` | Allow mentions such as `@esperta` or the legacy `@feliz` alias |
| `app:assignable` | Allow delegation to Esperta Code |
| `read` | Read issues, comments, labels, and relations |
| `write` | Emit activities and update issue state |
| `issues:create` | Reserved for future issue-creation workflows |

The installed app user ID is stored alongside the OAuth token.

## Issue Discovery

Esperta Code does not poll Linear for issues. Work enters through agent session webhooks:

1. Assignment to Esperta Code
2. `@esperta`, `@esperta-code`, or the legacy `@feliz` mention in a comment
3. Follow-up activity inside the same agent session

## Thread Mapping

The thread is the canonical interpretation of a Linear issue inside Esperta Code.

- On the first relevant webhook for an issue, Esperta Code creates a thread.
- On later webhooks for the same issue, Esperta Code resumes the existing thread.
- `agentSession.id` is stored on the thread as `linear_session_id`.

## Job Ingestion

Esperta Code does not parse a command language from Linear comments.

- A human follow-up becomes a new job in the thread.
- Review feedback written back by the agent later becomes a new job in the same thread.
- Failure summaries written by the agent later become a new job in the same thread.

If a new job arrives while the thread is already executing:

- `running` becomes `running_dirty`
- the active work is allowed to finish
- the thread is re-queued afterward so the new job is not lost

## Agent Activities

Esperta Code writes status back to Linear through agent activities.

| Activity type | Typical use |
|---|---|
| `thought` | Acknowledge receipt and indicate active work |
| `comment` | Post completion, follow-up, or stalled-work summaries |
| `error` | Report stop or unrecoverable failure |

Typical lifecycle:

1. Emit `thought` when the thread starts running.
2. Emit `comment` on completion or when work stalls.
3. Emit `error` when a stop signal interrupts execution.

## Stop Signal

`stop` is the only explicit control signal in the simplified model.

When Linear sends `agentSession.signal = "stop"`:

1. Esperta Code finds the matching thread.
2. Esperta Code marks the thread `stopped`.
3. Esperta Code asks the active adapter to cancel execution for that thread.
4. Esperta Code records the event in history.

## State Updates Back to Linear

Esperta Code can update issue state through GraphQL according to repo or deployment policy. The simplified model only requires that activity writeback remains best-effort and must never block local thread execution.
