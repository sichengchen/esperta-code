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

  test("parses 'agent list' command", () => {
    const cmd = parseArgs(["agent", "list"]);
    expect(cmd.command).toBe("agent");
    expect(cmd.subcommand).toBe("list");
  });

  test("parses 'thread read' command", () => {
    const cmd = parseArgs(["thread", "read"]);
    expect(cmd.command).toBe("thread");
    expect(cmd.subcommand).toBe("read");
  });

  test("parses 'thread write <message>' command", () => {
    const cmd = parseArgs(["thread", "write", "keep", "it", "simple"]);
    expect(cmd.command).toBe("thread");
    expect(cmd.subcommand).toBe("write");
    expect(cmd.args).toEqual(["keep", "it", "simple"]);
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
    const cmd = parseArgs(["--config", "/path/to/esperta-code.yml", "start"]);
    expect(cmd.command).toBe("start");
    expect(cmd.flags.config).toBe("/path/to/esperta-code.yml");
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
