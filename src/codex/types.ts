import type { Redacted } from "effect/Redacted";

export interface CodexAuthTokens {
  readonly accessToken: Redacted<string>;
  readonly accountId: string;
}

export interface CodexClientOptions {
  readonly baseUrl?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface RateLimitWindowSnapshot {
  readonly used_percent: number;
  readonly limit_window_seconds: number;
  readonly reset_after_seconds: number;
  readonly reset_at: number;
}

export interface RateLimitStatusDetails {
  readonly allowed?: boolean | undefined;
  readonly limit_reached?: boolean | undefined;
  readonly primary_window?: RateLimitWindowSnapshot | null | undefined;
  readonly secondary_window?: RateLimitWindowSnapshot | null | undefined;
}

export interface CreditStatusDetails {
  readonly has_credits?: boolean | undefined;
  readonly unlimited?: boolean | undefined;
  readonly balance?: string | null | undefined;
}

export interface SpendControlLimitDetails {
  readonly limit?: string | undefined;
  readonly used?: string | undefined;
  readonly remaining?: string | undefined;
  readonly used_percent?: number | undefined;
  readonly remaining_percent?: number | undefined;
  readonly reset_after_seconds?: number | undefined;
  readonly reset_at?: number | undefined;
}

export interface SpendControlStatusDetails {
  readonly reached?: boolean | undefined;
  readonly individual_limit?: SpendControlLimitDetails | null | undefined;
}

export interface AdditionalRateLimitDetails {
  readonly limit_name: string;
  readonly metered_feature: string;
  readonly rate_limit?: RateLimitStatusDetails | null | undefined;
}

export interface RateLimitReachedType {
  readonly type: string;
}

export interface RateLimitResetCreditsSummary {
  readonly available_count: number;
}

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

export interface NormalizedRateLimitWindow {
  readonly label: string;
  readonly kind: "primary" | "secondary";
  readonly usedPercent: number;
  readonly remainingPercent: number;
  readonly windowSeconds: number;
  readonly resetAfterSeconds: number;
  readonly resetsAt: Date | null;
}

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

export interface NormalizedUsage {
  readonly capturedAt: Date;
  readonly planType: string;
  readonly resetCreditsAvailable: number | null;
  readonly limits: readonly NormalizedRateLimit[];
}

type RateLimitResetCreditStatus = "available" | "expired" | "redeemed";

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

export interface RateLimitResetCreditsPayload {
  readonly available_count?: number | undefined;
  readonly credits?: readonly RateLimitResetCredit[] | undefined;
}

export type ConsumeResetCode =
  | "already_redeemed"
  | "no_credit"
  | "nothing_to_reset"
  | "reset";

export interface ConsumeResetResponse {
  readonly code: ConsumeResetCode;
  readonly windows_reset: number;
}
