# CLI

The CLI is for managing Feliz, not for interacting with issues (that's Linear's job).

```
feliz start                    # Start the Feliz daemon
feliz stop                     # Stop the daemon
feliz status                   # Show daemon status, running agents, queue

feliz project add              # Interactive: add a new project mapping
feliz project list             # List configured projects
feliz project remove <name>    # Remove a project

feliz run list                 # List recent runs across all projects
feliz run show <run_id>        # Show run details, artifacts, logs
feliz run retry <work_item>    # Manually retry a failed work item

feliz context show <work_item> # Show context snapshot for a work item
feliz context history <project># Show history events for a project

feliz agent list               # List installed agents and auth status
feliz agent login <name>       # Authenticate an agent (OAuth or API key)
feliz agent install <name>     # Install an agent CLI

feliz config validate          # Validate feliz.yml and all .feliz/ configs
feliz config show              # Print resolved configuration
```
