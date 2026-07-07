import type {
  ConsumeResetResponse,
  NormalizedRateLimitWindow,
  NormalizedUsage,
  RateLimitResetCredit,
  RateLimitResetCreditsPayload,
} from "@/codex/types.js";

/** Options for {@link formatUsage}. */
interface FormatUsageOptions {
  readonly title?: string;
}

/** Capitalizes the first character and lowercases the remainder. */
const titleCase = (value: string): string =>
  value.length === 0
    ? value
    : value[0]?.toUpperCase() + value.slice(1).toLowerCase();

/** Maps raw Codex plan type identifiers to display labels. */
const formatPlanType = (planType: string): string => {
  if (planType === "prolite") {
    return "Pro Lite";
  }

  if (planType === "self_serve_business_usage_based" || planType === "team") {
    return "Business";
  }

  if (planType === "enterprise_cbp_usage_based" || planType === "business") {
    return "Enterprise";
  }

  return planType.split("_").filter(Boolean).map(titleCase).join(" ");
};

/** Accepted date inputs for {@link formatDateTime}. */
type NullableDateInput = Date | string | null;

/** Formats a date value for CLI output, or `None` when absent. */
const formatDateTime = (value: NullableDateInput | undefined): string => {
  if (!value) {
    return "None";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

/** Formats a duration in seconds as a compact CLI countdown string. */
const secondsToDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "now";
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
  }

  const days = Math.floor(hours / 24);
  const hourRemainder = hours % 24;
  return hourRemainder === 0 ? `${days}d` : `${days}d ${hourRemainder}h`;
};

/** Formats a percentage value with no fractional digits. */
const percent = (value: number): string => `${value.toFixed(0)}%`;

/** Renders a fixed-width ASCII progress bar for remaining quota. */
const progressBar = (remainingPercent: number): string => {
  const segments = 20;
  const ratio = Math.min(1, Math.max(0, remainingPercent / 100));
  const filled = Math.round(ratio * segments);
  return `[${"#".repeat(filled)}${"-".repeat(segments - filled)}]`;
};

/** Formats a single normalized usage window for CLI output. */
const formatWindow = (window: NormalizedRateLimitWindow): string => {
  const resetText = window.resetsAt
    ? `${formatDateTime(window.resetsAt)} (${secondsToDuration(window.resetAfterSeconds)})`
    : "unknown";

  return [
    `${titleCase(window.label)} limit`,
    `  ${progressBar(window.remainingPercent)} ${percent(window.remainingPercent)} left`,
    `  Used:   ${percent(window.usedPercent)}`,
    `  Resets: ${resetText}`,
  ].join("\n");
};

/**
 * Formats a normalized usage snapshot for CLI output.
 *
 * @param usage - Normalized usage returned by {@link normalizeUsagePayload}.
 * @param options - Optional heading override.
 */
export const formatUsage = (
  usage: NormalizedUsage,
  options: FormatUsageOptions = {}
): string => {
  const lines = [
    options.title ?? "Codex usage",
    `Plan: ${formatPlanType(usage.planType)}`,
    `Captured: ${formatDateTime(usage.capturedAt)}`,
  ];

  if (usage.resetCreditsAvailable !== null) {
    lines.push(`Reset credits available: ${usage.resetCreditsAvailable}`);
  }

  for (const limit of usage.limits) {
    if (limit.windows.length === 0) {
      continue;
    }

    lines.push("");
    if (limit.id !== "codex") {
      lines.push(`${limit.name} (${limit.id})`);
    }

    for (const window of limit.windows) {
      lines.push(formatWindow(window));
    }
  }

  return `${lines.join("\n")}\n`;
};

/** Accepted string inputs for {@link daysUntil}. */
type NullableString = string | null;

/** Number of milliseconds in one UTC day. */
const millisecondsPerDay = 86_400_000;

/** Returns the UTC midnight timestamp for the calendar day containing `date`. */
const startOfUtcDay = (date: Date): number =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/**
 * Counts whole UTC calendar days from `from` until `to`.
 * Same-day values return `0`; the next UTC day returns `1`.
 */
const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.floor((startOfUtcDay(to) - startOfUtcDay(from)) / millisecondsPerDay);

/**
 * Formats a human-readable expiry countdown for reset-credit timestamps.
 * Returns an empty string for missing or invalid values.
 */
const daysUntil = (value: NullableString | undefined): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const millisecondsUntilExpiry = date.getTime() - Date.now();
  if (millisecondsUntilExpiry < 0) {
    return "expired";
  }

  const days = calendarDaysBetween(new Date(), date);
  if (days === 0) {
    return "expires today";
  }

  if (days === 1) {
    return "expires tomorrow";
  }

  return `${days} days left`;
};

/** Returns the shortened suffix of a reset-credit identifier for display. */
const shortCreditId = (credit: RateLimitResetCredit): string =>
  credit.id?.replace(/^RateLimitResetCredit_/u, "").slice(-8) ?? "unknown";

/**
 * Formats reset-credit inventory for CLI output.
 *
 * @param payload - Reset-credit payload from the Codex API.
 */
export const formatResetCredits = (
  payload: RateLimitResetCreditsPayload
): string => {
  const credits = payload.credits ?? [];
  const available =
    payload.available_count ??
    credits.filter((credit) => credit.status === "available").length;
  const lines = ["Codex rate limit reset credits", `Available: ${available}`];

  if (credits.length === 0) {
    return `${lines.join("\n")}\n`;
  }

  for (const [index, credit] of credits.entries()) {
    const expiryStatus = daysUntil(credit.expires_at);
    const expiryText = expiryStatus ? ` (${expiryStatus})` : "";
    lines.push(
      "",
      `${index + 1}. ${credit.title ?? "Rate limit reset"}`,
      `   Status:   ${credit.status ?? "unknown"}`,
      `   Source:   ${credit.profile_user_id ?? "unknown"}`,
      `   Granted:  ${formatDateTime(credit.granted_at)}`,
      `   Expires:  ${formatDateTime(credit.expires_at)}${expiryText}`,
      `   Redeemed: ${formatDateTime(credit.redeemed_at)}`,
      `   Credit ID: ...${shortCreditId(credit)}`
    );

    if (credit.description) {
      lines.push(`   Note:     ${credit.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
};

/**
 * Formats a consume-reset API response for CLI output.
 *
 * @param response - Parsed consume-reset response from the Codex API.
 */
export const formatConsumeResetResponse = (
  response: ConsumeResetResponse
): string => {
  const result = response.code.replaceAll("_", " ");
  return `Reset result: ${result}\nWindows reset: ${response.windows_reset}\n`;
};
