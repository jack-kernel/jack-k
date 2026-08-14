import { execa } from "execa";
import { AuthorityLevel } from "@jack-k/core";
import type { AuthorityLevel as Authority, Executor, ExecutorContext, ExecutorResult } from "@jack-k/core";
import { failedResult, parseExecutorResult } from "./parse-result.js";

const toolsFor = (authority: Authority): string => authority <= AuthorityLevel.L1 ? "Read,Glob,Grep" : "Read,Glob,Grep,Edit,Write,Bash";

export const buildClaudeArgv = (task: string, context: ExecutorContext, resumeSessionId?: string): string[] => [
  "-p",
  task,
  ...(resumeSessionId ? ["--resume", resumeSessionId] : []),
  "--allowedTools",
  toolsFor(context.authority),
  "--add-dir",
  context.worktree,
  "--max-turns",
  "8",
  "--max-budget-usd",
  Math.max(0.05, context.budgetUsd).toFixed(2),
  "--output-format",
  "json",
];

export class ClaudeCodeExecutor implements Executor {
  public readonly name = "claude-code" as const;

  public supports(_authority: Authority): boolean { return true; }

  public async run(task: string, context: ExecutorContext): Promise<ExecutorResult> {
    return this.execute(task, context);
  }

  public async resume(sessionId: string, message: string, context: ExecutorContext): Promise<ExecutorResult> {
    return this.execute(message, context, sessionId);
  }

  private async execute(task: string, context: ExecutorContext, resumeSessionId?: string): Promise<ExecutorResult> {
    const argv = buildClaudeArgv(task, context, resumeSessionId);
    try {
      const result = await execa("claude", argv, { cwd: context.worktree, timeout: context.timeoutMs ?? 600_000, reject: false });
      if (result.stdout) context.onEvent({ type: "output", stream: "stdout", text: result.stdout, at: new Date().toISOString() });
      if (result.stderr) context.onEvent({ type: "output", stream: "stderr", text: result.stderr, at: new Date().toISOString() });
      const parsed = parseExecutorResult(result.stdout, result.stderr, context);
      const sessionId = parsed.sessionId;
      if (sessionId) context.onEvent({ type: "session_started", sessionId, at: new Date().toISOString() });
      context.onEvent({ type: "completed", ok: result.exitCode === 0, at: new Date().toISOString() });
      return result.exitCode === 0 ? parsed : { ...parsed, ok: false };
    } catch (error) {
      return failedResult(error, context);
    }
  }
}
