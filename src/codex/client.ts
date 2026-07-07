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

/** Default ChatGPT backend API base URL. */
const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";

/** Default network timeout for Codex API requests. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Default `User-Agent` header sent to the Codex API. */
const DEFAULT_USER_AGENT = "codex-cli";

/** Hostnames that require the `/backend-api` path prefix. */
const CHATGPT_HOSTNAMES = new Set(["chat.openai.com", "chatgpt.com"]);

/** Options for redeeming a banked reset credit. */
export interface ConsumeResetCreditOptions {
  readonly creditId?: string;
  readonly redeemRequestId?: string;
}

/** Returns whether `hostname` refers to a loopback interface. */
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

/**
 * Normalizes and validates a Codex API base URL.
 *
 * @param baseUrl - Candidate base URL. Defaults to {@link DEFAULT_BASE_URL}.
 */
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

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return yield* new CodexConfigError({
        message: "Base URL must use HTTP or HTTPS",
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

    if (CHATGPT_HOSTNAMES.has(parsed.hostname)) {
      const pathname = parsed.pathname.replace(/\/+$/u, "") || "/";

      if (pathname === "/") {
        return `${normalized}/backend-api`;
      }

      if (pathname !== "/backend-api") {
        return yield* new CodexConfigError({
          message: "ChatGPT base URL path must be /backend-api or omitted",
        });
      }
    }

    return normalized;
  });

/** Builds JSON request headers for authenticated Codex POST requests. */
const jsonHeaders = (
  tokens: CodexAuthTokens,
  userAgent: string
): Record<string, string> => ({
  Authorization: `Bearer ${Redacted.value(tokens.accessToken)}`,
  "ChatGPT-Account-Id": tokens.accountId,
  "Content-Type": "application/json",
  "User-Agent": userAgent,
});

/** Builds request headers for authenticated Codex GET requests. */
const getHeaders = (
  tokens: CodexAuthTokens,
  userAgent: string
): Record<string, string> => ({
  Authorization: `Bearer ${Redacted.value(tokens.accessToken)}`,
  "ChatGPT-Account-Id": tokens.accountId,
  "User-Agent": userAgent,
});

/**
 * Performs an HTTP request and parses the response body as JSON.
 *
 * @param url - Fully qualified request URL.
 * @param init - Fetch request options.
 */
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

/** Typed Codex API client for usage and reset-credit endpoints. */
export interface CodexClient {
  /** Redeems a banked reset credit and returns the API result code. */
  readonly consumeResetCredit: (
    options?: ConsumeResetCreditOptions
  ) => Effect.Effect<ConsumeResetResponse, CodexHttpError | CodexParseError>;
  /** Fetches available banked rate-limit reset credits. */
  readonly fetchResetCredits: () => Effect.Effect<
    RateLimitResetCreditsPayload,
    CodexHttpError | CodexParseError
  >;
  /** Fetches and normalizes the current Codex usage snapshot. */
  readonly fetchUsage: () => Effect.Effect<
    NormalizedUsage,
    CodexHttpError | CodexParseError
  >;
}

/**
 * Creates an authenticated Codex API client.
 *
 * @param tokens - Redacted credentials from {@link readCodexAuth}.
 * @param options - Optional base URL and user-agent overrides.
 */
export const createCodexClient = (
  tokens: CodexAuthTokens,
  options: CodexClientOptions = {}
): Effect.Effect<CodexClient, CodexConfigError> =>
  Effect.gen(function* createCodexClientEffect() {
    const baseUrl = yield* normalizeBaseUrl(options.baseUrl);
    const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

    return {
      consumeResetCredit: (
        consumeOptions: ConsumeResetCreditOptions = {}
      ): Effect.Effect<
        ConsumeResetResponse,
        CodexHttpError | CodexParseError
      > =>
        requestJson(`${baseUrl}/wham/rate-limit-reset-credits/consume`, {
          body: JSON.stringify({
            ...(consumeOptions.creditId
              ? { credit_id: consumeOptions.creditId }
              : {}),
            redeem_request_id: consumeOptions.redeemRequestId ?? randomUUID(),
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
