import { describe, expect, test } from "bun:test";

import { extractReleaseNotes, runNpmRelease } from "../scripts/publish.js";
import type { CommandResult } from "../scripts/publish.js";

const result = (exitCode: number, stdout = "", stderr = ""): CommandResult => ({
  exitCode,
  stderr,
  stdout,
});

describe("release helpers", () => {
  test("matches the exact changelog version heading", () => {
    const changelog = [
      "## 1.2.30",
      "Wrong release notes",
      "",
      "## 1.2.3",
      "Correct release notes",
    ].join("\n");

    expect(extractReleaseNotes(changelog, "1.2.3")).toBe(
      "Correct release notes"
    );
  });

  test("does not stage after an npm view error", async () => {
    const calls: string[][] = [];

    await expect(
      runNpmRelease(
        (command, args) => {
          calls.push([command, ...args]);
          return Promise.resolve(result(1, "", "npm error code E401"));
        },
        { name: "example", version: "1.0.0" }
      )
    ).rejects.toThrow("npm view failed");

    expect(calls).toHaveLength(1);
  });

  test("checks stage-list status and uses supported stage-publish args", async () => {
    const calls: string[][] = [];
    const responses = [
      result(1, "", "npm error code E404"),
      result(0, "[]"),
      result(0, "staged"),
    ];

    await runNpmRelease(
      (command, args) => {
        calls.push([command, ...args]);
        return Promise.resolve(
          responses.shift() ?? result(1, "", "unexpected call")
        );
      },
      { name: "example", version: "1.0.0" }
    );

    expect(calls[2]).toEqual(["npm", "stage", "publish", "."]);
  });
});
