# Getting Started

This guide assumes you are running Esperta Code from a local checkout of the repository.

## Prerequisites

- [Bun](https://bun.sh)
- Git
- A Linear OAuth app with `actor=app`
- A GitHub token with `repo` scope, or authenticated `gh`
- At least one coding agent CLI: `codex` or `claude`

## Install

```bash
git clone git@github.com:sichengchen/esperta-code.git
cd esperta-code
bun install
```

For commands below, this guide uses:

```bash
EC="bun run src/cli/index.ts"
```

If you install the package globally, replace `$EC` with `esperta-code`.

## Authenticate with Linear

```bash
$EC auth linear
```

This flow:

1. Prompts for your Linear OAuth app client ID and client secret.
2. Opens the authorization page.
3. Exchanges the callback code for an access token.
4. Verifies the app identity with `viewer { id name }`.
5. Writes the token into `~/.feliz/feliz.yml`.

You can also pass credentials explicitly:

```bash
$EC auth linear --client-id <id> --client-secret <secret>
```

If Linear must redirect to a public host, pass a callback URL:

```bash
$EC auth linear --callback-url https://<your-host>:3421/auth/callback
```

## Create Initial Config

```bash
$EC init
```

This writes `~/.feliz/feliz.yml` with:

- runtime storage defaults
- webhook port
- agent defaults
- an empty `projects` list

You can also start with a hand-written config. See [Configuration](configuration.md).

## Add a Project

```bash
$EC project add
```

The wizard:

1. Lists available Linear projects.
2. Asks for the repository URL and base branch.
3. Clones the repo into the configured workspace root.
4. Optionally scaffolds repo-local workflow assets under `.feliz/`.
5. Appends the project entry to `feliz.yml`.

## Start the Daemon

```bash
$EC start
```

Check status:

```bash
$EC status
$EC config validate
```

## Submit Work

```bash
$EC submit --project repo-a --title "Implement cache invalidation" --goal "Build cache invalidation for user updates"
$EC thread list
```

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Inside the container:

```bash
docker compose exec feliz bun run src/cli/index.ts status
docker compose exec feliz bun run src/cli/index.ts project add
docker compose exec feliz bun run src/cli/index.ts auth linear
```

## Next Steps

- [Usage](usage.md) for the thread/job workflow
- [CLI Reference](cli.md) for the full command surface
- [Agents](agents.md) for adapter details
- [Repo Workflow Assets](pipelines.md) for `.feliz/` scaffolding
