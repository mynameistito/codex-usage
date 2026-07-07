import { Data } from "effect";

export class CodexConfigError extends Data.TaggedError("CodexConfigError")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}
