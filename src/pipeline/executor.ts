import type { Database } from "../db/database.ts";
import type { AgentAdapter } from "../agents/adapter.ts";
import type { PipelineDefinition, SuccessCondition } from "../config/types.ts";
import { newId } from "../id.ts";
import { existsSync } from "fs";
import { join } from "path";

export interface ExecuteParams {
  runId: string;
  workDir: string;
  pipeline: PipelineDefinition;
  promptRenderer: (phaseName: string, stepName: string, cycle: number) => string;
  onBuiltin?: (name: string) => Promise<boolean>;
}

export interface ExecuteResult {
  success: boolean;
  failureReason?: string;
  warnings: string[];
}

export class PipelineExecutor {
  private db: Database;
  private adapters: Record<string, AgentAdapter>;

  constructor(db: Database, adapters: Record<string, AgentAdapter>) {
    this.db = db;
    this.adapters = adapters;
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const warnings: string[] = [];

    for (const phase of params.pipeline.phases) {
      const maxCycles = phase.repeat?.max ?? 1;

      for (let cycle = 1; cycle <= maxCycles; cycle++) {
        let allStepsSucceeded = true;

        for (const step of phase.steps) {
          this.db.updateRunProgress(params.runId, phase.name, step.name);

          const maxAttempts = step.max_attempts ?? 1;
          let stepSucceeded = false;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const seId = newId();
            this.db.insertStepExecution({
              id: seId,
              run_id: params.runId,
              phase_name: phase.name,
              step_name: step.name,
              cycle,
              step_attempt: attempt,
              agent_adapter: step.agent || null,
            });

            let agentResult: { status: string; exitCode: number; stdout: string } | null = null;

            if (step.builtin) {
              // Handle builtin steps
              const builtinSuccess = params.onBuiltin
                ? await params.onBuiltin(step.builtin)
                : true;

              this.db.updateStepResult(
                seId,
                builtinSuccess ? "succeeded" : "failed",
                builtinSuccess ? 0 : 1,
                builtinSuccess ? null : `Builtin "${step.builtin}" failed`
              );

              if (builtinSuccess) {
                stepSucceeded = true;
                break;
              }
            } else if (step.agent) {
              // Run agent
              const adapter = this.adapters[step.agent];
              if (!adapter) {
                this.db.updateStepResult(
                  seId,
                  "failed",
                  -1,
                  `Agent adapter "${step.agent}" not found`
                );
                return {
                  success: false,
                  failureReason: `Agent adapter "${step.agent}" not found`,
                  warnings,
                };
              }

              const prompt = params.promptRenderer(phase.name, step.name, cycle);
              const result = await adapter.execute({
                runId: params.runId,
                workDir: params.workDir,
                prompt,
                timeout_ms: 600000,
                maxTurns: 20,
                approvalPolicy: "auto",
                env: {},
              });

              agentResult = result;

              if (result.status === "failed" || result.status === "timed_out") {
                this.db.updateStepResult(
                  seId,
                  result.status,
                  result.exitCode,
                  `Agent ${result.status}`
                );
                if (attempt < maxAttempts) continue; // retry
                // Fall through to evaluate success condition
              }
            }

            // Evaluate success condition
            const success = step.success
              ? await evaluateSuccess(step.success, params.workDir, agentResult)
              : agentResult
                ? agentResult.status === "succeeded"
                : true;

            this.db.updateStepResult(
              seId,
              success ? "succeeded" : "failed",
              agentResult?.exitCode ?? 0,
              success ? null : "Success condition not met"
            );

            if (success) {
              stepSucceeded = true;
              break;
            }

            if (attempt >= maxAttempts) break;
          }

          if (!stepSucceeded) {
            allStepsSucceeded = false;
            break;
          }
        }

        if (allStepsSucceeded) {
          break; // Phase succeeded, move to next phase
        }

        // Phase failed this cycle
        if (cycle >= maxCycles) {
          // Exhausted all cycles
          if (phase.repeat?.on_exhaust === "pass") {
            warnings.push(
              `Phase "${phase.name}" exhausted max cycles (${maxCycles}), auto-passing`
            );
            break;
          } else {
            return {
              success: false,
              failureReason: `Phase "${phase.name}" failed after ${maxCycles} cycles`,
              warnings,
            };
          }
        }
        // Otherwise, loop for next cycle
      }
    }

    return { success: true, warnings };
  }
}

async function evaluateSuccess(
  condition: SuccessCondition,
  workDir: string,
  agentResult: { status: string; exitCode: number; stdout: string } | null
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
    const filePath = join(workDir, condition.file_exists);
    return existsSync(filePath);
  }

  // Default: agent exit code 0
  return agentResult ? agentResult.exitCode === 0 : true;
}
