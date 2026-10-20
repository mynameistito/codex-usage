import { describe, expect, it, vi } from "vitest";

import type {
  CodexUsagePayload,
  RateLimitResetCreditsPayload,
} from "@/codex/types.js";
import { formatResetCredits, formatUsage } from "@/usage/format.js";
import { normalizeUsagePayload } from "@/usage/normalize.js";

describe(formatUsage, () => {
  it("prints usage windows and reset credits", () => {
    const payload: CodexUsagePayload = {
      plan_type: "pro",
      rate_limit: {
        primary_window: {
          limit_window_seconds: 18_000,
          reset_after_seconds: 600,
          reset_at: 1_800_000_000,
          used_percent: 25,
        },
        secondary_window: {
          limit_window_seconds: 604_800,
          reset_after_seconds: 86_400,
          reset_at: 1_800_086_400,
          used_percent: 50,
        },
      },
      rate_limit_reset_credits: { available_count: 3 },
    };

    const output = formatUsage(
      normalizeUsagePayload(payload, new Date("2026-06-19T00:00:00Z"))
    );

    expect(output).toMatch(
      /Codex usage[\s\S]*Plan: Pro[\s\S]*Reset credits available: 3[\s\S]*5h limit[\s\S]*75% left[\s\S]*Weekly limit/u
    );
  });
});

describe(formatResetCredits, () => {
  it("prints reset credit details", () => {
    const payload: RateLimitResetCreditsPayload = {
      available_count: 1,
      credits: [
        {
          expires_at: "2026-07-01T00:00:00Z",
          granted_at: "2026-06-01T00:00:00Z",
          id: "RateLimitResetCredit_abc123456789",
          status: "available",
          title: "Banked reset",
        },
      ],
    };

    const output = formatResetCredits(payload);

    expect(output).toContain("Available: 1");
    expect(output).toContain("Banked reset");
    expect(output).toContain("...23456789");
  });

  it("prints recently expired reset credits as expired", () => {
    const payload: RateLimitResetCreditsPayload = {
      available_count: 0,
      credits: [
        {
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          id: "RateLimitResetCredit_expired",
          status: "expired",
          title: "Expired reset",
        },
      ],
    };

    expect(formatResetCredits(payload)).toContain("expired");
  });

  it("labels expiry relative to the local calendar day", () => {
    const previousTz = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";

    const fixedNow = new Date(2026, 6, 7, 23, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    try {
      const payload: RateLimitResetCreditsPayload = {
        available_count: 1,
        credits: [
          {
            expires_at: new Date(2026, 6, 8, 1, 0, 0).toISOString(),
            id: "RateLimitResetCredit_local_day",
            status: "available",
            title: "Soon reset",
          },
        ],
      };

      expect(formatResetCredits(payload)).toContain("expires tomorrow");
      expect(formatResetCredits(payload)).not.toContain("expires today");
    } finally {
      vi.useRealTimers();

      if (previousTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTz;
      }
    }
  });
});
