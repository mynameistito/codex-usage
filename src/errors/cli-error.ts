import { Data } from "effect";

/** Raised for invalid CLI usage or guarded CLI operations. */
export class CliError extends Data.TaggedError("CliError")<{
  readonly exitCode: number;
  readonly message: string;
}> {}
