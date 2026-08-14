import { describe, expect, it } from "vitest";
import { AuthorityLevel, atLeast } from "./authority.js";

describe("authority levels", () => {
  it("orders levels from L0 through L6", () => {
    expect(atLeast(AuthorityLevel.L6, AuthorityLevel.L0)).toBe(true);
    expect(atLeast(AuthorityLevel.L3, AuthorityLevel.L3)).toBe(true);
    expect(atLeast(AuthorityLevel.L1, AuthorityLevel.L2)).toBe(false);
  });

  it("does not treat an invalid numeric level as sufficient", () => {
    expect(atLeast(99 as AuthorityLevel, AuthorityLevel.L6)).toBe(false);
    expect(atLeast(AuthorityLevel.L0, -1 as AuthorityLevel)).toBe(false);
  });
});
