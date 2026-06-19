import { describe, expect, test } from "bun:test";

import { Effect } from "effect";

import { parseArgs, runCli } from "@/cli.js";

describe("parseArgs", () => {
  test("defaults to status", () => {
    expect(parseArgs([])).toEqual({
      authPath: undefined,
      baseUrl: undefined,
      command: "status",
      confirm: false,
      json: false,
    });
  });

  test("requires explicit confirmation for reset through runCli", async () => {
    const exit = await Effect.runPromiseExit(runCli(["reset"]));

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain("without --confirm");
    }
  });

  test("help takes precedence over later commands", () => {
    expect(parseArgs(["--help", "reset", "--confirm"]).command).toBe("help");
  });
});
