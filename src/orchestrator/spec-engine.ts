import type { Database } from "../db/database.ts";
import type { AgentAdapter } from "../agents/adapter.ts";
import { newId } from "../id.ts";

interface SpecDraftParams {
  workItemId: string;
  workDir: string;
  specDir: string;
}

interface SpecDraftResult {
  success: boolean;
  files?: string[];
}

export class SpecEngine {
  private db: Database;
  private adapter: AgentAdapter;

  constructor(db: Database, adapter: AgentAdapter) {
    this.db = db;
    this.adapter = adapter;
  }

  buildSpecDraftPrompt(params: {
    identifier: string;
    title: string;
    description: string;
    specDir: string;
  }): string {
    return `You are drafting a behavior specification for issue ${params.identifier}: ${params.title}

## Issue Description

${params.description}

## Instructions

Draft a structured behavior specification in markdown format.
Store spec files under the "${params.specDir}/" directory.

Each spec should include:
- System Behavior section describing the feature
- Scenarios in Given/When/Then format

Output the spec content directly.`;
  }

  async draftSpec(params: SpecDraftParams): Promise<SpecDraftResult> {
    const wi = this.db.getWorkItem(params.workItemId);
    if (!wi) return { success: false };

    const prompt = this.buildSpecDraftPrompt({
      identifier: wi.linear_identifier,
      title: wi.title,
      description: wi.description,
      specDir: params.specDir,
    });

    const result = await this.adapter.execute({
      runId: newId(),
      workDir: params.workDir,
      prompt,
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "auto",
      env: {},
    });

    if (result.status !== "succeeded") {
      return { success: false };
    }

    // Record history event
    this.db.appendHistory({
      id: newId(),
      project_id: wi.project_id,
      work_item_id: wi.id,
      run_id: null,
      event_type: "spec.drafted",
      payload: {
        files: result.filesChanged,
        summary: result.summary,
      },
    });

    // Transition to spec_review
    this.db.updateWorkItemOrchestrationState(wi.id, "spec_review");

    return { success: true, files: result.filesChanged };
  }

  approveSpec(workItemId: string): void {
    const wi = this.db.getWorkItem(workItemId);
    if (!wi || wi.orchestration_state !== "spec_review") return;

    this.db.appendHistory({
      id: newId(),
      project_id: wi.project_id,
      work_item_id: wi.id,
      run_id: null,
      event_type: "spec.approved",
      payload: {},
    });

    this.db.updateWorkItemOrchestrationState(wi.id, "queued");
  }
}
