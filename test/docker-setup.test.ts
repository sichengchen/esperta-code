import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

describe("Docker setup assets", () => {
  test("docker compose exposes the Esperta Code service name", () => {
    const composePath = join(ROOT, "docker-compose.yml");
    expect(existsSync(composePath)).toBe(true);

    const content = readFileSync(composePath, "utf-8");
    expect(content).toContain("services:");
    expect(content).toContain("  esperta-code:");
    expect(content).not.toContain("  feliz:");
  });

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
    expect(content).toContain('/home/feliz/.esperta-code/esperta-code.yml');
    expect(content).toContain('if [ -n "$LINEAR_OAUTH_TOKEN" ]; then');
    expect(content).toContain("# Optional: enable the Linear connector later");
    expect(content).toContain("# linear:");
  });

  test("docker entrypoint generates a valid non-Linear runtime config", () => {
    const entrypointPath = join(ROOT, "docker-entrypoint.sh");
    expect(existsSync(entrypointPath)).toBe(true);

    const content = readFileSync(entrypointPath, "utf-8");
    expect(content).toContain("runtime:");
    expect(content).toContain("data_dir: /data/esperta-code");
    expect(content).toContain("max_concurrent_jobs: 4");
  });

  test("docker-facing docs and prompts use the Esperta Code service name", () => {
    const docsPath = join(ROOT, "docs", "getting-started.md");
    const entrypointPath = join(ROOT, "docker-entrypoint.sh");

    expect(readFileSync(docsPath, "utf-8")).toContain(
      "docker compose exec esperta-code"
    );
    expect(readFileSync(docsPath, "utf-8")).not.toContain(
      "docker compose exec feliz"
    );

    const entrypoint = readFileSync(entrypointPath, "utf-8");
    expect(entrypoint).toContain("docker compose exec esperta-code");
    expect(entrypoint).not.toContain("docker compose exec feliz");
  });
});
