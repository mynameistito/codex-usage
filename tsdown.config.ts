import { defineConfig } from "tsdown";

const shared = {
  deps: {
    neverBundle: ["effect"],
  },
  dts: true,
  format: ["esm"],
  outDir: "dist",
  outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
  platform: "node" as const,
};

export default defineConfig([
  {
    ...shared,
    clean: true,
    entry: { index: "src/index.ts" },
  },
  {
    ...shared,
    clean: false,
    entry: { cli: "src/cli.ts" },
  },
]);
