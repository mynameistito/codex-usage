import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { Effect, Redacted, Schema } from "effect";

import type { CodexAuthTokens, JsonValue } from "@/codex/types.js";
import { CodexAuthError } from "@/errors/index.js";

/** Returns the default Codex auth file path under the user home directory.
 * @returns The default auth file path.
 */
const defaultCodexAuthPath = (): string =>
  path.join(homedir(), ".codex", "auth.json");

type JsonObject = Readonly<Record<string, JsonValue>>;

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return typeof value === "object" && Object.values(value).every(isJsonValue);
};

/** Returns whether `value` is a plain object record.
 * @param value - JSON value to inspect.
 * @returns Whether the value is an object record.
 */
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
 * @returns Parsed credentials or a typed auth error.
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
 * @returns Parsed credentials or a typed auth error.
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
      try: async () => await readFile(authPath, "utf-8"),
    });

    const parsed = yield* Effect.try({
      catch: (cause) =>
        new CodexAuthError({
          cause,
          message: `Could not parse Codex auth file at ${authPath}`,
        }),
      try: () => {
        const parsedValue: unknown = JSON.parse(raw);

        if (!isJsonValue(parsedValue)) {
          throw new TypeError("Auth file contains a non-JSON value");
        }

        return parsedValue;
      },
    });

    return yield* parseAuthTokens(parsed);
  });
