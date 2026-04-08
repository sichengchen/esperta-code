import type { Database } from "../db/database.ts";
import type { JobAuthor } from "../domain/types.ts";
import { ContextAssembler } from "../context/assembler.ts";
import { newId } from "../id.ts";

export function threadRead(db: Database, threadId: string): string {
  const assembler = new ContextAssembler(db);
  const context = assembler.assemble(threadId);
  if (!context) {
    return "Thread not found.";
  }

  const sections: string[] = [];
  const { thread } = context;

  sections.push(`# Thread\n`);
  sections.push(`## Issue\n`);
  sections.push(`- ${thread.linear_identifier}: ${thread.title}`);
  sections.push(`- status: ${thread.status}`);

  if (thread.description.trim()) {
    sections.push(`\n## Description\n`);
    sections.push(thread.description);
  }

  if (context.memory.length > 0) {
    sections.push(`\n## Memory\n`);
    for (const item of context.memory) {
      sections.push(`### ${item.path}\n\n${item.content}`);
    }
  }

  if (context.specs.length > 0) {
    sections.push(`\n## Specs\n`);
    for (const item of context.specs) {
      sections.push(`### ${item.path}\n\n${item.content}`);
    }
  }

  if (context.jobs.length > 0) {
    sections.push(`\n## Jobs\n`);
    for (const job of context.jobs) {
      const ts = job.created_at.toISOString().slice(0, 19).replace("T", " ");
      const author = job.author ?? "unknown";
      sections.push(`- [${author}] ${job.body} (${ts})`);
    }
  }

  return sections.join("\n");
}

export function threadWrite(
  db: Database,
  threadId: string,
  message: string,
  author: JobAuthor = "human"
): void {
  db.appendJob({
    id: newId(),
    thread_id: threadId,
    body: message.trim(),
    author,
  });
}
