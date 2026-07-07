import { randomUUID } from "node:crypto";

import { Effect, Redacted } from "effect";

import {
  parseConsumeResetResponse,
  parseResetCreditsPayload,
  parseUsagePayload,
} from "@/codex/schemas.js";
import type {
  CodexAuthTokens,
  CodexClientOptions,
  ConsumeResetResponse,
  NormalizedUsage,
  RateLimitResetCreditsPayload,
} from "@/codex/types.js";
import {
  CodexConfigError,
  CodexHttpError,
  CodexParseError,
} from "@/errors/index.js";
import { normalizeUsagePayload } from "@/usage/normalize.js";

const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT = "codex-cli";

const CHATGPT_HOSTNAMES = new Set(["chat.openai.com", "chatgpt.com"]);

const isLoopbackHostname = (hostname: string): boolean => {
  if (hostname === "localhost") {
    return true;
  }

  if (hostname.endsWith(".localhost")) {
    return true;
  }

  if (hostname === "127.0.0.1") {
    return true;
  }

  if (hostname === "[::1]") {
    return true;
  }

  return hostname === "::1";
};

const normalizeBaseUrl = (
  baseUrl = DEFAULT_BASE_URL
): Effect.Effect<string, CodexConfigError> =>
  Effect.gen(function* normalizeBaseUrlEffect() {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch (error) {
      return yield* new CodexConfigError({
        cause: error,
        message: `Invalid base URL: ${baseUrl}`,
      });
    }

    if (parsed.username || parsed.password) {
      return yield* new CodexConfigError({
        message: "Base URL must not include credentials",
      });
    }

    if (parsed.search || parsed.hash) {
      return yield* new CodexConfigError({
        message: "Base URL must not include a query string or fragment",
      });
    }

    if (parsed.protocol !== "https:" && !isLoopbackHostname(parsed.hostname)) {
      return yield* new CodexConfigError({
        message: "Base URL must use HTTPS unless it is localhost",
      });
    }

    let normalized = parsed.toString();
    while (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }

    if (
      CHATGPT_HOSTNAMES.has(parsed.hostname) &&
      !parsed.pathname.startsWith("/backend-api")
    ) {
      return `${normalized}/backend-api`;
    }

    return normalized;
  });

const jsonHeaders = (
  tokens: CodexAuthTokens,
  userAgent: string
): Record<string, string> => ({
  Authorization: `Bearer ${Redacted.value(tokens.accessToken)}`,
  "ChatGPT-Account-Id": tokens.accountId,
  "Content-Type": "application/json",
  "User-Agent": userAgent,
});

const getHeaders = (
  tokens: CodexAuthTokens,
  userAgent: string
): Record<string, string> => ({
  Authorization: `Bearer ${Redacted.value(tokens.accessToken)}`,
  "ChatGPT-Account-Id": tokens.accountId,
  "User-Agent": userAgent,
});

const requestJson = (
  url: string,
  init: RequestInit
): Effect.Effect<unknown, CodexHttpError | CodexParseError> =>
  Effect.gen(function* requestJsonEffect() {
    const response = yield* Effect.tryPromise({
      catch: (cause) =>
        new CodexHttpError({
          body: cause instanceof Error ? cause.message : String(cause),
          message:
            cause instanceof DOMException && cause.name === "TimeoutError"
              ? `Request timed out after ${DEFAULT_REQUEST_TIMEOUT_MS}ms: ${url}`
              : `Request failed before receiving a response: ${url}`,
          status: 0,
          statusText:
            cause instanceof DOMException && cause.name === "TimeoutError"
              ? "TIMEOUT"
              : "NETWORK_ERROR",
        }),
      try: () =>
        fetch(url, {
          ...init,
          signal:
            init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
        }),
    });

    const body = yield* Effect.tryPromise({
      catch: (cause) =>
        new CodexHttpError({
          body: cause instanceof Error ? cause.message : String(cause),
          message: `Could not read response body: ${url}`,
          status: response.status,
          statusText: response.statusText,
        }),
      try: () => response.text(),
    });

    if (!response.ok) {
      return yield* new CodexHttpError({
        body,
        message: `${init.method ?? "GET"} ${url} failed`,
        status: response.status,
        statusText: response.statusText,
      });
    }

    return yield* Effect.try({
      catch: () =>
        new CodexParseError({
          message: `Response was not valid JSON: ${url}`,
          value: body,
        }),
      try: () => JSON.parse(body) as unknown,
    });
  });

export interface CodexClient {
  readonly consumeResetCredit: (
    redeemRequestId?: string,
    creditId?: string
  ) => Effect.Effect<ConsumeResetResponse, CodexHttpError | CodexParseError>;
  readonly fetchResetCredits: () => Effect.Effect<
    RateLimitResetCreditsPayload,
    CodexHttpError | CodexParseError
  >;
  readonly fetchUsage: () => Effect.Effect<
    NormalizedUsage,
    CodexHttpError | CodexParseError
  >;
}

export const createCodexClient = (
  tokens: CodexAuthTokens,
  options: CodexClientOptions = {}
): Effect.Effect<CodexClient, CodexConfigError> =>
  Effect.gen(function* createCodexClientEffect() {
    const baseUrl = yield* normalizeBaseUrl(options.baseUrl);
    const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

    return {
      consumeResetCredit: (
        redeemRequestId = randomUUID(),
        creditId?: string
      ): Effect.Effect<
        ConsumeResetResponse,
        CodexHttpError | CodexParseError
      > =>
        requestJson(`${baseUrl}/wham/rate-limit-reset-credits/consume`, {
          body: JSON.stringify({
            ...(creditId ? { credit_id: creditId } : {}),
            redeem_request_id: redeemRequestId,
          }),
          headers: jsonHeaders(tokens, userAgent),
          method: "POST",
        }).pipe(Effect.flatMap(parseConsumeResetResponse)),

      fetchResetCredits: (): Effect.Effect<
        RateLimitResetCreditsPayload,
        CodexHttpError | CodexParseError
      > =>
        requestJson(`${baseUrl}/wham/rate-limit-reset-credits`, {
          headers: getHeaders(tokens, userAgent),
          method: "GET",
        }).pipe(Effect.flatMap(parseResetCreditsPayload)),

      fetchUsage: (): Effect.Effect<
        NormalizedUsage,
        CodexHttpError | CodexParseError
      > =>
        requestJson(`${baseUrl}/wham/usage`, {
          headers: getHeaders(tokens, userAgent),
          method: "GET",
        }).pipe(
          Effect.flatMap(parseUsagePayload),
          Effect.map((value) => normalizeUsagePayload(value))
        ),
    };
  });
