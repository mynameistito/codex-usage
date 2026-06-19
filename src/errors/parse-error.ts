import { Data } from "effect";

export class CodexParseError extends Data.TaggedError("CodexParseError")<{
  readonly message: string;
  readonly value: unknown;
}> {}
