import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { selectJsPlugins } from "ultracite/oxlint/js-plugins";
import vitest from "ultracite/oxlint/vitest";

const jsPlugins = selectJsPlugins(["github", "jsdoc-js", "sonarjs", "tsdoc"]);

export default defineConfig({
  env: core.env,
  extends: [core, vitest, jsPlugins, antiSlop],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: jsPlugins.jsPlugins,
  // Explicit undefined is meaningful with exactOptionalPropertyTypes.
  rules: { "sonarjs/no-redundant-optional": "off" },
  options: { typeAware: true },
});
