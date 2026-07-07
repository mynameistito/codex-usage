import { createRequire } from "node:module";

/** Module-scoped `require` used to load `package.json` at runtime. */
const requirePackageJson = createRequire(import.meta.url);

/** Minimal package metadata fields used for CLI titles. */
interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

/** Type guard for {@link PackageMetadata}. */
const isPackageMetadata = (value: unknown): value is PackageMetadata => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("name" in value) || typeof value.name !== "string") {
    return false;
  }

  return "version" in value && typeof value.version === "string";
};

/** Returns the published package name and version for CLI headings. */
export const packageTitle = (): string => {
  const metadata = requirePackageJson("../package.json") as unknown;
  if (!isPackageMetadata(metadata)) {
    return "codex-usage";
  }

  return `${metadata.name} v${metadata.version}`;
};
