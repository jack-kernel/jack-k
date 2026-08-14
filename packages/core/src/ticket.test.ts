import { describe, expect, it } from "vitest";
import { canTransition } from "./ticket.js";

describe("ticket state machine", () => {
  it("allows the read-only intake path", () => {
    expect(canTransition("received", "triaging")).toBe(true);
    expect(canTransition("triaging", "planned")).toBe(true);
    expect(canTransition("planned", "executing")).toBe(true);
    expect(canTransition("executing", "awaiting_approval")).toBe(true);
  });

  it("allows terminal failure and rejects illegal skips", () => {
    expect(canTransition("executing", "failed")).toBe(true);
    expect(canTransition("received", "pr_open")).toBe(false);
    expect(canTransition("merged", "executing")).toBe(false);
  });
});
