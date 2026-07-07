import { Data } from "effect";

/** Raised when a Codex HTTP request fails or returns a non-success status. */
export class CodexHttpError extends Data.TaggedError("CodexHttpError")<{
  readonly body: string;
  readonly message: string;
  readonly status: number;
  readonly statusText: string;
}> {}
