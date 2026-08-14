import { describe, expect, it, vi } from "vitest";
import { AuthorityLevel } from "@jack-k/core";
import { execa } from "execa";
import { ClaudeCodeExecutor } from "./claude-code.js";
import { CodexExecutor } from "./codex.js";

vi.mock("execa", () => ({ execa: vi.fn() }));

const context = (authority: AuthorityLevel) => ({
  ticketId: "ticket-1",
  worktree: "/tmp/worktree",
  repo: { name: "acme/app", url: "https://github.com/acme/app.git", defaultBranch: "main", authority, forbiddenPaths: [] },
  authority,
  budgetUsd: 0,
  onEvent: vi.fn(),
});

const mockedExeca = vi.mocked(execa);

describe("CLI executors", () => {
  it("gives Claude Code read-only tools at L0", async () => {
    mockedExeca.mockResolvedValue({ stdout: JSON.stringify({ session_id: "s1", result: "analysis" }), stderr: "" } as never);
    await new ClaudeCodeExecutor().run("Analyze this repo", context(AuthorityLevel.L0));
    const args = mockedExeca.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(["-p", "Analyze this repo", "--allowedTools", "Read,Glob,Grep", "--add-dir", "/tmp/worktree", "--max-turns", "8", "--max-budget-usd", "0.05", "--output-format", "json"]);
    expect(args.join(" ")).not.toContain("Edit");
    expect(args.join(" ")).not.toContain("dangerously-skip-permissions");
  });

  it("enables Claude Code writes only at L2 and returns the session id", async () => {
    mockedExeca.mockResolvedValue({ stdout: JSON.stringify({ session_id: "s2", result: "implemented", cost_usd: 0.12, files_changed: ["src/a.ts"] }), stderr: "" } as never);
    const result = await new ClaudeCodeExecutor().run("Implement this", context(AuthorityLevel.L2));
    const args = mockedExeca.mock.calls[1]?.[1] as string[];
    expect(args).toContain("Read,Glob,Grep,Edit,Write,Bash");
    expect(result.sessionId).toBe("s2");
    expect(result.filesChanged).toEqual(["src/a.ts"]);
  });

  it("uses Codex read-only sandbox below L2", async () => {
    mockedExeca.mockResolvedValue({ stdout: JSON.stringify({ session_id: "c1", result: "analysis" }), stderr: "" } as never);
    await new CodexExecutor().run("Analyze this repo", context(AuthorityLevel.L1));
    const args = mockedExeca.mock.calls[2]?.[1] as string[];
    expect(args).toContain("read-only");
    expect(args).not.toContain("workspace-write");
  });
});
