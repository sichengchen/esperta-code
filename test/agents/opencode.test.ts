import { describe, expect, test } from "bun:test";
import { OpenCodeAdapter } from "../../src/agents/opencode.ts";

describe("OpenCodeAdapter", () => {
  test("has correct name", () => {
    const adapter = new OpenCodeAdapter();
    expect(adapter.name).toBe("opencode");
  });

  test("builds correct command args for auto policy", () => {
    const adapter = new OpenCodeAdapter();
    const args = adapter.buildArgs({
      threadId: "thread-1",
      workDir: "/tmp/work",
      prompt: "Fix the bug",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "auto",
      env: {},
    });

    expect(args[0]).toBe("run");
    expect(args).toContain("--format");
    expect(args).toContain("json");
    expect(args).toContain("--agent");
    expect(args).toContain("build");
    expect(args[args.length - 1]).toBe("Fix the bug");
  });

  test("uses plan agent for gated policy", () => {
    const adapter = new OpenCodeAdapter();
    const args = adapter.buildArgs({
      threadId: "thread-1",
      workDir: "/tmp/work",
      prompt: "Review this repository",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "gated",
      env: {},
    });

    const agentIdx = args.indexOf("--agent");
    expect(args[agentIdx + 1]).toBe("plan");
  });

  test("buildEnv sets permissive config for auto policy", () => {
    const adapter = new OpenCodeAdapter();
    const env = adapter.buildEnv({
      threadId: "thread-1",
      workDir: "/tmp/work",
      prompt: "Implement feature",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "auto",
      env: { FOO: "bar" },
    });

    expect(env.FOO).toBe("bar");
    expect(env.OPENCODE_CONFIG_CONTENT).toBeDefined();
    const parsed = JSON.parse(env.OPENCODE_CONFIG_CONTENT!);
    expect(parsed.permission).toBe("allow");
  });

  test("buildEnv denies edits and bash for gated policy", () => {
    const adapter = new OpenCodeAdapter();
    const env = adapter.buildEnv({
      threadId: "thread-1",
      workDir: "/tmp/work",
      prompt: "Review this",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "gated",
      env: {},
    });

    const parsed = JSON.parse(env.OPENCODE_CONFIG_CONTENT!);
    expect(parsed.permission.edit).toBe("deny");
    expect(parsed.permission.bash).toBe("deny");
  });

  test("parseOutput handles JSONL assistant events", () => {
    const adapter = new OpenCodeAdapter();
    const jsonl = [
      JSON.stringify({ type: "message", role: "assistant", content: "Working on it..." }),
      JSON.stringify({ type: "message", role: "assistant", content: "Done. Fixed the bug." }),
    ].join("\n");

    const result = adapter.parseOutput(0, jsonl, "");
    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("Done. Fixed the bug.");
  });

  test("parseOutput handles object output with result field", () => {
    const adapter = new OpenCodeAdapter();
    const result = adapter.parseOutput(0, JSON.stringify({ result: "Completed successfully." }), "");
    expect(result.status).toBe("succeeded");
    expect(result.summary).toBe("Completed successfully.");
  });

  test("parseOutput handles non-zero exit code", () => {
    const adapter = new OpenCodeAdapter();
    const result = adapter.parseOutput(1, "error", "stderr");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
  });
});
