import { execa } from "execa";
import { AuthorityLevel } from "@jack-k/core";
import type { AuthorityLevel as Authority, Executor, ExecutorContext, ExecutorResult } from "@jack-k/core";
import { failedResult, parseExecutorResult } from "./parse-result.js";

export const buildCodexArgv = (task: string, context: ExecutorContext, resumeSessionId?: string): string[] => [
  "exec",
  "--profile",
  "forge",
  "--sandbox",
  context.authority <= AuthorityLevel.L1 ? "read-only" : "workspace-write",
  "--ask-for-approval",
  "never",
  "--json",
  "--cd",
  context.worktree,
  ...(resumeSessionId ? ["--resume", resumeSessionId] : []),
  task,
];

export class CodexExecutor implements Executor {
  public readonly name = "codex" as const;

  public supports(_authority: Authority): boolean { return true; }

  public async run(task: string, context: ExecutorContext): Promise<ExecutorResult> {
    return this.execute(task, context);
  }

  public async resume(sessionId: string, message: string, context: ExecutorContext): Promise<ExecutorResult> {
    return this.execute(message, context, sessionId);
  }

  private async execute(task: string, context: ExecutorContext, resumeSessionId?: string): Promise<ExecutorResult> {
    try {
      const result = await execa("codex", buildCodexArgv(task, context, resumeSessionId), { cwd: context.worktree, timeout: context.timeoutMs ?? 600_000, reject: false });
      if (result.stdout) context.onEvent({ type: "output", stream: "stdout", text: result.stdout, at: new Date().toISOString() });
      if (result.stderr) context.onEvent({ type: "output", stream: "stderr", text: result.stderr, at: new Date().toISOString() });
      const parsed = parseExecutorResult(result.stdout, result.stderr, context);
      if (parsed.sessionId) context.onEvent({ type: "session_started", sessionId: parsed.sessionId, at: new Date().toISOString() });
      context.onEvent({ type: "completed", ok: result.exitCode === 0, at: new Date().toISOString() });
      return result.exitCode === 0 ? parsed : { ...parsed, ok: false };
    } catch (error) {
      return failedResult(error, context);
    }
  }
}
