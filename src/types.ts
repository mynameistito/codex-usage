export interface CodexAuthTokens {
  readonly accessToken: string;
  readonly accountId: string;
}

export interface CodexClientOptions {
  readonly baseUrl?: string;
  readonly userAgent?: string;
}

export interface RateLimitWindowSnapshot {
  readonly used_percent: number;
  readonly limit_window_seconds: number;
  readonly reset_after_seconds: number;
  readonly reset_at: number;
}

export interface RateLimitStatusDetails {
  readonly allowed?: boolean;
  readonly limit_reached?: boolean;
  readonly primary_window?: RateLimitWindowSnapshot | null;
  readonly secondary_window?: RateLimitWindowSnapshot | null;
}

export interface CreditStatusDetails {
  readonly has_credits?: boolean;
  readonly unlimited?: boolean;
  readonly balance?: string | null;
}

export interface SpendControlLimitDetails {
  readonly limit?: string;
  readonly used?: string;
  readonly remaining?: string;
  readonly used_percent?: number;
  readonly remaining_percent?: number;
  readonly reset_after_seconds?: number;
  readonly reset_at?: number;
}

export interface SpendControlStatusDetails {
  readonly reached?: boolean;
  readonly individual_limit?: SpendControlLimitDetails | null;
}

export interface AdditionalRateLimitDetails {
  readonly limit_name: string;
  readonly metered_feature: string;
  readonly rate_limit?: RateLimitStatusDetails | null;
}

export interface RateLimitReachedType {
  readonly type: string;
}

export interface RateLimitResetCreditsSummary {
  readonly available_count: number;
}

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

export interface RateLimitResetCredit {
  readonly id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly profile_user_id?: string;
  readonly granted_at?: string;
  readonly expires_at?: string;
  readonly redeemed_at?: string | null;
  readonly description?: string;
}

export interface RateLimitResetCreditsPayload {
  readonly available_count?: number;
  readonly credits?: readonly RateLimitResetCredit[];
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
