import { Data } from "effect";

/** Raised when Codex auth files are missing, unreadable, or malformed. */
export class CodexAuthError extends Data.TaggedError("CodexAuthError")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}
