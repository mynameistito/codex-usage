import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { Effect, Redacted } from "effect";

import type { CodexAuthTokens } from "@/codex/types.js";
import { CodexAuthError } from "@/errors/index.js";

const defaultCodexAuthPath = (): string =>
  path.join(homedir(), ".codex", "auth.json");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const parseAuthTokens = (
  value: unknown
): Effect.Effect<CodexAuthTokens, CodexAuthError> =>
  Effect.gen(function* parseAuthTokensEffect() {
    const tokens = isRecord(value) ? value["tokens"] : undefined;
    if (!isRecord(tokens)) {
      return yield* new CodexAuthError({
        message: "Missing tokens object in .codex/auth.json",
      });
    }

    const accessToken = tokens["access_token"];
    const accountId = tokens["account_id"];

    if (typeof accessToken !== "string" || accessToken.length === 0) {
      return yield* new CodexAuthError({
        message: "Missing tokens.access_token in .codex/auth.json",
      });
    }

    if (typeof accountId !== "string" || accountId.length === 0) {
      return yield* new CodexAuthError({
        message: "Missing tokens.account_id in .codex/auth.json",
      });
    }

    return { accessToken: Redacted.make(accessToken), accountId };
  });

export const readCodexAuth = (
  authPath = defaultCodexAuthPath()
): Effect.Effect<CodexAuthTokens, CodexAuthError> =>
  Effect.gen(function* readCodexAuthEffect() {
    const raw = yield* Effect.tryPromise({
      catch: (cause) =>
        new CodexAuthError({
          cause,
          message: `Could not read Codex auth file at ${authPath}`,
        }),
      try: () => readFile(authPath, "utf-8"),
    });

    const parsed = yield* Effect.try({
      catch: (cause) =>
        new CodexAuthError({
          cause,
          message: `Could not parse Codex auth file at ${authPath}`,
        }),
      try: () => JSON.parse(raw) as unknown,
    });

    return yield* parseAuthTokens(parsed);
  });
