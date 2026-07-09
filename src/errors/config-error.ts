import { Data } from "effect";

/** Raised when client configuration such as the base URL is invalid. */
export class CodexConfigError extends Data.TaggedError("CodexConfigError")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}
