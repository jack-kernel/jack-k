import type { Executor, RepoConfig } from "@jack-k/core";
import { ClaudeCodeExecutor } from "./claude-code.js";
import { CodexExecutor } from "./codex.js";

export const executorFor = (repo: RepoConfig): Executor => repo.executor === "codex" ? new CodexExecutor() : new ClaudeCodeExecutor();
