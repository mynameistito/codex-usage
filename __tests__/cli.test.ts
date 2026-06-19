import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Effect } from "effect";

import { parseArgs, runCli } from "@/cli.js";

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

const mockFetch = (body: unknown): FetchCall[] => {
  const calls: FetchCall[] = [];
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

    return Promise.resolve(Response.json(body));
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
  test("defaults to status", () => {
    expect(parseArgs([])).toEqual({
      authPath: undefined,
      baseUrl: undefined,
      command: "status",
      confirm: false,
      json: false,
    });
  });

  test("requires explicit confirmation for reset through runCli", async () => {
    const exit = await Effect.runPromiseExit(runCli(["reset"]));

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain("without --confirm");
    }
  });

  test("help takes precedence over later commands", () => {
    expect(parseArgs(["--help", "reset", "--confirm"]).command).toBe("help");
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

  test("dispatches confirmed reset json with mocked fetch only", async () => {
    const authPath = await createAuthFile();
    const calls = mockFetch({ code: "reset", windows_reset: 1 });

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
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(
      `${testBaseUrl}/wham/rate-limit-reset-credits/consume`
    );
    expect(JSON.parse(String(calls[0]?.body))).toEqual({
      redeem_request_id: expect.any(String),
    });
  });
});
