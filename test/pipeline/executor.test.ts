import { describe, expect, mock, test } from "bun:test";
import { PipelineExecutor } from "../../src/pipeline/executor.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";

function makeAdapter(
  impl?: Partial<AgentAdapter> & {
    execute?: AgentAdapter["execute"];
  }
): AgentAdapter {
  return {
    name: "mock-agent",
    isAvailable: async () => true,
    execute:
      impl?.execute ??
      (async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: "done",
        stderr: "",
        filesChanged: [],
      })),
    cancel: impl?.cancel ?? (async () => {}),
  };
}

describe("PipelineExecutor", () => {
  test("executes a single-step pipeline and passes threadId to the adapter", async () => {
    const execute = mock(async (params) => ({
      status: "succeeded" as const,
      exitCode: 0,
      stdout: "done",
      stderr: "",
      filesChanged: [],
      summary: params.threadId,
    }));

    const executor = new PipelineExecutor({
      "mock-agent": makeAdapter({ execute }),
    });

    const result = await executor.execute({
      threadId: "thread-1",
      workDir: "/tmp",
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
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0].threadId).toBe("thread-1");
  });

  test("retries a step until it succeeds", async () => {
    let attempts = 0;
    const executor = new PipelineExecutor({
      "mock-agent": makeAdapter({
        execute: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              status: "failed",
              exitCode: 1,
              stdout: "nope",
              stderr: "boom",
              filesChanged: [],
            };
          }
          return {
            status: "succeeded",
            exitCode: 0,
            stdout: "fixed",
            stderr: "",
            filesChanged: [],
          };
        },
      }),
    });

    const result = await executor.execute({
      threadId: "thread-1",
      workDir: "/tmp",
      pipeline: {
        phases: [
          {
            name: "execute",
            steps: [{ name: "run", agent: "mock-agent", max_attempts: 2 }],
          },
        ],
      },
      promptRenderer: () => "Retry if needed",
    });

    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
  });

  test("fails when the configured adapter is missing", async () => {
    const executor = new PipelineExecutor({});
    const result = await executor.execute({
      threadId: "thread-1",
      workDir: "/tmp",
      pipeline: {
        phases: [
          {
            name: "execute",
            steps: [{ name: "run", agent: "missing-agent" }],
          },
        ],
      },
      promptRenderer: () => "Do the work",
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain("missing-agent");
  });

  test("calls afterStep with the agent result", async () => {
    const afterStep = mock(() => {});
    const executor = new PipelineExecutor({
      "mock-agent": makeAdapter(),
    });

    const result = await executor.execute({
      threadId: "thread-1",
      workDir: "/tmp",
      pipeline: {
        phases: [
          {
            name: "execute",
            steps: [{ name: "run", agent: "mock-agent" }],
          },
        ],
      },
      promptRenderer: () => "Do the work",
      afterStep,
    });

    expect(result.success).toBe(true);
    expect(afterStep).toHaveBeenCalledTimes(1);
    const firstCall = afterStep.mock.calls[0] as unknown[] | undefined;
    const firstArg = firstCall?.[0] as
      | { phaseName: string; agentResult: { stdout: string } }
      | undefined;
    expect(firstArg).toBeDefined();
    if (!firstArg) {
      throw new Error("afterStep was not called");
    }
    expect(firstArg.phaseName).toBe("execute");
    expect(firstArg.agentResult.stdout).toBe("done");
  });
});
