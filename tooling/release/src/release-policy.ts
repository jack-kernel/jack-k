export interface ReleaseArgs {
  version: string;
  dryRun: boolean;
}

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const parseReleaseArgs = (args: readonly string[]): ReleaseArgs => {
  const dryRun = args.includes("--dry-run");
  const values = args.filter((arg) => arg !== "--dry-run" && arg !== "--");
  if (values.length !== 1) throw new Error("Usage: pnpm release [--dry-run] <semantic version>");
  const version = values[0];
  if (!version || !semverPattern.test(version)) throw new Error(`Release version must be a semantic version, received: ${version ?? "<missing>"}`);
  return { version, dryRun };
};

export const removeEmptyReleaseHeaders = (content: string, version: string): string => {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(`^(?:# ${escapedVersion} \\([^\\n]+\\)\\s*)+`), "");
};
