import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthorityLevel } from "@jack-k/core";
import { TicketStore } from "./store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const makeStore = () => {
  const root = mkdtempSync(join(tmpdir(), "jack-k-store-"));
  roots.push(root);
  return new TicketStore({
    dbPath: join(root, "tickets.db"),
    eventDir: join(root, "events"),
  });
};

const ticket = (repo: string = "acme/app") => ({
  id: "ticket-1",
  repo,
  description: "Improve the parser",
  source: "manual" as const,
  authority: AuthorityLevel.L2,
});

describe("TicketStore", () => {
  it("persists transitions as JSONL events and projects the current ticket", () => {
    const store = makeStore();
    store.createTicket(ticket());
    store.transition("ticket-1", "triaging");
    store.transition("ticket-1", "planned");

    expect(store.getTicket("ticket-1")?.state).toBe("planned");
    const events = store.streamEvents(0);
    expect(events.map((event) => event.event.type)).toEqual([
      "ticket_created",
      "ticket_transitioned",
      "ticket_transitioned",
    ]);
    expect(
      readFileSync(events[0]?.filePath ?? "", "utf8")
        .split("\n")
        .filter(Boolean),
    ).toHaveLength(3);
  });

  it("rejects illegal transitions", () => {
    const store = makeStore();
    store.createTicket(ticket());
    expect(() => store.transition("ticket-1", "pr_open")).toThrow(/illegal/i);
  });

  it("rebuilds the SQLite projection from the event log", () => {
    const store = makeStore();
    store.createTicket(ticket());
    store.transition("ticket-1", "triaging");
    store.rebuild();
    expect(store.getTicket("ticket-1")?.state).toBe("triaging");
  });

  it("allows only one active claim per repository", () => {
    const store = makeStore();
    store.createTicket(ticket());
    store.createTicket({ ...ticket("acme/app"), id: "ticket-2" });
    expect(store.claim("ticket-1")).toBe(true);
    expect(store.claim("ticket-2")).toBe(false);
    store.release("ticket-1");
    expect(store.claim("ticket-2")).toBe(true);
  });

  it("records and checks approvals", () => {
    const store = makeStore();
    store.createTicket(ticket());
    expect(store.hasApproval("ticket-1", "open_draft_pr")).toBe(false);
    store.recordApproval("ticket-1", "open_draft_pr", "telegram-user-1");
    expect(store.hasApproval("ticket-1", "open_draft_pr")).toBe(true);
  });

  it("persists completed executor output and rebuilds it from the audit log", () => {
    const store = makeStore();
    store.createTicket(ticket());
    const result = {
      ok: true,
      summary: "Done",
      filesChanged: ["src/parser.ts"],
      transcript: "verified",
    };
    const persistedResult = {
      ...result,
      transcript: "Executor output redacted before persistence.",
    };
    store.recordCompletedExecution("ticket-1", "forge/ticket-1", result);

    expect(store.getCompletedExecution("ticket-1")).toMatchObject({
      branch: "forge/ticket-1",
      result: persistedResult,
    });
    store.rebuild();
    expect(store.getCompletedExecution("ticket-1")).toMatchObject({
      branch: "forge/ticket-1",
      result: persistedResult,
    });
  });
});
