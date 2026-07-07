import type {
  ConsumeResetResponse,
  NormalizedRateLimitWindow,
  NormalizedUsage,
  RateLimitResetCredit,
  RateLimitResetCreditsPayload,
} from "@/types.js";

const titleCase = (value: string): string =>
  value.length === 0
    ? value
    : value[0]?.toUpperCase() + value.slice(1).toLowerCase();

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

type NullableDateInput = Date | string | null;

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

const percent = (value: number): string => `${value.toFixed(0)}%`;

const progressBar = (remainingPercent: number): string => {
  const segments = 20;
  const ratio = Math.min(1, Math.max(0, remainingPercent / 100));
  const filled = Math.round(ratio * segments);
  return `[${"#".repeat(filled)}${"-".repeat(segments - filled)}]`;
};

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

export const formatUsage = (usage: NormalizedUsage): string => {
  const lines = [
    "Codex usage",
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

type NullableString = string | null;

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

  const days = Math.ceil(millisecondsUntilExpiry / 86_400_000);
  if (days < 0) {
    return "expired";
  }

  if (days === 0) {
    return "expires today";
  }

  if (days === 1) {
    return "expires tomorrow";
  }

  return `${days} days left`;
};

const shortCreditId = (credit: RateLimitResetCredit): string =>
  credit.id?.replace(/^RateLimitResetCredit_/u, "").slice(-8) ?? "unknown";

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

export const formatConsumeResetResponse = (
  response: ConsumeResetResponse
): string => {
  const result = response.code.replaceAll("_", " ");
  return `Reset result: ${result}\nWindows reset: ${response.windows_reset}\n`;
};
