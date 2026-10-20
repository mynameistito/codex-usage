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
  JsonValue,
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

/** Returns whether an unknown value is a JSON value.
 * @param value - Candidate JSON value.
 * @returns Whether the candidate is valid JSON data.
 */
const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return typeof value === "object" && Object.values(value).every(isJsonValue);
};

/** Hostnames that require the `/backend-api` path prefix. */
const CHATGPT_HOSTNAMES = new Set(["chat.openai.com", "chatgpt.com"]);

/** Options for redeeming a banked reset credit. */
export interface ConsumeResetCreditOptions {
  readonly creditId?: string;
  readonly redeemRequestId?: string;
}

/** Returns whether `value` is a plain consume-reset options object.
 * @param value - Candidate consume-reset options.
 * @returns Whether the value is an options object.
 */
const isConsumeResetCreditOptions = (
  value: ConsumeResetCreditOptions | null
): value is ConsumeResetCreditOptions =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Normalizes consume-reset options and rejects legacy positional callers.
 *
 * @param consumeOptions - Options object, or `undefined`/`null` for defaults.
 * @returns Normalized options or a typed parse error.
 */
const normalizeConsumeResetCreditOptions = (
  consumeOptions?: ConsumeResetCreditOptions | null
): Effect.Effect<ConsumeResetCreditOptions, CodexParseError> => {
  if (consumeOptions === undefined || consumeOptions === null) {
    return Effect.succeed({});
  }

  if (!isConsumeResetCreditOptions(consumeOptions)) {
    return Effect.fail(
      new CodexParseError({
        message:
          "consumeResetCredit expects an options object; pass { creditId?, redeemRequestId? } instead of positional arguments",
        value: consumeOptions,
      })
    );
  }

  return Effect.succeed(consumeOptions);
};

/** Returns whether `hostname` refers to a loopback interface.
 * @param hostname - URL hostname to inspect.
 * @returns Whether the hostname is a loopback address.
 */
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
 * @returns Normalized URL or a typed configuration error.
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

    if (parsed.username.length > 0 || parsed.password.length > 0) {
      return yield* new CodexConfigError({
        message: "Base URL must not include credentials",
      });
    }

    if (parsed.search.length > 0 || parsed.hash.length > 0) {
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
      const { pathname: parsedPathname } = parsed;
      let pathname = parsedPathname;

      while (pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }

      pathname ||= "/";

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

/** Builds JSON request headers for authenticated Codex POST requests.
 * @param tokens - Redacted credentials used for authentication.
 * @param userAgent - User-agent header value.
 * @returns Authenticated JSON request headers.
 */
const jsonHeaders = (
  tokens: CodexAuthTokens,
  userAgent: string
): HeadersInit => ({
  Authorization: `Bearer ${Redacted.value(tokens.accessToken)}`,
  "ChatGPT-Account-Id": tokens.accountId,
  "Content-Type": "application/json",
  "User-Agent": userAgent,
});

/** Builds request headers for authenticated Codex GET requests.
 * @param tokens - Redacted credentials used for authentication.
 * @param userAgent - User-agent header value.
 * @returns Authenticated request headers.
 */
const getHeaders = (
  tokens: CodexAuthTokens,
  userAgent: string
): HeadersInit => ({
  Authorization: `Bearer ${Redacted.value(tokens.accessToken)}`,
  "ChatGPT-Account-Id": tokens.accountId,
  "User-Agent": userAgent,
});

/**
 * Performs an HTTP request and parses the response body as JSON.
 *
 * @param url - Fully qualified request URL.
 * @param init - Fetch request options.
 * @returns Parsed JSON response or a typed HTTP/parse error.
 */
const requestJson = (
  url: string,
  init: RequestInit
): Effect.Effect<JsonValue, CodexHttpError | CodexParseError> =>
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
      try: async () =>
        await fetch(url, {
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
      try: async () => await response.text(),
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
      try: () => {
        const parsedValue: unknown = JSON.parse(body);

        if (!isJsonValue(parsedValue)) {
          throw new TypeError("Response contains a non-JSON value");
        }

        return parsedValue;
      },
    });
  });

/** Typed Codex API client for usage and reset-credit endpoints. */
export interface CodexClient {
  /** Redeems a banked reset credit and returns the API result code. */
  readonly consumeResetCredit: (
    options?: ConsumeResetCreditOptions | null
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
 * @returns An authenticated client or a typed configuration error.
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
        consumeOptions?: ConsumeResetCreditOptions | null
      ): Effect.Effect<
        ConsumeResetResponse,
        CodexHttpError | CodexParseError
      > => {
        const defaultRedeemRequestId = randomUUID();

        return Effect.gen(function* consumeResetCreditEffect() {
          const resolvedOptions =
            yield* normalizeConsumeResetCreditOptions(consumeOptions);

          return yield* requestJson(
            `${baseUrl}/wham/rate-limit-reset-credits/consume`,
            {
              body: JSON.stringify(
                resolvedOptions.creditId !== undefined &&
                  resolvedOptions.creditId.length > 0
                  ? {
                      credit_id: resolvedOptions.creditId,
                      redeem_request_id:
                        resolvedOptions.redeemRequestId ??
                        defaultRedeemRequestId,
                    }
                  : {
                      redeem_request_id:
                        resolvedOptions.redeemRequestId ??
                        defaultRedeemRequestId,
                    }
              ),
              headers: jsonHeaders(tokens, userAgent),
              method: "POST",
            }
          ).pipe(Effect.flatMap(parseConsumeResetResponse));
        });
      },

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
