#!/usr/bin/env node
/**
 * Command-line entry point for inspecting Codex usage and reset credits.
 */
import { pathToFileURL } from "node:url";

import { Cause, Effect, Option } from "effect";

import { readCodexAuth } from "@/codex/auth.js";
import { createCodexClient } from "@/codex/client.js";
import type { RateLimitResetCredit } from "@/codex/types.js";
import { CliError } from "@/errors/index.js";
import type { CodexUsageError } from "@/errors/index.js";
import { packageTitle } from "@/package-metadata.js";
import {
  formatConsumeResetResponse,
  formatResetCredits,
  formatUsage,
} from "@/usage/format.js";

/** CLI commands that only display help or usage information. */
type CliHelpOrStatusCommand = "help" | "status";

/** CLI commands that read or redeem reset credits. */
type CliResetCommand = "reset" | "resets";

/** Supported top-level CLI commands. */
type CliCommand = CliHelpOrStatusCommand | CliResetCommand;

/** Immutable parsed CLI arguments. */
interface ParsedArgs {
  readonly command: CliCommand;
  readonly authPath?: string;
  readonly baseUrl?: string;
  readonly confirm: boolean;
  readonly json: boolean;
}

/** Built-in help text printed for `codex-usage --help`. */
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
  -v, --verbose      Print full error details for unexpected failures.
  -h, --help         Show this help.
`;

/**
 * Reads the value that follows a flag-style CLI option.
 *
 * @param args - Full argv slice being parsed.
 * @param index - Index of the option token in `args`.
 * @param option - Option name used in error messages.
 */
const readOptionValue = (
  args: readonly string[],
  index: number,
  option: string
): Effect.Effect<string, CliError> =>
  Effect.gen(function* readOptionValueEffect() {
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      return yield* new CliError({
        exitCode: 2,
        message: `Missing value for ${option}`,
      });
    }

    return value;
  });

/** Mutable parse state accumulated while scanning argv. */
interface MutableParsedArgs {
  command: CliCommand;
  authPath?: string;
  baseUrl?: string;
  confirm: boolean;
  json: boolean;
}

/** Result of parsing a single argv token. */
interface ArgParseStep {
  readonly nextIndex: number;
  readonly stop: boolean;
}

/**
 * Parses one argv token and updates mutable CLI state.
 *
 * @param args - Full argv slice being parsed.
 * @param index - Index of the token to parse.
 * @param state - Mutable parse accumulator.
 */
const parseNextArg = (
  args: readonly string[],
  index: number,
  state: MutableParsedArgs
): Effect.Effect<ArgParseStep, CliError> =>
  Effect.gen(function* parseNextArgEffect() {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      state.command = "help";
      return { nextIndex: index + 1, stop: true };
    }

    if (arg === "--json") {
      state.json = true;
      return { nextIndex: index + 1, stop: false };
    }

    if (arg === "-y" || arg === "--confirm" || arg === "--yes") {
      state.confirm = true;
      return { nextIndex: index + 1, stop: false };
    }

    if (arg === "-v" || arg === "--verbose") {
      return { nextIndex: index + 1, stop: false };
    }

    if (arg === "--auth") {
      state.authPath = yield* readOptionValue(args, index, arg);
      return { nextIndex: index + 2, stop: false };
    }

    if (arg === "--base-url") {
      state.baseUrl = yield* readOptionValue(args, index, arg);
      return { nextIndex: index + 2, stop: false };
    }

    if (arg === "status" || arg === "resets" || arg === "reset") {
      state.command = arg;
      return { nextIndex: index + 1, stop: false };
    }

    return yield* new CliError({
      exitCode: 2,
      message: `Unknown argument: ${arg}`,
    });
  });

/**
 * Parses CLI argv into a typed command description.
 *
 * @param args - Arguments after the executable name.
 */
export const parseArgs = (
  args: readonly string[]
): Effect.Effect<ParsedArgs, CliError> =>
  Effect.gen(function* parseArgsEffect() {
    const state: MutableParsedArgs = {
      command: "status",
      confirm: false,
      json: false,
    };

    let index = 0;
    while (index < args.length) {
      const step = yield* parseNextArg(args, index, state);
      if (step.stop) {
        break;
      }

      index = step.nextIndex;
    }

    return {
      ...(state.authPath === undefined ? {} : { authPath: state.authPath }),
      ...(state.baseUrl === undefined ? {} : { baseUrl: state.baseUrl }),
      command: state.command,
      confirm: state.confirm,
      json: state.json,
    };
  });

/** Serializes a value as pretty-printed JSON with a trailing newline. */
const stringifyJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

/**
 * Returns the expiry timestamp for credit selection, or `null` when invalid.
 *
 * Credits without an expiry are treated as never expiring.
 */
const timestampForCreditExpiry = (
  credit: RateLimitResetCredit
): number | null => {
  if (!credit.expires_at) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = Date.parse(credit.expires_at);
  return Number.isNaN(timestamp) ? null : timestamp;
};

/**
 * Selects the soonest-expiring available reset credit for redemption.
 *
 * @param credits - Reset credits returned by the Codex API.
 * @param now - Current timestamp used for expiry comparisons.
 */
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

/** Builds optional {@link CodexClientOptions} from parsed CLI args. */
const clientOptionsForArgs = (parsed: ParsedArgs) =>
  parsed.baseUrl === undefined ? {} : { baseUrl: parsed.baseUrl };

/**
 * Executes a parsed CLI command and returns the output to print.
 *
 * @param parsed - Parsed CLI arguments.
 */
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
    const client = yield* createCodexClient(
      tokens,
      clientOptionsForArgs(parsed)
    );

    if (parsed.command === "status") {
      const usage = yield* client.fetchUsage();
      return parsed.json
        ? stringifyJson(usage)
        : formatUsage(usage, { title: packageTitle() });
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

    const response = yield* client.consumeResetCredit({ creditId: credit.id });
    return parsed.json
      ? stringifyJson(response)
      : formatConsumeResetResponse(response);
  });

/**
 * Parses argv and runs the requested CLI command.
 *
 * @param args - Arguments after the executable name.
 */
export const runCli = (
  args: readonly string[]
): Effect.Effect<string, CodexUsageError> =>
  parseArgs(args).pipe(Effect.flatMap(runParsed));

/** Returns whether argv requests verbose unexpected-error output. */
export const isVerboseCli = (args: readonly string[]): boolean =>
  args.includes("--verbose") || args.includes("-v");

/** Formats an unexpected CLI failure for stderr. */
export const formatUnexpectedCliError = (
  cause: Cause.Cause<unknown>,
  args: readonly string[]
): string =>
  isVerboseCli(args) ? Cause.pretty(cause) : "An unexpected error occurred";

/** Prints a tagged CLI or Codex error and returns the process exit code. */
const printError = (error: CodexUsageError): number => {
  if (error._tag === "CodexHttpError") {
    console.error(`${error.message}: HTTP ${error.status} ${error.statusText}`);
    return 1;
  }

  console.error(error.message);
  if (error._tag === "CliError") {
    return error.exitCode;
  }

  return error._tag === "CodexConfigError" ? 2 : 1;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const cliArgs = process.argv.slice(2);
  const exit = await Effect.runPromiseExit(runCli(cliArgs));
  if (exit._tag === "Success") {
    const output = exit.value;
    process.stdout.write(output);
  } else {
    const failure = Cause.failureOption(exit.cause);
    if (Option.isSome(failure)) {
      process.exitCode = printError(failure.value);
    } else {
      console.error(formatUnexpectedCliError(exit.cause, cliArgs));
      process.exitCode = 1;
    }
  }
}
