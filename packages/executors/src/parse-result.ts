import type { ExecutorContext, ExecutorResult } from "@jack-k/core";

interface StructuredOutput {
  session_id?: string;
  result?: string;
  summary?: string;
  cost_usd?: number;
  files_changed?: string[];
}

const redactTranscript = (value: string): string =>
  value
    .replace(/\bgh[pousr]_[A-Za-z0-9]{36}\b/g, "[REDACTED]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]+\b/g, "[REDACTED]");

export const parseExecutorResult = (stdout: string, stderr: string, context: ExecutorContext): ExecutorResult => {
  const sanitizedStdout = redactTranscript(stdout);
  const transcriptArtifact = `Executor output omitted (${stdout.length + stderr.length} bytes).`;

  try {
    const parsed = JSON.parse(sanitizedStdout) as StructuredOutput;
    return {
      ok: true,
      summary: redactTranscript(parsed.result ?? parsed.summary ?? ""),
      filesChanged: parsed.files_changed ?? [],
      ...(parsed.session_id ? { sessionId: parsed.session_id } : {}),
      ...(parsed.cost_usd !== undefined ? { costUsd: parsed.cost_usd } : {}),
      transcript: transcriptArtifact,
    };
  } catch {
    return {
      ok: true,
      summary: sanitizedStdout.trim(),
      filesChanged: [],
      transcript: transcriptArtifact,
    };
  }
};

export const failedResult = (error: unknown, context: ExecutorContext): ExecutorResult => {
  const message = error instanceof Error ? error.message : String(error);
  context.onEvent({ type: "failed", error: message, at: new Date().toISOString() });
  return { ok: false, summary: message, filesChanged: [], transcript: message };
};
