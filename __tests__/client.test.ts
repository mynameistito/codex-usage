import { Effect, Exit, Redacted, Schema } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { createCodexClient } from "@/codex/client.js";
import type { CodexClient } from "@/codex/client.js";
import type { CodexClientOptions, JsonValue } from "@/codex/types.js";
import type { CodexConfigError } from "@/errors/config-error.js";

const tokens = {
  accessToken: Redacted.make("access-token"),
  accountId: "account-id",
};

const originalFetch = globalThis.fetch;

const failureText = <A, E>(exit: Exit.Exit<A, E>): string => {
  if (Exit.isFailure(exit)) {
    return exit.cause.toString();
  }

  throw new Error("Expected the operation to fail");
};

const defaultOptions: CodexClientOptions = { baseUrl: "https://example.com" };

const withClient = <A, E>(
  run: (client: CodexClient) => Effect.Effect<A, E>,
  options: CodexClientOptions = defaultOptions
): Effect.Effect<A, E | CodexConfigError> =>
  createCodexClient(tokens, options).pipe(Effect.flatMap(run));

const mockResponse = (body: JsonValue | readonly JsonValue[]): void => {
  const fetchMock = Object.assign(
    async () => await Promise.resolve(Response.json(body)),
    { preconnect: () => null }
  );

  globalThis.fetch = fetchMock;
};

describe(createCodexClient, () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects usage responses that are arrays", async () => {
    mockResponse([]);

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchUsage())
    );

    expect(failureText(exit)).toContain("Usage response was not an object");
  });

  it("rejects insecure remote base URLs", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "http://example.com" })
    );

    expect(failureText(exit)).toContain(
      "Base URL must use HTTPS unless it is localhost"
    );
  });

  it("rejects unsupported loopback URL schemes", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "ftp://localhost" })
    );

    expect(failureText(exit)).toContain("Base URL must use HTTP or HTTPS");
  });

  it("allows HTTP loopback base URLs", async () => {
    const calls: string[] = [];

    const fetchMock = Object.assign(
      async (input: RequestInfo | URL) => {
        calls.push(input instanceof Request ? input.url : input.toString());

        return await Promise.resolve(Response.json({ plan_type: "pro" }));
      },
      { preconnect: () => null }
    );

    globalThis.fetch = fetchMock;

    await Effect.runPromise(
      withClient((client) => client.fetchUsage(), {
        baseUrl: "http://localhost:8787",
      })
    );

    expect(calls).toStrictEqual(["http://localhost:8787/wham/usage"]);
  });

  it("rejects base URLs that include credentials", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://user:pass@example.com" })
    );

    expect(failureText(exit)).toContain(
      "Base URL must not include credentials"
    );
  });

  it("rejects base URLs that include query strings", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://example.com?query=value" })
    );

    expect(failureText(exit)).toContain(
      "Base URL must not include a query string or fragment"
    );
  });

  it("rejects base URLs that include fragments", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://example.com#fragment" })
    );

    expect(failureText(exit)).toContain(
      "Base URL must not include a query string or fragment"
    );
  });

  it("only appends backend-api for exact ChatGPT hostnames", async () => {
    const calls: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        calls.push(input instanceof Request ? input.url : input.toString());

        return await Promise.resolve(Response.json({ plan_type: "pro" }));
      },
      { preconnect: () => null }
    );

    await Effect.runPromise(
      withClient((client) => client.fetchUsage(), {
        baseUrl: "https://chatgpt.com.evil.test",
      })
    );

    expect(calls).toStrictEqual(["https://chatgpt.com.evil.test/wham/usage"]);
  });

  it("appends backend-api for exact ChatGPT hostnames", async () => {
    const calls: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        calls.push(input instanceof Request ? input.url : input.toString());

        return await Promise.resolve(Response.json({ plan_type: "pro" }));
      },
      { preconnect: () => null }
    );

    await Effect.runPromise(
      withClient((client) => client.fetchUsage(), {
        baseUrl: "https://chatgpt.com",
      })
    );

    expect(calls).toStrictEqual(["https://chatgpt.com/backend-api/wham/usage"]);
  });

  it("rejects unexpected ChatGPT base URL paths", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, { baseUrl: "https://chatgpt.com/foo" })
    );

    expect(failureText(exit)).toContain(
      "ChatGPT base URL path must be /backend-api or omitted"
    );
  });

  it("rejects ChatGPT paths that only prefix backend-api", async () => {
    const exit = await Effect.runPromiseExit(
      createCodexClient(tokens, {
        baseUrl: "https://chatgpt.com/backend-api-v2",
      })
    );

    expect(failureText(exit)).toContain(
      "ChatGPT base URL path must be /backend-api or omitted"
    );
  });

  it("rejects malformed nested rate limit windows", async () => {
    mockResponse({
      plan_type: "pro",
      rate_limit: {
        primary_window: [],
      },
    });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchUsage())
    );

    expect(failureText(exit)).toContain("Usage response had an invalid shape");
  });

  it("rejects reset credits responses that are arrays", async () => {
    mockResponse([]);

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchResetCredits())
    );

    expect(failureText(exit)).toContain(
      "Reset credits response was not an object"
    );
  });

  it("rejects malformed reset credits payloads", async () => {
    mockResponse({ available_count: "not-a-number" });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchResetCredits())
    );

    expect(failureText(exit)).toContain(
      "Reset credits response had an invalid shape"
    );
  });

  it("rejects non-object reset credit entries", async () => {
    mockResponse({ credits: [null] });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchResetCredits())
    );

    expect(failureText(exit)).toContain(
      "Reset credits response had an invalid shape"
    );
  });

  it("rejects reset credit entries with invalid field types", async () => {
    mockResponse({ credits: [{ expires_at: 123 }] });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.fetchResetCredits())
    );

    expect(failureText(exit)).toContain(
      "Reset credits response had an invalid shape"
    );
  });

  it("rejects consume reset responses that are arrays", async () => {
    mockResponse([]);

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.consumeResetCredit())
    );

    expect(failureText(exit)).toContain(
      "Consume reset response was not an object"
    );
  });

  it("rejects malformed consume reset responses", async () => {
    mockResponse({ code: "reset", windows_reset: "not-a-number" });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.consumeResetCredit())
    );

    expect(failureText(exit)).toContain(
      "Consume reset response had an invalid shape"
    );
  });

  it("accepts known consume reset response codes", async () => {
    const codes = [
      "already_redeemed",
      "no_credit",
      "nothing_to_reset",
      "reset",
    ] as const;

    let nextCode = 0;

    const fetchMock = Object.assign(
      async () => {
        const code = codes[nextCode];
        nextCode += 1;

        return await Promise.resolve(Response.json({ code, windows_reset: 1 }));
      },
      { preconnect: () => null }
    );

    globalThis.fetch = fetchMock;

    const responses = await Promise.all(
      codes.map(
        async () =>
          await Effect.runPromise(
            withClient((client) => client.consumeResetCredit())
          )
      )
    );

    expect(responses).toStrictEqual(
      codes.map((code) => ({ code, windows_reset: 1 }))
    );
  });

  it("rejects unknown consume reset response codes", async () => {
    mockResponse({ code: "unexpected", windows_reset: 1 });

    const exit = await Effect.runPromiseExit(
      withClient((client) => client.consumeResetCredit())
    );

    expect(failureText(exit)).toContain(
      "Consume reset response had an invalid shape"
    );
  });

  it("treats null options as defaults", async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) => {
        bodies.push(init?.body);

        return await Promise.resolve(
          Response.json({ code: "reset", windows_reset: 1 })
        );
      },
      { preconnect: () => null }
    );

    await Effect.runPromise(
      withClient((client) => client.consumeResetCredit(null))
    );

    const requestSchema = Schema.Struct({ redeem_request_id: Schema.String });

    const requestBody = Schema.decodeUnknownSync(requestSchema)(
      JSON.parse(String(bodies[0]))
    );

    expect(requestBody.redeem_request_id.length).toBeGreaterThan(0);
  });

  it("reuses redeem_request_id when the consume effect is retried", async () => {
    const bodies: unknown[] = [];
    let attempt = 0;
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) => {
        bodies.push(init?.body);
        attempt += 1;

        if (attempt === 1) {
          throw new DOMException("timeout", "TimeoutError");
        }

        return await Promise.resolve(
          Response.json({ code: "reset", windows_reset: 1 })
        );
      },
      { preconnect: () => null }
    );

    await Effect.runPromise(
      withClient((client) => {
        const consume = client.consumeResetCredit();

        return consume.pipe(Effect.retry({ times: 1 }));
      })
    );

    expect(bodies).toHaveLength(2);
    const requestSchema = Schema.Struct({ redeem_request_id: Schema.String });

    const first = Schema.decodeUnknownSync(requestSchema)(
      JSON.parse(String(bodies[0]))
    );

    const second = Schema.decodeUnknownSync(requestSchema)(
      JSON.parse(String(bodies[1]))
    );

    expect(first.redeem_request_id).toBe(second.redeem_request_id);
  });

  it("sends creditId when provided via options object", async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) => {
        bodies.push(init?.body);

        return await Promise.resolve(
          Response.json({ code: "reset", windows_reset: 1 })
        );
      },
      { preconnect: () => null }
    );

    await Effect.runPromise(
      withClient((client) =>
        client.consumeResetCredit({
          creditId: "RateLimitResetCredit_test",
          redeemRequestId: "redeem-request-id",
        })
      )
    );

    expect(JSON.parse(String(bodies[0]))).toStrictEqual({
      credit_id: "RateLimitResetCredit_test",
      redeem_request_id: "redeem-request-id",
    });
  });
});
