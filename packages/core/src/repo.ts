import type { AuthorityLevel } from "./authority.js";

export interface RepoConfig {
  name: string;
  url: string;
  defaultBranch: string;
  authority: AuthorityLevel;
  testCommand?: string;
  buildCommand?: string;
  forbiddenPaths: string[];
  executor?: "claude-code" | "codex";
}
