import type { Redacted } from "effect/Redacted";

import type {
  RateLimitWindowSnapshotSchema,
  RateLimitStatusDetailsSchema,
  CreditStatusDetailsSchema,
  SpendControlLimitDetailsSchema,
  SpendControlStatusDetailsSchema,
  AdditionalRateLimitDetailsSchema,
  RateLimitReachedTypeSchema,
  RateLimitResetCreditsSummarySchema,
  CodexUsagePayloadSchema,
  RateLimitResetCreditSchema,
  RateLimitResetCreditsPayloadSchema,
} from "@/codex/schemas.js";

/** JSON value accepted at external API and file boundaries. */
export type JsonValue =
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[]
  | string
  | number
  | boolean
  | null;

/** Redacted Codex API credentials read from `auth.json`. */
export interface CodexAuthTokens {
  readonly accessToken: Redacted;
  readonly accountId: string;
}

/** Optional overrides when constructing a {@link CodexClient}. */
export type CodexClientOptions = Partial<{
  readonly baseUrl: string | undefined;
  readonly userAgent: string | undefined;
}>;

/** Raw rate-limit window snapshot returned by the Codex usage API. */
export type RateLimitWindowSnapshot = typeof RateLimitWindowSnapshotSchema.Type;

/** Raw primary/secondary rate-limit details from the Codex usage API. */
export type RateLimitStatusDetails = typeof RateLimitStatusDetailsSchema.Type;

/** Raw prepaid-credit status details from the Codex usage API. */
export type CreditStatusDetails = typeof CreditStatusDetailsSchema.Type;

/** Raw individual spend-control limit details from the Codex usage API. */
export type SpendControlLimitDetails =
  typeof SpendControlLimitDetailsSchema.Type;

/** Raw spend-control status wrapper from the Codex usage API. */
export type SpendControlStatusDetails =
  typeof SpendControlStatusDetailsSchema.Type;

/** Raw additional metered rate limit entry from the Codex usage API. */
export type AdditionalRateLimitDetails =
  typeof AdditionalRateLimitDetailsSchema.Type;

/** Raw rate-limit reached classification from the Codex usage API. */
export type RateLimitReachedType = typeof RateLimitReachedTypeSchema.Type;

/** Raw reset-credit availability summary from the Codex usage API. */
export type RateLimitResetCreditsSummary =
  typeof RateLimitResetCreditsSummarySchema.Type;

/** Parsed Codex `/wham/usage` response payload. */
export type CodexUsagePayload = typeof CodexUsagePayloadSchema.Type;

/** A single normalized primary or secondary usage window for display. */
export interface NormalizedRateLimitWindow {
  readonly label: string;
  readonly kind: "primary" | "secondary";
  readonly usedPercent: number;
  readonly remainingPercent: number;
  readonly windowSeconds: number;
  readonly resetAfterSeconds: number;
  readonly resetsAt: Date | null;
}

/** A normalized rate limit, including the main Codex limit and metered add-ons. */
export interface NormalizedRateLimit {
  readonly id: string;
  readonly name: string;
  readonly planType: string;
  readonly allowed: boolean | null;
  readonly limitReached: boolean | null;
  readonly windows: readonly NormalizedRateLimitWindow[];
  readonly credits: CreditStatusDetails | null;
  readonly individualLimit: SpendControlLimitDetails | null;
  readonly rateLimitReachedType: string | null;
}

/** Normalized usage snapshot ready for formatting or JSON export. */
export interface NormalizedUsage {
  readonly capturedAt: Date;
  readonly planType: string;
  readonly resetCreditsAvailable: number | null;
  readonly limits: readonly NormalizedRateLimit[];
}

/** A single banked rate-limit reset credit from the Codex API. */
export type RateLimitResetCredit = typeof RateLimitResetCreditSchema.Type;

/** Parsed Codex `/wham/rate-limit-reset-credits` response payload. */
export type RateLimitResetCreditsPayload =
  typeof RateLimitResetCreditsPayloadSchema.Type;

/** Known result codes returned by the consume-reset endpoint. */
export type ConsumeResetCode =
  | "already_redeemed"
  | "no_credit"
  | "nothing_to_reset"
  | "reset";

/** Parsed Codex consume-reset response payload. */
export interface ConsumeResetResponse {
  readonly code: ConsumeResetCode;
  readonly windows_reset: number;
}
