// Core
export { Database } from "./db/database.ts";
export { createLogger } from "./logger/index.ts";
export { newId } from "./id.ts";
export {
  executeJsonRequest,
  handleJsonCliCommand,
} from "./cli/json.ts";
export type {
  JsonCliError,
  JsonCliErrorResponse,
  JsonCliRequest,
  JsonCliResponse,
  JsonCliSuccessResponse,
} from "./cli/json.ts";

// Config
export { loadFelizConfig, loadRepoConfig, loadPipelineConfig, getDefaultPipeline, resolveEnvVars } from "./config/loader.ts";
export { renderTemplate } from "./config/template.ts";
export type { FelizConfig, RepoConfig, PipelineDefinition, PipelinePhase, PipelineStep, SuccessCondition, ProjectConfig } from "./config/types.ts";

// Domain
export type { Project, WorkItem, Run, StepExecution, HistoryEntry, OrchestrationState, RunResult, StepResult, ContextSnapshot, ArtifactRef } from "./domain/types.ts";

// Core
export type {
  Approval,
  ApprovalState,
  Artifact,
  CoreProject,
  ExternalEvent,
  Job,
  JobState,
  JobTypeProfile,
  PublishBehavior,
  RunRecord,
  RunState,
  Thread,
  ThreadLink,
  ThreadState,
  WorktreeRecord,
  WorktreeState,
  WriteMode,
} from "./core/types.ts";
export { ThreadService } from "./core/service.ts";
export { JobExecutor } from "./core/executor.ts";

// Connectors
export { LinearClient, WebhookHandler, parseCommand } from "./connectors/linear/index.ts";
export type {
  FetchResult,
  FelizCommand,
  LinearIssue,
  AgentSessionEvent,
  WebhookResult,
} from "./connectors/linear/index.ts";

// Workspace
export {
  WorkspaceManager,
  computeRetentionDeadline,
  sanitizeIdentifier,
} from "./workspace/manager.ts";

// Agents
export type { AgentAdapter, AgentRunParams, AgentRunResult } from "./agents/adapter.ts";
export { ClaudeCodeAdapter } from "./agents/claude-code.ts";
export { CodexAdapter } from "./agents/codex.ts";
export { OpenCodeAdapter } from "./agents/opencode.ts";

// Pipeline
export { PipelineExecutor } from "./pipeline/executor.ts";
export type { ExecuteParams, ExecuteResult, AgentConfig, HooksConfig } from "./pipeline/executor.ts";

// Context
export { ContextAssembler } from "./context/assembler.ts";
export type { AssembledContext, MemoryItem, ScratchpadItem, SpecItem } from "./context/assembler.ts";

// Orchestrator
export { Orchestrator } from "./orchestrator/orchestrator.ts";
export { canTransition, getValidTransitions, nextStateForNewIssue } from "./orchestrator/state-machine.ts";
export { ConcurrencyManager } from "./orchestrator/concurrency.ts";
export { computeRetryDelay, shouldRetry } from "./orchestrator/retry.ts";
export { SpecEngine } from "./orchestrator/spec-engine.ts";
export { DecompositionEngine } from "./orchestrator/decomposition.ts";
export type { SubIssueProposal } from "./orchestrator/decomposition.ts";

// Server
export { FelizServer } from "./server.ts";
