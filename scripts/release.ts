#!/usr/bin/env bun

import { appendFileSync, readFileSync } from "node:fs";

/** Package metadata required by the release workflow. */
export interface ReleasePackage {
  readonly name: string;
  readonly version: string;
}

/** GitHub Actions output keys written by release commands. */
export interface ReleaseOutputs {
  readonly name: string;
  readonly published?: "true";
  readonly staged?: "true";
  readonly tag: string;
  readonly version: string;
}

/** Result from an external release command. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** External command runner used by release operations. */
export type CommandRunner = (
  command: string,
  args: readonly string[]
) => Promise<CommandResult>;

/** Supported release subcommands. */
export type ReleaseCommand = "gh-release" | "npm";

/** Error raised for expected release workflow failures. */
export class ReleaseError extends Error {
  /** Stable discriminant for release errors. */
  readonly _tag = "ReleaseError" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReleaseError";
  }
}

const PACKAGE_JSON_PATH = "package.json";
const CHANGELOG_PATH = "CHANGELOG.md";
const PUBLISHED_VERSION_CONFLICT = "Cannot stage previously published version";

const releaseCommands = ["gh-release", "npm"] as const;

/** Parses the release subcommand passed to `bun run release`. */
export const parseReleaseCommand = (
  command: string | undefined
): ReleaseCommand => {
  if (releaseCommands.includes(command as ReleaseCommand)) {
    return command as ReleaseCommand;
  }

  throw new ReleaseError("Usage: bun run release <npm | gh-release>");
};

/** Reads and parses package metadata needed by release operations. */
export const readReleasePackage = (
  packageJsonPath = PACKAGE_JSON_PATH
): ReleasePackage => {
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new ReleaseError("package.json must contain an object");
  }

  const packageJson = parsed as Record<string, unknown>;
  const { name, version } = packageJson;

  if (typeof name !== "string" || !name.trim()) {
    throw new ReleaseError("package.json must include a non-empty name field");
  }

  if (typeof version !== "string" || !version.trim()) {
    throw new ReleaseError(
      "package.json must include a non-empty version field"
    );
  }

  return { name, version };
};

/** Returns the npm package spec for a release package. */
export const packageSpec = (releasePackage: ReleasePackage) =>
  `${releasePackage.name}@${releasePackage.version}`;

/** Returns GitHub Actions outputs shared by release subcommands. */
export const createBaseOutputs = (
  releasePackage: ReleasePackage
): ReleaseOutputs => ({
  name: releasePackage.name,
  tag: `v${releasePackage.version}`,
  version: releasePackage.version,
});

/** Writes release outputs to GitHub Actions when `GITHUB_OUTPUT` is present. */
export const writeGithubOutputs = (outputs: ReleaseOutputs) => {
  const outputPath = process.env["GITHUB_OUTPUT"];
  const lines = Object.entries(outputs).map(
    ([key, value]) => `${key}=${value}`
  );

  if (outputPath) {
    appendFileSync(outputPath, `${lines.join("\n")}\n`);
  }

  for (const line of lines) {
    console.log(line);
  }
};

/** Runs an external command without invoking a shell. */
export const runCommand: CommandRunner = async (command, args) => {
  const processResult = Bun.spawn([command, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processResult.stdout).text(),
    new Response(processResult.stderr).text(),
    processResult.exited,
  ]);

  return { exitCode, stderr, stdout };
};

const isStagedEntryForVersion = (entry: unknown, version: string) => {
  if (typeof entry === "string") {
    return entry === version || entry.endsWith(`@${version}`);
  }

  if (!entry || typeof entry !== "object") {
    return false;
  }

  const record = entry as Record<string, unknown>;
  const packageRecord = record["package"];

  return (
    record["version"] === version ||
    (Boolean(packageRecord) &&
      typeof packageRecord === "object" &&
      (packageRecord as Record<string, unknown>)["version"] === version)
  );
};

/** Returns whether npm staged-version output contains the package version. */
export const hasStagedVersion = (input: string, version: string) => {
  const trimmed = input.trim();

  if (!trimmed) {
    return false;
  }

  const parsed = JSON.parse(trimmed) as unknown;

  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  if ("error" in parsed) {
    return false;
  }

  const staged = Array.isArray(parsed)
    ? parsed
    : Object.values(parsed as Record<string, unknown>);

  return staged.some((entry) => isStagedEntryForVersion(entry, version));
};

/** Stages the package with npm or reports that it is already released. */
export const runNpmRelease = async (
  runner: CommandRunner = runCommand,
  releasePackage = readReleasePackage()
) => {
  const spec = packageSpec(releasePackage);
  const baseOutputs = createBaseOutputs(releasePackage);
  const published = await runner("npm", ["view", spec, "version"]);

  if (published.exitCode === 0) {
    console.log(`${spec} is already published`);
    writeGithubOutputs({ ...baseOutputs, published: "true" });
    return;
  }

  const stagedList = await runner("npm", [
    "stage",
    "list",
    releasePackage.name,
    "--json",
  ]);

  try {
    if (hasStagedVersion(stagedList.stdout, releasePackage.version)) {
      console.log(`${spec} is already staged for approval`);
      writeGithubOutputs({ ...baseOutputs, staged: "true" });
      return;
    }
  } catch {
    // Non-JSON output means the version is not provably staged; publish decides.
  }

  const stagePublish = await runner("npm", [
    "stage",
    "publish",
    ".",
    "--access",
    "public",
    "--provenance",
  ]);
  const publishOutput = `${stagePublish.stdout}${stagePublish.stderr}`;

  process.stdout.write(publishOutput);

  if (stagePublish.exitCode !== 0) {
    if (publishOutput.includes(PUBLISHED_VERSION_CONFLICT)) {
      console.log(`${spec} is already published or staged`);
      writeGithubOutputs({ ...baseOutputs, published: "true" });
      return;
    }

    throw new ReleaseError(
      `npm stage publish failed with ${stagePublish.exitCode}`
    );
  }

  writeGithubOutputs({ ...baseOutputs, staged: "true" });
};

/** Extracts release notes for `version` from a Changesets changelog. */
export const extractReleaseNotes = (changelog: string, version: string) => {
  const heading = `## ${version}`;
  const start = changelog.indexOf(heading);
  const bodyStart = start === -1 ? -1 : changelog.indexOf("\n", start) + 1;
  const nextHeading =
    bodyStart === -1 ? -1 : changelog.indexOf("\n## ", bodyStart);

  if (bodyStart === -1) {
    return `Release ${version}`;
  }

  return changelog
    .slice(bodyStart, nextHeading === -1 ? undefined : nextHeading)
    .trim();
};

/** Creates a GitHub release unless the tag already exists. */
export const runGitHubRelease = async (
  runner: CommandRunner = runCommand,
  releasePackage = readReleasePackage(),
  changelog = readFileSync(CHANGELOG_PATH, "utf-8")
) => {
  const tag = `v${releasePackage.version}`;
  const existingRelease = await runner("gh", ["release", "view", tag]);

  if (existingRelease.exitCode === 0) {
    console.log(`GitHub release ${tag} already exists`);
    return;
  }

  const target = process.env["GITHUB_SHA"];

  if (!target) {
    throw new ReleaseError("GITHUB_SHA is required to create a GitHub release");
  }

  const createRelease = await runner("gh", [
    "release",
    "create",
    tag,
    "--target",
    target,
    "--title",
    packageSpec(releasePackage),
    "--notes",
    extractReleaseNotes(changelog, releasePackage.version),
  ]);

  process.stdout.write(createRelease.stdout);
  process.stderr.write(createRelease.stderr);

  if (createRelease.exitCode !== 0) {
    throw new ReleaseError(
      `gh release create failed with ${createRelease.exitCode}`
    );
  }
};

/** Dispatches a release subcommand. */
export const runRelease = async (args: readonly string[]) => {
  const command = parseReleaseCommand(args[0]);

  if (command === "npm") {
    await runNpmRelease();
    return;
  }

  await runGitHubRelease();
};

if (import.meta.main) {
  try {
    await runRelease(process.argv.slice(2));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown release error";
    console.error(message);
    process.exit(1);
  }
}
