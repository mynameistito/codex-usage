#!/usr/bin/env bun

import { appendFileSync, readFileSync } from "node:fs";

import { Predicate, Schema } from "effect";

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
export type ReleaseCommand = "github" | "npm";

/** Error raised for expected release workflow failures. */
export class ReleaseError extends Error {
  /** Stable discriminant for release errors. */
  readonly _tag = "ReleaseError" as const;

  /** Creates a release error with a human-readable message.
   * @param message - Explanation of the release failure.
   */
  constructor(message: string) {
    super(message);
    this.name = "ReleaseError";
  }
}

const PACKAGE_JSON_PATH = "package.json";
const CHANGELOG_PATH = "CHANGELOG.md";
const PUBLISHED_VERSION_CONFLICT = "Cannot stage previously published version";

/** Parses the release subcommand passed to `node --run release`.
 * @param command - Raw subcommand argument.
 * @returns The supported release command.
 */
export const parseReleaseCommand = (
  command: string | undefined
): ReleaseCommand => {
  if (command === "github" || command === "npm") {
    return command;
  }

  throw new ReleaseError("Usage: node --run release -- <npm | github>");
};

/** Reads and parses package metadata needed by release operations.
 * @param packageJsonPath - Package metadata file path.
 * @returns Validated release package metadata.
 */
export const readReleasePackage = (
  packageJsonPath = PACKAGE_JSON_PATH
): ReleasePackage => {
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

  if (!Predicate.isObject(parsed) || Array.isArray(parsed)) {
    throw new ReleaseError("package.json must contain an object");
  }

  if (!("name" in parsed) || !("version" in parsed)) {
    throw new ReleaseError("package.json must include name and version fields");
  }

  const { name, version } = parsed;

  if (!Schema.is(Schema.String)(name) || name.trim().length === 0) {
    throw new ReleaseError("package.json must include a non-empty name field");
  }

  if (!Schema.is(Schema.String)(version) || version.trim().length === 0) {
    throw new ReleaseError(
      "package.json must include a non-empty version field"
    );
  }

  return { name, version };
};

/** Returns the npm package spec for a release package.
 * @param releasePackage - Package name and version.
 * @returns The npm package specifier.
 */
export const packageSpec = (releasePackage: ReleasePackage) =>
  `${releasePackage.name}@${releasePackage.version}`;

/** Returns GitHub Actions outputs shared by release subcommands.
 * @param releasePackage - Package name and version.
 * @returns Shared release output values.
 */
export const createBaseOutputs = (
  releasePackage: ReleasePackage
): ReleaseOutputs => ({
  name: releasePackage.name,
  tag: `v${releasePackage.version}`,
  version: releasePackage.version,
});

/** Writes release outputs to GitHub Actions when `GITHUB_OUTPUT` is present.
 * @param outputs - Release output key/value pairs.
 * @returns Nothing.
 */
export const writeGithubOutputs = (outputs: ReleaseOutputs) => {
  const outputPath = process.env["GITHUB_OUTPUT"];

  const lines = Object.entries(outputs).map(
    ([key, value]) => `${key}=${value}`
  );

  if (outputPath !== undefined && outputPath.length > 0) {
    appendFileSync(outputPath, `${lines.join("\n")}\n`);
  }

  for (const line of lines) {
    console.log(line);
  }
};

/** Runs an external command without invoking a shell.
 * @param command - Executable name.
 * @param args - Arguments passed to the executable.
 * @returns Captured command result.
 */
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

/** Stages the package with npm or reports that it is already released.
 * @param runner - External command runner.
 * @param releasePackage - Package being released.
 * @returns Completion promise.
 */
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

  const publishedOutput = `${published.stdout}${published.stderr}`;

  if (!/E404|404 Not Found|is not in this registry/iu.test(publishedOutput)) {
    throw new ReleaseError(
      `npm view failed with ${published.exitCode}: ${publishedOutput.trim()}`
    );
  }

  const stagePublish = await runner("npm", ["stage", "publish", "."]);
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

/** Extracts release notes for `version` from a Changesets changelog.
 * @param changelog - Full changelog contents.
 * @param version - Version whose notes are selected.
 * @returns Release notes or a fallback title.
 */
export const extractReleaseNotes = (changelog: string, version: string) => {
  const escapedVersion = version.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const heading = new RegExp(`^## ${escapedVersion}[ \\t]*$`, "mu");
  const match = heading.exec(changelog);
  const newlineStart = match ? match.index + match[0].length : -1;
  let bodyStart = -1;

  if (newlineStart !== -1) {
    const newlineLength = changelog.startsWith("\r\n", newlineStart) ? 2 : 1;
    bodyStart = newlineStart + newlineLength;
  }

  const nextHeading =
    bodyStart === -1 ? -1 : changelog.indexOf("\n## ", bodyStart);

  if (bodyStart === -1) {
    return `Release ${version}`;
  }

  return changelog
    .slice(bodyStart, nextHeading === -1 ? undefined : nextHeading)
    .trim();
};

/** Creates a GitHub release unless the tag already exists.
 * @param runner - External command runner.
 * @param releasePackage - Package being released.
 * @param changelog - Changelog used to create release notes.
 * @returns Completion promise.
 */
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

  if (target === undefined || target.length === 0) {
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

/** Dispatches a release subcommand.
 * @param args - Command-line arguments after the executable name.
 * @returns Completion promise.
 */
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
