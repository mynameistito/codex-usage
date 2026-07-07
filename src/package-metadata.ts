import { createRequire } from "node:module";

const requirePackageJson = createRequire(import.meta.url);

interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

const isPackageMetadata = (value: unknown): value is PackageMetadata => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("name" in value) || typeof value.name !== "string") {
    return false;
  }

  return "version" in value && typeof value.version === "string";
};

export const packageTitle = (): string => {
  const metadata = requirePackageJson("../package.json") as unknown;
  if (!isPackageMetadata(metadata)) {
    return "codex-usage";
  }

  return `${metadata.name} v${metadata.version}`;
};
