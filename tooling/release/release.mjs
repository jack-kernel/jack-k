#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseReleaseArgs } from "./dist/release-policy.js";
import { removeEmptyReleaseHeaders } from "./dist/release-policy.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const { version, dryRun } = parseReleaseArgs(process.argv.slice(2));
const tag = `v${version}`;

const run = (command, args, mutating = false) => {
  console.log(`\n> ${command} ${args.join(" ")}`);
  if (!dryRun || !mutating) execFileSync(command, args, { cwd: root, stdio: "inherit" });
};

const runPnpm = (args, mutating = false) => run(pnpm, args, mutating);

if (!dryRun) {
  try {
    execFileSync("git", ["show-ref", "--tags", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: root, stdio: "ignore" });
    throw new Error(`Release tag already exists: ${tag}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Release tag already exists")) throw error;
  }
}

runPnpm(["turbo", "build", "typecheck", "lint", "test"]);
runPnpm(["exec", "versioning", "check-secrets"]);
runPnpm(["run", "version:validate"]);

if (dryRun) {
  console.log(`\nDry run: would create release ${version} and tag ${tag}.`);
  process.exit(0);
}

runPnpm(["exec", "versioning", "release", version, "--no-commit", "--no-tag", "--message", `release: ${tag}`], true);
const changelogPath = join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const normalizedChangelog = removeEmptyReleaseHeaders(changelog, version);
if (normalizedChangelog !== changelog) writeFileSync(changelogPath, normalizedChangelog);
runPnpm(["exec", "versioning", "update-readme", "--readme", "README.md", "--changelog", "CHANGELOG.md", "--pkg", "package.json"], true);
runPnpm(["run", "version:validate"]);
runPnpm(["exec", "versioning", "check-changelog", "--version", version]);
run("git", ["diff", "--check"]);

const packagePaths = ["package.json", "pnpm-lock.yaml", "README.md", "CHANGELOG.md", "versioning.config.json", ".husky"];
for (const workspace of ["packages", "apps", "tooling"]) {
  for (const entry of readdirSync(join(root, workspace), { withFileTypes: true })) {
    if (entry.isDirectory()) packagePaths.push(`${workspace}/${entry.name}/package.json`);
  }
}
const trackedFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
run("git", trackedFiles ? ["add", "--", ...packagePaths] : ["add", "--all"], true);
runPnpm(["exec", "versioning", "check-secrets"]);
run("git", ["diff", "--cached", "--check"]);
run("git", ["commit", "-m", `release: ${tag}`], true);
run("git", ["tag", "-a", tag, "-m", `Release ${version}`], true);
runPnpm(["exec", "versioning", "guard-tag", "--tag", tag]);

console.log(`\nRelease ${version} created as ${tag}. Push the commit and tag when ready.`);
