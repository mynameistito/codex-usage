import type {
  AdditionalRateLimitDetails,
  CodexUsagePayload,
  CreditStatusDetails,
  NormalizedRateLimit,
  NormalizedRateLimitWindow,
  NormalizedUsage,
  RateLimitStatusDetails,
  RateLimitWindowSnapshot,
  SpendControlLimitDetails,
} from "@/types.js";

const secondsToMinutes = (seconds: number): number | null => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Math.ceil(seconds / 60);
};

const isApproximateWindow = (minutes: number, expected: number): boolean =>
  minutes >= expected * 0.95 && minutes <= expected * 1.05;

export const limitLabelForWindow = (
  windowSeconds: number,
  kind: "primary" | "secondary"
): string => {
  const minutes = secondsToMinutes(windowSeconds);

  if (minutes === null) {
    return kind === "secondary" ? "secondary usage" : "usage";
  }

  const hour = 60;
  const day = 24 * hour;

  if (isApproximateWindow(minutes, 5 * hour)) {
    return "5h";
  }

  if (isApproximateWindow(minutes, day)) {
    return "daily";
  }

  if (isApproximateWindow(minutes, 7 * day)) {
    return "weekly";
  }

  if (isApproximateWindow(minutes, 30 * day)) {
    return "monthly";
  }

  if (isApproximateWindow(minutes, 365 * day)) {
    return "annual";
  }

  return kind === "secondary" ? "secondary usage" : "usage";
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
};

const normalizeWindow = (
  kind: "primary" | "secondary",
  window: RateLimitWindowSnapshot | null | undefined
): NormalizedRateLimitWindow | null => {
  if (!window) {
    return null;
  }

  const usedPercent = clampPercent(window.used_percent);
  const resetsAt =
    window.reset_at > 0 ? new Date(window.reset_at * 1000) : null;

  return {
    kind,
    label: limitLabelForWindow(window.limit_window_seconds, kind),
    remainingPercent: 100 - usedPercent,
    resetAfterSeconds: window.reset_after_seconds,
    resetsAt,
    usedPercent,
    windowSeconds: window.limit_window_seconds,
  };
};

const normalizeWindows = (
  details: RateLimitStatusDetails | null | undefined
): readonly NormalizedRateLimitWindow[] =>
  [
    normalizeWindow("primary", details?.primary_window),
    normalizeWindow("secondary", details?.secondary_window),
  ].filter((window): window is NormalizedRateLimitWindow => window !== null);

const normalizeLimit = (params: {
  readonly id: string;
  readonly name: string | null;
  readonly planType: string;
  readonly details: RateLimitStatusDetails | null | undefined;
  readonly credits: CreditStatusDetails | null;
  readonly individualLimit: SpendControlLimitDetails | null;
  readonly rateLimitReachedType: string | null;
}): NormalizedRateLimit => ({
  allowed:
    typeof params.details?.allowed === "boolean"
      ? params.details.allowed
      : null,
  credits: params.credits,
  id: params.id,
  individualLimit: params.individualLimit,
  limitReached:
    typeof params.details?.limit_reached === "boolean"
      ? params.details.limit_reached
      : null,
  name: params.name ?? params.id,
  planType: params.planType,
  rateLimitReachedType: params.rateLimitReachedType,
  windows: normalizeWindows(params.details),
});

const normalizeAdditionalLimit = (
  planType: string,
  limit: AdditionalRateLimitDetails
): NormalizedRateLimit =>
  normalizeLimit({
    credits: null,
    details: limit.rate_limit,
    id: limit.metered_feature,
    individualLimit: null,
    name: limit.limit_name,
    planType,
    rateLimitReachedType: null,
  });

export const normalizeUsagePayload = (
  payload: CodexUsagePayload,
  capturedAt = new Date()
): NormalizedUsage => {
  const individualLimit = payload.spend_control?.individual_limit ?? null;
  const primaryLimit = normalizeLimit({
    credits: payload.credits ?? null,
    details: payload.rate_limit,
    id: "codex",
    individualLimit,
    name: null,
    planType: payload.plan_type,
    rateLimitReachedType: payload.rate_limit_reached_type?.type ?? null,
  });
  const additionalLimits = (payload.additional_rate_limits ?? []).map((limit) =>
    normalizeAdditionalLimit(payload.plan_type, limit)
  );

  return {
    capturedAt,
    limits: [primaryLimit, ...additionalLimits],
    planType: payload.plan_type,
    resetCreditsAvailable:
      payload.rate_limit_reset_credits?.available_count ?? null,
  };
};
