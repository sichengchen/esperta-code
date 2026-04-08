import type { Database } from "../db/database.ts";
import type { CliCommand } from "./commands.ts";
import { ThreadService } from "../core/service.ts";
import { WorkspaceManager } from "../workspace/manager.ts";
import { PRIMARY_CLI_NAME } from "../branding.ts";
import {
  deriveSummaryFromInstruction,
  findProjectConfig,
  openCoreDb,
  projectIdFromName,
} from "./core-support.ts";

function requireFlag(flags: Record<string, string>, key: string, usage: string): string {
  const value = flags[key];
  if (!value) {
    throw new Error(usage);
  }
  return value;
}

function requireInstructionFlag(
  flags: Record<string, string>,
  usage: string
): string {
  const instruction = flags.instruction ?? flags.goal;
  if (!instruction) {
    throw new Error(usage);
  }
  return instruction;
}

function resolveSummaryFlag(
  flags: Record<string, string>,
  instruction?: string
): string | undefined {
  const summary = flags.summary ?? flags.title;
  if (summary) {
    return summary;
  }
  return instruction ? deriveSummaryFromInstruction(instruction) : undefined;
}

function printThread(thread: ReturnType<Database["getThread"]>) {
  if (!thread) return;
  console.log(`Thread:   ${thread.id}`);
  console.log(`Project:  ${thread.project_id}`);
  console.log(`Status:   ${thread.status}`);
  console.log(`Summary:  ${thread.title}`);
  console.log(`Branch:   ${thread.branch_name}`);
  console.log(`Base:     ${thread.base_branch}`);
  if (thread.current_pr_url) {
    console.log(`PR:       ${thread.current_pr_url}`);
  }
}

export async function handleCoreCliCommand(
  cmd: CliCommand,
  configPath: string
): Promise<boolean> {
  if (
    !["submit", "continue", "thread", "job", "worktree", "event"].includes(
      cmd.command
    )
  ) {
    return false;
  }

  const { config, db } = openCoreDb(configPath);
  const threadService = new ThreadService(db);

  try {
    const isThreadStart =
      (cmd.command === "thread" && cmd.subcommand === "start") ||
      cmd.command === "submit";
    const isThreadContinue =
      (cmd.command === "thread" && cmd.subcommand === "continue") ||
      cmd.command === "continue";

    if (isThreadStart) {
      const usage = `Usage: ${PRIMARY_CLI_NAME} thread start --project <name> --instruction <text> [--summary <text>] [--job-type <type>] [--prompt <prompt>]`;
      const projectName = requireFlag(
        cmd.flags,
        "project",
        usage
      );
      const instruction = requireInstructionFlag(cmd.flags, usage);
      const summary = resolveSummaryFlag(cmd.flags, instruction)!;

      findProjectConfig(config, projectName);
      const created = threadService.createThread({
        project_id: projectIdFromName(projectName),
        title: summary,
        requested_by: {
          type: "cli",
          id: process.env.USER ?? "cli",
        },
        initial_job: {
          job_type: cmd.flags["job-type"] ?? "implement",
          title: summary,
          goal: instruction,
          prompt_payload: {
            prompt: cmd.flags.prompt ?? instruction,
          },
        },
      });

      console.log(`Created thread ${created.thread.id}`);
      if (created.job) {
        console.log(`Queued job ${created.job.id} (${created.job.job_type})`);
      }
      return true;
    }

    if (isThreadContinue) {
      const usage = `Usage: ${PRIMARY_CLI_NAME} thread continue <thread-id> --instruction <text> [--summary <text>] [--job-type <type>] [--prompt <prompt>]`;
      const threadId =
        cmd.command === "continue" ? cmd.subcommand ?? cmd.args[0] : cmd.args[0];
      if (!threadId) {
        throw new Error(usage);
      }

      const instruction = requireInstructionFlag(cmd.flags, usage);
      const summary = resolveSummaryFlag(cmd.flags, instruction)!;

      const job = threadService.continueThread(threadId, {
        job_type: cmd.flags["job-type"] ?? "continue",
        title: summary,
        goal: instruction,
        prompt_payload: {
          prompt: cmd.flags.prompt ?? instruction,
        },
        requested_by: {
          type: "cli",
          id: process.env.USER ?? "cli",
        },
      });

      console.log(`Queued job ${job.id} on thread ${job.thread_id}`);
      return true;
    }

    if (cmd.command === "thread" && cmd.subcommand === "create") {
      const usage = `Usage: ${PRIMARY_CLI_NAME} thread create --project <name> --summary <text> [--instruction <text>] [--job-type <type>] [--prompt <prompt>]`;
      const projectName = requireFlag(
        cmd.flags,
        "project",
        usage
      );
      const instruction = cmd.flags.instruction ?? cmd.flags.goal;
      const summary = resolveSummaryFlag(cmd.flags, instruction);
      if (!summary) {
        throw new Error(usage);
      }

      findProjectConfig(config, projectName);
      const created = threadService.createThread({
        project_id: projectIdFromName(projectName),
        title: summary,
        requested_by: {
          type: "cli",
          id: process.env.USER ?? "cli",
        },
        ...(instruction
          ? {
              initial_job: {
                job_type: cmd.flags["job-type"] ?? "implement",
                title: summary,
                goal: instruction,
                prompt_payload: {
                  prompt: cmd.flags.prompt ?? instruction,
                },
              },
            }
          : {}),
      });

      printThread(created.thread);
      if (created.job) {
        console.log(`Job:      ${created.job.id} (${created.job.job_type})`);
      }
      return true;
    }

    if (cmd.command === "thread" && cmd.subcommand === "list") {
      const threads = db.listThreads();
      if (threads.length === 0) {
        console.log("No threads found.");
        return true;
      }

      console.log("ID            Status         Project           Summary");
      console.log("─".repeat(90));
      for (const thread of threads) {
        console.log(
          `${thread.id.padEnd(14)}${thread.status.padEnd(15)}${thread.project_id.padEnd(18)}${thread.title}`
        );
      }
      return true;
    }

    if (cmd.command === "thread" && cmd.subcommand === "show") {
      const threadId = cmd.args[0];
      if (!threadId) {
        throw new Error(`Usage: ${PRIMARY_CLI_NAME} thread show <thread-id>`);
      }

      const thread = db.getThread(threadId);
      if (!thread) {
        throw new Error(`Thread not found: ${threadId}`);
      }

      printThread(thread);
      const jobs = db.listJobsForThread(thread.id);
      const links = db.listThreadLinks(thread.id);
      const events = db.listExternalEventsForThread(thread.id);
      if (jobs.length > 0) {
        console.log("\nJobs:");
        for (const job of jobs) {
          console.log(`  ${job.id}  ${job.status}  ${job.job_type}  ${job.title}`);
        }
      }
      if (links.length > 0) {
        console.log("\nLinks:");
        for (const link of links) {
          console.log(`  ${link.label}: ${link.url ?? link.external_id}`);
        }
      }
      if (events.length > 0) {
        console.log(`\nEvents: ${events.length}`);
      }
      return true;
    }

    if (cmd.command === "job" && cmd.subcommand === "list") {
      const threadId = cmd.args[0] ?? cmd.flags.thread;
      const jobs = threadId ? db.listJobsForThread(threadId) : db.listJobs();
      if (jobs.length === 0) {
        console.log("No jobs found.");
        return true;
      }

      console.log("ID            Status              Type         Thread");
      console.log("─".repeat(90));
      for (const job of jobs) {
        console.log(
          `${job.id.padEnd(14)}${job.status.padEnd(20)}${job.job_type.padEnd(13)}${job.thread_id}`
        );
      }
      return true;
    }

    if (cmd.command === "job" && cmd.subcommand === "show") {
      const jobId = cmd.args[0];
      if (!jobId) {
        throw new Error(`Usage: ${PRIMARY_CLI_NAME} job show <job-id>`);
      }

      const job = db.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      console.log(`Job:      ${job.id}`);
      console.log(`Thread:   ${job.thread_id}`);
      console.log(`Status:   ${job.status}`);
      console.log(`Type:     ${job.job_type}`);
      console.log(`Agent:    ${job.agent_adapter}`);
      console.log(`Write:    ${job.write_mode}`);
      console.log(`Summary:  ${job.title}`);
      console.log(`Instruction: ${job.goal}`);
      const run = db.getLatestRunRecordForJob(job.id);
      if (run) {
        console.log(`Run:      ${run.id} (${run.status})`);
      }
      const artifacts = db.listArtifactsForJob(job.id);
      if (artifacts.length > 0) {
        console.log(`Artifacts: ${artifacts.length}`);
      }
      return true;
    }

    if (cmd.command === "job" && cmd.subcommand === "logs") {
      const jobId = cmd.args[0];
      if (!jobId) {
        throw new Error(`Usage: ${PRIMARY_CLI_NAME} job logs <job-id>`);
      }

      const artifacts = db.listArtifactsForJob(jobId).filter((artifact) =>
        ["agent_stdout", "agent_stderr", "verification"].includes(artifact.kind)
      );
      if (artifacts.length === 0) {
        console.log("No logs found.");
        return true;
      }

      for (const artifact of artifacts) {
        console.log(`${artifact.kind}: ${artifact.path}`);
      }
      return true;
    }

    if (cmd.command === "job" && cmd.subcommand === "retry") {
      const jobId = cmd.args[0];
      if (!jobId) {
        throw new Error(`Usage: ${PRIMARY_CLI_NAME} job retry <job-id>`);
      }

      const job = db.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      if (!["failed", "cancelled"].includes(job.status)) {
        throw new Error(`Job ${job.id} is not retryable from "${job.status}"`);
      }

      db.updateJob(job.id, { status: "retry_queued" });
      db.updateThreadStatus(job.thread_id, "active");
      console.log(`Queued ${job.id} for retry.`);
      return true;
    }

    if (cmd.command === "job" && cmd.subcommand === "cancel") {
      const jobId = cmd.args[0];
      if (!jobId) {
        throw new Error(`Usage: ${PRIMARY_CLI_NAME} job cancel <job-id>`);
      }

      const job = db.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      db.updateJob(job.id, { status: "cancelled" });
      db.updateThreadStatus(job.thread_id, "blocked");
      console.log(`Cancelled ${job.id}.`);
      return true;
    }

    if (cmd.command === "job" && cmd.subcommand === "approve") {
      const jobId = cmd.args[0];
      if (!jobId) {
        throw new Error(`Usage: ${PRIMARY_CLI_NAME} job approve <job-id>`);
      }

      const job = db.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      db.updateJob(job.id, {
        status: job.status === "waiting_approval" ? "queued" : job.status,
      });
      console.log(`Approved ${job.id}.`);
      return true;
    }

    if (cmd.command === "worktree" && cmd.subcommand === "list") {
      const worktrees = db.listWorktrees();
      if (worktrees.length === 0) {
        console.log("No worktrees found.");
        return true;
      }

      console.log("ID            State        Thread           Path");
      console.log("─".repeat(110));
      for (const worktree of worktrees) {
        console.log(
          `${worktree.id.padEnd(14)}${worktree.state.padEnd(13)}${worktree.thread_id.padEnd(17)}${worktree.path}`
        );
      }
      return true;
    }

    if (cmd.command === "worktree" && cmd.subcommand === "inspect") {
      const worktreeId = cmd.args[0];
      if (!worktreeId) {
        throw new Error(`Usage: ${PRIMARY_CLI_NAME} worktree inspect <id>`);
      }

      const worktree = db.getWorktreeRecord(worktreeId);
      if (!worktree) {
        throw new Error(`Worktree not found: ${worktreeId}`);
      }

      console.log(`Worktree: ${worktree.id}`);
      console.log(`Thread:   ${worktree.thread_id}`);
      console.log(`State:    ${worktree.state}`);
      console.log(`Branch:   ${worktree.branch_name}`);
      console.log(`Path:     ${worktree.path}`);
      if (worktree.retained_until) {
        console.log(`Retain:   ${worktree.retained_until.toISOString()}`);
      }
      return true;
    }

    if (cmd.command === "worktree" && cmd.subcommand === "prune") {
      const workspace = new WorkspaceManager(
        config.runtime?.worktree_root ?? config.storage.workspace_root
      );
      const now = new Date();
      let removed = 0;

      for (const worktree of db.listWorktrees()) {
        if (worktree.state !== "retained" || worktree.pinned) {
          continue;
        }
        if (!worktree.retained_until || worktree.retained_until > now) {
          continue;
        }

        const project = db.getCoreProject(worktree.project_id);
        if (project) {
          await workspace.removeWorktreePath(project.name, worktree.path);
        }
        db.updateWorktreeRecord(worktree.id, {
          state: "deleted",
          deleted_at: now,
        });
        removed += 1;
      }

      console.log(`Pruned ${removed} worktree(s).`);
      return true;
    }

    if (cmd.command === "event" && cmd.subcommand === "attach") {
      const threadId = cmd.args[0];
      if (!threadId) {
        throw new Error(
          `Usage: ${PRIMARY_CLI_NAME} event attach <thread-id> --type <type> --source <kind> --source-id <id> [--body <text>]`
        );
      }

      const event = threadService.attachExternalEvent(threadId, {
        source_kind: requireFlag(
          cmd.flags,
          "source",
          `Usage: ${PRIMARY_CLI_NAME} event attach <thread-id> --type <type> --source <kind> --source-id <id> [--body <text>]`
        ),
        source_id: requireFlag(
          cmd.flags,
          "source-id",
          `Usage: ${PRIMARY_CLI_NAME} event attach <thread-id> --type <type> --source <kind> --source-id <id> [--body <text>]`
        ),
        event_type: requireFlag(
          cmd.flags,
          "type",
          `Usage: ${PRIMARY_CLI_NAME} event attach <thread-id> --type <type> --source <kind> --source-id <id> [--body <text>]`
        ),
        payload: {
          body: cmd.flags.body ?? "",
        },
      });

      console.log(`Attached event ${event.id} to thread ${event.thread_id}.`);
      return true;
    }
  } finally {
    db.close();
  }

  return false;
}
