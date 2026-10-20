import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  CliError,
  CodexAuthError,
  CodexConfigError,
  CodexHttpError,
  CodexParseError,
} from "@/index.js";
import type { CodexUsageError } from "@/index.js";

describe("public exports", () => {
  it("exports error classes from the package root", () => {
    const errors: CodexUsageError[] = [
      new CodexAuthError({ message: "missing auth" }),
      new CodexConfigError({ message: "invalid base URL" }),
      new CodexHttpError({
        body: "{}",
        message: "request failed",
        status: 500,
        statusText: "Internal Server Error",
      }),
      new CodexParseError({ message: "bad payload", value: null }),
    ];

    expect(new CliError({ exitCode: 1, message: "failed" })).toBeInstanceOf(
      CliError
    );
    expect(errors.map((error) => error._tag)).toStrictEqual([
      "CodexAuthError",
      "CodexConfigError",
      "CodexHttpError",
      "CodexParseError",
    ]);
  });

  it("built CLI prints help without accessing the network", () => {
    const stdout = execFileSync(process.execPath, ["dist/cli.js", "--help"], {
      encoding: "utf-8",
    });

    expect(stdout.startsWith("codex-usage\n\nUsage:")).toBeTruthy();
  }, 15_000);
});
