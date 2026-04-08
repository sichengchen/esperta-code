export interface RuntimeConfig {
  data_dir: string;
  max_concurrent_jobs: number;
  canonical_repo_root: string;
  worktree_root: string;
  artifact_root: string;
}

export interface ProjectWorktreeConfig {
  retain_on_success_minutes?: number;
  retain_on_failure_hours?: number;
  prune_after_days?: number;
}

export interface ProjectConcurrencyConfig {
  max_jobs?: number;
  allow_read_only_parallel?: boolean;
}

export interface JobTypeProfileConfig {
  agent: string;
  system_prompt: string;
  prompt_template?: string;
  write_mode?: "workspace_write" | "read_only";
  verify?: string[];
  publish?: string;
  artifact_expectations?: string[];
  timeout_ms?: number;
  retry_limit?: number;
}

export interface FelizConfig {
  runtime?: RuntimeConfig;
  linear: {
    oauth_token: string;
    app_user_id?: string;
  };
  webhook: {
    port: number;
  };
  tick: {
    interval_ms: number;
  };
  storage: {
    data_dir: string;
    workspace_root: string;
  };
  agent: {
    default: string;
    max_concurrent: number;
  };
  projects: ProjectConfig[];
}

export interface ProjectAddConfig {
  linear: {
    oauth_token: string;
  };
  agent: {
    default: string;
  };
  storage: {
    workspace_root: string;
  };
}

export interface ProjectConfig {
  name: string;
  repo: string;
  linear_project?: string;
  branch: string;
  base_branch?: string;
  worktrees?: ProjectWorktreeConfig;
  concurrency?: ProjectConcurrencyConfig;
  job_types?: Record<string, JobTypeProfileConfig>;
}

export interface RepoConfig {
  agent: {
    adapter: string;
    approval_policy: "auto" | "gated" | "suggest";
    max_turns: number;
    timeout_ms: number;
  };
  hooks: {
    after_create?: string;
    before_run?: string;
    after_run?: string;
    before_remove?: string;
  };
  specs: {
    enabled: boolean;
    directory: string;
    approval_required: boolean;
  };
  gates: {
    test_command?: string;
    lint_command?: string;
  };
  concurrency: {
    max_per_state?: Record<string, number>;
  };
}

export interface SuccessCondition {
  command?: string;
  agent_verdict?: string;
  file_exists?: string;
  always?: boolean;
}

export interface PipelineStep {
  name: string;
  agent?: string;
  prompt?: string;
  success?: SuccessCondition;
  max_attempts?: number;
}

export interface PipelinePhase {
  name: string;
  repeat?: {
    max: number;
    on_exhaust: "pass" | "fail";
  };
  steps: PipelineStep[];
}

export interface PipelineDefinition {
  phases: PipelinePhase[];
}
