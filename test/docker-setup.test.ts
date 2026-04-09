import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

describe("Docker setup assets", () => {
  test("docker compose treats the local .env file as optional", () => {
    const composePath = join(ROOT, "docker-compose.yml");
    expect(existsSync(composePath)).toBe(true);

    const content = readFileSync(composePath, "utf-8");
    expect(content).toContain("env_file:");
    expect(content).toContain("path: .env");
    expect(content).toContain("required: false");
  });

  test("docker entrypoint only enables Linear config when a token is present", () => {
    const entrypointPath = join(ROOT, "docker-entrypoint.sh");
    expect(existsSync(entrypointPath)).toBe(true);

    const content = readFileSync(entrypointPath, "utf-8");
    expect(content).toContain('if [ -n "$LINEAR_OAUTH_TOKEN" ]; then');
    expect(content).toContain("# Optional: enable the Linear connector later");
    expect(content).toContain("# linear:");
  });
});
