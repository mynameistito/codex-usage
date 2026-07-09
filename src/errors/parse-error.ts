import { Data } from "effect";

/** Raised when a Codex API response cannot be parsed into the expected shape. */
export class CodexParseError extends Data.TaggedError("CodexParseError")<{
  readonly message: string;
  readonly value: unknown;
}> {}
