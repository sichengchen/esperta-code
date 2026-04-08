import { existsSync } from "fs";
import { PRIMARY_CLI_NAME, PRODUCT_NAME } from "../branding.ts";
import { generateConfig, writeConfigFile } from "../config/writer.ts";

type PromptFn = (message?: string) => string | null;

export async function runInit(
  configPath: string,
  promptFn: PromptFn = globalThis.prompt
): Promise<void> {
  if (existsSync(configPath)) {
    console.log(`Config file already exists: ${configPath}`);
    console.log(`To reconfigure, delete it first and re-run \`${PRIMARY_CLI_NAME} init\`.`);
    return;
  }

  console.log(`${PRODUCT_NAME} Setup`);
  console.log("");

  let oauthToken: string;
  const envToken = process.env.LINEAR_OAUTH_TOKEN;
  if (envToken) {
    const useEnv = promptFn("LINEAR_OAUTH_TOKEN is set. Use it? [Y/n]") ?? "Y";
    if (useEnv.toLowerCase() === "n") {
      const entered = promptFn("Enter Linear OAuth token:");
      if (!entered) throw new Error("OAuth token is required");
      oauthToken = entered;
    } else {
      oauthToken = "$LINEAR_OAUTH_TOKEN";
    }
  } else {
    const entered = promptFn("Enter Linear OAuth token:");
    if (!entered) throw new Error("OAuth token is required");
    oauthToken = entered;
  }

  const content = generateConfig({ oauthToken });
  writeConfigFile(configPath, content);

  console.log("");
  console.log(`Config written to ${configPath}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Add a project:            ${PRIMARY_CLI_NAME} project add`);
  console.log(`  2. Review the config:        ${PRIMARY_CLI_NAME} config show`);
  console.log(`  3. Start ${PRODUCT_NAME}:    ${PRIMARY_CLI_NAME} start`);
}
