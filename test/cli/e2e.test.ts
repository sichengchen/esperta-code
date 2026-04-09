import { describe, expect, test } from "bun:test";
import {
  runE2ECommand,
  type E2ECommandDeps,
} from "../../src/cli/e2e.ts";

function makeDeps(overrides: Partial<E2ECommandDeps> = {}): E2ECommandDeps {
  const lines: string[] = [];
  return {
    writeLine: (line: string) => lines.push(line),
    writeError: (line: string) => lines.push(`ERR:${line}`),
    writeFile: () => {},
    runDoctor: () => ({
      ok: true,
      checks: [
        { id: "config.exists", status: "pass", summary: "Config exists" },
      ],
    }),
    runSmoke: () => ({
      ok: true,
      doctor: {
        ok: true,
        checks: [
          { id: "config.exists", status: "pass", summary: "Config exists" },
        ],
      },
      checks: [
        {
          id: "cli.config_validate",
          status: "pass",
          summary: "Config validate passed",
        },
      ],
      scenarios: [{ id: "S1", title: "Issue Discovery", status: "pending" }],
    }),
    getOutput: () => lines,
    ...overrides,
  };
}

describe("runE2ECommand", () => {
  test("runs doctor and prints summary", () => {
    const deps = makeDeps();
    const ok = runE2ECommand(
      {
        subcommand: "doctor",
        configPath: "/tmp/esperta-code-e2e/esperta-code.yml",
        flags: {},
      },
      deps
    );

    expect(ok).toBe(true);
    expect(deps.getOutput!().some((line) => line.includes("E2E Doctor"))).toBe(true);
  });

  test("returns false for unknown subcommand", () => {
    const deps = makeDeps();
    const ok = runE2ECommand(
      {
        subcommand: "unknown",
        configPath: "/tmp/esperta-code-e2e/esperta-code.yml",
        flags: {},
      },
      deps
    );

    expect(ok).toBe(false);
    expect(deps.getOutput!().some((line) => line.includes("Usage"))).toBe(true);
  });
});
