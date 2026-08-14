import type { AuthorityLevel } from "./authority.js";
import type { RepoConfig } from "./repo.js";

export interface ExecutorContext {
  ticketId: string;
  worktree: string;
  repo: RepoConfig;
  authority: AuthorityLevel;
  budgetUsd: number;
  sessionId?: string;
  timeoutMs?: number;
  onEvent: (event: ExecutorEvent) => void;
}

export interface ExecutorResult {
  ok: boolean;
  summary: string;
  filesChanged: string[];
  sessionId?: string;
  costUsd?: number;
  transcript: string;
}

export type ExecutorEvent =
  | { type: "session_started"; sessionId: string; at: string }
  | { type: "output"; stream: "stdout" | "stderr"; text: string; at: string }
  | { type: "authority_check"; operation: string; allowed: boolean; at: string }
  | { type: "completed"; ok: boolean; at: string }
  | { type: "failed"; error: string; at: string };

export interface Executor {
  readonly name: "claude-code" | "codex" | string;
  supports(level: AuthorityLevel): boolean;
  run(task: string, context: ExecutorContext): Promise<ExecutorResult>;
  resume?(sessionId: string, message: string, context: ExecutorContext): Promise<ExecutorResult>;
}
