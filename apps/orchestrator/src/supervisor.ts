import { AuthorityLevel } from "@jack-k/core";
import type { Executor, ExecutorResult, RepoConfig, Ticket } from "@jack-k/core";
import { GitWorker } from "@jack-k/git-worker";
import { TicketStore } from "@jack-k/ticket-store";

export interface GitWorkerPort {
  prepare(ticketId: string): Promise<{ worktree: string; branch: string }>;
  commit(ticketId: string, message: string): Promise<void>;
  push(ticketId: string): Promise<void>;
  openDraftPr(ticketId: string, body: string): Promise<string>;
  cleanup(ticketId: string): Promise<void>;
}

export interface SupervisorOptions {
  store: TicketStore;
  executor: Executor | ((repo: RepoConfig) => Executor);
  gitWorker: GitWorkerPort;
  repos: readonly RepoConfig[];
  mode: "analysis" | "draft-pr";
  notify: (ticketId: string, message: string) => Promise<void>;
}

interface CompletedWork {
  result: ExecutorResult;
  branch: string;
}

export class Supervisor {
  private readonly completed = new Map<string, CompletedWork>();

  public constructor(private readonly options: SupervisorOptions) {}

  public async pollOnce(): Promise<void> {
    for (const ticket of this.options.store.listTickets({ state: "received" })) {
      if (!this.options.store.claim(ticket.id)) continue;
      await this.processTicket(ticket);
    }
  }

  public async processApprovals(): Promise<void> {
    for (const ticket of this.options.store.listTickets({ state: "awaiting_approval" })) {
      if (this.options.store.hasApproval(ticket.id, "reject") || this.options.store.hasApproval(ticket.id, "request_changes")) {
        this.options.store.transition(ticket.id, "rejected", "Approval rejected or changes requested");
        await this.safeCleanup(ticket.id);
        this.options.store.release(ticket.id);
        continue;
      }
      if (!this.options.store.hasApproval(ticket.id, "open_draft_pr")) continue;
      const completed = this.completed.get(ticket.id);
      if (!completed) {
        await this.options.notify(ticket.id, "Approval found, but the executor result is unavailable after restart; re-run the ticket.");
        continue;
      }
      try {
        await this.options.gitWorker.commit(ticket.id, `forge: ${ticket.description.slice(0, 72)}`);
        await this.options.gitWorker.push(ticket.id);
        const url = await this.options.gitWorker.openDraftPr(ticket.id, this.prBody(ticket, completed.result));
        this.options.store.transition(ticket.id, "pr_open");
        await this.options.notify(ticket.id, `Draft PR opened: ${url}`);
      } catch (error) {
        this.options.store.transition(ticket.id, "failed", errorMessage(error));
        await this.options.notify(ticket.id, `Draft PR failed: ${errorMessage(error)}`);
      } finally {
        await this.safeCleanup(ticket.id);
        this.options.store.release(ticket.id);
      }
    }
  }

  public async recoverOnBoot(): Promise<void> {
    for (const ticket of this.options.store.listTickets({ state: "executing" })) {
      try { await this.options.gitWorker.cleanup(ticket.id); } finally {
        this.options.store.transition(ticket.id, "failed", "Supervisor restarted during executor execution");
        this.options.store.release(ticket.id);
      }
    }
  }

  private async processTicket(ticket: Ticket): Promise<void> {
    try {
      const repo = this.options.repos.find((candidate) => candidate.name === ticket.repo);
      if (!repo) throw new Error(`Repository is not allowlisted: ${ticket.repo}`);
      this.options.store.transition(ticket.id, "triaging");
      this.options.store.transition(ticket.id, "planned");
      this.options.store.transition(ticket.id, "executing");
      const prepared = await this.options.gitWorker.prepare(ticket.id);
      const authority = this.options.mode === "analysis" ? AuthorityLevel.L0 : Math.min(ticket.authority, repo.authority) as Ticket["authority"];
      const executor = typeof this.options.executor === "function" ? this.options.executor(repo) : this.options.executor;
      const result = await executor.run(ticket.description, {
        ticketId: ticket.id,
        worktree: prepared.worktree,
        repo,
        authority,
        budgetUsd: 0.05,
        onEvent: () => undefined,
      });
      if (!result.ok) throw new Error(result.summary || "Executor failed");
      this.completed.set(ticket.id, { result, branch: prepared.branch });
      this.options.store.transition(ticket.id, "awaiting_approval");
      await this.options.notify(ticket.id, result.summary);
    } catch (error) {
      const current = this.options.store.getTicket(ticket.id);
      if (current && current.state !== "failed") this.options.store.transition(ticket.id, "failed", errorMessage(error));
      await this.safeCleanup(ticket.id);
      this.options.store.release(ticket.id);
      await this.options.notify(ticket.id, `Ticket failed: ${errorMessage(error)}`);
    }
  }

  private prBody(ticket: Ticket, result: ExecutorResult): string {
    return `## Summary\n\n${result.summary}\n\n## Ticket\n\n${ticket.description}\n\n## Files changed\n\n${result.filesChanged.map((file) => `- ${file}`).join("\n") || "- None reported"}\n\n## Transcript\n\n${result.transcript}`;
  }

  private async safeCleanup(ticketId: string): Promise<void> {
    try { await this.options.gitWorker.cleanup(ticketId); } catch { /* cleanup is best-effort after a terminal transition */ }
  }
}

export const createSupervisor = (options: Omit<SupervisorOptions, "gitWorker"> & { gitWorker: GitWorker }): Supervisor => new Supervisor(options);
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
