# Skills

Claude Code skills for bootstrapping Feliz projects.

## `feliz-machine-setup`

Host and container bootstrap: central `feliz.yml` setup, daemon lifecycle, E2E preflight.

File: `skills/feliz-machine-setup/SKILL.md`

## `feliz-project-onboarding`

Per-repo setup: project mappings, `.feliz/config.yml`, `.feliz/pipeline.yml`, `WORKFLOW.md`.

File: `skills/feliz-project-onboarding/SKILL.md`

## `feliz-setup`

Router skill for mixed-scope requests. Delegates to machine-setup or project-onboarding as needed.

File: `skills/feliz-setup/SKILL.md`

## Recommended order

1. `feliz-machine-setup` — get the daemon running
2. `feliz-project-onboarding` — wire up each repo
