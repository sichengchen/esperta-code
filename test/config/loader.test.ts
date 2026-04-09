import { describe, expect, test } from "bun:test";
import {
  loadFelizConfig,
  loadFelizProjectAddConfig,
  resolveEnvVars,
  loadRepoConfig,
  loadPipelineConfig,
  getDefaultPipeline,
} from "../../src/config/loader.ts";

describe("resolveEnvVars", () => {
  test("replaces $ENV_VAR with environment value", () => {
    process.env.TEST_API_KEY = "sk-test-123";
    expect(resolveEnvVars("$TEST_API_KEY")).toBe("sk-test-123");
    delete process.env.TEST_API_KEY;
  });

  test("returns literal string when not an env ref", () => {
    expect(resolveEnvVars("literal-value")).toBe("literal-value");
  });

  test("throws when env var is not set", () => {
    delete process.env.MISSING_VAR;
    expect(() => resolveEnvVars("$MISSING_VAR")).toThrow(
      "Environment variable MISSING_VAR is not set"
    );
  });
});

describe("loadFelizConfig", () => {
  test("parses the new remote-first config shape", () => {
    const yaml = `
runtime:
  data_dir: /tmp/feliz
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
`;
    const config = loadFelizConfig(yaml);
    expect(config.runtime?.data_dir).toBe("/tmp/feliz");
    expect(config.runtime?.max_concurrent_jobs).toBe(4);
    expect(config.projects[0]!.base_branch).toBe("main");
    expect(config.projects[0]!.worktrees?.retain_on_failure_hours).toBe(24);
    expect(config.projects[0]!.concurrency?.max_jobs).toBe(2);
    expect(config.projects[0]!.job_types?.implement?.agent).toBe("codex");
    expect(config.projects[0]!.job_types?.implement?.verify).toEqual(["bun test"]);
    expect(config.projects[0]!.job_types?.implement?.publish).toBe("draft_pr");
  });

  test("parses valid feliz.yml with defaults", () => {
    const yaml = `
linear:
  oauth_token: test-key
projects:
  - name: backend
    repo: git@github.com:org/backend.git
    linear_project: Backend
`;
    const config = loadFelizConfig(yaml);
    expect(config.linear.oauth_token).toBe("test-key");
    expect(config.tick.interval_ms).toBe(5000);
    expect(config.storage.data_dir).toContain(".esperta-code");
    expect(config.agent.default).toBe("claude-code");
    expect(config.webhook.port).toBe(3421);
    expect(config.agent.max_concurrent).toBe(5);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0]!.name).toBe("backend");
    expect(config.projects[0]!.branch).toBe("main");
  });

  test("parses full feliz.yml with overrides", () => {
    const yaml = `
linear:
  oauth_token: sk-123
tick:
  interval_ms: 60000
storage:
  data_dir: /data/feliz
  workspace_root: /data/feliz/ws
agent:
  default: codex
  max_concurrent: 10
projects:
  - name: frontend
    repo: git@github.com:org/frontend.git
    linear_project: Frontend App
    branch: develop
`;
    const config = loadFelizConfig(yaml);
    expect(config.tick.interval_ms).toBe(60000);
    expect(config.storage.data_dir).toBe("/data/feliz");
    expect(config.storage.workspace_root).toBe("/data/feliz/ws");
    expect(config.agent.default).toBe("codex");
    expect(config.agent.max_concurrent).toBe(10);
    expect(config.projects[0]!.branch).toBe("develop");
  });

  test("throws when linear.oauth_token is missing", () => {
    const yaml = `
projects:
  - name: x
    repo: git@github.com:org/x.git
    linear_project: X
`;
    expect(() => loadFelizConfig(yaml)).toThrow(
      "runtime.max_concurrent_jobs or linear.oauth_token is required"
    );
  });

  test("accepts empty projects array", () => {
    const yaml = `
linear:
  oauth_token: test
projects: []
`;
    const config = loadFelizConfig(yaml);
    expect(config.projects).toEqual([]);
  });

  test("accepts missing projects key", () => {
    const yaml = `
linear:
  oauth_token: test
`;
    const config = loadFelizConfig(yaml);
    expect(config.projects).toEqual([]);
  });

  test("throws when project is missing required fields", () => {
    const yaml = `
linear:
  oauth_token: test
projects:
  - name: x
`;
    expect(() => loadFelizConfig(yaml)).toThrow("repo is required");
  });
});

describe("loadFelizProjectAddConfig", () => {
  test("parses config required for project add when projects is empty", () => {
    const yaml = `
linear:
  oauth_token: test-key
agent:
  default: codex
projects: []
storage:
  workspace_root: /tmp/feliz-workspaces
`;
    const config = loadFelizProjectAddConfig(yaml);
    expect(config.linear?.oauth_token).toBe("test-key");
    expect(config.storage.workspace_root).toBe("/tmp/feliz-workspaces");
    expect(config.agent.default).toBe("codex");
  });

  test("allows missing linear.oauth_token for manual project setup", () => {
    const yaml = `
runtime:
  data_dir: /tmp/feliz
  max_concurrent_jobs: 4
projects: []
`;
    const config = loadFelizProjectAddConfig(yaml);
    expect(config.linear?.oauth_token).toBeUndefined();
    expect(config.agent.default).toBe("claude-code");
    expect(config.storage.workspace_root).toBe("/tmp/feliz/workspaces");
  });

  test("uses default scaffold adapter when agent.default is missing", () => {
    const yaml = `
linear:
  oauth_token: test-key
projects: []
`;
    const config = loadFelizProjectAddConfig(yaml);
    expect(config.agent.default).toBe("claude-code");
  });

});

describe("loadRepoConfig", () => {
  test("parses valid .feliz/config.yml with defaults", () => {
    const yaml = `
agent:
  adapter: claude-code
`;
    const config = loadRepoConfig(yaml);
    expect(config.agent.adapter).toBe("claude-code");
    expect(config.agent.approval_policy).toBe("auto");
    expect(config.agent.max_turns).toBe(20);
    expect(config.agent.timeout_ms).toBe(600000);
    expect(config.specs.enabled).toBe(false);
    expect(config.specs.directory).toBe("specs");
    expect(config.specs.approval_required).toBe(true);
  });

  test("parses full .feliz/config.yml", () => {
    const yaml = `
agent:
  adapter: codex
  approval_policy: gated
  max_turns: 30
  timeout_ms: 900000
hooks:
  after_create: npm install
  before_run: npm run lint -- --fix
  after_run: npm test
specs:
  enabled: true
  directory: specifications
  approval_required: false
gates:
  test_command: npm test
  lint_command: npm run lint
concurrency:
  max_per_state:
    Todo: 3
    "In Progress": 5
`;
    const config = loadRepoConfig(yaml);
    expect(config.agent.approval_policy).toBe("gated");
    expect(config.agent.max_turns).toBe(30);
    expect(config.hooks.after_create).toBe("npm install");
    expect(config.hooks.before_run).toBe("npm run lint -- --fix");
    expect(config.specs.enabled).toBe(true);
    expect(config.specs.directory).toBe("specifications");
    expect(config.gates.test_command).toBe("npm test");
    expect(config.concurrency.max_per_state).toEqual({
      Todo: 3,
      "In Progress": 5,
    });
  });

  test("parses hooks correctly", () => {
    const yaml = `
agent:
  adapter: claude-code
hooks:
  after_create: npm install
  before_run: npm run lint
  after_run: npm test
  before_remove: npm run cleanup
`;
    const config = loadRepoConfig(yaml);
    expect(config.hooks.after_create).toBe("npm install");
    expect(config.hooks.before_run).toBe("npm run lint");
    expect(config.hooks.after_run).toBe("npm test");
    expect(config.hooks.before_remove).toBe("npm run cleanup");
  });

  test("parses concurrency.max_per_state", () => {
    const yaml = `
agent:
  adapter: claude-code
concurrency:
  max_per_state:
    Todo: 2
    "In Progress": 4
`;
    const config = loadRepoConfig(yaml);
    expect(config.concurrency.max_per_state).toEqual({
      Todo: 2,
      "In Progress": 4,
    });
  });

  test("defaults hooks to undefined when not specified", () => {
    const yaml = `
agent:
  adapter: claude-code
`;
    const config = loadRepoConfig(yaml);
    expect(config.hooks.after_create).toBeUndefined();
    expect(config.hooks.before_run).toBeUndefined();
    expect(config.hooks.after_run).toBeUndefined();
    expect(config.hooks.before_remove).toBeUndefined();
  });

  test("defaults gates to undefined when not specified", () => {
    const yaml = `
agent:
  adapter: claude-code
`;
    const config = loadRepoConfig(yaml);
    expect(config.gates.test_command).toBeUndefined();
    expect(config.gates.lint_command).toBeUndefined();
  });
});

describe("loadPipelineConfig", () => {
  test("parses pipeline.yml", () => {
    const yaml = `
phases:
  - name: implement
    steps:
      - name: write_code
        agent: claude-code
        prompt: .feliz/prompts/write_code.md
        success:
          command: "npm test"
        max_attempts: 3
  - name: publish
    steps:
      - name: create_pr
        prompt: .esperta-code/prompts/publish.md
`;
    const pipeline = loadPipelineConfig(yaml);
    expect(pipeline.phases).toHaveLength(2);
    expect(pipeline.phases[0]!.name).toBe("implement");
    expect(pipeline.phases[0]!.steps[0]!.name).toBe("write_code");
    expect(pipeline.phases[0]!.steps[0]!.agent).toBe("claude-code");
    expect(pipeline.phases[0]!.steps[0]!.success?.command).toBe("npm test");
    expect(pipeline.phases[0]!.steps[0]!.max_attempts).toBe(3);
    expect(pipeline.phases[1]!.steps[0]!.prompt).toBe(".esperta-code/prompts/publish.md");
  });

  test("parses pipeline with repeat phases", () => {
    const yaml = `
phases:
  - name: review_cycle
    repeat:
      max: 3
      on_exhaust: pass
    steps:
      - name: review
        agent: codex
        success:
          agent_verdict: approved
      - name: fix_issues
        agent: claude-code
`;
    const pipeline = loadPipelineConfig(yaml);
    expect(pipeline.phases[0]!.repeat?.max).toBe(3);
    expect(pipeline.phases[0]!.repeat?.on_exhaust).toBe("pass");
  });
});

describe("getDefaultPipeline", () => {
  test("returns default single-phase pipeline", () => {
    const pipeline = getDefaultPipeline("claude-code");
    expect(pipeline.phases).toHaveLength(1);
    expect(pipeline.phases[0]!.name).toBe("execute");
    expect(pipeline.phases[0]!.steps).toHaveLength(2);
    expect(pipeline.phases[0]!.steps[0]!.name).toBe("run");
    expect(pipeline.phases[0]!.steps[0]!.prompt).toBe("WORKFLOW.md");
    expect(pipeline.phases[0]!.steps[1]!.prompt).toBe(".esperta-code/prompts/publish.md");
  });

  test("includes test command in success condition when provided", () => {
    const pipeline = getDefaultPipeline("claude-code", "npm test");
    expect(pipeline.phases[0]!.steps[0]!.success?.command).toBe("npm test");
  });

  test("sets agent on all steps", () => {
    const pipeline = getDefaultPipeline("claude-code");
    expect(pipeline.phases[0]!.steps[0]!.agent).toBe("claude-code");
    expect(pipeline.phases[0]!.steps[1]!.agent).toBe("claude-code");
  });

  test("uses provided agent adapter name", () => {
    const pipeline = getDefaultPipeline("codex");
    expect(pipeline.phases[0]!.steps[0]!.agent).toBe("codex");
    expect(pipeline.phases[0]!.steps[1]!.agent).toBe("codex");
  });
});
