import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const PRIMARY_CONFIG_DIRNAME = ".esperta-code";
export const PRIMARY_CONFIG_FILENAME = "esperta-code.yml";
export const LEGACY_CONFIG_DIRNAME = ".feliz";
export const LEGACY_CONFIG_FILENAME = "feliz.yml";

export const PRIMARY_REPO_METADATA_DIRNAME = ".esperta-code";
export const LEGACY_REPO_METADATA_DIRNAME = ".feliz";

export const PRIMARY_PUBLISH_PROMPT_PATH = ".esperta-code/prompts/publish.md";
export const PRIMARY_MEMORY_DIR_PATH = ".esperta-code/context/memory";

export const PRIMARY_PID_FILENAME = "esperta-code.pid";
export const LEGACY_PID_FILENAME = "feliz.pid";

export const PRIMARY_AUTH_CODE_FILENAME = "esperta-code-auth-code";
export const LEGACY_AUTH_CODE_FILENAME = "feliz-auth-code";

export const PRIMARY_DB_FILENAME = "esperta-code.db";
export const LEGACY_DB_FILENAME = "feliz.db";

export const PRIMARY_DATA_DIR_ENV = "ESPERTA_CODE_DATA_DIR";
export const LEGACY_DATA_DIR_ENV = "FELIZ_DATA_DIR";
export const PRIMARY_THREAD_ID_ENV = "ESPERTA_CODE_THREAD_ID";
export const LEGACY_THREAD_ID_ENV = "FELIZ_THREAD_ID";
export const PRIMARY_PROJECT_ID_ENV = "ESPERTA_CODE_PROJECT_ID";
export const LEGACY_PROJECT_ID_ENV = "FELIZ_PROJECT_ID";

export function getPrimaryConfigDir(home: string = homedir()): string {
  return join(home, PRIMARY_CONFIG_DIRNAME);
}

export function getLegacyConfigDir(home: string = homedir()): string {
  return join(home, LEGACY_CONFIG_DIRNAME);
}

export function getPrimaryConfigPath(home: string = homedir()): string {
  return join(getPrimaryConfigDir(home), PRIMARY_CONFIG_FILENAME);
}

export function getLegacyConfigPath(home: string = homedir()): string {
  return join(getLegacyConfigDir(home), LEGACY_CONFIG_FILENAME);
}

export function resolveDefaultConfigPath(home: string = homedir()): string {
  const primary = getPrimaryConfigPath(home);
  if (existsSync(primary)) return primary;

  const legacy = getLegacyConfigPath(home);
  if (existsSync(legacy)) return legacy;

  return primary;
}

export function resolveDefaultDataDir(home: string = homedir()): string {
  const primary = getPrimaryConfigDir(home);
  if (existsSync(primary)) return primary;

  const legacy = getLegacyConfigDir(home);
  if (existsSync(legacy)) return legacy;

  return primary;
}

export function getPrimaryRepoMetadataDir(repoPath: string): string {
  return join(repoPath, PRIMARY_REPO_METADATA_DIRNAME);
}

export function getLegacyRepoMetadataDir(repoPath: string): string {
  return join(repoPath, LEGACY_REPO_METADATA_DIRNAME);
}

export function resolveRepoMetadataDir(repoPath: string): string {
  const primary = getPrimaryRepoMetadataDir(repoPath);
  if (existsSync(primary)) return primary;

  const legacy = getLegacyRepoMetadataDir(repoPath);
  if (existsSync(legacy)) return legacy;

  return primary;
}

export function resolveRepoAssetPath(
  repoPath: string,
  relativePath: string
): string {
  const primary = join(getPrimaryRepoMetadataDir(repoPath), relativePath);
  if (existsSync(primary)) return primary;

  const legacy = join(getLegacyRepoMetadataDir(repoPath), relativePath);
  if (existsSync(legacy)) return legacy;

  return primary;
}

export function getPrimaryDbPath(dataDir: string): string {
  return join(dataDir, "db", PRIMARY_DB_FILENAME);
}

export function getLegacyDbPath(dataDir: string): string {
  return join(dataDir, "db", LEGACY_DB_FILENAME);
}

export function resolveDbPath(dataDir: string): string {
  const primary = getPrimaryDbPath(dataDir);
  if (existsSync(primary)) return primary;

  const legacy = getLegacyDbPath(dataDir);
  if (existsSync(legacy)) return legacy;

  return primary;
}
