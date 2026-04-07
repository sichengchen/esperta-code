import { join } from "path";
import { existsSync, mkdirSync } from "fs";

export interface WorktreeRetentionPolicy {
  retain_on_success_minutes?: number;
  retain_on_failure_hours?: number;
  prune_after_days?: number;
}

export function injectGitHubToken(repoUrl: string, token?: string): string {
  if (!token) return repoUrl;
  try {
    const url = new URL(repoUrl);
    if (url.protocol === "https:" && url.hostname === "github.com") {
      url.username = "x-access-token";
      url.password = token;
      return url.toString();
    }
  } catch {
    // Not a valid URL (e.g. SSH git@... syntax)
  }
  return repoUrl;
}

export function sanitizeIdentifier(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function computeRetentionDeadline(
  policy: WorktreeRetentionPolicy,
  outcome: "success" | "failure",
  now: Date = new Date()
): Date | null {
  if (outcome === "success" && policy.retain_on_success_minutes) {
    return new Date(
      now.getTime() + policy.retain_on_success_minutes * 60 * 1000
    );
  }

  if (outcome === "failure" && policy.retain_on_failure_hours) {
    return new Date(
      now.getTime() + policy.retain_on_failure_hours * 60 * 60 * 1000
    );
  }

  return null;
}

export class WorkspaceManager {
  private root: string;

  constructor(workspaceRoot: string) {
    this.root = workspaceRoot;
  }

  getRepoPath(projectName: string): string {
    return join(this.root, projectName, "repo");
  }

  getWorktreePath(projectName: string, identifier: string): string {
    return join(
      this.root,
      projectName,
      "worktrees",
      sanitizeIdentifier(identifier)
    );
  }

  getRunWorktreePath(projectName: string, threadId: string, runId: string): string {
    return join(
      this.root,
      projectName,
      "worktrees",
      sanitizeIdentifier(threadId),
      sanitizeIdentifier(runId)
    );
  }

  getBranchName(identifier: string): string {
    return `feliz/${identifier}`;
  }

  getThreadBranchName(threadId: string): string {
    return `feliz/thread/${sanitizeIdentifier(threadId)}`;
  }

  async cloneRepo(projectName: string, repoUrl: string): Promise<string> {
    const repoPath = this.getRepoPath(projectName);
    const cloneUrl = injectGitHubToken(repoUrl, process.env.GITHUB_TOKEN);
    const result = Bun.spawnSync(["git", "clone", cloneUrl, repoPath]);
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to clone repo: ${result.stderr.toString()}`
      );
    }
    return repoPath;
  }

  async createWorktree(
    projectName: string,
    identifier: string,
    baseBranch: string
  ): Promise<string> {
    const repoPath = this.getRepoPath(projectName);
    const wtPath = this.getWorktreePath(projectName, identifier);
    const branchName = this.getBranchName(identifier);

    const result = Bun.spawnSync(
      ["git", "worktree", "add", wtPath, "-b", branchName, baseBranch],
      { cwd: repoPath }
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to create worktree: ${result.stderr.toString()}`
      );
    }
    return wtPath;
  }

  async createRunWorktree(options: {
    projectName: string;
    threadId: string;
    runId: string;
    branchName: string;
    fromRef: string;
  }): Promise<string> {
    const repoPath = this.getRepoPath(options.projectName);
    const wtPath = this.getRunWorktreePath(
      options.projectName,
      options.threadId,
      options.runId
    );

    mkdirSync(join(wtPath, ".."), { recursive: true });

    const branchExists = Bun.spawnSync(
      ["git", "show-ref", "--verify", "--quiet", `refs/heads/${options.branchName}`],
      { cwd: repoPath }
    ).exitCode === 0;

    const args = branchExists
      ? ["git", "worktree", "add", "--force", wtPath, options.branchName]
      : [
          "git",
          "worktree",
          "add",
          "-b",
          options.branchName,
          wtPath,
          options.fromRef,
        ];

    const result = Bun.spawnSync(args, { cwd: repoPath });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create run worktree: ${result.stderr.toString()}`);
    }

    return wtPath;
  }

  async removeWorktree(
    projectName: string,
    identifier: string
  ): Promise<void> {
    const repoPath = this.getRepoPath(projectName);
    const wtPath = this.getWorktreePath(projectName, identifier);

    Bun.spawnSync(["git", "worktree", "remove", wtPath, "--force"], {
      cwd: repoPath,
    });
  }

  async removeWorktreePath(projectName: string, worktreePath: string): Promise<void> {
    const repoPath = this.getRepoPath(projectName);
    if (!existsSync(worktreePath)) {
      return;
    }

    Bun.spawnSync(["git", "worktree", "remove", worktreePath, "--force"], {
      cwd: repoPath,
    });
  }

  async runHook(workDir: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const result = Bun.spawnSync(["sh", "-c", command], { cwd: workDir });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  }
}
