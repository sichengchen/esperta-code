import { writeFileSync } from "fs";
import {
  runE2EDoctor,
  runE2ESmoke,
  type E2EDoctorReport,
  type E2ESmokeReport,
} from "../e2e/harness.ts";

export interface E2ECommandParams {
  subcommand?: string;
  configPath: string;
  flags: Record<string, string>;
}

export interface E2ECommandDeps {
  writeLine: (line: string) => void;
  writeError: (line: string) => void;
  writeFile: (path: string, content: string) => void;
  runDoctor: typeof runE2EDoctor;
  runSmoke: typeof runE2ESmoke;
  getOutput?: () => string[];
}

function defaultDeps(): E2ECommandDeps {
  return {
    writeLine: (line: string) => console.log(line),
    writeError: (line: string) => console.error(line),
    writeFile: (path: string, content: string) => writeFileSync(path, content, "utf-8"),
    runDoctor: runE2EDoctor,
    runSmoke: runE2ESmoke,
  };
}

function usage(): string {
  return "Usage: feliz e2e <doctor|smoke> [--config <path>] [--json] [--out <path>]";
}

function printDoctor(report: E2EDoctorReport, deps: E2ECommandDeps): void {
  deps.writeLine("E2E Doctor");
  for (const check of report.checks) {
    deps.writeLine(`[${check.status.toUpperCase()}] ${check.id} - ${check.summary}`);
  }
  deps.writeLine(`Result: ${report.ok ? "PASS" : "FAIL"}`);
}

function printSmoke(report: E2ESmokeReport, deps: E2ECommandDeps): void {
  deps.writeLine("E2E Smoke");
  deps.writeLine(`Doctor: ${report.doctor.ok ? "PASS" : "FAIL"}`);

  for (const check of report.checks) {
    deps.writeLine(`[${check.status.toUpperCase()}] ${check.id} - ${check.summary}`);
  }

  deps.writeLine("Scenarios:");
  for (const scenario of report.scenarios) {
    deps.writeLine(`- ${scenario.id}: ${scenario.title} (${scenario.status})`);
  }
  deps.writeLine(`Result: ${report.ok ? "PASS" : "FAIL"}`);
}

export function runE2ECommand(
  params: E2ECommandParams,
  providedDeps?: E2ECommandDeps
): boolean {
  const deps = providedDeps ?? defaultDeps();

  if (params.subcommand !== "doctor" && params.subcommand !== "smoke") {
    deps.writeError(usage());
    return false;
  }

  const jsonOutput = params.flags.json === "true";
  const outPath = params.flags.out;

  if (params.subcommand === "doctor") {
    const report = deps.runDoctor({ configPath: params.configPath });

    if (jsonOutput) {
      const content = JSON.stringify(report, null, 2);
      deps.writeLine(content);
      if (outPath) deps.writeFile(outPath, content);
    } else {
      printDoctor(report, deps);
      if (outPath) deps.writeFile(outPath, JSON.stringify(report, null, 2));
    }

    return report.ok;
  }

  const report = deps.runSmoke({ configPath: params.configPath });
  if (jsonOutput) {
    const content = JSON.stringify(report, null, 2);
    deps.writeLine(content);
    if (outPath) deps.writeFile(outPath, content);
  } else {
    printSmoke(report, deps);
    if (outPath) deps.writeFile(outPath, JSON.stringify(report, null, 2));
  }

  return report.ok;
}
