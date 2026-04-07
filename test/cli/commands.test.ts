import { describe, expect, test } from "bun:test";
import { parseArgs, type CliCommand } from "../../src/cli/commands.ts";

describe("CLI parseArgs", () => {
  test("parses 'start' command", () => {
    const cmd = parseArgs(["start"]);
    expect(cmd.command).toBe("start");
  });

  test("parses 'init' command", () => {
    const cmd = parseArgs(["init"]);
    expect(cmd.command).toBe("init");
  });

  test("parses 'stop' command", () => {
    const cmd = parseArgs(["stop"]);
    expect(cmd.command).toBe("stop");
  });

  test("parses 'status' command", () => {
    const cmd = parseArgs(["status"]);
    expect(cmd.command).toBe("status");
  });

  test("parses 'config validate' command", () => {
    const cmd = parseArgs(["config", "validate"]);
    expect(cmd.command).toBe("config");
    expect(cmd.subcommand).toBe("validate");
  });

  test("parses 'config show' command", () => {
    const cmd = parseArgs(["config", "show"]);
    expect(cmd.command).toBe("config");
    expect(cmd.subcommand).toBe("show");
  });

  test("parses 'project list' command", () => {
    const cmd = parseArgs(["project", "list"]);
    expect(cmd.command).toBe("project");
    expect(cmd.subcommand).toBe("list");
  });

  test("parses 'run list' command", () => {
    const cmd = parseArgs(["run", "list"]);
    expect(cmd.command).toBe("run");
    expect(cmd.subcommand).toBe("list");
  });

  test("parses 'submit' command with flags", () => {
    const cmd = parseArgs([
      "submit",
      "--project",
      "repo-a",
      "--title",
      "Implement queue runner",
      "--goal",
      "Build it",
    ]);
    expect(cmd.command).toBe("submit");
    expect(cmd.flags.project).toBe("repo-a");
    expect(cmd.flags.title).toBe("Implement queue runner");
    expect(cmd.flags.goal).toBe("Build it");
  });

  test("parses 'continue <thread-id>' command", () => {
    const cmd = parseArgs(["continue", "thread-123", "--title", "Follow up"]);
    expect(cmd.command).toBe("continue");
    expect(cmd.subcommand).toBe("thread-123");
    expect(cmd.flags.title).toBe("Follow up");
  });

  test("parses 'thread show <id>' command", () => {
    const cmd = parseArgs(["thread", "show", "thread-123"]);
    expect(cmd.command).toBe("thread");
    expect(cmd.subcommand).toBe("show");
    expect(cmd.args).toEqual(["thread-123"]);
  });

  test("parses 'job retry <id>' command", () => {
    const cmd = parseArgs(["job", "retry", "job-123"]);
    expect(cmd.command).toBe("job");
    expect(cmd.subcommand).toBe("retry");
    expect(cmd.args).toEqual(["job-123"]);
  });

  test("parses 'worktree inspect <id>' command", () => {
    const cmd = parseArgs(["worktree", "inspect", "wt-123"]);
    expect(cmd.command).toBe("worktree");
    expect(cmd.subcommand).toBe("inspect");
    expect(cmd.args).toEqual(["wt-123"]);
  });

  test("parses 'run show <id>' command", () => {
    const cmd = parseArgs(["run", "show", "run-123"]);
    expect(cmd.command).toBe("run");
    expect(cmd.subcommand).toBe("show");
    expect(cmd.args).toEqual(["run-123"]);
  });

  test("parses 'agent list' command", () => {
    const cmd = parseArgs(["agent", "list"]);
    expect(cmd.command).toBe("agent");
    expect(cmd.subcommand).toBe("list");
  });

  test("parses 'context history <project>' command", () => {
    const cmd = parseArgs(["context", "history", "backend"]);
    expect(cmd.command).toBe("context");
    expect(cmd.subcommand).toBe("history");
    expect(cmd.args).toEqual(["backend"]);
  });

  test("parses 'e2e smoke' command", () => {
    const cmd = parseArgs(["e2e", "smoke"]);
    expect(cmd.command).toBe("e2e");
    expect(cmd.subcommand).toBe("smoke");
  });

  test("parses 'e2e doctor' command", () => {
    const cmd = parseArgs(["e2e", "doctor"]);
    expect(cmd.command).toBe("e2e");
    expect(cmd.subcommand).toBe("doctor");
  });

  test("parses --config flag", () => {
    const cmd = parseArgs(["--config", "/path/to/feliz.yml", "start"]);
    expect(cmd.command).toBe("start");
    expect(cmd.flags.config).toBe("/path/to/feliz.yml");
  });

  test("returns help for empty args", () => {
    const cmd = parseArgs([]);
    expect(cmd.command).toBe("help");
  });

  test("returns help for --help flag", () => {
    const cmd = parseArgs(["--help"]);
    expect(cmd.command).toBe("help");
  });
});
