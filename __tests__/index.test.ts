import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CliError,
  CodexAuthError,
  CodexConfigError,
  CodexHttpError,
  CodexParseError,
} from "@/index.js";
import type { CodexUsageError } from "@/index.js";

describe("public exports", () => {
  test("exports error classes from the package root", () => {
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
    expect(errors.map((error) => error._tag)).toEqual([
      "CodexAuthError",
      "CodexConfigError",
      "CodexHttpError",
      "CodexParseError",
    ]);
  });

  test("built CLI prints the published package version", async () => {
    if (!existsSync("dist/cli.js")) {
      await Bun.$`bun run build`.quiet();
    }

    const requirePackageJson = createRequire(import.meta.url);
    const packageJson = requirePackageJson("../package.json") as {
      readonly name: string;
      readonly version: string;
    };
    const directory = await mkdtemp(path.join(tmpdir(), "codex-usage-dist-"));
    const authPath = path.join(directory, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        tokens: {
          access_token: "test-access-token",
          account_id: "test-account-id",
        },
      })
    );
    const server = Bun.serve({
      fetch: () => Response.json({ plan_type: "pro" }),
      port: 0,
    });

    try {
      const child = Bun.spawn(
        [
          process.execPath,
          "dist/cli.js",
          "status",
          "--auth",
          authPath,
          "--base-url",
          `http://127.0.0.1:${server.port}`,
        ],
        { stderr: "pipe", stdout: "pipe" }
      );
      const [exitCode, stdout] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
      ]);

      expect(exitCode).toBe(0);
      expect(stdout.split("\n")[0]).toBe(
        `${packageJson.name} v${packageJson.version}`
      );
    } finally {
      server.stop(true);
      await rm(directory, { force: true, recursive: true });
    }
  });
});
