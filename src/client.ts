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
const DEFAULT_USER_AGENT = "codex-cli";

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
          message: `Request failed before receiving a response: ${url}`,
          status: 0,
          statusText: "NETWORK_ERROR",
        }),
      try: () => fetch(url, init),
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
      }).pipe(Effect.map((value) => value as ConsumeResetResponse)),

    fetchResetCredits: (): Effect.Effect<
      RateLimitResetCreditsPayload,
      CodexHttpError | CodexParseError
    > =>
      requestJson(`${baseUrl}/wham/rate-limit-reset-credits`, {
        headers: getHeaders(tokens, userAgent),
        method: "GET",
      }).pipe(Effect.map((value) => value as RateLimitResetCreditsPayload)),

    fetchUsage: (): Effect.Effect<
      NormalizedUsage,
      CodexHttpError | CodexParseError
    > =>
      requestJson(`${baseUrl}/wham/usage`, {
        headers: getHeaders(tokens, userAgent),
        method: "GET",
      }).pipe(
        Effect.map((value) => normalizeUsagePayload(value as CodexUsagePayload))
      ),
  };
};
