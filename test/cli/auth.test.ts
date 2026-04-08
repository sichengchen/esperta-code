import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/feliz-auth-test";

describe("buildAuthorizationUrl", () => {
  test("includes all required params", async () => {
    const { buildAuthorizationUrl } = await import("../../src/cli/auth.ts");
    const url = buildAuthorizationUrl("client_123", "http://localhost:3421/auth/callback");

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://linear.app/oauth/authorize"
    );
    expect(parsed.searchParams.get("client_id")).toBe("client_123");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3421/auth/callback"
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("actor")).toBe("app");
  });

  test("includes required scopes", async () => {
    const { buildAuthorizationUrl } = await import("../../src/cli/auth.ts");
    const url = buildAuthorizationUrl("client_123", "http://localhost:3421/auth/callback");
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope")!;

    expect(scope).toContain("app:mentionable");
    expect(scope).toContain("app:assignable");
    expect(scope).toContain("read");
    expect(scope).toContain("write");
    expect(scope).toContain("issues:create");
  });

  test("uses custom callback URL in redirect_uri", async () => {
    const { buildAuthorizationUrl } = await import("../../src/cli/auth.ts");
    const url = buildAuthorizationUrl("client_123", "https://my-host.com/auth/callback");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://my-host.com/auth/callback"
    );
  });
});

describe("exchangeCodeForToken", () => {
  test("sends correct POST request and returns token", async () => {
    const { exchangeCodeForToken } = await import("../../src/cli/auth.ts");

    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return new Response(
        JSON.stringify({
          access_token: "lin_oauth_test123",
          token_type: "Bearer",
          expires_in: 315360000,
          scope: ["read", "write"],
        }),
        { status: 200 }
      );
    };

    const result = await exchangeCodeForToken({
      clientId: "cid",
      clientSecret: "csecret",
      code: "auth_code_abc",
      redirectUri: "http://localhost:8374/auth/callback",
      fetchFn: mockFetch as any,
    });

    expect(capturedUrl).toBe("https://api.linear.app/oauth/token");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const body = capturedInit?.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("client_id")).toBe("cid");
    expect(params.get("client_secret")).toBe("csecret");
    expect(params.get("code")).toBe("auth_code_abc");
    expect(params.get("redirect_uri")).toBe(
      "http://localhost:8374/auth/callback"
    );

    expect(result.access_token).toBe("lin_oauth_test123");
  });

  test("throws on failed token exchange", async () => {
    const { exchangeCodeForToken } = await import("../../src/cli/auth.ts");

    const mockFetch = async () =>
      new Response(
        JSON.stringify({ error: "invalid_grant" }),
        { status: 400 }
      );

    await expect(
      exchangeCodeForToken({
        clientId: "cid",
        clientSecret: "csecret",
        code: "bad_code",
        redirectUri: "http://localhost:8374/auth/callback",
        fetchFn: mockFetch as any,
      })
    ).rejects.toThrow();
  });
});

describe("verifyToken", () => {
  test("queries viewer and returns identity", async () => {
    const { verifyToken } = await import("../../src/cli/auth.ts");

    let capturedAuth = "";
    const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return new Response(
        JSON.stringify({
          data: { viewer: { id: "user_1", name: "Feliz Bot" } },
        }),
        { status: 200 }
      );
    };

    const viewer = await verifyToken(
      "lin_oauth_test123",
      mockFetch as any
    );

    expect(capturedAuth).toBe("Bearer lin_oauth_test123");
    expect(viewer).toEqual({ id: "user_1", name: "Feliz Bot" });
  });

  test("returns null on verification failure", async () => {
    const { verifyToken } = await import("../../src/cli/auth.ts");

    const mockFetch = async () =>
      new Response(
        JSON.stringify({ errors: [{ message: "Unauthorized" }] }),
        { status: 200 }
      );

    const viewer = await verifyToken(
      "bad_token",
      mockFetch as any
    );

    expect(viewer).toBeNull();
  });
});

describe("writeTokenToConfig", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("creates new feliz.yml when none exists", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    writeTokenToConfig(configPath, "lin_oauth_new_token", false);

    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("lin_oauth_new_token");
  });

  test("writes env var reference when useEnvVar is true", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    writeTokenToConfig(configPath, "lin_oauth_new_token", true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("$LINEAR_OAUTH_TOKEN");
    expect(content).not.toContain("lin_oauth_new_token");
  });

  test("updates existing feliz.yml without clobbering other fields", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    writeFileSync(
      configPath,
      `linear:
  oauth_token: old_token
projects:
  - name: my-project
    repo: git@github.com:org/repo.git
    linear_project: My Project
agent:
  default: claude-code
`,
      "utf-8"
    );

    writeTokenToConfig(configPath, "lin_oauth_updated", false);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("lin_oauth_updated");
    expect(content).not.toContain("old_token");
    expect(content).toContain("my-project");
    expect(content).toContain("claude-code");
  });

  test("stores viewer ID alongside token", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    writeTokenToConfig(configPath, "lin_oauth_xyz", false, "user_abc");

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("lin_oauth_xyz");
    expect(content).toContain("app_user_id: user_abc");
  });

  test("stores viewer ID when updating existing config", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    writeFileSync(configPath, "linear:\n  oauth_token: old\nprojects: []\n", "utf-8");
    writeTokenToConfig(configPath, "lin_oauth_new", false, "viewer_123");

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("lin_oauth_new");
    expect(content).toContain("app_user_id: viewer_123");
    expect(content).not.toContain("old");
  });

  test("creates nested directories for config path", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "a", "b", "feliz.yml");

    writeTokenToConfig(configPath, "lin_oauth_nested", false);

    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("lin_oauth_nested");
  });
});

describe("maskToken", () => {
  test("masks middle of token", async () => {
    const { maskToken } = await import("../../src/cli/auth.ts");
    expect(maskToken("lin_oauth_abcdef1234567890")).toBe("lin_...7890");
  });

  test("masks short tokens", async () => {
    const { maskToken } = await import("../../src/cli/auth.ts");
    expect(maskToken("short")).toBe("****");
  });
});

describe("waitForCallback", () => {
  test("times out when no callback received", async () => {
    const { waitForCallback } = await import("../../src/cli/auth.ts");

    await expect(
      waitForCallback(0, 50, {
        waitViaServer: () => {
          const error = new Error("port in use") as Error & { code?: string };
          error.code = "EADDRINUSE";
          throw error;
        },
      })
    ).rejects.toThrow(
      "OAuth callback timed out"
    );
  });

  test("resolves with code from callback server", async () => {
    const { waitForCallback } = await import("../../src/cli/auth.ts");

    const code = await waitForCallback(18374, 5000, {
      waitViaServer: async (_port, _timeoutMs) => "test_code_123",
    });

    expect(code).toBe("test_code_123");
  });

  test("falls back to polling code file when port is in use", async () => {
    const { waitForCallback } =
      await import("../../src/cli/auth.ts");

    const code = await waitForCallback(18377, 3000, {
      waitViaServer: () => {
        const error = new Error("port in use") as Error & { code?: string };
        error.code = "EADDRINUSE";
        throw error;
      },
      waitViaPolling: async (_timeoutMs) => "polled_code_456",
    });

    expect(code).toBe("polled_code_456");
  });
});

describe("runAuth", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("full flow with injected dependencies", async () => {
    const { runAuth } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    const promptAnswers = ["n"]; // "n" = store literal token, not env var
    let promptIdx = 0;
    const promptFn = (_msg?: string) => promptAnswers[promptIdx++] ?? null;

    let savedConfig:
      | { path: string; token: string; useEnvVar: boolean; viewerId?: string }
      | undefined;

    await runAuth(
      configPath,
      {
        "client-id": "test_client",
        "client-secret": "test_secret",
      },
      promptFn,
      {
        waitForCallback: async () => "test_auth_code",
        exchangeCodeForToken: async ({ redirectUri }) => {
          expect(redirectUri).toBe("http://localhost:3421/auth/callback");
          return {
            access_token: "lin_oauth_test123",
            token_type: "Bearer",
            expires_in: 315360000,
            scope: ["read", "write"],
          };
        },
        verifyToken: async () => ({ id: "viewer_1", name: "Feliz Bot" }),
        writeTokenToConfig: (path, token, useEnvVar, viewerId) => {
          savedConfig = { path, token, useEnvVar, viewerId };
        },
        openBrowser: () => {},
        console: { log: () => {}, warn: () => {} },
      }
    );

    expect(savedConfig).toEqual({
      path: configPath,
      token: "lin_oauth_test123",
      useEnvVar: false,
      viewerId: "viewer_1",
    });
  });

  test("uses --callback-url for redirect_uri", async () => {
    const { runAuth } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    const promptAnswers = ["n"];
    let promptIdx = 0;
    const promptFn = (_msg?: string) => promptAnswers[promptIdx++] ?? null;

    let capturedRedirectUri = "";

    await runAuth(
      configPath,
      {
        "client-id": "test_client",
        "client-secret": "test_secret",
        port: "18376",
        "callback-url": "https://my-host.com/auth/callback",
      },
      promptFn,
      {
        waitForCallback: async () => "test_auth_code",
        exchangeCodeForToken: async ({ redirectUri }) => {
          capturedRedirectUri = redirectUri;
          return {
            access_token: "lin_oauth_test123",
            token_type: "Bearer",
            expires_in: 315360000,
            scope: ["read", "write"],
          };
        },
        verifyToken: async () => null,
        writeTokenToConfig: () => {},
        openBrowser: () => {},
        console: { log: () => {}, warn: () => {} },
      }
    );

    expect(capturedRedirectUri).toBe("https://my-host.com/auth/callback");
  });

  test("defaults to port 3421 (webhook port)", async () => {
    const { DEFAULT_PORT } = await import("../../src/cli/auth.ts");
    expect(DEFAULT_PORT).toBe(3421);
  });
});
