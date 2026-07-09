import { describe, expect, test } from "bun:test";

import type { CodexUsagePayload } from "@/codex/types.js";
import {
  limitLabelForWindow,
  normalizeUsagePayload,
} from "@/usage/normalize.js";

describe("limitLabelForWindow", () => {
  test("labels known Codex windows by duration", () => {
    expect(limitLabelForWindow(18_000, "primary")).toBe("5h");
    expect(limitLabelForWindow(604_800, "secondary")).toBe("weekly");
  });

  test("falls back by window kind for unknown durations", () => {
    expect(limitLabelForWindow(123, "primary")).toBe("usage");
    expect(limitLabelForWindow(123, "secondary")).toBe("secondary usage");
  });
});

describe("normalizeUsagePayload", () => {
  test("maps main and additional limits", () => {
    const payload: CodexUsagePayload = {
      additional_rate_limits: [
        {
          limit_name: "codex-other",
          metered_feature: "codex_other",
          rate_limit: {
            allowed: true,
            limit_reached: false,
            primary_window: {
              limit_window_seconds: 86_400,
              reset_after_seconds: 3600,
              reset_at: 1_800_000_000,
              used_percent: 20,
            },
          },
        },
      ],
      plan_type: "pro",
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          limit_window_seconds: 18_000,
          reset_after_seconds: 600,
          reset_at: 1_800_000_000,
          used_percent: 42,
        },
        secondary_window: {
          limit_window_seconds: 604_800,
          reset_after_seconds: 86_400,
          reset_at: 1_800_086_400,
          used_percent: 84,
        },
      },
      rate_limit_reset_credits: { available_count: 2 },
    };

    const usage = normalizeUsagePayload(
      payload,
      new Date("2026-06-19T00:00:00Z")
    );

    expect(usage.resetCreditsAvailable).toBe(2);
    expect(usage.limits).toHaveLength(2);
    expect(usage.limits[0]?.windows.map((window) => window.label)).toEqual([
      "5h",
      "weekly",
    ]);
    expect(usage.limits[1]?.windows[0]?.label).toBe("daily");
  });
});
