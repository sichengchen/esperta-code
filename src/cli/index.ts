#!/usr/bin/env bun
import { parseArgs } from "./commands.ts";
import { loadFelizConfig, loadFelizProjectAddConfig } from "../config/loader.ts";
import { Database } from "../db/database.ts";
import { createLogger } from "../logger/index.ts";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { validateAllConfigs } from "./validate.ts";
import { PRIMARY_CLI_NAME, PRODUCT_NAME } from "../branding.ts";

const HELP_TEXT = `
${PRODUCT_NAME} - Cloud agents platform

Usage: ${PRIMARY_CLI_NAME} <command> [options]

Commands:
  start                    Start the Esperta Code daemon
  init                     Interactive setup wizard
  stop                     Stop the Esperta Code daemon
  status                   Show daemon status
  config validate          Validate configuration
  config show              Print resolved configuration
  project list             List configured projects
  project add              Add a new project
  project remove <name>    Remove a project
  agent list               List installed agents
  thread read              Read thread context (for agents during execution)
  thread write <msg>       Append a job to the current thread (for agents during execution)
  auth linear              Authenticate with Linear (OAuth flow)
  e2e doctor               Validate local E2E prerequisites
  e2e smoke                Run automated E2E smoke checks

Options:
  --config <path>          Path to config file (default: ~/.feliz/feliz.yml)
  --json                   Print report as JSON (for e2e commands)
  --out <path>             Write report JSON to file (for e2e commands)
  --help                   Show this help
`.trim();

function loadConfig(configPath: string) {
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }
  const content = readFileSync(configPath, "utf-8");
  return loadFelizConfig(content);
}

function loadProjectAddConfig(configPath: string) {
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }
  const content = readFileSync(configPath, "utf-8");
  return loadFelizProjectAddConfig(content);
}

function openDb(configPath: string) {
  const config = loadConfig(configPath);
  const dbPath = join(config.storage.data_dir, "db", "feliz.db");
  if (!existsSync(dbPath)) {
    return { config, db: null, dbPath };
  }
  return { config, db: new Database(dbPath), dbPath };
}

async function main() {
  const cmd = parseArgs(process.argv.slice(2));
  const logger = createLogger("cli");

  if (cmd.command === "help") {
    console.log(HELP_TEXT);
    return;
  }

  const configPath =
    cmd.flags.config ?? join(homedir(), ".feliz", "feliz.yml");

  if (cmd.command === "config" && cmd.subcommand === "validate") {
    try {
      const result = validateAllConfigs(configPath);
      console.log(
        `Configuration is valid. Validated ${result.validated_projects} project(s), ${result.checked_repo_configs} repo config(s), ${result.checked_pipelines} pipeline config(s).`
      );
    } catch (error: any) {
      console.error(`Configuration error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "config" && cmd.subcommand === "show") {
    try {
      console.log(JSON.stringify(loadConfig(configPath), null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "status") {
    try {
      if (!existsSync(configPath)) {
        console.log(`${PRODUCT_NAME} is not configured. Run \`${PRIMARY_CLI_NAME} init\` first.`);
        return;
      }
      const config = loadConfig(configPath);
      const dbPath = join(config.storage.data_dir, "db", "feliz.db");
      if (!existsSync(dbPath)) {
        console.log(
          `${PRODUCT_NAME} is configured but not running. ${config.projects.length} project(s) configured.`
        );
        return;
      }

      const db = new Database(dbPath);
      const running = db.countRunningThreads();
      console.log(
        `${PRODUCT_NAME} status: ${config.projects.length} project(s), ${running} running agent thread(s).`
      );
      for (const project of config.projects) {
        console.log(`  ${project.name}: watching "${project.linear_project}"`);
      }
      db.close();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "project" && cmd.subcommand === "list") {
    try {
      const config = loadConfig(configPath);
      for (const project of config.projects) {
        console.log(`${project.name}: ${project.repo} (${project.linear_project})`);
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "thread" && cmd.subcommand === "read") {
    const dataDir = process.env.FELIZ_DATA_DIR;
    const threadId = process.env.FELIZ_THREAD_ID;

    if (!dataDir || !threadId) {
      console.error("Missing environment variables. This command is for use by agents during execution.");
      console.error("Required: FELIZ_DATA_DIR, FELIZ_THREAD_ID");
      process.exit(1);
    }

    try {
      const db = new Database(join(dataDir, "db", "feliz.db"));
      const { threadRead } = await import("./thread-agent.ts");
      console.log(threadRead(db, threadId));
      db.close();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "thread" && cmd.subcommand === "write") {
    const dataDir = process.env.FELIZ_DATA_DIR;
    const threadId = process.env.FELIZ_THREAD_ID;

    if (!dataDir || !threadId) {
      console.error("Missing environment variables. This command is for use by agents during execution.");
      console.error("Required: FELIZ_DATA_DIR, FELIZ_THREAD_ID");
      process.exit(1);
    }

    let message = cmd.args.join(" ");
    if (!message) {
      message = await Bun.stdin.text();
    }

      if (!message.trim()) {
      console.error(`Usage: ${PRIMARY_CLI_NAME} thread write <message>`);
      process.exit(1);
    }

    try {
      const db = new Database(join(dataDir, "db", "feliz.db"));
      const { threadWrite } = await import("./thread-agent.ts");
      threadWrite(db, threadId, message.trim(), "agent");
      db.close();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "agent" && cmd.subcommand === "list") {
    const { ClaudeCodeAdapter } = await import("../agents/claude-code.ts");
    const { CodexAdapter } = await import("../agents/codex.ts");
    const adapters = [new ClaudeCodeAdapter(), new CodexAdapter()];
    console.log("Agent          Available");
    console.log("─".repeat(30));
    for (const adapter of adapters) {
      const available = await adapter.isAvailable();
      console.log(`${adapter.name.padEnd(15)}${available ? "yes" : "no"}`);
    }
    return;
  }

  if (cmd.command === "project" && cmd.subcommand === "add") {
    try {
      if (!existsSync(configPath)) {
        console.error(`Config file not found. Run \`${PRIMARY_CLI_NAME} init\` first.`);
        process.exit(1);
      }

      const config = loadProjectAddConfig(configPath);
      const { LinearClient } = await import("../connectors/linear/client.ts");
      const { WorkspaceManager } = await import("../workspace/manager.ts");
      const { addProjectToConfig } = await import("./project.ts");
      const {
        repoHasFelizConfig,
        writeRepoScaffold,
        writeRepoScaffoldWithAgent,
        gitCommitAndPush,
      } = await import("./repo-scaffold.ts");
      const { ClaudeCodeAdapter } = await import("../agents/claude-code.ts");
      const { CodexAdapter } = await import("../agents/codex.ts");
      const { OpenCodeAdapter } = await import("../agents/opencode.ts");
      const { runProjectAddWizard } = await import("./project-add-wizard.ts");

      const linearClient = new LinearClient(config.linear.oauth_token);
      const workspace = new WorkspaceManager(config.storage.workspace_root);
      const adapters = {
        "claude-code": new ClaudeCodeAdapter(),
        codex: new CodexAdapter(),
        opencode: new OpenCodeAdapter(),
      };

      await runProjectAddWizard({
        prompt: globalThis.prompt,
        fetchProjects: () => linearClient.fetchProjects(),
        cloneRepo: (name, url) => workspace.cloneRepo(name, url),
        repoHasFelizConfig,
        writeRepoScaffoldWithAgent: async (repoPath, adapterName, answers) => {
          const adapter = adapters[adapterName as keyof typeof adapters];
          if (!adapter) {
            return {
              success: false,
              reason: `unknown adapter "${adapterName}"`,
            };
          }
          return writeRepoScaffoldWithAgent(
            repoPath,
            adapter,
            adapterName,
            answers
          );
        },
        writeRepoScaffold,
        gitCommitAndPush,
        addProjectToConfig,
        defaultScaffoldAdapter: config.agent.default,
        configPath,
      });
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "project" && cmd.subcommand === "remove") {
    const name = cmd.args[0];
    if (!name) {
      console.error(`Usage: ${PRIMARY_CLI_NAME} project remove <name>`);
      process.exit(1);
    }
    try {
      if (!existsSync(configPath)) {
        console.error(`Config file not found. Run \`${PRIMARY_CLI_NAME} init\` first.`);
        process.exit(1);
      }
      const { removeProjectFromConfig } = await import("./project.ts");
      removeProjectFromConfig(configPath, name);
      console.log(`Removed project "${name}".`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "init") {
    const { runInit } = await import("./init.ts");
    await runInit(configPath);
    return;
  }

  if (cmd.command === "stop") {
    try {
      if (!existsSync(configPath)) {
        console.log(`${PRODUCT_NAME} is not running (no config file found).`);
        return;
      }
      const config = loadConfig(configPath);
      const { readPidFile } = await import("../pid.ts");
      const pid = readPidFile(config.storage.data_dir);
      if (pid === null) {
        console.log(`${PRODUCT_NAME} is not running (no PID file found).`);
        return;
      }
      try {
        process.kill(pid, "SIGTERM");
        console.log(`Stopped ${PRODUCT_NAME} daemon (PID ${pid}).`);
      } catch (error: any) {
        if (error.code === "ESRCH") {
          console.log(`${PRODUCT_NAME} is not running (stale PID ${pid}). Cleaning up.`);
          const { removePidFile } = await import("../pid.ts");
          removePidFile(config.storage.data_dir);
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "start") {
    if (!existsSync(configPath)) {
      const { CONFIG_TEMPLATE, writeConfigFile } = await import("../config/writer.ts");
      writeConfigFile(configPath, CONFIG_TEMPLATE);
      console.log(`Created config file: ${configPath}`);
      console.log("");
      console.log("Review this file, add your project details, and optionally configure Linear,");
        console.log(`then run \`${PRIMARY_CLI_NAME} start\` again.`);
      return;
    }

    console.log(`Starting ${PRODUCT_NAME} daemon...`);
    logger.info(`${PRODUCT_NAME} starting`);
    const { FelizServer } = await import("../server.ts");
    const server = new FelizServer(loadConfig(configPath));
    await server.start();
    return;
  }

  if (cmd.command === "auth") {
    if (cmd.subcommand !== "linear") {
      console.error(`Usage: ${PRIMARY_CLI_NAME} auth linear [--client-id <id>] [--client-secret <secret>] [--port <port>] [--callback-url <url>]`);
      process.exit(1);
    }
    const { runAuth } = await import("./auth.ts");
    await runAuth(configPath, cmd.flags);
    return;
  }

  if (cmd.command === "e2e") {
    const { runE2ECommand } = await import("./e2e.ts");
    const ok = runE2ECommand({
      subcommand: cmd.subcommand,
      configPath,
      flags: cmd.flags,
    });
    if (!ok) {
      process.exit(1);
    }
    return;
  }

  console.log(`Unknown command: ${cmd.command}. Run '${PRIMARY_CLI_NAME} --help' for usage.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
