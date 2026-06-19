import type { CodexAuthError } from "@/errors/auth-error.js";
import type { CliError } from "@/errors/cli-error.js";
import type { CodexHttpError } from "@/errors/http-error.js";
import type { CodexParseError } from "@/errors/parse-error.js";

export type CodexUsageError =
  | CliError
  | CodexAuthError
  | CodexHttpError
  | CodexParseError;
