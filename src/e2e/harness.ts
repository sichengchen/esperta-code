import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from "fs";
import { join } from "path";
import { loadFelizConfig } from "../config/loader.ts";

export type E2ECheckStatus = "pass" | "fail" | "warn";
export type E2EScenarioStatus = "pending" | "blocked";

export interface E2ECheck {
  id: string;
  status: E2ECheckStatus;
  summary: string;
  details?: string;
}

export interface E2EScenario {
  id: string;
  title: string;
  status: E2EScenarioStatus;
}

export interface E2EDoctorReport {
  ok: boolean;
  checks: E2ECheck[];
}

export interface E2ESmokeReport {
  ok: boolean;
  doctor: E2EDoctorReport;
  checks: E2ECheck[];
  scenarios: E2EScenario[];
}

export interface E2EHarnessParams {
  configPath: string;
}

export interface E2ECommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface E2EHarnessDeps {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => string;
  env: Record<string, string | undefined>;
  runCommand: (cmd: string, args: string[]) => E2ECommandResult;
}

const REQUIRED_TABLES = ["projects", "work_items", "runs", "history"];

const SCENARIO_TITLES = [
  "Issue Discovery",
  "Spec Draft Progression",
  "Decomposition Progression",
  "Dispatch and Run Recording",
  "Publishing",
  "Retry",
  "Blocker Enforcement",
  "Per-State Concurrency",
  "Context Snapshot Traceability",
  "Worktree Lifecycle",
];

function defaultDeps(): E2EHarnessDeps {
  return {
    existsSync: fsExistsSync,
    readFileSync: (path: string) => fsReadFileSync(path, "utf-8"),
    env: process.env,
    runCommand: (cmd: string, args: string[]) => {
      const result = Bun.spawnSync([cmd, ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    },
  };
}

function buildScenarios(status: E2EScenarioStatus): E2EScenario[] {
  return SCENARIO_TITLES.map((title, idx) => ({
    id: `S${idx + 1}`,
    title,
    status,
  }));
}

function addToolCheck(
  checks: E2ECheck[],
  deps: E2EHarnessDeps,
  id: string,
  cmd: string,
  args: string[]
): void {
  const result = deps.runCommand(cmd, args);
  checks.push({
    id,
    status: result.exitCode === 0 ? "pass" : "fail",
    summary:
      result.exitCode === 0
        ? `${cmd} is available`
        : `${cmd} is not available`,
    details: result.exitCode === 0 ? undefined : result.stderr || result.stdout,
  });
}

function hasFail(checks: E2ECheck[]): boolean {
  return checks.some((check) => check.status === "fail");
}

export function runE2EDoctor(
  params: E2EHarnessParams,
  providedDeps?: E2EHarnessDeps
): E2EDoctorReport {
  const deps = providedDeps ?? defaultDeps();
  const checks: E2ECheck[] = [];

  if (!deps.existsSync(params.configPath)) {
    checks.push({
      id: "config.exists",
      status: "fail",
      summary: `Config does not exist: ${params.configPath}`,
    });
  } else {
    checks.push({
      id: "config.exists",
      status: "pass",
      summary: `Config exists: ${params.configPath}`,
    });
  }

  let parsedConfig:
    | ReturnType<typeof loadFelizConfig>
    | null = null;
  if (deps.existsSync(params.configPath)) {
    try {
      parsedConfig = loadFelizConfig(deps.readFileSync(params.configPath));
      checks.push({
        id: "config.parse",
        status: "pass",
        summary: "Configuration parses successfully",
      });
    } catch (error: unknown) {
      checks.push({
        id: "config.parse",
        status: "fail",
        summary: "Configuration parse failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  addToolCheck(checks, deps, "tool.bun", "bun", ["--version"]);
  addToolCheck(checks, deps, "tool.gh", "gh", ["--version"]);
  addToolCheck(checks, deps, "tool.sqlite3", "sqlite3", ["--version"]);
  addToolCheck(checks, deps, "tool.git", "git", ["--version"]);

  const codex = deps.runCommand("codex", ["--version"]);
  const claude = deps.runCommand("claude", ["--version"]);
  if (codex.exitCode === 0 || claude.exitCode === 0) {
    checks.push({
      id: "tool.agent",
      status: "pass",
      summary: codex.exitCode === 0 ? "codex is available" : "claude is available",
    });
  } else {
    checks.push({
      id: "tool.agent",
      status: "fail",
      summary: "No supported agent CLI available (codex or claude)",
      details: [codex.stderr, claude.stderr].filter(Boolean).join(" | "),
    });
  }

  const ghAuth = deps.runCommand("gh", ["auth", "status"]);
  checks.push({
    id: "github.auth",
    status: ghAuth.exitCode === 0 ? "pass" : "fail",
    summary:
      ghAuth.exitCode === 0
        ? "GitHub CLI is authenticated"
        : "GitHub CLI is not authenticated",
    details: ghAuth.exitCode === 0 ? undefined : ghAuth.stderr || ghAuth.stdout,
  });

  if (deps.env.GITHUB_TOKEN) {
    checks.push({
      id: "env.github_token",
      status: "pass",
      summary: "GITHUB_TOKEN is set",
    });
  } else {
    checks.push({
      id: "env.github_token",
      status: "warn",
      summary: "GITHUB_TOKEN is not set (gh auth may still be sufficient)",
    });
  }

  if (parsedConfig && parsedConfig.projects.length > 0) {
    checks.push({
      id: "config.projects",
      status: "pass",
      summary: `Configured projects: ${parsedConfig.projects.length}`,
    });
  }

  return {
    ok: !hasFail(checks),
    checks,
  };
}

export function runE2ESmoke(
  params: E2EHarnessParams,
  providedDeps?: E2EHarnessDeps
): E2ESmokeReport {
  const deps = providedDeps ?? defaultDeps();
  const doctor = runE2EDoctor(params, deps);
  if (!doctor.ok) {
    return {
      ok: false,
      doctor,
      checks: [],
      scenarios: buildScenarios("blocked"),
    };
  }

  const checks: E2ECheck[] = [];
  const validateResult = deps.runCommand("bun", [
    "run",
    "src/cli/index.ts",
    "config",
    "validate",
    "--config",
    params.configPath,
  ]);
  checks.push({
    id: "cli.config_validate",
    status: validateResult.exitCode === 0 ? "pass" : "fail",
    summary:
      validateResult.exitCode === 0
        ? "Config validation command succeeded"
        : "Config validation command failed",
    details:
      validateResult.exitCode === 0
        ? undefined
        : validateResult.stderr || validateResult.stdout,
  });

  try {
    const config = loadFelizConfig(deps.readFileSync(params.configPath));
    const dbPath = join(config.storage.data_dir, "db", "feliz.db");
    if (!deps.existsSync(dbPath)) {
      checks.push({
        id: "db.exists",
        status: "warn",
        summary: `Database not found yet: ${dbPath}`,
      });
    } else {
      const tableResult = deps.runCommand("sqlite3", [dbPath, ".tables"]);
      if (tableResult.exitCode !== 0) {
        checks.push({
          id: "db.tables",
          status: "fail",
          summary: "Unable to inspect sqlite tables",
          details: tableResult.stderr || tableResult.stdout,
        });
      } else {
        const tables = tableResult.stdout.split(/\s+/).filter(Boolean);
        const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));
        checks.push({
          id: "db.tables",
          status: missing.length === 0 ? "pass" : "fail",
          summary:
            missing.length === 0
              ? "Required DB tables exist"
              : `Missing DB tables: ${missing.join(", ")}`,
        });
      }
    }
  } catch (error: unknown) {
    checks.push({
      id: "db.tables",
      status: "fail",
      summary: "Failed to evaluate DB table checks",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    ok: !hasFail(checks),
    doctor,
    checks,
    scenarios: buildScenarios("pending"),
  };
}
