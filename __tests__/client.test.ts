import { afterEach, describe, expect, test } from "bun:test";

import { Effect } from "effect";

import { createCodexClient } from "@/client.js";

const tokens = {
  accessToken: "access-token",
  accountId: "account-id",
};

const originalFetch = globalThis.fetch;

const mockUsageResponse = (body: unknown): void => {
  globalThis.fetch = (() =>
    Promise.resolve(Response.json(body))) as unknown as typeof fetch;
};

describe("createCodexClient", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("rejects usage responses that are arrays", async () => {
    mockUsageResponse([]);

    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://example.com" }).fetchUsage()
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Usage response was not an object"
      );
    }
  });

  test("rejects malformed nested rate limit windows", async () => {
    mockUsageResponse({
      plan_type: "pro",
      rate_limit: {
        primary_window: [],
      },
    });

    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://example.com" }).fetchUsage()
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Usage response had an invalid shape"
      );
    }
  });
});
