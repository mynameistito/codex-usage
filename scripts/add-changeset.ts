#!/usr/bin/env bun
/**
 * Non-interactive changeset creator for AI agents.
 *
 * Usage:
 *   bun run ./scripts/add-changeset.ts <type> <summary>
 *
 * Example:
 *   bun run ./scripts/add-changeset.ts patch "Fix clipboard timing"
 *   bun run ./scripts/add-changeset.ts minor "Add new feature"
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { Schema } from "effect";

/** Subset of `package.json` fields read by this script. */
const PackageJsonSchema = Schema.Struct({
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String)
  ),
  name: Schema.optionalKey(Schema.String),
  optionalDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String)
  ),
  peerDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String)
  ),
});

type PackageJson = typeof PackageJsonSchema.Type;

/** Supported Changesets semver bump types. */
type ChangesetType = "patch" | "minor" | "major";

/** Filename used to locate the project root. */
const PACKAGE_JSON_FILENAME = "package.json";

/** Allowed Changesets bump types. */
const changesetTypes = ["patch", "minor", "major"] as const;

/** Prints a fatal CLI message and terminates the process.
 * @param message - Error message to print.
 * @returns Never returns because the process exits.
 */
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** Returns whether `type` is a supported Changesets bump type.
 * @param type - Candidate Changesets bump type.
 * @returns Whether the value is a supported bump type.
 */
const isChangesetType = (type: string | undefined): type is ChangesetType =>
  type !== undefined && changesetTypes.some((value) => value === type);

/**
 * Walks parent directories from `startDir` until a `package.json` is found.
 *
 * @param startDir - Directory to begin searching from.
 * @returns The first parent directory containing `package.json`.
 */
const findProjectRoot = (startDir: string) => {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    if (existsSync(path.join(currentDir, PACKAGE_JSON_FILENAME))) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  if (existsSync(path.join(currentDir, PACKAGE_JSON_FILENAME))) {
    return currentDir;
  }

  return fail(`Could not find ${PACKAGE_JSON_FILENAME} from script location`);
};

/**
 * Reads and parses `package.json` from `packageJsonPath`.
 *
 * @param packageJsonPath - Absolute path to `package.json`.
 * @returns Parsed package metadata.
 */
const readPackageJson = (packageJsonPath: string) => {
  try {
    return Schema.decodeUnknownSync(PackageJsonSchema)(
      JSON.parse(readFileSync(packageJsonPath, "utf-8"))
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return fail(`Failed to read package.json: ${message}`);
  }
};

/**
 * Returns the package name from parsed `package.json` metadata.
 *
 * @param packageJson - Parsed package metadata.
 * @returns Valid package name.
 */
const getPackageName = (packageJson: PackageJson) => {
  if (packageJson.name === undefined || packageJson.name.trim().length === 0) {
    return fail("package.json must include a non-empty name field");
  }

  return packageJson.name;
};

/** Returns whether `@changesets/cli` is declared in `package.json`.
 * @param packageJson - Parsed package metadata.
 * @returns Whether Changesets is declared in any dependency group.
 */
const hasChangesetsCliDependency = (packageJson: PackageJson) =>
  Boolean(
    packageJson.dependencies?.["@changesets/cli"] ??
    packageJson.devDependencies?.["@changesets/cli"] ??
    packageJson.optionalDependencies?.["@changesets/cli"] ??
    packageJson.peerDependencies?.["@changesets/cli"]
  );

/**
 * Verifies that `@changesets/cli` is declared and installed.
 *
 * @param packageJson - Parsed package metadata.
 * @param projectRoot - Repository root directory.
 * @returns Nothing when the dependency is installed; otherwise exits.
 */
const assertChangesetsCliInstalled = (
  packageJson: PackageJson,
  projectRoot: string
): void => {
  if (!hasChangesetsCliDependency(packageJson)) {
    fail(
      'Missing dependency: "@changesets/cli"\nInstall it with: bun add -d "@changesets/cli"'
    );
  }

  const requireFromProject = createRequire(
    path.join(projectRoot, PACKAGE_JSON_FILENAME)
  );

  try {
    requireFromProject.resolve("@changesets/cli/package.json");
  } catch {
    fail(
      'Dependency "@changesets/cli" is declared but not installed\nRun: bun install'
    );
  }
};

/**
 * Parses and validates the requested Changesets bump type.
 *
 * @param type - Raw CLI type argument.
 * @returns Validated Changesets bump type.
 */
const parseChangesetType = (type: string | undefined): ChangesetType => {
  if (isChangesetType(type)) {
    return type;
  }

  return fail(`Invalid type: ${type}. Must be patch, minor, or major.`);
};

/**
 * Generates a unique changeset filename inside `.changeset`.
 *
 * @param changesetDir - Absolute path to the `.changeset` directory.
 * @param content - Changeset file contents.
 * @returns Absolute path to the newly created changeset.
 */
const createChangesetFile = (changesetDir: string, content: string) => {
  mkdirSync(changesetDir, { recursive: true });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = randomBytes(4).toString("hex");
    const filename = path.join(changesetDir, `${id}.md`);

    try {
      writeFileSync(filename, content, { flag: "wx" });

      return filename;
    } catch (error) {
      if (
        !Schema.is(Schema.Struct({ code: Schema.String }))(error) ||
        error.code !== "EEXIST"
      ) {
        throw error;
      }
    }
  }

  return fail("Could not generate a unique changeset filename");
};

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: add-changeset.ts <type> <summary>");
  console.error("  type: patch | minor | major");
  console.error("  summary: Description of the change");
  process.exit(1);
}

const [type, ...summaryParts] = args;
const changesetType = parseChangesetType(type);
const summary = summaryParts.join(" ");

if (!summary.trim()) {
  console.error("Summary cannot be empty");
  process.exit(1);
}

const projectRoot = findProjectRoot(import.meta.dirname);
const packageJsonPath = path.join(projectRoot, PACKAGE_JSON_FILENAME);
const packageJson = readPackageJson(packageJsonPath);
const packageName = getPackageName(packageJson);

assertChangesetsCliInstalled(packageJson, projectRoot);

const changesetDir = path.join(projectRoot, ".changeset");

const content = `---
"${packageName}": ${changesetType}
---

${summary.trim()}
`;

const filename = createChangesetFile(changesetDir, content);
const relativeFilename = path.relative(projectRoot, filename);

console.log(`✓ Created changeset: ${relativeFilename}`);

console.log(`  Package: ${packageName}`);

console.log(`  Type: ${changesetType}`);

console.log(`  Summary: ${summary}`);
