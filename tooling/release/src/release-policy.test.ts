import { describe, expect, it } from "vitest";
import { parseReleaseArgs } from "./release-policy.js";
import { removeEmptyReleaseHeaders } from "./release-policy.js";

describe("release arguments", () => {
  it("accepts a semantic version", () => {
    expect(parseReleaseArgs(["0.1.0"])).toEqual({ version: "0.1.0", dryRun: false });
  });

  it("supports a dry run without allowing an ambiguous version", () => {
    expect(parseReleaseArgs(["--dry-run", "1.2.3"])).toEqual({ version: "1.2.3", dryRun: true });
    expect(parseReleaseArgs(["--dry-run", "--", "1.2.3"])).toEqual({ version: "1.2.3", dryRun: true });
    expect(() => parseReleaseArgs(["--dry-run"])).toThrow(/version/i);
    expect(() => parseReleaseArgs(["1.2.3", "1.2.4"])).toThrow(/usage/i);
  });

  it("rejects tags and non-semver versions", () => {
    expect(() => parseReleaseArgs(["v0.1.0"])).toThrow(/semantic version/i);
    expect(() => parseReleaseArgs(["0.1"])).toThrow(/semantic version/i);
  });

  it("removes empty first-release headings before README generation", () => {
    const content = "# 0.1.0 (2026-08-14)\n\n\n# Changelog\n\n## [0.1.0] - 2026-08-13\n\n### Added\n\n- Initial release.\n";
    expect(removeEmptyReleaseHeaders(content, "0.1.0")).toBe("# Changelog\n\n## [0.1.0] - 2026-08-13\n\n### Added\n\n- Initial release.\n");
  });
});
