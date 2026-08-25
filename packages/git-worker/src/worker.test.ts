import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthorityLevel } from "@jack-k/core";
import { execa } from "execa";
import { TicketStore } from "@jack-k/ticket-store";
import { GitWorker } from "./worker.js";

vi.mock("execa", () => ({ execa: vi.fn() }));
const mockedExeca = vi.mocked(execa);
const roots: string[] = [];
afterEach(() => {
  mockedExeca.mockReset();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const setup = (authority: AuthorityLevel) => {
  const root = mkdtempSync(join(tmpdir(), "jack-k-worker-"));
  roots.push(root);
  const store = new TicketStore({ dbPath: join(root, "tickets.db"), eventDir: join(root, "events") });
  store.createTicket({ id: `ticket-${authority}`, repo: "acme/app", description: "Fix parser safely", source: "manual", authority });
  const worker = new GitWorker(store, [{ name: "acme/app", url: "https://github.com/acme/app.git", defaultBranch: "main", authority: AuthorityLevel.L6, forbiddenPaths: [".env", "secrets/*"] }], join(root, "forge"));
  return { store, worker };
};

describe("GitWorker authority boundary", () => {
  it("rejects prepare, commit, and push before invoking subprocesses below L2", async () => {
    const { worker } = setup(AuthorityLevel.L1);
    await expect(worker.prepare("ticket-1")).rejects.toThrow(/authority/i);
    await expect(worker.commit("ticket-1", "message")).rejects.toThrow(/authority/i);
    await expect(worker.push("ticket-1")).rejects.toThrow(/authority/i);
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it("requires L3 and an approval before opening a draft PR", async () => {
    const { worker } = setup(AuthorityLevel.L2);
    await expect(worker.openDraftPr("ticket-2", "untrusted body")).rejects.toThrow(/authority/i);
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it("passes PR bodies as stdin and never through a shell command", async () => {
    const { store, worker } = setup(AuthorityLevel.L3);
    store.recordApproval("ticket-3", "open_draft_pr", "telegram-user");
    mockedExeca.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 } as never)
      .mockResolvedValueOnce({ stdout: "https://github.com/acme/app/pull/1", stderr: "", exitCode: 0 } as never);
    await worker.openDraftPr("ticket-3", "body; $(touch /tmp/pwned)");
    expect(mockedExeca).toHaveBeenCalledWith("gh", expect.arrayContaining(["pr", "create", "--body-file", "-"]), expect.objectContaining({ input: "body; $(touch /tmp/pwned)" }));
    expect(mockedExeca.mock.calls[0]?.[0]).toBe("gh");
  });

  it("blocks commits touching forbidden paths", async () => {
    const { worker } = setup(AuthorityLevel.L2);
    mockedExeca.mockResolvedValueOnce({ stdout: ".env\nsecrets/key.txt\n", stderr: "", exitCode: 0 } as never);
    await expect(worker.commit("ticket-2", "message")).rejects.toThrow(/forbidden/i);
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });

  it("resumes completed commit and draft PR publication idempotently", async () => {
    const { store, worker } = setup(AuthorityLevel.L3);
    store.recordApproval("ticket-3", "open_draft_pr", "telegram-user");

    mockedExeca.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 } as never);
    await expect(worker.commit("ticket-3", "Fix parser safely")).resolves.toBeUndefined();

    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["diff", "--name-only"]),
      expect.any(Object),
    );
    expect(mockedExeca).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["commit"]),
      expect.any(Object),
    );

    mockedExeca.mockClear();
    mockedExeca.mockResolvedValueOnce({
      stdout: "https://github.com/acme/app/pull/42",
      stderr: "",
      exitCode: 0,
    } as never);

    await expect(worker.openDraftPr("ticket-3", "draft body")).resolves.toBe(
      "https://github.com/acme/app/pull/42",
    );

    expect(mockedExeca).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["pr", "list", "forge/ticket-3-fix-parser-safely"]),
      expect.any(Object),
    );
    expect(mockedExeca).not.toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["pr", "create"]),
      expect.any(Object),
    );
  });
});
