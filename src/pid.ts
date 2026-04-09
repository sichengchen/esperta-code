import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { LEGACY_PID_FILENAME, PRIMARY_PID_FILENAME } from "./paths.ts";

export function writePidFile(dataDir: string): void {
  writeFileSync(join(dataDir, PRIMARY_PID_FILENAME), String(process.pid) + "\n");
}

export function removePidFile(dataDir: string): void {
  for (const filename of [PRIMARY_PID_FILENAME, LEGACY_PID_FILENAME]) {
    const path = join(dataDir, filename);
    if (existsSync(path)) unlinkSync(path);
  }
}

export function readPidFile(dataDir: string): number | null {
  const primaryPath = join(dataDir, PRIMARY_PID_FILENAME);
  const legacyPath = join(dataDir, LEGACY_PID_FILENAME);
  const path = existsSync(primaryPath) ? primaryPath : legacyPath;
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return null;
  const pid = Number(content);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}
