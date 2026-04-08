# Skills

Claude Code skills for setting up and configuring Esperta Code.

## `feliz-setup`

Install and configure the Esperta Code service: prerequisites, credentials, Linear OAuth app setup, central `feliz.yml`, and daemon startup.

File: `skills/feliz-setup/SKILL.md`

## `feliz-add-project`

Add a project to Esperta Code and configure its workflow: register in `feliz.yml`, clone repo, write `.feliz/config.yml`, `.feliz/pipeline.yml`, prompt templates, and `WORKFLOW.md`.

File: `skills/feliz-add-project/SKILL.md`

## Recommended order

1. `feliz-setup` — install Esperta Code and get the daemon running
2. `feliz-add-project` — add each project repo with its pipeline and prompts
