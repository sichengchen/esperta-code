import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { loadFelizConfig } from "../config/loader.ts";
import type { FelizConfig, JobTypeProfileConfig, ProjectConfig } from "../config/types.ts";
import { Database } from "../db/database.ts";
import { sanitizeIdentifier } from "../workspace/manager.ts";

export function projectIdFromName(name: string): string {
  return `project:${sanitizeIdentifier(name)}`;
}

export function deriveSummaryFromInstruction(instruction: string): string {
  const normalized = instruction.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) {
    return normalized;
  }

  const prefix = normalized.slice(0, 77);
  const lastSpace = prefix.lastIndexOf(" ");
  const clipped = lastSpace >= 32 ? prefix.slice(0, lastSpace) : prefix;
  return `${clipped.trim()}...`;
}

export function loadConfigOrThrow(configPath: string): FelizConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  return loadFelizConfig(readFileSync(configPath, "utf-8"));
}

export function getDataDir(config: FelizConfig): string {
  return config.runtime?.data_dir ?? config.storage.data_dir;
}

export function buildDefaultJobTypes(
  project: ProjectConfig,
  config: FelizConfig
): Record<string, JobTypeProfileConfig> {
  const defaultAgent = config.agent.default || "codex";

  return (
    project.job_types ?? {
      implement: {
        agent: defaultAgent,
        system_prompt: ".feliz/prompts/implement.md",
        verify: [],
        publish: "draft_pr",
      },
      fix: {
        agent: defaultAgent,
        system_prompt: ".feliz/prompts/fix.md",
        verify: [],
        publish: "update_pr",
      },
      fix_ci: {
        agent: defaultAgent,
        system_prompt: ".feliz/prompts/fix-ci.md",
        verify: [],
        publish: "update_pr",
      },
      review: {
        agent: defaultAgent,
        system_prompt: ".feliz/prompts/review.md",
        write_mode: "read_only",
        verify: [],
        publish: "none",
      },
      spec: {
        agent: defaultAgent,
        system_prompt: ".feliz/prompts/spec.md",
        verify: [],
        publish: "none",
      },
      publish: {
        agent: defaultAgent,
        system_prompt: ".feliz/prompts/publish.md",
        verify: [],
        publish: "branch",
      },
      continue: {
        agent: defaultAgent,
        system_prompt: ".feliz/prompts/continue.md",
        verify: [],
        publish: "update_pr",
      },
    }
  );
}

export function syncProjects(db: Database, config: FelizConfig) {
  for (const project of config.projects) {
    db.upsertCoreProject({
      id: projectIdFromName(project.name),
      name: project.name,
      repo_url: project.repo,
      default_branch: project.base_branch ?? project.branch,
      runtime_config: {},
      concurrency: (project.concurrency ?? {}) as Record<string, unknown>,
      worktree_policy: (project.worktrees ?? {}) as Record<string, unknown>,
      job_types: buildDefaultJobTypes(project, config),
    });
  }
}

export function openCoreDb(configPath: string): {
  config: FelizConfig;
  db: Database;
} {
  const config = loadConfigOrThrow(configPath);
  const dbPath = join(getDataDir(config), "db", "feliz.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  syncProjects(db, config);
  return { config, db };
}

export function findProjectConfig(config: FelizConfig, name: string): ProjectConfig {
  const project = config.projects.find((candidate) => candidate.name === name);
  if (!project) {
    throw new Error(`Project not found: ${name}`);
  }
  return project;
}

export function findProjectConfigById(
  config: FelizConfig,
  projectId: string
): ProjectConfig {
  const project = config.projects.find(
    (candidate) => projectIdFromName(candidate.name) === projectId
  );
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return project;
}
