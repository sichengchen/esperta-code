# Configuration

## Central Server Config (`feliz.yml`)

The central config defines Linear auth, storage locations, global concurrency, and project mappings.

```yaml
linear:
  oauth_token: $LINEAR_OAUTH_TOKEN
  app_user_id: user_123

webhook:
  port: 3421

tick:
  interval_ms: 5000

storage:
  data_dir: /data/feliz
  workspace_root: /data/feliz/workspaces

agent:
  default: claude-code
  max_concurrent: 5

projects:
  - name: backend-api
    repo: git@github.com:org/backend-api.git
    linear_project: Backend API
    branch: main
```

### Schema

| Field | Type | Description |
|---|---|---|
| `linear.oauth_token` | string | Linear OAuth token, usually via env var reference |
| `linear.app_user_id` | string | Installed Linear app user ID |
| `webhook.port` | number | Port for Linear webhooks |
| `tick.interval_ms` | number | Background dispatch interval |
| `storage.data_dir` | string | Root for DB and logs |
| `storage.workspace_root` | string | Root for repo clones and thread worktrees |
| `agent.default` | string | Default adapter name |
| `agent.max_concurrent` | number | Max concurrently running threads |
| `projects[]` | array | Repo-to-Linear project mappings |

## Repo Config (`.feliz/config.yml`)

Repo config controls agent defaults, hooks, optional specs, gates, and concurrency by Linear issue state.

```yaml
agent:
  adapter: claude-code
  approval_policy: auto
  max_turns: 30
  timeout_ms: 600000

hooks:
  after_create: bun install
  before_run: bun run lint -- --fix
  after_run: bun test

specs:
  enabled: true
  directory: specs
  approval_required: false

gates:
  test_command: bun test
  lint_command: bun run lint

concurrency:
  max_per_state:
    Todo: 3
    In Progress: 5
```

### Repo Schema

| Field | Type | Description |
|---|---|---|
| `agent.adapter` | string | Default adapter for this repo |
| `agent.approval_policy` | `auto \| gated \| suggest` | Adapter sandbox/approval mode |
| `agent.max_turns` | number | Max turns per agent invocation |
| `agent.timeout_ms` | number | Max wall-clock time per invocation |
| `hooks.after_create` | string | One-time hook after first worktree creation |
| `hooks.before_run` | string | Hook before each pipeline step |
| `hooks.after_run` | string | Hook after each pipeline step |
| `hooks.before_remove` | string | Reserved for future cleanup workflows |
| `specs.enabled` | boolean | Whether repo specs are part of context |
| `specs.directory` | string | Spec directory in the repo |
| `specs.approval_required` | boolean | Repo policy flag for human review of spec changes |
| `gates.*` | string | Conventional test/lint commands |
| `concurrency.max_per_state` | map | Limit concurrent threads by Linear issue state |

## Pipeline Definition (`.feliz/pipeline.yml`)

Pipelines are phase/step sequences executed against a thread worktree.

```yaml
phases:
  - name: implement
    steps:
      - name: write_code
        agent: claude-code
        prompt: .feliz/prompts/write_code.md
        success:
          command: "bun test"
        max_attempts: 3

  - name: review_cycle
    repeat:
      max: 3
      on_exhaust: pass
    steps:
      - name: review
        agent: codex
        prompt: .feliz/prompts/review.md
        success:
          agent_verdict: approved
      - name: fix_review
        agent: claude-code
        prompt: .feliz/prompts/fix_review.md

  - name: publish
    steps:
      - name: create_pr
        agent: claude-code
        prompt: .feliz/prompts/publish.md
```

### Pipeline Schema

| Field | Type | Description |
|---|---|---|
| `phases[]` | array | Ordered phases |
| `phases[].name` | string | Phase label |
| `phases[].repeat.max` | number | Max phase cycles |
| `phases[].repeat.on_exhaust` | `pass \| fail` | Behavior when repeats are exhausted |
| `phases[].steps[]` | array | Ordered steps within the phase |
| `phases[].steps[].name` | string | Step label |
| `phases[].steps[].agent` | string | Optional adapter override |
| `phases[].steps[].prompt` | string | Prompt template path |
| `phases[].steps[].success` | object | Optional success condition |
| `phases[].steps[].max_attempts` | number | Max retries for that step |

## Prompt Templates

Prompt templates should stay thread-centric.

Available template variables:

| Variable | Type | Description |
|---|---|---|
| `project.name` | string | Project name |
| `issue.identifier` | string | Linear issue identifier |
| `issue.title` | string | Issue title |
| `issue.description` | string | Issue description |
| `issue.labels` | string[] | Linear labels |
| `issue.priority` | number | Linear priority |
| `phase.name` | string | Current phase |
| `step.name` | string | Current step |
| `cycle` | number \| null | Current repeat cycle |

Prompt templates should not expect:

- `previous_failure`
- `previous_review`
- `run`
- `step execution`

Instead, prompts should call:

- `feliz thread read`
- `feliz thread write`

to access and extend thread context.
