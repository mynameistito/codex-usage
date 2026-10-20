import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { parseResetCreditsPayload } from "@/codex/schemas.js";

describe(parseResetCreditsPayload, () => {
  it("does not embed rejected response values in parse error messages", async () => {
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

    const message = Exit.isFailure(exit) ? exit.cause.toString() : "";
    expect(message).toContain("Reset credits response had an invalid shape");
    expect(message).not.toContain("RateLimitResetCredit_secret123456789");
    expect(message).not.toContain("not-a-number");
  });
});
