import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthorityLevel } from "@jack-k/core";
import type { Executor, ExecutorContext, ExecutorResult } from "@jack-k/core";
import { TicketStore } from "@jack-k/ticket-store";
import { Supervisor } from "./supervisor.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "jack-k-orchestrator-"));
  roots.push(root);
  const store = new TicketStore({ dbPath: join(root, "tickets.db"), eventDir: join(root, "events") });
  store.createTicket({ id: "ticket-1", repo: "acme/app", description: "Fix parser", source: "manual", authority: AuthorityLevel.L2 });
  const executor: Executor = { name: "test", supports: () => true, run: vi.fn(async (_task: string, _context: ExecutorContext): Promise<ExecutorResult> => ({ ok: true, summary: "Implemented parser fix", filesChanged: ["src/parser.ts"], transcript: "transcript" })) };
  const gitWorker = {
    prepare: vi.fn(async () => ({ worktree: "/tmp/worktree", branch: "forge/ticket-1-fix-parser" })),
    commit: vi.fn(async () => undefined),
    push: vi.fn(async () => undefined),
    openDraftPr: vi.fn(async () => "https://github.com/acme/app/pull/1"),
    cleanup: vi.fn(async () => undefined),
  };
  return { root, store, executor, gitWorker };
};

describe("Supervisor", () => {
  it("runs analysis read-only and waits without git mutation", async () => {
    const { store, executor, gitWorker } = setup();
    const notify = vi.fn(async () => undefined);
    const supervisor = new Supervisor({ store, executor, gitWorker, repos: [{ name: "acme/app", url: "https://github.com/acme/app.git", defaultBranch: "main", authority: AuthorityLevel.L2, forbiddenPaths: [] }], mode: "analysis", notify });
    await supervisor.pollOnce();
    expect(store.getTicket("ticket-1")?.state).toBe("awaiting_approval");
    expect(executor.run).toHaveBeenCalledWith("Fix parser", expect.objectContaining({ authority: AuthorityLevel.L0 }));
    expect(gitWorker.commit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("ticket-1", expect.stringContaining("Implemented parser fix"));
  });

  it("opens a draft PR only after Telegram approval", async () => {
    const { store, executor, gitWorker } = setup();
    const supervisor = new Supervisor({ store, executor, gitWorker, repos: [{ name: "acme/app", url: "https://github.com/acme/app.git", defaultBranch: "main", authority: AuthorityLevel.L6, forbiddenPaths: [] }], mode: "draft-pr", notify: vi.fn(async () => undefined) });
    await supervisor.pollOnce();
    expect(store.getTicket("ticket-1")?.state).toBe("awaiting_approval");
    expect(gitWorker.openDraftPr).not.toHaveBeenCalled();
    store.recordApproval("ticket-1", "open_draft_pr", "42");
    await supervisor.processApprovals();
    expect(store.getTicket("ticket-1")?.state).toBe("pr_open");
    expect(gitWorker.commit).toHaveBeenCalledOnce();
    expect(gitWorker.push).toHaveBeenCalledOnce();
    expect(gitWorker.openDraftPr).toHaveBeenCalledOnce();
  });

  it("fails and cleans up tickets left executing after a crash", async () => {
    const { store, gitWorker } = setup();
    store.transition("ticket-1", "triaging");
    store.transition("ticket-1", "planned");
    store.transition("ticket-1", "executing");
    const supervisor = new Supervisor({ store, executor: {} as Executor, gitWorker, repos: [], mode: "draft-pr", notify: vi.fn(async () => undefined) });
    await supervisor.recoverOnBoot();
    expect(store.getTicket("ticket-1")?.state).toBe("failed");
    expect(gitWorker.cleanup).toHaveBeenCalledWith("ticket-1");
  });
});
