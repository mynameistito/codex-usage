import { randomUUID } from "node:crypto";

import { Effect } from "effect";

import { CodexHttpError, CodexParseError } from "@/errors/index.js";
import { normalizeUsagePayload } from "@/normalize.js";
import type {
  CodexAuthTokens,
  CodexClientOptions,
  ConsumeResetCode,
  CodexUsagePayload,
  ConsumeResetResponse,
  NormalizedUsage,
  RateLimitResetCreditsPayload,
} from "@/types.js";

const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT = "codex-cli";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOptionalArray = (
  value: unknown
): value is readonly unknown[] | null | undefined =>
  value === null || value === undefined || Array.isArray(value);

const isOptionalBoolean = (value: unknown): boolean =>
  value === undefined || typeof value === "boolean";

const isOptionalNumber = (value: unknown): boolean =>
  value === undefined || typeof value === "number";

const isOptionalString = (value: unknown): boolean =>
  value === undefined || typeof value === "string";

const isOptionalNullableString = (value: unknown): boolean =>
  value === null || value === undefined || typeof value === "string";

const isRateLimitWindowSnapshot = (value: unknown): boolean =>
  isObject(value) &&
  typeof value.used_percent === "number" &&
  typeof value.limit_window_seconds === "number" &&
  typeof value.reset_after_seconds === "number" &&
  typeof value.reset_at === "number";

const isOptionalRateLimitWindowSnapshot = (value: unknown): boolean =>
  value === null || value === undefined || isRateLimitWindowSnapshot(value);

const isRateLimitStatusDetails = (value: unknown): boolean =>
  isObject(value) &&
  isOptionalBoolean(value.allowed) &&
  isOptionalBoolean(value.limit_reached) &&
  isOptionalRateLimitWindowSnapshot(value.primary_window) &&
  isOptionalRateLimitWindowSnapshot(value.secondary_window);

const isOptionalRateLimitStatusDetails = (value: unknown): boolean =>
  value === null || value === undefined || isRateLimitStatusDetails(value);

const isCreditStatusDetails = (value: unknown): boolean =>
  isObject(value) &&
  isOptionalBoolean(value.has_credits) &&
  isOptionalBoolean(value.unlimited) &&
  isOptionalNullableString(value.balance);

const isOptionalCreditStatusDetails = (value: unknown): boolean =>
  value === null || value === undefined || isCreditStatusDetails(value);

const isSpendControlLimitDetails = (value: unknown): boolean =>
  isObject(value) &&
  isOptionalString(value.limit) &&
  isOptionalString(value.used) &&
  isOptionalString(value.remaining) &&
  isOptionalNumber(value.used_percent) &&
  isOptionalNumber(value.remaining_percent) &&
  isOptionalNumber(value.reset_after_seconds) &&
  isOptionalNumber(value.reset_at);

const isOptionalSpendControlLimitDetails = (value: unknown): boolean =>
  value === null || value === undefined || isSpendControlLimitDetails(value);

const isSpendControlStatusDetails = (value: unknown): boolean =>
  isObject(value) &&
  isOptionalBoolean(value.reached) &&
  isOptionalSpendControlLimitDetails(value.individual_limit);

const isOptionalSpendControlStatusDetails = (value: unknown): boolean =>
  value === null || value === undefined || isSpendControlStatusDetails(value);

const isAdditionalRateLimitDetails = (value: unknown): boolean =>
  isObject(value) &&
  typeof value.limit_name === "string" &&
  typeof value.metered_feature === "string" &&
  isOptionalRateLimitStatusDetails(value.rate_limit);

const isOptionalAdditionalRateLimitDetailsArray = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (Array.isArray(value) && value.every(isAdditionalRateLimitDetails));

const isRateLimitReachedType = (value: unknown): boolean =>
  isObject(value) && typeof value.type === "string";

const isOptionalRateLimitReachedType = (value: unknown): boolean =>
  value === null || value === undefined || isRateLimitReachedType(value);

const isRateLimitResetCreditsSummary = (value: unknown): boolean =>
  isObject(value) && typeof value.available_count === "number";

const isOptionalRateLimitResetCreditsSummary = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  isRateLimitResetCreditsSummary(value);

const isConsumeResetCode = (value: unknown): value is ConsumeResetCode =>
  value === "already_redeemed" ||
  value === "no_credit" ||
  value === "nothing_to_reset" ||
  value === "reset";

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
    if (!isConsumeResetCode(code) || typeof windowsReset !== "number") {
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
      !isOptionalRateLimitStatusDetails(value.rate_limit) ||
      !isOptionalCreditStatusDetails(value.credits) ||
      !isOptionalSpendControlStatusDetails(value.spend_control) ||
      !isOptionalAdditionalRateLimitDetailsArray(
        value.additional_rate_limits
      ) ||
      !isOptionalRateLimitReachedType(value.rate_limit_reached_type) ||
      !isOptionalRateLimitResetCreditsSummary(value.rate_limit_reset_credits)
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
