import type { Database } from "../db/database.ts";
import { ContextAssembler } from "../context/assembler.ts";
import { newId } from "../id.ts";

export function contextRead(
  db: Database,
  scratchpadRoot: string,
  projectId: string,
  workItemId: string,
  runId: string | null
): string {
  const assembler = new ContextAssembler(db, scratchpadRoot);
  const context = assembler.assemble(projectId, workItemId, null, runId);

  const sections: string[] = [];

  if (context.history.length > 0) {
    sections.push("## History\n");
    for (const h of context.history) {
      const ts = h.created_at.toISOString().slice(0, 19).replace("T", " ");
      const detail = formatPayload(h.payload);
      sections.push(`- ${h.event_type}${detail} (${ts})`);
    }
  }

  if (context.scratchpad.length > 0) {
    sections.push("\n## Prior Steps\n");
    for (const s of context.scratchpad) {
      sections.push(`### ${s.path}\n\n${s.content}`);
    }
  }

  if (sections.length === 0) {
    return "No context available.";
  }

  return "# Context\n\n" + sections.join("\n");
}

export function contextWrite(
  db: Database,
  scratchpadRoot: string,
  projectId: string,
  runId: string,
  message: string
): void {
  const project = db.getProject(projectId);
  const projectName = project?.name ?? projectId;
  const assembler = new ContextAssembler(db, scratchpadRoot);
  const id = newId();
  assembler.writeScratchpad(projectName, runId, `message-${id}.md`, message);
}

function formatPayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  if (payload.title) parts.push(String(payload.title));
  if (payload.attempt) parts.push(`attempt ${payload.attempt}`);
  if (payload.failure_reason) parts.push(String(payload.failure_reason));
  if (payload.result) parts.push(String(payload.result));
  if (parts.length === 0) return "";
  return `: ${parts.join(", ")}`;
}
