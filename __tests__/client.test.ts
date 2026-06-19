import { afterEach, describe, expect, test } from "bun:test";

import { Effect } from "effect";

import { createCodexClient } from "@/client.js";

const tokens = {
  accessToken: "access-token",
  accountId: "account-id",
};

const originalFetch = globalThis.fetch;

const mockResponse = (body: unknown): void => {
  globalThis.fetch = (() =>
    Promise.resolve(Response.json(body))) as unknown as typeof fetch;
};

describe("createCodexClient", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("rejects usage responses that are arrays", async () => {
    mockResponse([]);

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
    mockResponse({
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

  test("rejects reset credits responses that are arrays", async () => {
    mockResponse([]);

    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, {
        baseUrl: "https://example.com",
      }).fetchResetCredits()
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Reset credits response was not an object"
      );
    }
  });

  test("rejects malformed reset credits payloads", async () => {
    mockResponse({ available_count: "not-a-number" });

    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, {
        baseUrl: "https://example.com",
      }).fetchResetCredits()
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Reset credits response had an invalid shape"
      );
    }
  });

  test("rejects consume reset responses that are arrays", async () => {
    mockResponse([]);

    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, {
        baseUrl: "https://example.com",
      }).consumeResetCredit()
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Consume reset response was not an object"
      );
    }
  });

  test("rejects malformed consume reset responses", async () => {
    mockResponse({ code: "reset", windows_reset: "not-a-number" });

    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, {
        baseUrl: "https://example.com",
      }).consumeResetCredit()
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Consume reset response had an invalid shape"
      );
    }
  });

  test("accepts known consume reset response codes", async () => {
    const codes = [
      "already_redeemed",
      "no_credit",
      "nothing_to_reset",
      "reset",
    ] as const;
    let nextCode = 0;
    globalThis.fetch = (() => {
      const code = codes[nextCode];
      nextCode += 1;
      return Promise.resolve(Response.json({ code, windows_reset: 1 }));
    }) as unknown as typeof fetch;

    const responses = await Promise.all(
      codes.map(() =>
        Effect.runPromise(
          createCodexClient(tokens, {
            baseUrl: "https://example.com",
          }).consumeResetCredit()
        )
      )
    );

    expect(responses).toEqual(
      codes.map((code) => ({ code, windows_reset: 1 }))
    );
  });

  test("rejects unknown consume reset response codes", async () => {
    mockResponse({ code: "unexpected", windows_reset: 1 });

    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, {
        baseUrl: "https://example.com",
      }).consumeResetCredit()
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Consume reset response had an invalid shape"
      );
    }
  });
});
