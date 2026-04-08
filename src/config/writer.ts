import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { stringify } from "yaml";
import {
  DOCS_REPOSITORY_URL,
  PRIMARY_CLI_NAME,
  PRODUCT_NAME,
} from "../branding.ts";
import { getDefaultPipeline } from "./loader.ts";

export const CONFIG_TEMPLATE = `# ${PRODUCT_NAME} configuration
# Docs: ${DOCS_REPOSITORY_URL}

linear:
  oauth_token: $LINEAR_OAUTH_TOKEN  # Set this environment variable

webhook:
  port: 3421

storage:
  data_dir: /data/feliz
  workspace_root: /data/feliz/workspaces

agent:
  default: claude-code

projects: []
`;

export interface InitAnswers {
  oauthToken: string;
}

export function generateConfig(answers: InitAnswers): string {
  return `# ${PRODUCT_NAME} configuration
# Docs: ${DOCS_REPOSITORY_URL}

linear:
  oauth_token: ${answers.oauthToken}

webhook:
  port: 3421

storage:
  data_dir: /data/feliz
  workspace_root: /data/feliz/workspaces

agent:
  default: claude-code

projects: []
`;
}

export function writeConfigFile(configPath: string, content: string): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, content, "utf-8");
}

export interface RepoScaffoldAnswers {
  agentAdapter: string;
  specsEnabled: boolean;
  specsDirectory?: string;
  testCommand?: string;
  lintCommand?: string;
}

export function generateRepoConfig(answers: RepoScaffoldAnswers): string {
  const doc: Record<string, unknown> = {
    agent: {
      adapter: answers.agentAdapter,
    },
    specs: {
      enabled: answers.specsEnabled,
      ...(answers.specsEnabled && answers.specsDirectory
        ? { directory: answers.specsDirectory }
        : {}),
    },
  };

  if (answers.testCommand || answers.lintCommand) {
    const gates: Record<string, string> = {};
    if (answers.testCommand) gates.test_command = answers.testCommand;
    if (answers.lintCommand) gates.lint_command = answers.lintCommand;
    doc.gates = gates;
  }

  return stringify(doc);
}

export function generatePipelineYml(agentAdapter: string = "claude-code", testCommand?: string): string {
  return stringify(getDefaultPipeline(agentAdapter, testCommand));
}

export function generateWorkflowMd(): string {
  return `# System Prompt

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Context

Run \`${PRIMARY_CLI_NAME} thread read\` to see project memory, specs, and thread jobs.
Run \`${PRIMARY_CLI_NAME} thread write <message>\` to append new jobs to the current thread.
Project memory is in \`.feliz/context/memory/\` — read and write files there directly.
Specs are in \`specs/\`.

## Instructions

- Follow the coding conventions in this repository
- Write tests for new functionality
- Do not modify unrelated code
`;
}
