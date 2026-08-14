import type { ExecutorContext, ExecutorResult } from "@jack-k/core";

interface StructuredOutput {
  session_id?: string;
  result?: string;
  summary?: string;
  cost_usd?: number;
  files_changed?: string[];
}

export const parseExecutorResult = (stdout: string, stderr: string, context: ExecutorContext): ExecutorResult => {
  try {
    const parsed = JSON.parse(stdout) as StructuredOutput;
    return {
      ok: true,
      summary: parsed.result ?? parsed.summary ?? "",
      filesChanged: parsed.files_changed ?? [],
      ...(parsed.session_id ? { sessionId: parsed.session_id } : {}),
      ...(parsed.cost_usd !== undefined ? { costUsd: parsed.cost_usd } : {}),
      transcript: stdout,
    };
  } catch {
    return { ok: true, summary: stdout.trim(), filesChanged: [], transcript: stderr ? `${stdout}\n${stderr}` : stdout };
  }
};

export const failedResult = (error: unknown, context: ExecutorContext): ExecutorResult => {
  const message = error instanceof Error ? error.message : String(error);
  context.onEvent({ type: "failed", error: message, at: new Date().toISOString() });
  return { ok: false, summary: message, filesChanged: [], transcript: message };
};
