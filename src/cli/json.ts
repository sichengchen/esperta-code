import type { Job, Thread, WorktreeRecord } from "../core/types.ts";
import { ThreadService } from "../core/service.ts";
import type { Database } from "../db/database.ts";
import type { CliCommand } from "./commands.ts";
import {
  buildDefaultJobTypes,
  findProjectConfig,
  findProjectConfigById,
  openCoreDb,
  projectIdFromName,
} from "./core-support.ts";
import { PRIMARY_CLI_NAME, PRODUCT_NAME } from "../branding.ts";

const JSON_CLI_VERSION = "v1";
const JSON_ACTIONS = [
  "capabilities",
  "project.list",
  "submit",
  "continue",
  "thread.list",
  "thread.get",
  "job.list",
  "job.get",
  "job.retry",
  "job.cancel",
  "job.approve",
  "worktree.list",
  "worktree.get",
  "event.attach",
] as const;

type JsonAction = (typeof JSON_ACTIONS)[number];

export interface JsonCliRequest {
  version: "v1";
  id?: string;
  client?: Record<string, unknown>;
  action: JsonAction | string;
  input?: Record<string, unknown>;
}

interface JsonRequestedBy {
  type: string;
  id: string;
  [key: string]: unknown;
}

export interface JsonCliError {
  code: string;
  message: string;
  details?: unknown;
}

export interface JsonCliSuccessResponse {
  version: "v1";
  id?: string;
  action: string;
  ok: true;
  result: unknown;
}

export interface JsonCliErrorResponse {
  version: "v1";
  id?: string;
  action?: string;
  ok: false;
  error: JsonCliError;
}

export type JsonCliResponse = JsonCliSuccessResponse | JsonCliErrorResponse;

class JsonCliRequestError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function invalidRequest(message: string, details?: unknown): never {
  throw new JsonCliRequestError("invalid_request", message, details);
}

function notFound(message: string, details?: unknown): never {
  throw new JsonCliRequestError("not_found", message, details);
}

function unknownAction(action: string): never {
  throw new JsonCliRequestError("unknown_action", `Unsupported action: ${action}`);
}

function asObject(
  value: unknown,
  fieldName: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidRequest(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  value: Record<string, unknown>,
  fieldName: string,
  aliases: string[] = []
): string {
  const candidate = [fieldName, ...aliases]
    .map((key) => value[key])
    .find((entry) => typeof entry === "string" && entry.trim().length > 0);

  if (typeof candidate !== "string") {
    invalidRequest(`Missing required string field: ${fieldName}`);
  }

  return candidate.trim();
}

function optionalString(
  value: Record<string, unknown>,
  fieldName: string,
  aliases: string[] = []
): string | undefined {
  const candidate = [fieldName, ...aliases].map((key) => value[key]).find((entry) => {
    return typeof entry === "string" && entry.trim().length > 0;
  });

  return typeof candidate === "string" ? candidate.trim() : undefined;
}

function optionalNumber(
  value: Record<string, unknown>,
  fieldName: string
): number | undefined {
  const candidate = value[fieldName];
  if (candidate === undefined || candidate === null) {
    return undefined;
  }
  if (typeof candidate !== "number" || Number.isNaN(candidate)) {
    invalidRequest(`${fieldName} must be a number`);
  }
  return candidate;
}

function optionalStringArray(
  value: Record<string, unknown>,
  fieldName: string
): string[] | undefined {
  const candidate = value[fieldName];
  if (candidate === undefined || candidate === null) {
    return undefined;
  }
  if (!Array.isArray(candidate) || candidate.some((entry) => typeof entry !== "string")) {
    invalidRequest(`${fieldName} must be an array of strings`);
  }
  return candidate as string[];
}

function optionalRecord(
  value: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> | undefined {
  const candidate = value[fieldName];
  if (candidate === undefined || candidate === null) {
    return undefined;
  }
  return asObject(candidate, fieldName);
}

function parseRequest(raw: string): JsonCliRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    invalidRequest("Request body must be valid JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const request = asObject(parsed, "request");
  if (request.version !== JSON_CLI_VERSION) {
    invalidRequest(`Unsupported request version: ${String(request.version ?? "")}`);
  }

  if (typeof request.action !== "string" || request.action.trim().length === 0) {
    invalidRequest("Missing required string field: action");
  }

  if (request.id !== undefined && typeof request.id !== "string") {
    invalidRequest("id must be a string");
  }

  if (request.client !== undefined) {
    asObject(request.client, "client");
  }

  if (request.input !== undefined) {
    asObject(request.input, "input");
  }

  return {
    version: JSON_CLI_VERSION,
    ...(typeof request.id === "string" ? { id: request.id } : {}),
    ...(request.client ? { client: request.client as Record<string, unknown> } : {}),
    action: request.action as string,
    ...(request.input ? { input: request.input as Record<string, unknown> } : {}),
  };
}

function normalizeRequestedBy(
  request: JsonCliRequest,
  input: Record<string, unknown>
): JsonRequestedBy {
  const requestedBy = optionalRecord(input, "requested_by");
  if (requestedBy) {
    const type = optionalString(requestedBy, "type");
    const id = optionalString(requestedBy, "id");
    if (!type || !id) {
      invalidRequest("requested_by must include type and id");
    }
    return {
      ...requestedBy,
      type,
      id,
    };
  }

  const client = request.client ? asObject(request.client, "client") : undefined;
  const clientName = client && typeof client.name === "string" && client.name.trim().length > 0
    ? client.name.trim()
    : "local-agent";

  return {
    type: "local_agent",
    id: clientName,
    ...(client ? { client } : {}),
  };
}

function serializeForJson(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeForJson(entry));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = serializeForJson(nested);
    }
    return out;
  }

  return value;
}

function responseEnvelope(
  request: Partial<JsonCliRequest>,
  result: unknown
): JsonCliSuccessResponse {
  return {
    version: JSON_CLI_VERSION,
    ...(request.id ? { id: request.id } : {}),
    action: request.action ?? "unknown",
    ok: true,
    result: serializeForJson(result),
  };
}

function errorEnvelope(
  request: Partial<JsonCliRequest>,
  error: JsonCliRequestError | Error
): JsonCliErrorResponse {
  return {
    version: JSON_CLI_VERSION,
    ...(request.id ? { id: request.id } : {}),
    ...(request.action ? { action: request.action } : {}),
    ok: false,
    error:
      error instanceof JsonCliRequestError
        ? {
            code: error.code,
            message: error.message,
            ...(error.details !== undefined
              ? { details: serializeForJson(error.details) }
              : {}),
          }
        : {
            code: "internal_error",
            message: error.message || "Unexpected error",
          },
  };
}

function ensureThread(db: Database, threadId: string): Thread {
  const thread = db.getThread(threadId);
  if (!thread) {
    notFound(`Thread not found: ${threadId}`);
  }
  return thread;
}

function ensureJob(db: Database, jobId: string): Job {
  const job = db.getJob(jobId);
  if (!job) {
    notFound(`Job not found: ${jobId}`);
  }
  return job;
}

function ensureWorktree(db: Database, worktreeId: string): WorktreeRecord {
  const worktree = db.getWorktreeRecord(worktreeId);
  if (!worktree) {
    notFound(`Worktree not found: ${worktreeId}`);
  }
  return worktree;
}

function getLatestJobForThread(db: Database, threadId: string): Job | null {
  const jobs = db.listJobsForThread(threadId);
  return jobs.length > 0 ? jobs[jobs.length - 1]! : null;
}

function projectSummary(configPathResult: ReturnType<typeof openCoreDb>["config"]) {
  return configPathResult.projects.map((project) => ({
    id: projectIdFromName(project.name),
    name: project.name,
    repo_url: project.repo,
    default_branch: project.base_branch ?? project.branch,
    concurrency: project.concurrency ?? {},
    worktree_policy: project.worktrees ?? {},
    job_types: Object.keys(buildDefaultJobTypes(project, configPathResult)),
  }));
}

function resolveProjectInput(
  config: ReturnType<typeof openCoreDb>["config"],
  input: Record<string, unknown>
): { projectId: string; projectName: string } {
  const projectName = optionalString(input, "project");
  const projectId = optionalString(input, "project_id");

  if (!projectName && !projectId) {
    invalidRequest("submit requires project or project_id");
  }

  if (projectName && projectId && projectIdFromName(projectName) !== projectId) {
    invalidRequest("project and project_id refer to different projects");
  }

  if (projectName) {
    return {
      projectId: projectIdFromName(findProjectConfig(config, projectName).name),
      projectName,
    };
  }

  const project = findProjectConfigById(config, projectId!);
  return {
    projectId: projectId!,
    projectName: project.name,
  };
}

function buildPromptPayload(
  input: Record<string, unknown>,
  fallbackGoal: string
): Record<string, unknown> {
  const promptPayload = optionalRecord(input, "prompt_payload");
  if (promptPayload) {
    return promptPayload;
  }

  const prompt = optionalString(input, "prompt");
  return {
    prompt: prompt ?? fallbackGoal,
  };
}

function buildThreadSnapshot(db: Database, threadId: string) {
  const thread = ensureThread(db, threadId);
  const project = db.getCoreProject(thread.project_id);
  const jobs = db.listJobsForThread(threadId);
  const latestJob = jobs.length > 0 ? jobs[jobs.length - 1]! : null;
  const latestRun = latestJob ? db.getLatestRunRecordForJob(latestJob.id) : null;

  return {
    thread,
    project,
    jobs,
    latest_job: latestJob,
    latest_run: latestRun,
    worktrees: db.listWorktrees(threadId),
    artifacts: db.listArtifactsForThread(threadId),
    approvals: db.listApprovalsForThread(threadId),
    events: db.listExternalEventsForThread(threadId),
    links: db.listThreadLinks(threadId),
  };
}

async function dispatchJsonRequest(
  request: JsonCliRequest,
  configPath: string
): Promise<unknown> {
  const { config, db } = openCoreDb(configPath);
  const threadService = new ThreadService(db);
  const input = request.input ?? {};

  try {
    switch (request.action) {
      case "capabilities":
        return {
          name: PRODUCT_NAME,
          cli: PRIMARY_CLI_NAME,
          version: JSON_CLI_VERSION,
          transport: "stdin_stdout",
          actions: [...JSON_ACTIONS],
        };
      case "project.list":
        return {
          projects: projectSummary(config),
        };
      case "submit": {
        const { projectId, projectName } = resolveProjectInput(config, input);
        const title = requireString(input, "title");
        const goal = requireString(input, "goal");
        const created = threadService.createThread({
          project_id: projectId,
          title,
          requested_by: normalizeRequestedBy(request, input),
          metadata: optionalRecord(input, "thread_metadata") ?? {},
          initial_job: {
            job_type: optionalString(input, "job_type") ?? "implement",
            title,
            goal,
            prompt_payload: buildPromptPayload(input, goal),
            agent_adapter: optionalString(input, "agent_adapter"),
            approval_policy: optionalString(input, "approval_policy"),
            publish_policy: optionalString(input, "publish_policy"),
            verification_commands: optionalStringArray(input, "verification_commands"),
            priority: optionalNumber(input, "priority"),
            write_mode:
              (optionalString(input, "write_mode") as "workspace_write" | "read_only" | undefined),
            timeout_ms: optionalNumber(input, "timeout_ms"),
            retry_limit: optionalNumber(input, "retry_limit"),
            metadata: optionalRecord(input, "job_metadata") ?? {},
          },
        });

        return {
          project: {
            id: projectId,
            name: projectName,
          },
          thread: created.thread,
          job: created.job,
        };
      }
      case "continue": {
        const threadId = requireString(input, "thread_id");
        ensureThread(db, threadId);
        const title = requireString(input, "title");
        const goal = requireString(input, "goal");
        const job = threadService.continueThread(threadId, {
          job_type: optionalString(input, "job_type") ?? "continue",
          title,
          goal,
          prompt_payload: buildPromptPayload(input, goal),
          requested_by: normalizeRequestedBy(request, input),
          agent_adapter: optionalString(input, "agent_adapter"),
          approval_policy: optionalString(input, "approval_policy"),
          publish_policy: optionalString(input, "publish_policy"),
          verification_commands: optionalStringArray(input, "verification_commands"),
          priority: optionalNumber(input, "priority"),
          write_mode:
            (optionalString(input, "write_mode") as "workspace_write" | "read_only" | undefined),
          timeout_ms: optionalNumber(input, "timeout_ms"),
          retry_limit: optionalNumber(input, "retry_limit"),
          metadata: optionalRecord(input, "job_metadata") ?? {},
        });

        return {
          thread: ensureThread(db, threadId),
          job,
        };
      }
      case "thread.list": {
        const projectName = optionalString(input, "project");
        const projectId = optionalString(input, "project_id");
        const status = optionalString(input, "status");
        let threads = projectName
          ? db.listThreads(projectIdFromName(findProjectConfig(config, projectName).name))
          : projectId
            ? db.listThreads(findProjectConfigById(config, projectId).name ? projectId : projectId)
            : db.listThreads();

        if (status) {
          threads = threads.filter((thread) => thread.status === status);
        }

        return {
          threads,
        };
      }
      case "thread.get": {
        const threadId = requireString(input, "thread_id", ["id"]);
        return buildThreadSnapshot(db, threadId);
      }
      case "job.list": {
        const threadId = optionalString(input, "thread_id");
        if (threadId) {
          ensureThread(db, threadId);
        }
        return {
          jobs: threadId ? db.listJobsForThread(threadId) : db.listJobs(),
        };
      }
      case "job.get": {
        const jobId = requireString(input, "job_id", ["id"]);
        const job = ensureJob(db, jobId);
        const latestRun = db.getLatestRunRecordForJob(job.id);
        return {
          job,
          thread: ensureThread(db, job.thread_id),
          latest_run: latestRun,
          worktree:
            latestRun?.worktree_id ? db.getWorktreeRecord(latestRun.worktree_id) : null,
          artifacts: db.listArtifactsForJob(job.id),
          approvals: db
            .listApprovalsForThread(job.thread_id)
            .filter((approval) => approval.job_id === job.id),
        };
      }
      case "job.retry": {
        const jobId = requireString(input, "job_id", ["id"]);
        const job = ensureJob(db, jobId);
        if (!["failed", "cancelled"].includes(job.status)) {
          invalidRequest(`Job ${job.id} is not retryable from "${job.status}"`);
        }
        db.updateJob(job.id, { status: "retry_queued" });
        db.updateThreadStatus(job.thread_id, "active");
        return {
          job: ensureJob(db, jobId),
          thread: ensureThread(db, job.thread_id),
        };
      }
      case "job.cancel": {
        const jobId = requireString(input, "job_id", ["id"]);
        const job = ensureJob(db, jobId);
        db.updateJob(job.id, { status: "cancelled" });
        db.updateThreadStatus(job.thread_id, "blocked");
        return {
          job: ensureJob(db, jobId),
          thread: ensureThread(db, job.thread_id),
        };
      }
      case "job.approve": {
        const jobId = requireString(input, "job_id", ["id"]);
        const job = ensureJob(db, jobId);
        db.updateJob(job.id, {
          status: job.status === "waiting_approval" ? "queued" : job.status,
        });
        return {
          job: ensureJob(db, jobId),
          thread: ensureThread(db, job.thread_id),
        };
      }
      case "worktree.list": {
        const threadId = optionalString(input, "thread_id");
        if (threadId) {
          ensureThread(db, threadId);
        }
        return {
          worktrees: db.listWorktrees(threadId),
        };
      }
      case "worktree.get": {
        const worktreeId = requireString(input, "worktree_id", ["id"]);
        const worktree = ensureWorktree(db, worktreeId);
        const latestJob = getLatestJobForThread(db, worktree.thread_id);
        return {
          worktree,
          thread: ensureThread(db, worktree.thread_id),
          latest_job: latestJob,
          latest_run: latestJob ? db.getLatestRunRecordForJob(latestJob.id) : null,
        };
      }
      case "event.attach": {
        const threadId = requireString(input, "thread_id");
        const event = threadService.attachExternalEvent(threadId, {
          source_kind: requireString(input, "source_kind", ["source"]),
          source_id: requireString(input, "source_id"),
          event_type: requireString(input, "event_type", ["type"]),
          payload:
            optionalRecord(input, "payload") ??
            (() => {
              const body = optionalString(input, "body");
              return body ? { body } : {};
            })(),
        });
        return {
          thread: ensureThread(db, threadId),
          event,
        };
      }
      default:
        unknownAction(request.action);
    }
  } finally {
    db.close();
  }
}

export async function executeJsonRequest(
  configPath: string,
  request: JsonCliRequest
): Promise<JsonCliResponse> {
  try {
    return responseEnvelope(request, await dispatchJsonRequest(request, configPath));
  } catch (error) {
    return errorEnvelope(
      request,
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

export async function handleJsonCliCommand(
  cmd: CliCommand,
  configPath: string,
  requestText?: string
): Promise<boolean> {
  if (cmd.command !== "json") {
    return false;
  }

  let request: Partial<JsonCliRequest> = {};

  try {
    const rawRequest = requestText ?? (await Bun.stdin.text());
    if (!rawRequest.trim()) {
      throw new JsonCliRequestError(
        "invalid_request",
        `Usage: echo '{"version":"v1","action":"capabilities"}' | ${PRIMARY_CLI_NAME} json`
      );
    }

    request = parseRequest(rawRequest);
    const response = await executeJsonRequest(configPath, request as JsonCliRequest);
    console.log(JSON.stringify(response));
    return true;
  } catch (error) {
    const wrapped =
      error instanceof Error ? error : new Error(String(error));
    console.log(JSON.stringify(errorEnvelope(request, wrapped)));
    return true;
  }
}
