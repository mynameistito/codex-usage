import { Data } from "effect";

export class CodexAuthError extends Data.TaggedError("CodexAuthError")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}
