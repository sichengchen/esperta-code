import { mkdirSync, writeFileSync } from "fs";

export function writeCoreCliTestConfig(testRoot: string, configPath: string) {
  mkdirSync(testRoot, { recursive: true });
  writeFileSync(
    configPath,
    `runtime:
  data_dir: ${testRoot}
  max_concurrent_jobs: 4

projects:
  - name: repo-a
    repo: git@github.com:org/repo-a.git
    base_branch: main
    worktrees:
      retain_on_success_minutes: 30
      retain_on_failure_hours: 24
      prune_after_days: 7
    concurrency:
      max_jobs: 2
    job_types:
      implement:
        agent: codex
        system_prompt: .feliz/prompts/implement.md
        verify:
          - bun test
        publish: draft_pr
      continue:
        agent: codex
        system_prompt: .feliz/prompts/continue.md
        verify: []
        publish: update_pr
`,
    "utf-8"
  );
}
