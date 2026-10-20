import { Effect, Exit, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { createCodexClient } from "../src/codex/client.js";

describe("legacy consume-reset calls", () => {
  it("rejects positional string arguments", async () => {
    const clientExit = await Effect.runPromiseExit(
      createCodexClient(
        {
          accessToken: Redacted.make("access-token"),
          accountId: "account-id",
        },
        { baseUrl: "https://example.com" }
      ).pipe(
        Effect.flatMap((client) =>
          client.consumeResetCredit("redeem-request-id")
        )
      )
    );

    const failureMessage = Exit.isFailure(clientExit)
      ? clientExit.cause.toString()
      : "";

    expect(failureMessage).toContain("expects an options object");
  });
});
