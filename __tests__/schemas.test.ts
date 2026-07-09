import { describe, expect, test } from "bun:test";

import { Effect } from "effect";

import { parseResetCreditsPayload } from "@/codex/schemas.js";

describe("parseResetCreditsPayload", () => {
  test("does not embed rejected response values in parse error messages", async () => {
    const exit = await Effect.runPromiseExit(
      parseResetCreditsPayload({
        available_count: "not-a-number",
        credits: [
          {
            expires_at: 123,
            id: "RateLimitResetCredit_secret123456789",
          },
        ],
      })
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const message = exit.cause.toString();
      expect(message).toContain("Reset credits response had an invalid shape");
      expect(message).not.toContain("RateLimitResetCredit_secret123456789");
      expect(message).not.toContain("not-a-number");
    }
  });
});
