import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Cause, Effect, Exit, Schema } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { formatUnexpectedCliError, parseArgs, runCli } from "@/cli.js";
import type { JsonValue } from "@/codex/types.js";
import { packageTitle } from "@/package-metadata.js";

const testBaseUrl = "https://example.test/backend-api";
const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

const isJsonValueArray = (
  value: JsonValue | readonly JsonValue[]
): value is readonly JsonValue[] => Array.isArray(value);

const failureText = <A, E>(exit: Exit.Exit<A, E>): string => {
  if (Exit.isFailure(exit)) {
    return exit.cause.toString();
  }

  throw new Error("Expected the operation to fail");
};

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

const mockFetch = (body: JsonValue | readonly JsonValue[]): FetchCall[] => {
  const calls: FetchCall[] = [];
  const bodies = isJsonValueArray(body) ? [...body] : [body];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) => {
      let url: string;
      let requestHeaders: Headers | undefined;
      let requestMethod: string | undefined;

      if (input instanceof Request) {
        const { headers, method, url: requestUrl } = input;
        url = requestUrl;
        requestHeaders = headers;
        requestMethod = method;
      } else if (input instanceof URL) {
        url = input.href;
      } else {
        url = input;
      }

      calls.push({
        body: init?.body,
        headers: new Headers(init?.headers ?? requestHeaders),
        method: init?.method ?? requestMethod ?? "GET",
        url,
      });

      return await Promise.resolve(Response.json(bodies.shift() ?? body));
    },
    { preconnect: () => null }
  );

  return calls;
};

describe(parseArgs, () => {
  afterEach(async () => {
    globalThis.fetch = originalFetch;

    await Promise.all(
      tempDirs.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  it("defaults to status", async () => {
    const parsed = await Effect.runPromise(parseArgs([]));

    expect(parsed).toStrictEqual({
      command: "status",
      confirm: false,
      json: false,
    });
    expect(parsed.authPath).toBeUndefined();
    expect(parsed.baseUrl).toBeUndefined();
  });

  it("requires explicit confirmation for reset through runCli", async () => {
    const exit = await Effect.runPromiseExit(runCli(["reset"]));

    expect(failureText(exit)).toContain("without --confirm");
  });

  it("help takes precedence over later commands", async () => {
    const parsed = await Effect.runPromise(
      parseArgs(["--help", "reset", "--confirm"])
    );

    expect(parsed.command).toBe("help");
  });

  it("accepts verbose flags without treating them as unknown arguments", async () => {
    const parsed = await Effect.runPromise(
      parseArgs(["status", "--verbose", "-v"])
    );

    expect(parsed.command).toBe("status");
  });

  it("dispatches status json with fake auth and mocked fetch", async () => {
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

    const parsed = Schema.decodeUnknownSync(
      Schema.Struct({ planType: Schema.optionalKey(Schema.String) })
    )(JSON.parse(output));

    expect(parsed.planType).toBe("pro");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${testBaseUrl}/wham/usage`);
    expect(calls[0]?.headers.get("authorization")).toBe(
      "Bearer test-access-token"
    );
    expect(calls[0]?.headers.get("chatgpt-account-id")).toBe("test-account-id");
  });

  it("dispatches resets json with fake auth and mocked fetch", async () => {
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

    const parsed = Schema.decodeUnknownSync(
      Schema.Struct({
        available_count: Schema.optionalKey(Schema.Number),
      })
    )(JSON.parse(output));

    expect(parsed.available_count).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${testBaseUrl}/wham/rate-limit-reset-credits`);
  });

  it("dispatches confirmed reset json with the soonest-expiring credit", async () => {
    const authPath = await createAuthFile();

    const calls = mockFetch([
      {
        available_count: 3,
        credits: [
          {
            expires_at: "2099-08-01T00:00:00Z",
            id: "RateLimitResetCredit_later",
            status: "available",
          },
          {
            expires_at: "2026-07-01T00:00:00Z",
            id: "RateLimitResetCredit_expired",
            status: "available",
          },
          {
            expires_at: "2099-07-10T00:00:00Z",
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

    const parsed = Schema.decodeUnknownSync(
      Schema.Struct({ code: Schema.optionalKey(Schema.String) })
    )(JSON.parse(output));

    expect(parsed.code).toBe("reset");
    expect(calls.map(({ method, url }) => ({ method, url }))).toStrictEqual([
      { method: "GET", url: `${testBaseUrl}/wham/rate-limit-reset-credits` },
      {
        method: "POST",
        url: `${testBaseUrl}/wham/rate-limit-reset-credits/consume`,
      },
    ]);

    const consumeRequest = Schema.decodeUnknownSync(
      Schema.Struct({
        credit_id: Schema.String,
        redeem_request_id: Schema.String,
      })
    )(JSON.parse(String(calls[1]?.body)));

    expect(consumeRequest.credit_id).toBe("RateLimitResetCredit_soonest");
    expect(consumeRequest.redeem_request_id.length).toBeGreaterThan(0);
  });

  it("refuses confirmed reset when no credits are available", async () => {
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

    expect(calls).toHaveLength(1);
    expect(failureText(exit)).toContain("No available reset credits");
  });

  it("refuses confirmed reset when available credits have invalid expiry dates", async () => {
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

    expect(calls).toHaveLength(1);
    expect(failureText(exit)).toContain("No available reset credits");
  });

  it("rejects insecure remote base URLs before fetching", async () => {
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

    expect(calls).toHaveLength(0);
    expect(failureText(exit)).toContain(
      "Base URL must use HTTPS unless it is localhost"
    );
  });

  it("exits with usage code for invalid CLI base URLs", async () => {
    const authPath = await createAuthFile();

    const child = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "status",
        "--auth",
        authPath,
        "--base-url",
        "http://example.test",
      ],
      { encoding: "utf-8" }
    );

    expect(child.status).toBe(2);
    expect(child.stderr).toContain(
      "Base URL must use HTTPS unless it is localhost"
    );
  });

  it("formats unexpected failures concisely by default", () => {
    const message = formatUnexpectedCliError(Cause.die("boom"), []);

    expect(message).toBe("An unexpected error occurred");
  });

  it("formats unexpected failures verbosely with --verbose", () => {
    const message = formatUnexpectedCliError(Cause.die("boom"), ["--verbose"]);

    expect(message).toContain("boom");
  });

  it("prints package name and version in status output", async () => {
    const authPath = await createAuthFile();
    mockFetch({ plan_type: "pro" });

    const output = await Effect.runPromise(
      runCli(["status", "--auth", authPath, "--base-url", testBaseUrl])
    );

    expect(output.split("\n")[0]).toBe(packageTitle());
  });
});
