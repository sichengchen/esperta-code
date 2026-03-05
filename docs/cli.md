# CLI Reference

The Feliz CLI manages the daemon and inspects state. All issue interaction happens through Linear — the CLI is for operations only.

## Global options

| Flag | Description |
|---|---|
| `--config <path>` | Path to `feliz.yml`. Default: `~/.feliz/feliz.yml` |
| `--help`, `-h` | Show help text |

## Commands

### `feliz start`

Start the Feliz daemon. Begins polling Linear and processing issues.

```bash
feliz start
feliz start --config /path/to/feliz.yml
```

On startup, Feliz:
1. Loads and validates `feliz.yml`
2. Creates storage directories if needed
3. Opens the SQLite database
4. Registers configured projects
5. Clones repos that haven't been cloned yet
6. Enters the main poll loop

### `feliz stop`

Stop the running daemon gracefully.

```bash
feliz stop
```

### `feliz status`

Show the current daemon status, number of projects, and active agents.

```bash
feliz status
```

Output:

```
Feliz status: 2 project(s), 1 running agent(s).
  backend-api: watching "Backend API"
  frontend-app: watching "Frontend App"
```

### `feliz config validate`

Validate the configuration file without starting the daemon.

```bash
feliz config validate
feliz config validate --config /path/to/feliz.yml
```

Checks:
- YAML syntax
- Required fields present (`linear.api_key`, at least one project, etc.)
- Environment variables referenced by `$VAR` are set

### `feliz config show`

Print the fully resolved configuration with environment variables expanded.

```bash
feliz config show
```

### `feliz project list`

List all configured projects from `feliz.yml`.

```bash
feliz project list
```

Output:

```
backend-api: git@github.com:org/backend-api.git (Backend API)
frontend-app: git@github.com:org/frontend-app.git (Frontend App)
```

### `feliz project add`

Add a new project interactively. Prompts for:
- Linear project name
- Git repo URL
- Base branch

### `feliz project remove <name>`

Remove a project from the configuration.

```bash
feliz project remove backend-api
```

### `feliz run list`

List recent pipeline runs across all projects.

```bash
feliz run list
```

### `feliz run show <run_id>`

Show details for a specific run: phase/step progress, result, failure reasons, PR URL.

```bash
feliz run show run_abc123
```

### `feliz run retry <work_item>`

Manually retry a failed work item. Resets the work item to `queued` state.

```bash
feliz run retry wi_xyz789
```

### `feliz agent list`

List installed agent adapters and their availability.

```bash
feliz agent list
```

### `feliz context history <project>`

Show recent history events for a project.

```bash
feliz context history backend-api
```

### `feliz context show <work_item>`

Show the context snapshot for a specific work item: assembled history, memory, and scratchpad artifacts.

```bash
feliz context show wi_xyz789
```
