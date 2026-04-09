import type { Database } from "../db/database.ts";
import type { Job, Thread } from "../domain/types.ts";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, relative } from "path";
import { loadRepoConfig } from "../config/loader.ts";
import { resolveRepoAssetPath } from "../paths.ts";

export interface MemoryItem {
  path: string;
  content: string;
}

export interface SpecItem {
  path: string;
  content: string;
}

export interface AssembledContext {
  thread: Thread;
  jobs: Job[];
  memory: MemoryItem[];
  specs: SpecItem[];
}

export class ContextAssembler {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  assemble(threadId: string): AssembledContext | null {
    const thread = this.db.getThread(threadId);
    if (!thread) return null;

    const worktree = thread.worktree_path;
    const memory = worktree ? this.readMemory(worktree) : [];
    const specs = worktree ? this.readSpecs(worktree) : [];
    const jobs = this.db.listJobs(threadId);

    return { thread, jobs, memory, specs };
  }

  readSpecs(worktreePath: string): SpecItem[] {
    const specDir = this.resolveSpecDir(worktreePath);
    const specsPath = join(worktreePath, specDir);
    if (!existsSync(specsPath)) return [];

    const items: SpecItem[] = [];
    this.walkDir(specsPath, (filePath) => {
      items.push({
        path: relative(worktreePath, filePath),
        content: readFileSync(filePath, "utf-8"),
      });
    });
    return items;
  }

  private readMemory(worktreePath: string): MemoryItem[] {
    const memoryDir = resolveRepoAssetPath(worktreePath, join("context", "memory"));
    if (!existsSync(memoryDir)) return [];

    const items: MemoryItem[] = [];
    this.walkDir(memoryDir, (filePath) => {
      items.push({
        path: relative(worktreePath, filePath),
        content: readFileSync(filePath, "utf-8"),
      });
    });
    return items;
  }

  private resolveSpecDir(worktreePath: string): string {
    const configPath = resolveRepoAssetPath(worktreePath, "config.yml");
    if (!existsSync(configPath)) return "specs";

    try {
      const config = loadRepoConfig(readFileSync(configPath, "utf-8"));
      return config.specs.directory || "specs";
    } catch {
      return "specs";
    }
  }

  private walkDir(dir: string, callback: (filePath: string) => void) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, callback);
      } else {
        callback(fullPath);
      }
    }
  }
}
