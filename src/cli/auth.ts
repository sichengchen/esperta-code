import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { parse, stringify } from "yaml";
import { PRIMARY_CLI_NAME, PRODUCT_NAME } from "../branding.ts";
import {
  LEGACY_AUTH_CODE_FILENAME,
  PRIMARY_AUTH_CODE_FILENAME,
} from "../paths.ts";

const SCOPES = "app:mentionable,app:assignable,read,write,issues:create";
export const DEFAULT_PORT = 3421;
const TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 500;

export const AUTH_CODE_FILE = join(tmpdir(), PRIMARY_AUTH_CODE_FILENAME);
const LEGACY_AUTH_CODE_FILE = join(tmpdir(), LEGACY_AUTH_CODE_FILENAME);

export function writeAuthCode(code: string): void {
  writeFileSync(AUTH_CODE_FILE, code, "utf-8");
}

export function clearAuthCode(): void {
  if (existsSync(AUTH_CODE_FILE)) unlinkSync(AUTH_CODE_FILE);
  if (existsSync(LEGACY_AUTH_CODE_FILE)) unlinkSync(LEGACY_AUTH_CODE_FILE);
}

export const AUTH_CALLBACK_HTML = `<!DOCTYPE html>
<html>
<head><title>${PRODUCT_NAME}</title></head>
<body>
<h1>Authorization complete</h1>
<p>You can close this tab.</p>
</body>
</html>`;

export function buildAuthorizationUrl(
  clientId: string,
  redirectUri: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    actor: "app",
  });
  return `https://linear.app/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchFn?: typeof fetch;
}): Promise<{ access_token: string; token_type: string; expires_in: number; scope: string[] }> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
  });

  const response = await fetchFn("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await response.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string[];
    error?: string;
  };

  if (!response.ok || !json.access_token) {
    throw new Error(
      `Token exchange failed: ${json.error || JSON.stringify(json)}`
    );
  }

  return json as { access_token: string; token_type: string; expires_in: number; scope: string[] };
}

export async function verifyToken(
  token: string,
  fetchFn?: typeof fetch
): Promise<{ id: string; name: string } | null> {
  const fn = fetchFn ?? globalThis.fetch;
  try {
    const response = await fn("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: "{ viewer { id name } }" }),
    });

    const json = (await response.json()) as {
      data?: { viewer?: { id: string; name: string } };
    };

    if (!json.data?.viewer) return null;
    return json.data.viewer;
  } catch {
    return null;
  }
}

export function writeTokenToConfig(
  configPath: string,
  token: string,
  useEnvVar: boolean,
  viewerId?: string
): void {
  const tokenValue = useEnvVar ? "$LINEAR_OAUTH_TOKEN" : token;

  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    const doc = parse(content) as Record<string, unknown>;
    if (!doc.linear) {
      doc.linear = {};
    }
    const linear = doc.linear as Record<string, unknown>;
    linear.oauth_token = tokenValue;
    if (viewerId) {
      linear.app_user_id = viewerId;
    }
    writeFileSync(configPath, stringify(doc), "utf-8");
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
    const linear: Record<string, string> = { oauth_token: tokenValue };
    if (viewerId) {
      linear.app_user_id = viewerId;
    }
    const doc = { linear, projects: [] as unknown[] };
    writeFileSync(configPath, stringify(doc), "utf-8");
  }
}

export function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "..." + token.slice(-4);
}

interface WaitForCallbackDeps {
  waitViaServer?: (port: number, timeoutMs: number) => Promise<string>;
  waitViaPolling?: (timeoutMs: number) => Promise<string>;
  log?: Pick<typeof console, "log">;
}

interface RunAuthDeps {
  waitForCallback?: (
    port: number,
    timeoutMs?: number,
    deps?: WaitForCallbackDeps
  ) => Promise<string>;
  exchangeCodeForToken?: typeof exchangeCodeForToken;
  verifyToken?: typeof verifyToken;
  writeTokenToConfig?: typeof writeTokenToConfig;
  openBrowser?: (url: string) => void;
  console?: Pick<typeof console, "log" | "warn">;
}

function tryOpenBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    Bun.spawn([cmd, url], { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    // Browser open is best-effort
  }
}

export async function runAuth(
  configPath: string,
  flags: Record<string, string> = {},
  promptFn: (msg?: string) => string | null = globalThis.prompt,
  deps: RunAuthDeps = {}
): Promise<void> {
  const logger = deps.console ?? console;
  const clientId =
    flags["client-id"] ?? promptFn("Linear OAuth App Client ID:");
  if (!clientId) throw new Error("Client ID is required");

  const clientSecret =
    flags["client-secret"] ?? promptFn("Linear OAuth App Client Secret:");
  if (!clientSecret) throw new Error("Client Secret is required");

  const port = parseInt(flags.port ?? String(DEFAULT_PORT), 10);
  const redirectUri = flags["callback-url"] ?? `http://localhost:${port}/auth/callback`;

  const authUrl = buildAuthorizationUrl(clientId, redirectUri);
  logger.log("");
  logger.log(`Open this URL to authorize ${PRODUCT_NAME} with Linear:`);
  logger.log("");
  logger.log(`  ${authUrl}`);
  logger.log("");

  (deps.openBrowser ?? tryOpenBrowser)(authUrl);

  const code = await (deps.waitForCallback ?? waitForCallback)(port);

  logger.log("Exchanging code for access token...");
  const tokenResult = await (deps.exchangeCodeForToken ?? exchangeCodeForToken)({
    clientId,
    clientSecret,
    code,
    redirectUri,
  });

  logger.log("Verifying token...");
  const viewer = await (deps.verifyToken ?? verifyToken)(tokenResult.access_token);
  if (viewer) {
    logger.log(`Authenticated as: ${viewer.name} (${viewer.id})`);
  } else {
    logger.warn(
      "Warning: Could not verify token via viewer query. Saving token anyway."
    );
  }

  const storeChoice =
    promptFn(
      "Store as $LINEAR_OAUTH_TOKEN env var reference? [Y/n]"
    ) ?? "Y";
  const useEnvVar = storeChoice.toLowerCase() !== "n";

  (deps.writeTokenToConfig ?? writeTokenToConfig)(
    configPath,
    tokenResult.access_token,
    useEnvVar,
    viewer?.id
  );
  logger.log(`Token saved to ${configPath}`);

  if (useEnvVar) {
    logger.log("");
    logger.log("Set the LINEAR_OAUTH_TOKEN environment variable:");
    logger.log("");
    logger.log(`  export LINEAR_OAUTH_TOKEN="${tokenResult.access_token}"`);
    logger.log("");
    logger.log("Add this to your .env file or shell profile.");
  }

  logger.log("");
  logger.log("Next steps:");
  logger.log("  1. Configure Linear webhooks:");
  logger.log("     - Go to your Linear OAuth app settings");
  logger.log("     - Enable webhooks and select 'Agent session events'");
  logger.log(`     - Set webhook URL to: https://<your-host>:${port}/webhook/linear`);
  logger.log(`  2. Add a project: ${PRIMARY_CLI_NAME} project add`);
  logger.log(`  3. Start ${PRODUCT_NAME}:   ${PRIMARY_CLI_NAME} start`);
}

export function waitForCallback(
  port: number,
  timeoutMs: number = TIMEOUT_MS,
  deps: WaitForCallbackDeps = {}
): Promise<string> {
  clearAuthCode();
  const log = deps.log ?? console;
  const viaServer = deps.waitViaServer ?? waitViaServer;
  const viaPolling = deps.waitViaPolling ?? waitViaPolling;

  try {
    return viaServer(port, timeoutMs);
  } catch (e: any) {
    if (e?.code === "EADDRINUSE") {
      log.log(
        `Port ${port} is in use (${PRODUCT_NAME} server running). Waiting for callback via auth code file...`
      );
      return viaPolling(timeoutMs);
    }
    throw e;
  }
}

function waitViaServer(port: number, timeoutMs: number): Promise<string> {
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/auth/callback") {
        const code = url.searchParams.get("code");
        if (!code) {
          return new Response("Missing code parameter", { status: 400 });
        }

        setTimeout(() => server.stop(), 100);
        resolveCallback(code);

        return new Response(AUTH_CALLBACK_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  let resolveCallback: (code: string) => void;
  let rejectCallback: (err: Error) => void;

  const promise = new Promise<string>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const timeout = setTimeout(() => {
    server.stop();
    rejectCallback(new Error("OAuth callback timed out after 5 minutes"));
  }, timeoutMs);

  return promise.finally(() => clearTimeout(timeout));
}

function waitViaPolling(timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const poll = setInterval(() => {
      if (existsSync(AUTH_CODE_FILE)) {
        const code = readFileSync(AUTH_CODE_FILE, "utf-8").trim();
        if (code) {
          clearInterval(poll);
          clearAuthCode();
          resolve(code);
        }
      }
      if (Date.now() > deadline) {
        clearInterval(poll);
        reject(new Error("OAuth callback timed out after 5 minutes"));
      }
    }, POLL_INTERVAL_MS);
  });
}
