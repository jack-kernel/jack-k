import { describe, expect, it } from "vitest";
import { isAllowedUser, parseApprovalAction, parseTicketCommand } from "./parse.js";

describe("Telegram intake", () => {
  it("parses a ticket command without changing the description", () => {
    expect(parseTicketCommand("/ticket acme/app Fix parser; preserve this text")).toEqual({ repo: "acme/app", description: "Fix parser; preserve this text" });
  });

  it("rejects malformed or empty ticket commands", () => {
    expect(parseTicketCommand("/ticket")).toBeUndefined();
    expect(parseTicketCommand("/ticket acme/app ")).toBeUndefined();
    expect(parseTicketCommand("hello acme/app issue")).toBeUndefined();
  });

  it("authenticates by numeric Telegram user id and parses approval actions", () => {
    expect(isAllowedUser(42, new Set([42, 43]))).toBe(true);
    expect(isAllowedUser(99, new Set([42, 43]))).toBe(false);
    expect(parseApprovalAction("approve:ticket-1")).toEqual({ ticketId: "ticket-1", action: "open_draft_pr" });
    expect(parseApprovalAction("reject:ticket-1")).toEqual({ ticketId: "ticket-1", action: "reject" });
    expect(parseApprovalAction("approve:ticket-1:extra")).toBeUndefined();
  });
});
