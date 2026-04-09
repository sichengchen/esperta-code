import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

describe("CLI help output", () => {
  test("uses Esperta Code wording and the primary CLI name", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli/index.ts", "--help"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    expect(output).toContain("Esperta Code - Cloud agents platform");
    expect(output).toContain("Start the Esperta Code daemon");
    expect(output).not.toContain("Start the Feliz daemon");
    expect(output).toContain("Usage: esperta-code <command> [options]");
    expect(output).not.toContain("Usage: feliz <command> [options]");
  });
});
