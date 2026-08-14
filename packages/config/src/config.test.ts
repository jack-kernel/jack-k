import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRepos, parseEnv } from "./config.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("configuration", () => {
  it("loads repos and applies the safe L2 default", () => {
    const root = mkdtempSync(join(tmpdir(), "jack-k-config-"));
    roots.push(root);
    const file = join(root, "repos.yaml");
    writeFileSync(file, `repos:\n  - name: acme/app\n    url: https://github.com/acme/app.git\n    defaultBranch: main\n    forbiddenPaths:\n      - .env\n`);
    const repos = loadRepos(file);
    expect(repos[0]?.authority).toBe(2);
    expect(repos[0]?.forbiddenPaths).toEqual([".env"]);
  });

  it("rejects malformed repo configuration with a useful path", () => {
    const root = mkdtempSync(join(tmpdir(), "jack-k-config-"));
    roots.push(root);
    const file = join(root, "repos.yaml");
    writeFileSync(file, "repos:\n  - name: acme/app\n    url: not-a-url\n");
    expect(() => loadRepos(file)).toThrow(/repos\.yaml|url/i);
  });

  it("fails fast when required environment variables are absent", () => {
    expect(() => parseEnv({})).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(parseEnv({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_SECRET_TOKEN: "secret",
      GITHUB_WEBHOOK_SECRET: "example",
      TELEGRAM_ALLOWED_USER_IDS: "42,43",
    }).telegramAllowedUserIds).toEqual([42, 43]);
  });
});
