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

/** Subset of `package.json` fields read by this script. */
interface PackageJson {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  name?: unknown;
  optionalDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

/** Supported Changesets semver bump types. */
type ChangesetType = "patch" | "minor" | "major";

/** Filename used to locate the project root. */
const PACKAGE_JSON_FILENAME = "package.json";

/** Allowed Changesets bump types. */
const changesetTypes = ["patch", "minor", "major"] as const;

/** Returns whether `type` is a supported Changesets bump type. */
const isChangesetType = (type: string | undefined): type is ChangesetType =>
  changesetTypes.includes(type as ChangesetType);

/**
 * Walks parent directories from `startDir` until a `package.json` is found.
 *
 * @param startDir - Directory to begin searching from.
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

  console.error(`Could not find ${PACKAGE_JSON_FILENAME} from script location`);
  process.exit(1);
};

/**
 * Reads and parses `package.json` from `packageJsonPath`.
 *
 * @param packageJsonPath - Absolute path to `package.json`.
 */
const readPackageJson = (packageJsonPath: string) => {
  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to read package.json: ${message}`);
    process.exit(1);
  }
};

/**
 * Returns the package name from parsed `package.json` metadata.
 *
 * @param packageJson - Parsed package metadata.
 */
const getPackageName = (packageJson: PackageJson) => {
  if (typeof packageJson.name !== "string" || !packageJson.name.trim()) {
    console.error("package.json must include a non-empty name field");
    process.exit(1);
  }

  return packageJson.name;
};

/** Returns whether `@changesets/cli` is declared in `package.json`. */
const hasChangesetsCliDependency = (packageJson: PackageJson) =>
  Boolean(
    packageJson.dependencies?.["@changesets/cli"] ||
    packageJson.devDependencies?.["@changesets/cli"] ||
    packageJson.optionalDependencies?.["@changesets/cli"] ||
    packageJson.peerDependencies?.["@changesets/cli"]
  );

/**
 * Verifies that `@changesets/cli` is declared and installed.
 *
 * @param packageJson - Parsed package metadata.
 * @param projectRoot - Repository root directory.
 */
const assertChangesetsCliInstalled = (
  packageJson: PackageJson,
  projectRoot: string
) => {
  if (!hasChangesetsCliDependency(packageJson)) {
    console.error('Missing dependency: "@changesets/cli"');
    console.error('Install it with: bun add -d "@changesets/cli"');
    process.exit(1);
  }

  const requireFromProject = createRequire(
    path.join(projectRoot, PACKAGE_JSON_FILENAME)
  );

  try {
    requireFromProject.resolve("@changesets/cli/package.json");
  } catch {
    console.error('Dependency "@changesets/cli" is declared but not installed');
    console.error("Run: bun install");
    process.exit(1);
  }
};

/**
 * Parses and validates the requested Changesets bump type.
 *
 * @param type - Raw CLI type argument.
 */
const parseChangesetType = (type: string | undefined): ChangesetType => {
  if (isChangesetType(type)) {
    return type;
  }

  console.error(`Invalid type: ${type}. Must be patch, minor, or major.`);
  process.exit(1);
};

/**
 * Generates a unique changeset filename inside `.changeset`.
 *
 * @param changesetDir - Absolute path to the `.changeset` directory.
 */
const createChangesetFilename = (changesetDir: string) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = randomBytes(4).toString("hex");
    const filename = path.join(changesetDir, `${id}.md`);

    if (!existsSync(filename)) {
      return filename;
    }
  }

  console.error("Could not generate a unique changeset filename");
  process.exit(1);
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
const filename = createChangesetFilename(changesetDir);
const relativeFilename = path.relative(projectRoot, filename);

const content = `---
"${packageName}": ${changesetType}
---

${summary.trim()}
`;

mkdirSync(changesetDir, { recursive: true });
writeFileSync(filename, content);
console.log(`✓ Created changeset: ${relativeFilename}`);
console.log(`  Package: ${packageName}`);
console.log(`  Type: ${changesetType}`);
console.log(`  Summary: ${summary}`);
