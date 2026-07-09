import type { Redacted } from "effect/Redacted";

/** Redacted Codex API credentials read from `auth.json`. */
export interface CodexAuthTokens {
  readonly accessToken: Redacted<string>;
  readonly accountId: string;
}

/** Optional overrides when constructing a {@link CodexClient}. */
export interface CodexClientOptions {
  readonly baseUrl?: string | undefined;
  readonly userAgent?: string | undefined;
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
  readonly allowed?: boolean | undefined;
  readonly limit_reached?: boolean | undefined;
  readonly primary_window?: RateLimitWindowSnapshot | null | undefined;
  readonly secondary_window?: RateLimitWindowSnapshot | null | undefined;
}

/** Raw prepaid-credit status details from the Codex usage API. */
export interface CreditStatusDetails {
  readonly has_credits?: boolean | undefined;
  readonly unlimited?: boolean | undefined;
  readonly balance?: string | null | undefined;
}

/** Raw individual spend-control limit details from the Codex usage API. */
export interface SpendControlLimitDetails {
  readonly limit?: string | undefined;
  readonly used?: string | undefined;
  readonly remaining?: string | undefined;
  readonly used_percent?: number | undefined;
  readonly remaining_percent?: number | undefined;
  readonly reset_after_seconds?: number | undefined;
  readonly reset_at?: number | undefined;
}

/** Raw spend-control status wrapper from the Codex usage API. */
export interface SpendControlStatusDetails {
  readonly reached?: boolean | undefined;
  readonly individual_limit?: SpendControlLimitDetails | null | undefined;
}

/** Raw additional metered rate limit entry from the Codex usage API. */
export interface AdditionalRateLimitDetails {
  readonly limit_name: string;
  readonly metered_feature: string;
  readonly rate_limit?: RateLimitStatusDetails | null | undefined;
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
  readonly rate_limit?: RateLimitStatusDetails | null | undefined;
  readonly credits?: CreditStatusDetails | null | undefined;
  readonly spend_control?: SpendControlStatusDetails | null | undefined;
  readonly additional_rate_limits?:
    | readonly AdditionalRateLimitDetails[]
    | null
    | undefined;
  readonly rate_limit_reached_type?: RateLimitReachedType | null | undefined;
  readonly rate_limit_reset_credits?:
    | RateLimitResetCreditsSummary
    | null
    | undefined;
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
  readonly id?: string | undefined;
  readonly title?: string | undefined;
  readonly status?: RateLimitResetCreditStatus | undefined;
  readonly profile_user_id?: string | undefined;
  readonly granted_at?: string | undefined;
  readonly expires_at?: string | undefined;
  readonly redeemed_at?: string | null | undefined;
  readonly description?: string | undefined;
}

/** Parsed Codex `/wham/rate-limit-reset-credits` response payload. */
export interface RateLimitResetCreditsPayload {
  readonly available_count?: number | undefined;
  readonly credits?: readonly RateLimitResetCredit[] | undefined;
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
