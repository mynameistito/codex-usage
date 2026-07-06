#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { Effect } from "effect";

import { readCodexAuth } from "@/auth.js";
import { createCodexClient } from "@/client.js";
import { CliError } from "@/errors/index.js";
import type { CodexUsageError } from "@/errors/index.js";
import {
  formatConsumeResetResponse,
  formatResetCredits,
  formatUsage,
} from "@/format.js";
import type { RateLimitResetCredit } from "@/types.js";

interface ParsedArgs {
  readonly command: "help" | "reset" | "resets" | "status";
  readonly authPath?: string;
  readonly baseUrl?: string;
  readonly confirm: boolean;
  readonly json: boolean;
}

const HELP_TEXT = `codex-usage

Usage:
  codex-usage [status] [--json] [--auth <path>] [--base-url <url>]
  codex-usage resets [--json] [--auth <path>] [--base-url <url>]
  codex-usage reset --confirm [--auth <path>] [--base-url <url>]

Commands:
  status   Show current Codex usage windows. This is the default.
  resets   List available banked reset credits.
  reset    Redeem one banked reset credit. Requires --confirm or --yes.

Options:
  --auth <path>      Path to Codex auth.json. Defaults to ~/.codex/auth.json.
  --base-url <url>   Override ChatGPT backend URL.
  --json             Print raw normalized JSON for read-only commands.
  -y, --confirm, --yes
                     Required before reset redemption is attempted.
  -h, --help         Show this help.
`;

const readOptionValue = (
  args: readonly string[],
  index: number,
  option: string
): string => {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new CliError({
      exitCode: 2,
      message: `Missing value for ${option}`,
    });
  }

  return value;
};

export const parseArgs = (args: readonly string[]): ParsedArgs => {
  let command: ParsedArgs["command"] = "status";
  let authPath: string | undefined;
  let baseUrl: string | undefined;
  let confirm = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      command = "help";
      break;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "-y" || arg === "--confirm" || arg === "--yes") {
      confirm = true;
      continue;
    }

    if (arg === "--auth") {
      authPath = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--base-url") {
      baseUrl = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "status" || arg === "resets" || arg === "reset") {
      command = arg;
      continue;
    }

    throw new CliError({
      exitCode: 2,
      message: `Unknown argument: ${arg}`,
    });
  }

  return { authPath, baseUrl, command, confirm, json };
};

const stringifyJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

const safeErrorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const timestampForCreditExpiry = (
  credit: RateLimitResetCredit
): number | null => {
  if (!credit.expires_at) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = Date.parse(credit.expires_at);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const pickSoonestExpiringCredit = (
  credits: readonly RateLimitResetCredit[],
  now = Date.now()
): RateLimitResetCredit | null => {
  const availableCredits = credits.filter((credit) => {
    if (!credit.id || (credit.status ?? "available") !== "available") {
      return false;
    }

    const expiresAt = timestampForCreditExpiry(credit);
    return (
      expiresAt !== null &&
      (expiresAt === Number.POSITIVE_INFINITY || expiresAt > now)
    );
  });

  return (
    availableCredits.toSorted((left, right) => {
      const leftExpiresAt = timestampForCreditExpiry(left);
      const rightExpiresAt = timestampForCreditExpiry(right);

      return (
        (leftExpiresAt ?? Number.POSITIVE_INFINITY) -
        (rightExpiresAt ?? Number.POSITIVE_INFINITY)
      );
    })[0] ?? null
  );
};

const runParsed = (
  parsed: ParsedArgs
): Effect.Effect<string, CodexUsageError> =>
  Effect.gen(function* runParsedEffect() {
    if (parsed.command === "help") {
      return HELP_TEXT;
    }

    if (parsed.command === "reset" && !parsed.confirm) {
      return yield* new CliError({
        exitCode: 2,
        message:
          "Refusing to redeem a reset credit without --confirm. Run `codex-usage status` first if you only want usage details.",
      });
    }

    const tokens = yield* readCodexAuth(parsed.authPath);
    const client = yield* Effect.try({
      catch: (cause) =>
        new CliError({
          exitCode: 2,
          message: safeErrorMessage(cause),
        }),
      try: () => createCodexClient(tokens, { baseUrl: parsed.baseUrl }),
    });

    if (parsed.command === "status") {
      const usage = yield* client.fetchUsage();
      return parsed.json ? stringifyJson(usage) : formatUsage(usage);
    }

    if (parsed.command === "resets") {
      const credits = yield* client.fetchResetCredits();
      return parsed.json ? stringifyJson(credits) : formatResetCredits(credits);
    }

    const credits = yield* client.fetchResetCredits();
    const credit = pickSoonestExpiringCredit(credits.credits ?? []);
    if (!credit?.id) {
      return yield* new CliError({
        exitCode: 1,
        message: "No available reset credits to redeem.",
      });
    }

    const response = yield* client.consumeResetCredit(undefined, credit.id);
    return parsed.json
      ? stringifyJson(response)
      : formatConsumeResetResponse(response);
  });

export const runCli = (
  args: readonly string[]
): Effect.Effect<string, CodexUsageError> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof CliError
        ? cause
        : new CliError({ exitCode: 2, message: String(cause) }),
    try: () => parseArgs(args),
  }).pipe(Effect.flatMap(runParsed));

const printError = (error: CodexUsageError): number => {
  if (error._tag === "CodexHttpError") {
    console.error(`${error.message}: HTTP ${error.status} ${error.statusText}`);
    return 1;
  }

  console.error(error.message);
  return error._tag === "CliError" ? error.exitCode : 1;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const output = await Effect.runPromise(runCli(process.argv.slice(2)));
    process.stdout.write(output);
  } catch (error) {
    process.exitCode = printError(error as CodexUsageError);
  }
}
