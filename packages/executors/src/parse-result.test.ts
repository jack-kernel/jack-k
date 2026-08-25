import { describe, expect, it, vi } from "vitest";
import type { ExecutorContext } from "@jack-k/core";
import { parseExecutorResult } from "./parse-result.js";

describe("parseExecutorResult", () => {
  it("redacts stdout and stderr before returning a successful executor result", () => {
    const stdoutSecret = ["ghp", "abcdefghijklmnopqrstuvwxyz1234567890"].join("_");
    const stderrSecret = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz1234567890"].join("-");
    const context = { onEvent: vi.fn() } as unknown as ExecutorContext;

    const result = parseExecutorResult(
      `Completed analysis successfully. Token: ${stdoutSecret}`,
      `Diagnostic included key ${stderrSecret}`,
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.transcript).not.toContain(stdoutSecret);
    expect(result.transcript).not.toContain(stderrSecret);
  });
});
