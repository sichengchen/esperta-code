import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  Publisher,
  type PublishParams,
  type PublishResult,
} from "../../src/publishing/publisher.ts";

describe("Publisher", () => {
  test("buildPrTitle formats correctly", () => {
    const publisher = new Publisher();
    const title = publisher.buildPrTitle("BAC-123", "Add login flow");
    expect(title).toBe("[BAC-123] Add login flow");
  });

  test("buildPrBody includes required sections", () => {
    const publisher = new Publisher();
    const body = publisher.buildPrBody({
      linearUrl: "https://linear.app/issue/BAC-123",
      summary: "Added login endpoint",
      filesChanged: ["src/auth.ts", "test/auth.test.ts"],
      testResults: "All tests passed",
    });
    expect(body).toContain("https://linear.app/issue/BAC-123");
    expect(body).toContain("Added login endpoint");
    expect(body).toContain("src/auth.ts");
    expect(body).toContain("All tests passed");
  });

  test("buildPrBody handles empty filesChanged", () => {
    const publisher = new Publisher();
    const body = publisher.buildPrBody({
      linearUrl: "https://linear.app/issue/BAC-1",
      summary: "Fix",
      filesChanged: [],
      testResults: null,
    });
    expect(body).toContain("Fix");
  });
});

describe("Gates", () => {
  test("runGate returns success on exit 0", async () => {
    const publisher = new Publisher();
    const result = await publisher.runGate("/tmp", "true");
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test("runGate returns failure on non-zero exit", async () => {
    const publisher = new Publisher();
    const result = await publisher.runGate("/tmp", "false");
    expect(result.passed).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  test("runGate captures output", async () => {
    const publisher = new Publisher();
    const result = await publisher.runGate("/tmp", "echo test-output");
    expect(result.passed).toBe(true);
    expect(result.output).toContain("test-output");
  });
});
