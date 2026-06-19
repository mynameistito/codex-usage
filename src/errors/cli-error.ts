import { Data } from "effect";

export class CliError extends Data.TaggedError("CliError")<{
  readonly exitCode: number;
  readonly message: string;
}> {}
