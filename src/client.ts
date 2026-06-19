import { randomUUID } from "node:crypto";

import { Effect } from "effect";

import { CodexHttpError, CodexParseError } from "@/errors/index.js";
import { normalizeUsagePayload } from "@/normalize.js";
import type {
  CodexAuthTokens,
  CodexClientOptions,
  CodexUsagePayload,
  ConsumeResetResponse,
  NormalizedUsage,
  RateLimitResetCreditsPayload,
} from "@/types.js";

const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT = "codex-cli";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isOptionalObject = (
  value: unknown
): value is Record<string, unknown> | null | undefined =>
  value === null || value === undefined || isObject(value);

const isOptionalArray = (
  value: unknown
): value is readonly unknown[] | null | undefined =>
  value === null || value === undefined || Array.isArray(value);

const parseError = (message: string, value: unknown): CodexParseError =>
  new CodexParseError({ message, value });

const validateConsumeResetResponse = (
  value: unknown
): Effect.Effect<ConsumeResetResponse, CodexParseError> =>
  Effect.gen(function* validateConsumeResetResponseEffect() {
    if (!isObject(value)) {
      return yield* parseError(
        "Consume reset response was not an object",
        value
      );
    }

    const { code, windows_reset: windowsReset } = value;
    if (typeof code !== "string" || typeof windowsReset !== "number") {
      return yield* parseError(
        "Consume reset response had an invalid shape",
        value
      );
    }

    return value as unknown as ConsumeResetResponse;
  });

const validateResetCreditsPayload = (
  value: unknown
): Effect.Effect<RateLimitResetCreditsPayload, CodexParseError> =>
  Effect.gen(function* validateResetCreditsPayloadEffect() {
    if (!isObject(value)) {
      return yield* parseError(
        "Reset credits response was not an object",
        value
      );
    }

    const { available_count: availableCount, credits } = value;
    if (
      (availableCount !== undefined && typeof availableCount !== "number") ||
      !isOptionalArray(credits)
    ) {
      return yield* parseError(
        "Reset credits response had an invalid shape",
        value
      );
    }

    return value as unknown as RateLimitResetCreditsPayload;
  });

const validateUsagePayload = (
  value: unknown
): Effect.Effect<CodexUsagePayload, CodexParseError> =>
  Effect.gen(function* validateUsagePayloadEffect() {
    if (!isObject(value)) {
      return yield* parseError("Usage response was not an object", value);
    }

    if (
      typeof value.plan_type !== "string" ||
      !isOptionalObject(value.rate_limit) ||
      !isOptionalObject(value.credits) ||
      !isOptionalObject(value.spend_control) ||
      !isOptionalArray(value.additional_rate_limits) ||
      !isOptionalObject(value.rate_limit_reached_type) ||
      !isOptionalObject(value.rate_limit_reset_credits)
    ) {
      return yield* parseError("Usage response had an invalid shape", value);
    }

    return value as unknown as CodexUsagePayload;
  });

const normalizeBaseUrl = (baseUrl = DEFAULT_BASE_URL): string => {
  let normalized = baseUrl;
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  if (
    (normalized.startsWith("https://chatgpt.com") ||
      normalized.startsWith("https://chat.openai.com")) &&
    !normalized.includes("/backend-api")
  ) {
    return `${normalized}/backend-api`;
  }

  return normalized;
};

const jsonHeaders = (
  tokens: CodexAuthTokens,
  userAgent: string
): Record<string, string> => ({
  Authorization: `Bearer ${tokens.accessToken}`,
  "ChatGPT-Account-Id": tokens.accountId,
  "Content-Type": "application/json",
  "User-Agent": userAgent,
});

const getHeaders = (
  tokens: CodexAuthTokens,
  userAgent: string
): Record<string, string> => ({
  Authorization: `Bearer ${tokens.accessToken}`,
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

export const createCodexClient = (
  tokens: CodexAuthTokens,
  options: CodexClientOptions = {}
) => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  return {
    consumeResetCredit: (
      redeemRequestId = randomUUID()
    ): Effect.Effect<ConsumeResetResponse, CodexHttpError | CodexParseError> =>
      requestJson(`${baseUrl}/wham/rate-limit-reset-credits/consume`, {
        body: JSON.stringify({ redeem_request_id: redeemRequestId }),
        headers: jsonHeaders(tokens, userAgent),
        method: "POST",
      }).pipe(Effect.flatMap(validateConsumeResetResponse)),

    fetchResetCredits: (): Effect.Effect<
      RateLimitResetCreditsPayload,
      CodexHttpError | CodexParseError
    > =>
      requestJson(`${baseUrl}/wham/rate-limit-reset-credits`, {
        headers: getHeaders(tokens, userAgent),
        method: "GET",
      }).pipe(Effect.flatMap(validateResetCreditsPayload)),

    fetchUsage: (): Effect.Effect<
      NormalizedUsage,
      CodexHttpError | CodexParseError
    > =>
      requestJson(`${baseUrl}/wham/usage`, {
        headers: getHeaders(tokens, userAgent),
        method: "GET",
      }).pipe(
        Effect.flatMap(validateUsagePayload),
        Effect.map((value) => normalizeUsagePayload(value))
      ),
  };
};
