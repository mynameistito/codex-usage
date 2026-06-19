import { Data } from "effect";

export class CodexHttpError extends Data.TaggedError("CodexHttpError")<{
  readonly body: string;
  readonly message: string;
  readonly status: number;
  readonly statusText: string;
}> {}
