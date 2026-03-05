import type { Database } from "../db/database.ts";
import type { AgentAdapter } from "../agents/adapter.ts";
import { newId } from "../id.ts";

export interface SubIssueProposal {
  title: string;
  description: string;
  dependencies: string[];
}

interface DecompositionResult {
  success: boolean;
  subIssues?: SubIssueProposal[];
}

export class DecompositionEngine {
  private db: Database;
  private adapter: AgentAdapter;

  constructor(db: Database, adapter: AgentAdapter) {
    this.db = db;
    this.adapter = adapter;
  }

  isLargeFeature(labels: string[]): boolean {
    return labels.includes("epic");
  }

  buildDecompositionPrompt(params: {
    identifier: string;
    title: string;
    description: string;
  }): string {
    return `You are breaking down a large feature into sub-issues.

## Issue: ${params.identifier} - ${params.title}

${params.description}

## Instructions

Analyze this feature and break it down into implementable sub-issues.

Output a JSON object with the following structure:
{
  "sub_issues": [
    {
      "title": "Sub-issue title",
      "description": "Detailed description",
      "dependencies": ["title of dependency"]
    }
  ]
}

Each sub-issue should be:
- Small enough to implement in one agent run
- Have clear acceptance criteria
- List dependencies on other sub-issues by title`;
  }

  async proposeDecomposition(params: {
    workItemId: string;
    workDir: string;
  }): Promise<DecompositionResult> {
    const wi = this.db.getWorkItem(params.workItemId);
    if (!wi) return { success: false };

    const prompt = this.buildDecompositionPrompt({
      identifier: wi.linear_identifier,
      title: wi.title,
      description: wi.description,
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

    let subIssues: SubIssueProposal[] = [];
    try {
      const parsed = JSON.parse(result.stdout);
      subIssues = parsed.sub_issues ?? [];
    } catch {
      return { success: false };
    }

    // Record history
    this.db.appendHistory({
      id: newId(),
      project_id: wi.project_id,
      work_item_id: wi.id,
      run_id: null,
      event_type: "decomposition.proposed",
      payload: {
        sub_issue_count: subIssues.length,
        sub_issues: subIssues.map((s) => s.title),
      },
    });

    // Transition to decompose_review
    this.db.updateWorkItemOrchestrationState(wi.id, "decompose_review");

    return { success: true, subIssues };
  }

  approveDecomposition(
    parentWorkItemId: string,
    subIssues: SubIssueProposal[]
  ): string[] {
    const parent = this.db.getWorkItem(parentWorkItemId);
    if (!parent) return [];

    const createdIds: string[] = [];

    for (const sub of subIssues) {
      const id = newId();
      this.db.upsertWorkItem({
        id,
        linear_id: newId(), // placeholder until created in Linear
        linear_identifier: `${parent.linear_identifier}-sub`,
        project_id: parent.project_id,
        parent_work_item_id: parent.id,
        title: sub.title,
        description: sub.description,
        state: parent.state,
        priority: parent.priority,
        labels: [...parent.labels, "feliz:sub-issue"],
        blocker_ids: [], // resolved later from dependency titles
        orchestration_state: "unclaimed",
      });
      createdIds.push(id);
    }

    // Record history
    this.db.appendHistory({
      id: newId(),
      project_id: parent.project_id,
      work_item_id: parent.id,
      run_id: null,
      event_type: "decomposition.approved",
      payload: {
        created_sub_items: createdIds,
      },
    });

    return createdIds;
  }
}
