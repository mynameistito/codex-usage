import type { Redacted } from "effect/Redacted";

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
export interface CodexClientOptions {
  readonly baseUrl?: string;
  readonly userAgent?: string;
}

/** Raw rate-limit window snapshot returned by the Codex usage API. */
export interface RateLimitWindowSnapshot {
  readonly used_percent: number;
  readonly limit_window_seconds: number;
  readonly reset_after_seconds: number;
  readonly reset_at: number;
}

/** Raw primary/secondary rate-limit details from the Codex usage API. */
export interface RateLimitStatusDetails {
  readonly allowed?: boolean;
  readonly limit_reached?: boolean;
  readonly primary_window?: RateLimitWindowSnapshot | null;
  readonly secondary_window?: RateLimitWindowSnapshot | null;
}

/** Raw prepaid-credit status details from the Codex usage API. */
export interface CreditStatusDetails {
  readonly has_credits?: boolean;
  readonly unlimited?: boolean;
  readonly balance?: string | null;
}

/** Raw individual spend-control limit details from the Codex usage API. */
export interface SpendControlLimitDetails {
  readonly limit?: string;
  readonly used?: string;
  readonly remaining?: string;
  readonly used_percent?: number;
  readonly remaining_percent?: number;
  readonly reset_after_seconds?: number;
  readonly reset_at?: number;
}

/** Raw spend-control status wrapper from the Codex usage API. */
export interface SpendControlStatusDetails {
  readonly reached?: boolean;
  readonly individual_limit?: SpendControlLimitDetails | null;
}

/** Raw additional metered rate limit entry from the Codex usage API. */
export interface AdditionalRateLimitDetails {
  readonly limit_name: string;
  readonly metered_feature: string;
  readonly rate_limit?: RateLimitStatusDetails | null;
}

/** Raw rate-limit reached classification from the Codex usage API. */
export interface RateLimitReachedType {
  readonly type: string;
}

/** Raw reset-credit availability summary from the Codex usage API. */
export interface RateLimitResetCreditsSummary {
  readonly available_count: number;
}

/** Parsed Codex `/wham/usage` response payload. */
export interface CodexUsagePayload {
  readonly plan_type: string;
  readonly rate_limit?: RateLimitStatusDetails | null;
  readonly credits?: CreditStatusDetails | null;
  readonly spend_control?: SpendControlStatusDetails | null;
  readonly additional_rate_limits?:
    | readonly AdditionalRateLimitDetails[]
    | null;
  readonly rate_limit_reached_type?: RateLimitReachedType | null;
  readonly rate_limit_reset_credits?: RateLimitResetCreditsSummary | null;
}

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

/** Lifecycle state of a banked rate-limit reset credit. */
type RateLimitResetCreditStatus = "available" | "expired" | "redeemed";

/** A single banked rate-limit reset credit from the Codex API. */
export interface RateLimitResetCredit {
  readonly id?: string;
  readonly title?: string;
  readonly status?: RateLimitResetCreditStatus;
  readonly profile_user_id?: string;
  readonly granted_at?: string;
  readonly expires_at?: string;
  readonly redeemed_at?: string | null;
  readonly description?: string;
}

/** Parsed Codex `/wham/rate-limit-reset-credits` response payload. */
export interface RateLimitResetCreditsPayload {
  readonly available_count?: number;
  readonly credits?: readonly RateLimitResetCredit[];
}

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
