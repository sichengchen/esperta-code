import type { AgentAdapter, AgentRunResult } from "../agents/adapter.ts";
import type { PipelineDefinition, SuccessCondition } from "../config/types.ts";
import { existsSync } from "fs";
import { join } from "path";

export interface AgentConfig {
  approval_policy: "auto" | "gated" | "suggest";
  timeout_ms: number;
  max_turns: number;
  defaultAgent?: string;
}

export interface HooksConfig {
  before_run?: string;
  after_run?: string;
}

export interface StepResult {
  phaseName: string;
  stepName: string;
  cycle: number;
  attempt: number;
  agentResult: AgentRunResult | null;
  success: boolean;
}

export interface ExecuteParams {
  threadId: string;
  workDir: string;
  pipeline: PipelineDefinition;
  promptRenderer: (phaseName: string, stepName: string, cycle: number) => string;
  afterStep?: (result: StepResult) => void;
  env?: Record<string, string>;
}

export interface ExecuteResult {
  success: boolean;
  failureReason?: string;
  warnings: string[];
  lastAgentResult?: AgentRunResult | null;
}

export class PipelineExecutor {
  private adapters: Record<string, AgentAdapter>;
  private agentConfig: AgentConfig;
  private hooks: HooksConfig;

  constructor(
    adapters: Record<string, AgentAdapter>,
    agentConfig?: AgentConfig,
    hooks?: HooksConfig
  ) {
    this.adapters = adapters;
    this.agentConfig = agentConfig ?? {
      approval_policy: "auto",
      timeout_ms: 600000,
      max_turns: 20,
    };
    this.hooks = hooks ?? {};
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const warnings: string[] = [];
    let lastAgentResult: AgentRunResult | null = null;

    for (const phase of params.pipeline.phases) {
      const maxCycles = phase.repeat?.max ?? 1;

      for (let cycle = 1; cycle <= maxCycles; cycle++) {
        let allStepsSucceeded = true;

        for (const step of phase.steps) {
          const maxAttempts = step.max_attempts ?? 1;
          let stepSucceeded = false;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (this.hooks.before_run) {
              runHook(this.hooks.before_run, params.workDir);
            }

            const agentName = step.agent || this.agentConfig.defaultAgent;
            if (!agentName) {
              return {
                success: false,
                failureReason: `No agent configured for step "${step.name}" and no defaultAgent set`,
                warnings,
              };
            }

            const adapter = this.adapters[agentName];
            if (!adapter) {
              return {
                success: false,
                failureReason: `Agent adapter "${agentName}" not found`,
                warnings,
              };
            }

            const prompt = params.promptRenderer(phase.name, step.name, cycle);
            const agentResult = await adapter.execute({
              threadId: params.threadId,
              workDir: params.workDir,
              prompt,
              timeout_ms: this.agentConfig.timeout_ms,
              maxTurns: this.agentConfig.max_turns,
              approvalPolicy: this.agentConfig.approval_policy,
              env: params.env ?? {},
            });
            lastAgentResult = agentResult;

            if (this.hooks.after_run) {
              runHook(this.hooks.after_run, params.workDir);
            }

            const success = step.success
              ? await evaluateSuccess(step.success, params.workDir, agentResult)
              : agentResult.status === "succeeded";

            params.afterStep?.({
              phaseName: phase.name,
              stepName: step.name,
              cycle,
              attempt,
              agentResult,
              success,
            });

            if (success) {
              stepSucceeded = true;
              break;
            }
          }

          if (!stepSucceeded) {
            allStepsSucceeded = false;
            break;
          }
        }

        if (allStepsSucceeded) {
          break;
        }

        if (cycle >= maxCycles) {
          if (phase.repeat?.on_exhaust === "pass") {
            warnings.push(
              `Phase "${phase.name}" exhausted max cycles (${maxCycles}), auto-passing`
            );
            break;
          }

          return {
            success: false,
            failureReason: `Phase "${phase.name}" failed after ${maxCycles} cycles`,
            warnings,
            lastAgentResult,
          };
        }
      }
    }

    return { success: true, warnings, lastAgentResult };
  }
}

function runHook(command: string, workDir: string): void {
  Bun.spawnSync(["sh", "-c", command], { cwd: workDir });
}

async function evaluateSuccess(
  condition: SuccessCondition,
  workDir: string,
  agentResult: AgentRunResult | null
): Promise<boolean> {
  if (condition.always) return true;

  if (condition.command) {
    const result = Bun.spawnSync(["sh", "-c", condition.command], {
      cwd: workDir,
    });
    return result.exitCode === 0;
  }

  if (condition.agent_verdict && agentResult) {
    return agentResult.stdout
      .toLowerCase()
      .includes(condition.agent_verdict.toLowerCase());
  }

  if (condition.file_exists) {
    return existsSync(join(workDir, condition.file_exists));
  }

  return agentResult ? agentResult.exitCode === 0 : true;
}
