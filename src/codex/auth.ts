import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { Effect, Redacted, Schema } from "effect";

import type { CodexAuthTokens, JsonValue } from "@/codex/types.js";
import { CodexAuthError } from "@/errors/index.js";

/** Returns the default Codex auth file path under the user home directory. */
const defaultCodexAuthPath = (): string =>
  path.join(homedir(), ".codex", "auth.json");

interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Returns whether `value` is a plain object record. */
const isRecord = (value: JsonValue): value is JsonObject =>
  value !== null &&
  !Array.isArray(value) &&
  Schema.is(Schema.Struct({}))(value);

const isNonEmptyString = (value: JsonValue): value is string =>
  Schema.is(Schema.String)(value) && value.length > 0;

/**
 * Parses a decoded `auth.json` object into redacted Codex API credentials.
 *
 * @param value - Parsed JSON value from a Codex auth file.
 */
export const parseAuthTokens = (
  value: JsonValue
): Effect.Effect<CodexAuthTokens, CodexAuthError> =>
  Effect.gen(function* parseAuthTokensEffect() {
    const tokens = isRecord(value) ? (value["tokens"] ?? null) : null;
    if (!isRecord(tokens)) {
      return yield* new CodexAuthError({
        message: "Missing tokens object in .codex/auth.json",
      });
    }

    const accessToken = tokens["access_token"] ?? null;
    const accountId = tokens["account_id"] ?? null;

    if (!isNonEmptyString(accessToken)) {
      return yield* new CodexAuthError({
        message: "Missing tokens.access_token in .codex/auth.json",
      });
    }

    if (!isNonEmptyString(accountId)) {
      return yield* new CodexAuthError({
        message: "Missing tokens.account_id in .codex/auth.json",
      });
    }

    return { accessToken: Redacted.make(accessToken), accountId };
  });

/**
 * Reads and parses Codex credentials from `auth.json`.
 *
 * @param authPath - Path to the auth file. Defaults to `~/.codex/auth.json`.
 */
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
      try: () => {
        const parsedValue: JsonValue = JSON.parse(raw);
        return parsedValue;
      },
    });

    return yield* parseAuthTokens(parsed);
  });
