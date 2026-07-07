import { afterEach, describe, expect, test } from "bun:test";

import { Effect, Redacted } from "effect";

import { createCodexClient } from "@/codex/client.js";
import type { CodexClient } from "@/codex/client.js";
import type { CodexClientOptions } from "@/codex/types.js";
import type { CodexConfigError } from "@/errors/config-error.js";

const tokens = {
  accessToken: Redacted.make("access-token"),
  accountId: "account-id",
};

const originalFetch = globalThis.fetch;

const defaultOptions: CodexClientOptions = { baseUrl: "https://example.com" };

const withClient = <A, E>(
  run: (client: CodexClient) => Effect.Effect<A, E>,
  options: CodexClientOptions = defaultOptions
): Effect.Effect<A, E | CodexConfigError> =>
  createCodexClient(tokens, options).pipe(Effect.flatMap(run));

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
      withClient((client) => client.fetchUsage())
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Usage response was not an object"
      );
    }
  });

  test("rejects insecure remote base URLs", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "http://example.com" })
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Base URL must use HTTPS unless it is localhost"
      );
    }
  });

  test("rejects base URLs that include credentials", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://user:pass@example.com" })
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Base URL must not include credentials"
      );
    }
  });

  test("rejects base URLs that include query strings", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://example.com?query=value" })
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Base URL must not include a query string or fragment"
      );
    }
  });

  test("rejects base URLs that include fragments", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://example.com#fragment" })
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Base URL must not include a query string or fragment"
      );
    }
  });

  test("only appends backend-api for exact ChatGPT hostnames", async () => {
    const calls: string[] = [];
    globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return Promise.resolve(Response.json({ plan_type: "pro" }));
    }) as typeof fetch;

    await Effect.runPromise(
      withClient((client) => client.fetchUsage(), {
        baseUrl: "https://chatgpt.com.evil.test",
      })
    );

    expect(calls).toEqual(["https://chatgpt.com.evil.test/wham/usage"]);
  });

  test("appends backend-api for exact ChatGPT hostnames", async () => {
    const calls: string[] = [];
    globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return Promise.resolve(Response.json({ plan_type: "pro" }));
    }) as typeof fetch;

    await Effect.runPromise(
      withClient((client) => client.fetchUsage(), {
        baseUrl: "https://chatgpt.com",
      })
    );

    expect(calls).toEqual(["https://chatgpt.com/backend-api/wham/usage"]);
  });

  test("rejects malformed nested rate limit windows", async () => {
    mockResponse({
      plan_type: "pro",
      rate_limit: {
        primary_window: [],
      },
    });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchUsage())
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
      withClient((client) => client.fetchResetCredits())
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
      withClient((client) => client.fetchResetCredits())
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Reset credits response had an invalid shape"
      );
    }
  });

  test("rejects non-object reset credit entries", async () => {
    mockResponse({ credits: [null] });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchResetCredits())
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Reset credits response had an invalid shape"
      );
    }
  });

  test("rejects reset credit entries with invalid field types", async () => {
    mockResponse({ credits: [{ expires_at: 123 }] });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchResetCredits())
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
      withClient((client) => client.consumeResetCredit())
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
      withClient((client) => client.consumeResetCredit())
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
        Effect.runPromise(withClient((client) => client.consumeResetCredit()))
      )
    );

    expect(responses).toEqual(
      codes.map((code) => ({ code, windows_reset: 1 }))
    );
  });

  test("rejects unknown consume reset response codes", async () => {
    mockResponse({ code: "unexpected", windows_reset: 1 });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.consumeResetCredit())
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Consume reset response had an invalid shape"
      );
    }
  });
});
