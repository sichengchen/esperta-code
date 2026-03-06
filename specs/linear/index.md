# Linear Integration

Feliz interacts with Linear through two distinct layers:

1. **Issue CRUD** — Linear GraphQL API for updating states, creating sub-issues, managing labels/relations, and reacting to messages.
2. **Messaging** — [Vercel Chat SDK](https://github.com/vercel/chat) (`@chat-adapter/linear`) for comment-based conversation: mentions, commands, replies, and thread subscriptions.

This separation keeps the messaging layer pluggable. Chat SDK supports multiple adapters (Linear, GitHub, Slack, Discord, etc.), enabling future support for GitHub Issues/PRs as an alternative project management interface.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Feliz Server                    │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Linear Client    │  │  Chat SDK            │  │
│  │  (GraphQL)        │  │  (Linear adapter)    │  │
│  │                   │  │                      │  │
│  │  - Update state   │  │  - onNewMention()    │  │
│  │  - Create issues  │  │  - onSubscribed()    │  │
│  │  - Manage labels  │  │  - thread.post()     │  │
│  │  - Add reactions  │  │  - thread.subscribe()│  │
│  └────────┬──────────┘  └──────────┬───────────┘  │
│           │                        │              │
│           └────────────┬───────────┘              │
│                        │                          │
│                  Orchestrator                      │
└──────────────────────────────────────────────────┘
```

## Issue Discovery (Mention-Based)

Feliz does **not** poll for all issues in a project. Instead, Feliz only tracks issues where it is explicitly mentioned. Discovery happens through the Chat SDK's `onNewMention` handler.

**How an issue enters Feliz**:

1. A user creates a Linear issue (in any state).
2. The user mentions `@feliz` in the issue description or a comment.
3. Chat SDK fires `onNewMention`. Feliz creates a WorkItem record and begins processing.

This means issues without a `@feliz` mention are invisible to Feliz. The user controls exactly which issues Feliz works on.

**Milestone support**: Users can optionally organize issues under Linear milestones. Feliz respects milestone grouping when decomposing large features — sub-issues are created under the same milestone as the parent.

## Messaging (Chat SDK)

Comment-based interaction is handled by the Vercel Chat SDK with the Linear adapter. This replaces custom comment polling and posting with a unified event-driven model.

### Setup

```typescript
import { Chat } from 'chat';
import { LinearAdapter } from '@chat-adapter/linear';

const chat = new Chat({
  adapters: [
    new LinearAdapter({
      apiKey: process.env.LINEAR_API_KEY,
    }),
  ],
});
```

### Event handlers

**New mention** — triggered when someone mentions `@feliz` on a Linear issue:

```typescript
chat.onNewMention(async ({ thread, message }) => {
  // 1. Always react with eyes emoji to acknowledge
  await thread.react('eyes');

  // 2. Check if this is a known work item
  const workItem = await findWorkItem(thread.externalId);

  if (!workItem) {
    // New issue — create WorkItem and start processing
    const wi = await createWorkItem(thread, message);
    await processNewWorkItem(wi, message);
    return;
  }

  // Existing work item — parse as command or feedback
  const command = parseCommand(message.text);
  if (command) {
    await handleCommand(command, thread, message, workItem);
  } else {
    await appendToContext(thread, message, workItem);
  }
});
```

**Subscribed messages** — triggered on follow-up messages in threads Feliz is watching:

```typescript
chat.onSubscribedMessage(async ({ thread, message }) => {
  // 1. React with eyes emoji
  await thread.react('eyes');

  // 2. Handle follow-up
  await handleFollowUp(thread, message);
});
```

### Commands

| Command | Effect |
|---|---|
| `@feliz` (first mention, no command) | Assign issue to Feliz. Creates WorkItem, starts processing. |
| `@feliz decompose` | Break down a large feature into sub-issues |
| `@feliz start` | Dispatch agent immediately (skip spec phase if enabled) |
| `@feliz plan` | Enter spec drafting phase (only when `specs.enabled`; ignored otherwise) |
| `@feliz retry` | Re-queue with incremented attempt |
| `@feliz status` | Reply with current orchestration state, last run info |
| `@feliz approve` | Approve spec/decomposition, transition to next state |
| `@feliz cancel` | Cancel running agent, release work item |
| (free text after initial mention) | Treated as clarification/feedback; appended to context |

### Acknowledgment protocol

On **every** Feliz-related event (mention, command, subscribed message), Feliz:

1. Reacts with 👀 (eyes emoji) to acknowledge receipt
2. Begins processing
3. Posts a status update back to Linear when processing completes or state changes

This gives the user immediate visual feedback that Feliz received their message.

### Posting replies

Feliz replies to commands and posts status updates using the Chat SDK's thread API:

```typescript
// React to acknowledge
await thread.react('eyes');

// Reply in the same thread
await thread.post('Started working on this (attempt 1).');

// Subscribe to the thread for follow-up messages
await thread.subscribe();
```

## Triggers

All triggers are event-driven through the Chat SDK:

| Trigger | Source | Action |
|---|---|---|
| **First mention** | Chat SDK (`onNewMention`) | `@feliz` mentioned on unknown issue → create WorkItem, start orchestration |
| **Command** | Chat SDK (`onNewMention`) | `@feliz <command>` on known issue → execute command |
| **Follow-up** | Chat SDK (`onSubscribedMessage`) | Reply in watched thread → append to context, may unblock waiting state |

There is no polling-based issue discovery. The GraphQL API is used only for **writing** (state updates, issue creation, label management, reactions), not for discovering new work.

## Writing back to Linear

### Status comments (via Chat SDK)

| Event | Message posted |
|---|---|
| Issue assigned to Feliz | "Got it, I'll work on this." (+ 👀 reaction) |
| Spec drafted | Spec summary + "Reply `@feliz approve` to proceed" |
| Decomposition proposed | Breakdown summary + "Reply `@feliz approve` to create issues" |
| Agent run started | "Started working on this (attempt N)" |
| Agent run succeeded | PR link + summary of changes |
| Agent run failed | Failure summary + "Reply `@feliz retry` to retry" |
| Agent needs help | Description of problem + question for user |

### State transitions (via GraphQL)

| Feliz event | Default Linear state change |
|---|---|
| Issue assigned to Feliz | → "In Progress" |
| Run succeeded + PR created | → "In Review" |
| Run failed | → (no change, comment only) |

State transitions are configurable per-workflow in `.feliz/config.yml`.

## GraphQL Usage

The Linear GraphQL API is used for **mutations only** (not polling):

- `issueUpdate` — update issue state, add labels
- `commentCreate` — post status comments (fallback when Chat SDK is unavailable)
- `issueCreate` — create sub-issues from decomposition
- `reactionCreate` — add emoji reactions

All mutations pass dynamic values via GraphQL `variables` rather than string interpolation.

### Scenario: Comment Body With Special Characters

- **Given** a comment body containing quotes and newlines
- **When** Feliz sends `commentCreate`
- **Then** the raw body is passed through GraphQL variables without manual escaping logic in the query string

## Future: GitHub Issues as alternative

The Chat SDK also provides `@chat-adapter/github`, which supports mentions and comments on GitHub Issues and PRs. This means Feliz could support GitHub Issues as a project management interface with:

- The same command model (`@feliz start`, `@feliz approve`, etc.) in GitHub issue comments
- PR management directly in the same platform

This is deferred to a future phase. The adapter-based architecture ensures the messaging layer is ready when needed.
