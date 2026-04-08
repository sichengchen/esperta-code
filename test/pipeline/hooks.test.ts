import { beforeEach, describe, expect, test } from "bun:test";
import { PipelineExecutor } from "../../src/pipeline/executor.ts";
import { mkdirSync, readFileSync, rmSync } from "fs";

const TEST_DIR = "/tmp/feliz-pipeline-hooks-test";

describe("Pipeline hooks", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  test("runs before_run and after_run hooks for each step", async () => {
    const executor = new PipelineExecutor(
      {
        "mock-agent": {
          name: "mock-agent",
          isAvailable: async () => true,
          execute: async () => ({
            status: "succeeded" as const,
            exitCode: 0,
            stdout: "done",
            stderr: "",
            filesChanged: [],
          }),
          cancel: async () => {},
        },
      },
      undefined,
      {
        before_run: "echo before >> hooks.log",
        after_run: "echo after >> hooks.log",
      }
    );

    const result = await executor.execute({
      threadId: "thread-1",
      workDir: TEST_DIR,
      pipeline: {
        phases: [
          {
            name: "execute",
            steps: [{ name: "run", agent: "mock-agent" }],
          },
        ],
      },
      promptRenderer: () => "Do the work",
    });

    expect(result.success).toBe(true);
    expect(readFileSync(`${TEST_DIR}/hooks.log`, "utf-8")).toBe("before\nafter\n");
  });
});
