import type { AgentAdapter, AgentRunParams, AgentRunResult } from "./adapter.ts";

type ParsedEvent = Record<string, unknown>;

export class OpenCodeAdapter implements AgentAdapter {
  name = "opencode";
  private runningProcesses = new Map<string, { kill: () => void }>();

  async isAvailable(): Promise<boolean> {
    const version = Bun.spawnSync(["opencode", "--version"]);
    return version.exitCode === 0;
  }

  buildArgs(params: AgentRunParams): string[] {
    const agent = params.approvalPolicy === "gated" ? "plan" : "build";
    return ["run", "--format", "json", "--agent", agent, params.prompt];
  }

  buildEnv(params: AgentRunParams): Record<string, string> {
    const permission =
      params.approvalPolicy === "gated"
        ? { edit: "deny", bash: "deny" }
        : "allow";

    return {
      ...process.env,
      ...params.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        permission,
      }),
    };
  }

  parseOutput(
    exitCode: number,
    stdout: string,
    stderr: string
  ): AgentRunResult {
    if (exitCode !== 0) {
      return {
        status: "failed",
        exitCode,
        stdout,
        stderr,
        filesChanged: [],
      };
    }

    return {
      status: "succeeded",
      exitCode,
      stdout,
      stderr,
      filesChanged: [],
      summary: this.extractSummary(stdout),
    };
  }

  async execute(params: AgentRunParams): Promise<AgentRunResult> {
    const args = this.buildArgs(params);
    const proc = Bun.spawn(["opencode", ...args], {
      cwd: params.workDir,
      env: this.buildEnv(params),
      stdout: "pipe",
      stderr: "pipe",
    });

    this.runningProcesses.set(params.threadId, {
      kill: () => proc.kill(),
    });

    const timeoutId = setTimeout(() => {
      proc.kill();
    }, params.timeout_ms);

    try {
      const exitCode = await proc.exited;
      clearTimeout(timeoutId);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      this.runningProcesses.delete(params.threadId);

      if (exitCode === 137 || exitCode === null) {
        return {
          status: "timed_out",
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          filesChanged: [],
        };
      }

      const diffResult = Bun.spawnSync(["git", "diff", "--name-only", "HEAD"], {
        cwd: params.workDir,
      });
      const filesChanged = diffResult.stdout
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean);

      const result = this.parseOutput(exitCode, stdout, stderr);
      result.filesChanged = filesChanged;
      return result;
    } catch {
      clearTimeout(timeoutId);
      this.runningProcesses.delete(params.threadId);
      return {
        status: "failed",
        exitCode: -1,
        stdout: "",
        stderr: "Agent process error",
        filesChanged: [],
      };
    }
  }

  async cancel(threadId: string): Promise<void> {
    const proc = this.runningProcesses.get(threadId);
    if (proc) {
      proc.kill();
      this.runningProcesses.delete(threadId);
    }
  }

  private extractSummary(stdout: string): string | undefined {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return undefined;
    }

    const direct = this.extractSummaryFromValue(this.tryParseJson(trimmed));
    if (direct) {
      return direct;
    }

    const lines = trimmed.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const parsed = this.tryParseJson(lines[i]!);
      const summary = this.extractSummaryFromValue(parsed);
      if (summary) {
        return summary;
      }
    }

    return undefined;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private extractSummaryFromValue(value: unknown): string | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) {
        const summary = this.extractSummaryFromValue(value[i]);
        if (summary) {
          return summary;
        }
      }
      return undefined;
    }

    const record = value as ParsedEvent;

    for (const key of ["result", "summary", "content", "text"]) {
      if (typeof record[key] === "string" && record[key]!.trim().length > 0) {
        return String(record[key]).trim();
      }
    }

    const message = record.message;
    if (message && typeof message === "object" && !Array.isArray(message)) {
      const nested = message as ParsedEvent;
      for (const key of ["content", "text"]) {
        if (typeof nested[key] === "string" && nested[key]!.trim().length > 0) {
          return String(nested[key]).trim();
        }
      }
    }

    if (
      typeof record.type === "string" &&
      record.type === "message" &&
      typeof record.role === "string" &&
      record.role === "assistant" &&
      typeof record.content === "string" &&
      record.content.trim().length > 0
    ) {
      return record.content.trim();
    }

    return undefined;
  }
}
