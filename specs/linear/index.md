# Linear Integration

Feliz interacts with Linear through two distinct layers:

1. **Issue CRUD** — Linear GraphQL API for polling issues, updating states, creating sub-issues, and managing labels/relations.
2. **Messaging** — [Vercel Chat SDK](https://github.com/vercel/chat) (`@chat-adapter/linear`) for comment-based conversation: mentions, commands, replies, and thread subscriptions.

This separation keeps the messaging layer pluggable. Chat SDK supports multiple adapters (Linear, GitHub, Slack, Discord, etc.), enabling future support for GitHub Issues/PRs as an alternative project management interface.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Feliz Server                    │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Issue Poller     │  │  Chat SDK            │  │
│  │  (GraphQL client) │  │  (Linear adapter)    │  │
│  │                   │  │                      │  │
│  │  - Poll issues    │  │  - onNewMention()    │  │
│  │  - Update state   │  │  - onSubscribed()    │  │
│  │  - Create issues  │  │  - thread.post()     │  │
│  │  - Manage labels  │  │  - thread.subscribe()│  │
│  └────────┬──────────┘  └──────────┬───────────┘  │
│           │                        │              │
│           └────────────┬───────────┘              │
│                        │                          │
│                  Orchestrator                      │
└──────────────────────────────────────────────────┘
```

## Issue polling (GraphQL)

Feliz polls Linear on a configurable interval (default 30s) using the GraphQL API.

**Poll cycle**:

1. For each configured project, fetch issues from the associated Linear project.
2. Compare with known WorkItems in local DB.
3. For new issues: create WorkItem record, emit `issue.discovered` history event.
4. For changed issues: update WorkItem fields, emit `issue.updated` history event.
5. For issues moved to terminal states: mark WorkItem accordingly, trigger cleanup.

**GraphQL query** (per project):

```graphql
query FelizPollIssues($projectName: String!, $after: String) {
  issues(
    filter: {
      project: { name: { eq: $projectName } }
    }
    after: $after
    first: 50
    orderBy: createdAt
  ) {
    nodes {
      id
      identifier
      title
      description
      priority
      state { name }
      labels { nodes { name } }
      relations {
        nodes {
          type
          relatedIssue { id identifier state { name } }
        }
      }
      branchName
      url
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

Issues are filtered by Linear project name, not by team. A single Linear project (which can span multiple teams) maps 1:1 to a single repo.

**Rate limiting**: Respect Linear's `X-RateLimit-Requests-Remaining` header. If remaining < 100, double the polling interval temporarily. If rate-limited (429), back off using `Retry-After` header.

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
  const command = parseCommand(message.text); // "start", "plan", "approve", etc.

  if (command) {
    await handleCommand(command, thread, message);
  } else {
    // Free-text mentioning @feliz — treat as clarification/feedback
    await appendToContext(thread, message);
  }
});
```

**Subscribed messages** — triggered on follow-up messages in threads Feliz is watching:

```typescript
chat.onSubscribedMessage(async ({ thread, message }) => {
  // User replied in a thread Feliz is participating in
  await handleFollowUp(thread, message);
});
```

### Commands

| Command | Effect |
|---|---|
| `@feliz start` | Dispatch agent immediately |
| `@feliz plan` | Enter spec drafting phase (only when `specs.enabled`; ignored otherwise) |
| `@feliz retry` | Re-queue with incremented attempt |
| `@feliz status` | Reply with current orchestration state, last run info |
| `@feliz approve` | Approve spec/decomposition, transition to next state |
| `@feliz cancel` | Cancel running agent, release work item |
| `@feliz decompose` | Break down a large feature into sub-issues |
| (free text) | Treated as clarification/feedback; appended to context |

### Posting replies

Feliz replies to commands and posts status updates using the Chat SDK's thread API:

```typescript
// Reply in the same thread
await thread.post('Started working on this (attempt 1).');

// Subscribe to the thread for follow-up messages
await thread.subscribe();

// Post with reactions
await thread.react('eyes'); // acknowledge
```

## Triggers

Three trigger types:

| Trigger | Source | Action |
|---|---|---|
| **State change** | Poller (GraphQL) | Issue state differs from stored WorkItem → evaluate orchestration transition |
| **Label added** | Poller (GraphQL) | Issue gains a watched label (e.g., `feliz`, `feliz:priority`) → priority boost |
| **Mention/comment** | Chat SDK (`onNewMention`) | `@feliz` mentioned → parse command and execute |

State and label changes are detected during the poll cycle (GraphQL). Comment commands are handled by the Chat SDK's event-driven model — no comment polling needed.

## Writing back to Linear

### Status comments (via Chat SDK)

| Event | Message posted |
|---|---|
| Spec drafted | Spec summary + "Reply `@feliz approve` to proceed" |
| Decomposition proposed | Breakdown summary + "Reply `@feliz approve` to create issues" |
| Agent run started | "Started working on this (attempt N)" |
| Agent run succeeded | PR link + summary of changes |
| Agent run failed | Failure summary + "Reply `@feliz retry` to retry" |
| Gates failed | Test/lint output |

### State transitions (via GraphQL)

| Feliz event | Default Linear state change |
|---|---|
| Run started | → "In Progress" |
| Run succeeded + PR created | → "In Review" |
| Run failed | → (no change, comment only) |

State transitions are configurable per-workflow in `.feliz/config.yml`.

## GraphQL Mutation Safety

All Linear GraphQL mutations must pass dynamic user/operator values via GraphQL `variables` rather than string interpolation in the query body.

This applies to operations including:

- `issueUpdate` (issue ID, target state ID)
- `commentCreate` (issue ID, comment body)

### Scenario: Comment Body With Special Characters

- **Given** a comment body containing quotes and newlines
- **When** Feliz sends `commentCreate`
- **Then** the raw body is passed through GraphQL variables without manual escaping logic in the query string

## Future: GitHub Issues as alternative

The Chat SDK also provides `@chat-adapter/github`, which supports mentions and comments on GitHub Issues and PRs. This means Feliz could support GitHub Issues as a project management interface with:

- The same command model (`@feliz start`, `@feliz approve`, etc.) in GitHub issue comments
- A GitHub-specific issue poller (using the GitHub API instead of Linear GraphQL)
- PR management directly in the same platform

This is deferred to a future phase. The adapter-based architecture ensures the messaging layer is ready when needed.
