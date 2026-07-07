import type { CodexAuthError } from "@/errors/auth-error.js";
import type { CliError } from "@/errors/cli-error.js";
import type { CodexConfigError } from "@/errors/config-error.js";
import type { CodexHttpError } from "@/errors/http-error.js";
import type { CodexParseError } from "@/errors/parse-error.js";

/** Union of recoverable errors surfaced by the CLI and Codex client. */
export type CodexUsageError =
  | CliError
  | CodexAuthError
  | CodexConfigError
  | CodexHttpError
  | CodexParseError;
