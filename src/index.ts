export { Database } from "./db/database.ts";
export { createLogger } from "./logger/index.ts";
export { newId } from "./id.ts";

export {
  loadFelizConfig,
  loadRepoConfig,
  loadPipelineConfig,
  getDefaultPipeline,
  resolveEnvVars,
} from "./config/loader.ts";
export { renderTemplate } from "./config/template.ts";
export type {
  FelizConfig,
  RepoConfig,
  PipelineDefinition,
  PipelinePhase,
  PipelineStep,
  SuccessCondition,
  ProjectConfig,
} from "./config/types.ts";

export type { Project, Thread, ThreadStatus, Job, JobAuthor, HistoryEntry } from "./domain/types.ts";

export { LinearClient } from "./connectors/linear/client.ts";
export type { LinearIssue, FetchResult } from "./connectors/linear/client.ts";
export { WebhookHandler } from "./connectors/linear/webhook.ts";
export type { AgentSessionEvent, WebhookResult } from "./connectors/linear/webhook.ts";

export { WorkspaceManager, sanitizeIdentifier } from "./workspace/manager.ts";

export type { AgentAdapter, AgentRunParams, AgentRunResult } from "./agents/adapter.ts";
export { ClaudeCodeAdapter } from "./agents/claude-code.ts";
export { CodexAdapter } from "./agents/codex.ts";
export { OpenCodeAdapter } from "./agents/opencode.ts";

export { PipelineExecutor } from "./pipeline/executor.ts";
export type { ExecuteParams, ExecuteResult, AgentConfig, HooksConfig } from "./pipeline/executor.ts";

export { ContextAssembler } from "./context/assembler.ts";
export type { AssembledContext, MemoryItem, SpecItem } from "./context/assembler.ts";

export { threadRead, threadWrite } from "./cli/thread-agent.ts";

export { Orchestrator } from "./orchestrator/orchestrator.ts";

export { FelizServer } from "./server.ts";
