import { readFileSync } from "node:fs";
import { z } from "zod";
import { AuthorityLevel } from "@jack-k/core";
import type { RepoConfig } from "@jack-k/core";

const authoritySchema = z.preprocess((value) => {
  if (typeof value === "string" && /^L[0-6]$/.test(value)) return Number(value.slice(1));
  return value;
}, z.number().int().min(0).max(6).default(AuthorityLevel.L2)) as z.ZodType<AuthorityLevel>;

const repoSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  defaultBranch: z.string().min(1),
  authority: authoritySchema,
  testCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  forbiddenPaths: z.array(z.string()).default([]),
  executor: z.enum(["claude-code", "codex"]).optional(),
});

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_SECRET_TOKEN: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_ALLOWED_USER_IDS: z.string().min(1),
  FORGE_DATA_DIR: z.string().min(1).default("~/.forge"),
  REPOS_FILE: z.string().min(1).default("repos.yaml"),
});

export interface ForgeEnv {
  telegramBotToken: string;
  telegramSecretToken: string;
  githubWebhookSecret: string;
  telegramAllowedUserIds: number[];
  dataDir: string;
  reposFile: string;
}

export const parseEnv = (input: Record<string, string | undefined>): ForgeEnv => {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}`);
  const userIds = parsed.data.TELEGRAM_ALLOWED_USER_IDS.split(",").map((value) => Number(value.trim()));
  if (userIds.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("TELEGRAM_ALLOWED_USER_IDS must be comma-separated non-negative integers");
  return {
    telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
    telegramSecretToken: parsed.data.TELEGRAM_SECRET_TOKEN,
    githubWebhookSecret: parsed.data.GITHUB_WEBHOOK_SECRET,
    telegramAllowedUserIds: userIds,
    dataDir: parsed.data.FORGE_DATA_DIR,
    reposFile: parsed.data.REPOS_FILE,
  };
};

export const loadRepos = (filePath: string): RepoConfig[] => {
  let parsed: unknown;
  try {
    parsed = parseSimpleYaml(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read repos.yaml at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = z.object({ repos: z.array(repoSchema) }).safeParse(parsed);
  if (!result.success) throw new Error(`Invalid repos.yaml: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  return result.data.repos.map((repo) => ({
    name: repo.name,
    url: repo.url,
    defaultBranch: repo.defaultBranch,
    authority: repo.authority,
    forbiddenPaths: repo.forbiddenPaths,
    ...(repo.testCommand !== undefined ? { testCommand: repo.testCommand } : {}),
    ...(repo.buildCommand !== undefined ? { buildCommand: repo.buildCommand } : {}),
    ...(repo.executor !== undefined ? { executor: repo.executor } : {}),
  }));
};

const scalar = (raw: string): unknown => {
  const value = raw.trim();
  if (value === "") return undefined;
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (value === "[]") return [];
  if (value.startsWith("[") && value.endsWith("]")) return value.slice(1, -1).split(",").map((item) => String(scalar(item.trim())));
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

const parseSimpleYaml = (text: string): { repos: Record<string, unknown>[] } => {
  const repos: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | undefined;
  let arrayKey: string | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trim() === "repos:") continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      if (line.indexOf("- ") <= 3) {
        current = {};
        repos.push(current);
        const inline = trimmed.slice(2);
        const separator = inline.indexOf(":");
        if (separator > 0) current[inline.slice(0, separator).trim()] = scalar(inline.slice(separator + 1));
        arrayKey = undefined;
      } else if (current && arrayKey) {
        const values = (current[arrayKey] as unknown[] | undefined) ?? [];
        values.push(scalar(trimmed.slice(2)));
        current[arrayKey] = values;
      }
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator < 1 || !current) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = scalar(trimmed.slice(separator + 1));
    current[key] = value;
    arrayKey = value === undefined ? key : undefined;
    if (value === undefined) current[key] = [];
  }
  return { repos };
};
