import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
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

/** Path to the built CLI artifact exercised by integration tests. */
const distCliPath = "dist/cli.js";

/** Returns the newest modification time among TypeScript sources under `directory`. */
const newestSourceMtime = (directory: string): number => {
  let newest = 0;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceMtime(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      newest = Math.max(newest, statSync(entryPath).mtimeMs);
    }
  }

  return newest;
};

/** Returns whether `dist/cli.js` is missing or older than current source inputs. */
const distCliIsStale = (): boolean => {
  if (!existsSync(distCliPath)) {
    return true;
  }

  const distMtime = statSync(distCliPath).mtimeMs;
  const sourceMtime = Math.max(
    newestSourceMtime("src"),
    statSync("package.json").mtimeMs,
    statSync("tsdown.config.ts").mtimeMs
  );

  return sourceMtime > distMtime;
};

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
    if (distCliIsStale()) {
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
