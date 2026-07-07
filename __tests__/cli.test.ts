import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { Cause, Effect } from "effect";

import { formatUnexpectedCliError, parseArgs, runCli } from "@/cli.js";

const requirePackageJson = createRequire(import.meta.url);
const packageJson = requirePackageJson("../package.json") as {
  readonly name: string;
  readonly version: string;
};

const testBaseUrl = "https://example.test/backend-api";
const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

interface FetchCall {
  readonly body: unknown;
  readonly headers: Headers;
  readonly method: string;
  readonly url: string;
}

const createAuthFile = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-usage-test-"));
  tempDirs.push(directory);

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

  return authPath;
};

const mockFetch = (body: unknown | readonly unknown[]): FetchCall[] => {
  const calls: FetchCall[] = [];
  const bodies = Array.isArray(body) ? [...body] : [body];
  globalThis.fetch = ((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const request = input instanceof Request ? input : null;
    calls.push({
      body: init?.body,
      headers: new Headers(init?.headers ?? request?.headers),
      method: init?.method ?? request?.method ?? "GET",
      url: request?.url ?? String(input),
    });

    return Promise.resolve(Response.json(bodies.shift() ?? body));
  }) as typeof fetch;

  return calls;
};

afterEach(async () => {
  globalThis.fetch = originalFetch;

  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("parseArgs", () => {
  test("defaults to status", async () => {
    const parsed = await Effect.runPromise(parseArgs([]));

    expect(parsed).toEqual({
      command: "status",
      confirm: false,
      json: false,
    });
    expect(parsed.authPath).toBeUndefined();
    expect(parsed.baseUrl).toBeUndefined();
  });

  test("requires explicit confirmation for reset through runCli", async () => {
    const exit = await Effect.runPromiseExit(runCli(["reset"]));

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain("without --confirm");
    }
  });

  test("help takes precedence over later commands", async () => {
    const parsed = await Effect.runPromise(
      parseArgs(["--help", "reset", "--confirm"])
    );

    expect(parsed.command).toBe("help");
  });

  test("accepts verbose flags without treating them as unknown arguments", async () => {
    const parsed = await Effect.runPromise(
      parseArgs(["status", "--verbose", "-v"])
    );

    expect(parsed.command).toBe("status");
  });

  test("dispatches status json with fake auth and mocked fetch", async () => {
    const authPath = await createAuthFile();
    const calls = mockFetch({
      plan_type: "pro",
      rate_limit: {
        primary_window: {
          limit_window_seconds: 18_000,
          reset_after_seconds: 300,
          reset_at: 1_700_000_000,
          used_percent: 25,
        },
      },
      rate_limit_reset_credits: {
        available_count: 2,
      },
    });

    const output = await Effect.runPromise(
      runCli([
        "status",
        "--json",
        "--auth",
        authPath,
        "--base-url",
        testBaseUrl,
      ])
    );
    const parsed = JSON.parse(output) as { readonly planType?: string };

    expect(parsed.planType).toBe("pro");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${testBaseUrl}/wham/usage`);
    expect(calls[0]?.headers.get("authorization")).toBe(
      "Bearer test-access-token"
    );
    expect(calls[0]?.headers.get("chatgpt-account-id")).toBe("test-account-id");
  });

  test("dispatches resets json with fake auth and mocked fetch", async () => {
    const authPath = await createAuthFile();
    const calls = mockFetch({ available_count: 3, credits: [] });

    const output = await Effect.runPromise(
      runCli([
        "resets",
        "--json",
        "--auth",
        authPath,
        "--base-url",
        testBaseUrl,
      ])
    );
    const parsed = JSON.parse(output) as { readonly available_count?: number };

    expect(parsed.available_count).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${testBaseUrl}/wham/rate-limit-reset-credits`);
  });

  test("dispatches confirmed reset json with the soonest-expiring credit", async () => {
    const authPath = await createAuthFile();
    const calls = mockFetch([
      {
        available_count: 3,
        credits: [
          {
            expires_at: "2026-08-01T00:00:00Z",
            id: "RateLimitResetCredit_later",
            status: "available",
          },
          {
            expires_at: "2026-07-01T00:00:00Z",
            id: "RateLimitResetCredit_expired",
            status: "available",
          },
          {
            expires_at: "2026-07-10T00:00:00Z",
            id: "RateLimitResetCredit_soonest",
            status: "available",
          },
        ],
      },
      { code: "reset", windows_reset: 1 },
    ]);

    const output = await Effect.runPromise(
      runCli([
        "reset",
        "--confirm",
        "--json",
        "--auth",
        authPath,
        "--base-url",
        testBaseUrl,
      ])
    );
    const parsed = JSON.parse(output) as { readonly code?: string };

    expect(parsed.code).toBe("reset");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${testBaseUrl}/wham/rate-limit-reset-credits`);
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.url).toBe(
      `${testBaseUrl}/wham/rate-limit-reset-credits/consume`
    );
    expect(JSON.parse(String(calls[1]?.body))).toEqual({
      credit_id: "RateLimitResetCredit_soonest",
      redeem_request_id: expect.any(String),
    });
  });

  test("refuses confirmed reset when no credits are available", async () => {
    const authPath = await createAuthFile();
    const calls = mockFetch({
      available_count: 0,
      credits: [
        {
          expires_at: "2026-08-01T00:00:00Z",
          id: "RateLimitResetCredit_redeemed",
          status: "redeemed",
        },
      ],
    });

    const exit = await Effect.runPromiseExit(
      runCli([
        "reset",
        "--confirm",
        "--auth",
        authPath,
        "--base-url",
        testBaseUrl,
      ])
    );

    expect(exit._tag).toBe("Failure");
    expect(calls).toHaveLength(1);
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain("No available reset credits");
    }
  });

  test("refuses confirmed reset when available credits have invalid expiry dates", async () => {
    const authPath = await createAuthFile();
    const calls = mockFetch({
      available_count: 1,
      credits: [
        {
          expires_at: "not a date",
          id: "RateLimitResetCredit_invalid_expiry",
          status: "available",
        },
      ],
    });

    const exit = await Effect.runPromiseExit(
      runCli([
        "reset",
        "--confirm",
        "--auth",
        authPath,
        "--base-url",
        testBaseUrl,
      ])
    );

    expect(exit._tag).toBe("Failure");
    expect(calls).toHaveLength(1);
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain("No available reset credits");
    }
  });

  test("rejects insecure remote base URLs before fetching", async () => {
    const authPath = await createAuthFile();
    const calls = mockFetch({ plan_type: "pro" });

    const exit = await Effect.runPromiseExit(
      runCli([
        "status",
        "--auth",
        authPath,
        "--base-url",
        "http://example.test",
      ])
    );

    expect(exit._tag).toBe("Failure");
    expect(calls).toHaveLength(0);
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Base URL must use HTTPS unless it is localhost"
      );
    }
  });

  test("exits with usage code for invalid CLI base URLs", async () => {
    const authPath = await createAuthFile();
    const child = Bun.spawn(
      [
        process.execPath,
        "src/cli.ts",
        "status",
        "--auth",
        authPath,
        "--base-url",
        "http://example.test",
      ],
      { stderr: "pipe", stdout: "pipe" }
    );

    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("Base URL must use HTTPS unless it is localhost");
  });

  test("formats unexpected failures concisely by default", () => {
    const message = formatUnexpectedCliError(Cause.die("boom"), []);

    expect(message).toBe("An unexpected error occurred");
  });

  test("formats unexpected failures verbosely with --verbose", () => {
    const message = formatUnexpectedCliError(Cause.die("boom"), ["--verbose"]);

    expect(message).toContain("boom");
  });

  test("prints package name and version in status output", async () => {
    const authPath = await createAuthFile();
    mockFetch({ plan_type: "pro" });

    const output = await Effect.runPromise(
      runCli(["status", "--auth", authPath, "--base-url", testBaseUrl])
    );

    expect(output.split("\n")[0]).toBe(
      `${packageJson.name} v${packageJson.version}`
    );
  });
});
