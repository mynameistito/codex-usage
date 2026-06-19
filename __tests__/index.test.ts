import { describe, expect, test } from "bun:test";

import {
  CliError,
  CodexAuthError,
  CodexHttpError,
  CodexParseError,
} from "@/index.js";
import type { CodexUsageError } from "@/index.js";

describe("public exports", () => {
  test("exports error classes from the package root", () => {
    const errors: CodexUsageError[] = [
      new CodexAuthError({ message: "missing auth" }),
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
    expect(errors.map((error) => error._tag)).toEqual([
      "CodexAuthError",
      "CodexHttpError",
      "CodexParseError",
    ]);
  });
});
