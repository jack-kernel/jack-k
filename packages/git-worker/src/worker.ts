import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { atLeast, AuthorityLevel } from "@jack-k/core";
import type { AuthorityLevel as Authority, RepoConfig, Ticket } from "@jack-k/core";
import { TicketStore } from "@jack-k/ticket-store";

export interface PreparedWorktree {
  worktree: string;
  branch: string;
}

export class GitWorker {
  public constructor(
    private readonly store: TicketStore,
    private readonly repos: readonly RepoConfig[],
    private readonly forgeDir: string,
  ) {}

  public async prepare(ticketId: string): Promise<PreparedWorktree> {
    const { ticket, repo } = this.authorize(ticketId, AuthorityLevel.L2, "prepare");
    const mirror = join(this.forgeDir, "mirrors", safePath(repo.name));
    const worktree = join(this.forgeDir, "worktrees", safePath(ticket.id));
    const branch = this.branchFor(ticket);
    mkdirSync(join(this.forgeDir, "mirrors"), { recursive: true });
    mkdirSync(join(this.forgeDir, "worktrees"), { recursive: true });
    if (existsSync(mirror)) {
      await this.run("git", ["--git-dir", mirror, "fetch", "--prune", "origin"]);
    } else {
      await this.run("git", ["clone", "--mirror", repo.url, mirror]);
    }
    await this.run("git", ["--git-dir", mirror, "worktree", "add", "-b", branch, worktree, repo.defaultBranch]);
    return { worktree, branch };
  }

  public async commit(ticketId: string, message: string): Promise<void> {
    const { ticket, repo } = this.authorize(ticketId, AuthorityLevel.L2, "commit");
    const worktree = this.worktreeFor(ticket);
    const changed = await this.run("git", ["-C", worktree, "diff", "--name-only"]);
    if (!changed.stdout.trim()) return;
    const forbidden = changed.stdout.split(/\r?\n/).map((path) => path.trim()).filter(Boolean).find((path) => repo.forbiddenPaths.some((pattern) => matchesForbidden(pattern, path)));
    if (forbidden) throw new Error(`Commit blocked by forbidden path: ${forbidden}`);
    await this.run("git", ["-C", worktree, "add", "--all"]);
    await this.run("git", ["-C", worktree, "commit", "-m", message]);
  }

  public async push(ticketId: string): Promise<void> {
    const { ticket } = this.authorize(ticketId, AuthorityLevel.L2, "push");
    await this.run("git", ["-C", this.worktreeFor(ticket), "push", "--set-upstream", "origin", this.branchFor(ticket)]);
  }

  public async openDraftPr(ticketId: string, body: string): Promise<string> {
    const { ticket, repo } = this.authorize(ticketId, AuthorityLevel.L3, "open_draft_pr");
    if (!this.store.hasApproval(ticketId, "open_draft_pr")) throw new Error("Telegram approval required before opening a draft PR");
    const existing = await this.run("gh", [
      "pr", "list", "--repo", repo.name, "--head", this.branchFor(ticket), "--state", "all", "--json", "url", "--jq", ".[0].url",
    ]);
    if (existing.stdout.trim()) return existing.stdout.trim();
    const result = await this.run("gh", [
      "pr", "create", "--draft", "--repo", repo.name, "--title", `Forge: ${ticket.description.slice(0, 80)}`,
      "--body-file", "-", "--head", this.branchFor(ticket), "--base", repo.defaultBranch,
    ], { input: body });
    return result.stdout.trim();
  }

  public async cleanup(ticketId: string): Promise<void> {
    const { ticket } = this.authorize(ticketId, AuthorityLevel.L0, "cleanup");
    const worktree = this.worktreeFor(ticket);
    if (existsSync(worktree)) await this.run("git", ["worktree", "remove", "--force", worktree]);
  }

  private authorize(ticketId: string, required: Authority, operation: string): { ticket: Ticket; repo: RepoConfig } {
    const ticket = this.store.getTicket(ticketId);
    if (!ticket) throw new Error(`Ticket not found: ${ticketId}`);
    const repo = this.repos.find((candidate) => candidate.name === ticket.repo);
    if (!repo) throw new Error(`Repository is not allowlisted: ${ticket.repo}`);
    const actual = Math.min(ticket.authority, repo.authority) as Authority;
    const allowed = atLeast(actual, required);
    this.store.append({ type: "authority_assertion", ticketId, operation, required, actual, allowed });
    if (!allowed) throw new Error(`Insufficient authority for ${operation}: requires L${required}, effective level is L${actual}`);
    return { ticket, repo };
  }

  private worktreeFor(ticket: Ticket): string { return join(this.forgeDir, "worktrees", safePath(ticket.id)); }
  private branchFor(ticket: Ticket): string { return `forge/${safePath(ticket.id)}-${slug(ticket.description)}`; }

  private async run(command: string, args: readonly string[], options?: { input?: string }): Promise<{ stdout: string; stderr: string }> {
    const result = await execa(command, [...args], { ...options, reject: false });
    if (result.exitCode !== 0) throw new Error(`${command} failed (${result.exitCode}): ${result.stderr}`);
    return { stdout: result.stdout, stderr: result.stderr };
  }
}

const safePath = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, "-");
const slug = (value: string): string => safePath(value.toLowerCase()).replace(/-+/g, "-").slice(0, 48).replace(/^-|-$/g, "") || "ticket";
const matchesForbidden = (pattern: string, path: string): boolean => {
  const escaped = pattern.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(path) || new RegExp(`^${escaped}/`).test(path);
};
