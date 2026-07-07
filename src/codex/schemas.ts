/**
 * Effect schemas and parsers for Codex API response payloads.
 */
import { Effect, ParseResult, Schema } from "effect";

import type {
  CodexUsagePayload,
  ConsumeResetResponse,
  RateLimitResetCreditsPayload,
} from "@/codex/types.js";
import { CodexParseError } from "@/errors/index.js";

/** Schema for a single rate-limit window snapshot in usage responses. */
const RateLimitWindowSnapshotSchema = Schema.Struct({
  limit_window_seconds: Schema.Number,
  reset_after_seconds: Schema.Number,
  reset_at: Schema.Number,
  used_percent: Schema.Number,
});

/** Schema for primary and secondary rate-limit details in usage responses. */
const RateLimitStatusDetailsSchema = Schema.Struct({
  allowed: Schema.optional(Schema.Boolean),
  limit_reached: Schema.optional(Schema.Boolean),
  primary_window: Schema.optional(Schema.NullOr(RateLimitWindowSnapshotSchema)),
  secondary_window: Schema.optional(
    Schema.NullOr(RateLimitWindowSnapshotSchema)
  ),
});

/** Schema for prepaid credit status details in usage responses. */
const CreditStatusDetailsSchema = Schema.Struct({
  balance: Schema.optional(Schema.NullOr(Schema.String)),
  has_credits: Schema.optional(Schema.Boolean),
  unlimited: Schema.optional(Schema.Boolean),
});

/** Schema for individual spend-control limit details in usage responses. */
const SpendControlLimitDetailsSchema = Schema.Struct({
  limit: Schema.optional(Schema.String),
  remaining: Schema.optional(Schema.String),
  remaining_percent: Schema.optional(Schema.Number),
  reset_after_seconds: Schema.optional(Schema.Number),
  reset_at: Schema.optional(Schema.Number),
  used: Schema.optional(Schema.String),
  used_percent: Schema.optional(Schema.Number),
});

/** Schema for spend-control status details in usage responses. */
const SpendControlStatusDetailsSchema = Schema.Struct({
  individual_limit: Schema.optional(
    Schema.NullOr(SpendControlLimitDetailsSchema)
  ),
  reached: Schema.optional(Schema.Boolean),
});

/** Schema for additional metered rate limits in usage responses. */
const AdditionalRateLimitDetailsSchema = Schema.Struct({
  limit_name: Schema.String,
  metered_feature: Schema.String,
  rate_limit: Schema.optional(Schema.NullOr(RateLimitStatusDetailsSchema)),
});

/** Schema for rate-limit reached classification in usage responses. */
const RateLimitReachedTypeSchema = Schema.Struct({
  type: Schema.String,
});

/** Schema for reset-credit availability summary in usage responses. */
const RateLimitResetCreditsSummarySchema = Schema.Struct({
  available_count: Schema.Number,
});

/** Schema for the Codex `/wham/usage` response payload. */
const CodexUsagePayloadSchema = Schema.Struct({
  additional_rate_limits: Schema.optional(
    Schema.NullOr(Schema.Array(AdditionalRateLimitDetailsSchema))
  ),
  credits: Schema.optional(Schema.NullOr(CreditStatusDetailsSchema)),
  plan_type: Schema.String,
  rate_limit: Schema.optional(Schema.NullOr(RateLimitStatusDetailsSchema)),
  rate_limit_reached_type: Schema.optional(
    Schema.NullOr(RateLimitReachedTypeSchema)
  ),
  rate_limit_reset_credits: Schema.optional(
    Schema.NullOr(RateLimitResetCreditsSummarySchema)
  ),
  spend_control: Schema.optional(
    Schema.NullOr(SpendControlStatusDetailsSchema)
  ),
});

/** Allowed lifecycle states for a banked reset credit. */
const RateLimitResetCreditStatusSchema = Schema.Literal(
  "available",
  "expired",
  "redeemed"
);

/** Schema for a single banked reset credit. */
const RateLimitResetCreditSchema = Schema.Struct({
  description: Schema.optional(Schema.String),
  expires_at: Schema.optional(Schema.String),
  granted_at: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  profile_user_id: Schema.optional(Schema.String),
  redeemed_at: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(RateLimitResetCreditStatusSchema),
  title: Schema.optional(Schema.String),
});

/** Schema for the Codex reset-credits list response payload. */
const RateLimitResetCreditsPayloadSchema = Schema.Struct({
  available_count: Schema.optional(Schema.Number),
  credits: Schema.optional(Schema.Array(RateLimitResetCreditSchema)),
});

/** Schema for the Codex consume-reset response payload. */
const ConsumeResetResponseSchema = Schema.Struct({
  code: Schema.Literal(
    "already_redeemed",
    "no_credit",
    "nothing_to_reset",
    "reset"
  ),
  windows_reset: Schema.Number,
});

/** Returns whether `value` is a non-null, non-array object. */
const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Builds a tagged parse error for the rejected API payload. */
const parseError = (message: string, value: unknown): CodexParseError =>
  new CodexParseError({ message, value });

/** Maps a schema decode failure into a `CodexParseError` with parse diagnostics. */
const invalidShapeError = (
  invalidShapeMessage: string,
  value: unknown,
  error: ParseResult.ParseError
): CodexParseError => {
  const details = ParseResult.TreeFormatter.formatErrorSync(error);
  return parseError(`${invalidShapeMessage}: ${details}`, value);
};

/**
 * Decodes an API payload with `schema`, preserving Effect parse diagnostics on
 * shape mismatches while keeping dedicated messages for non-object inputs.
 */
const parseSchema = <A, I>(params: {
  readonly input: unknown;
  readonly invalidShapeMessage: string;
  readonly notObjectMessage: string;
  readonly schema: Schema.Schema<A, I, never>;
}): Effect.Effect<A, CodexParseError> => {
  if (!isObject(params.input)) {
    return Effect.fail(parseError(params.notObjectMessage, params.input));
  }

  const decoded = Schema.decodeUnknownEither(params.schema)(params.input);
  if (decoded._tag === "Left") {
    return Effect.fail(
      invalidShapeError(params.invalidShapeMessage, params.input, decoded.left)
    );
  }

  return Effect.succeed(decoded.right);
};

/**
 * Parses a Codex usage API payload into a typed structure.
 *
 * @param input - Raw JSON value from the usage endpoint.
 */
export const parseUsagePayload = (
  input: unknown
): Effect.Effect<CodexUsagePayload, CodexParseError> =>
  parseSchema({
    input,
    invalidShapeMessage: "Usage response had an invalid shape",
    notObjectMessage: "Usage response was not an object",
    schema: CodexUsagePayloadSchema,
  });

/**
 * Parses a rate-limit reset credits API payload into a typed structure.
 *
 * @param input - Raw JSON value from the reset-credits endpoint.
 */
export const parseResetCreditsPayload = (
  input: unknown
): Effect.Effect<RateLimitResetCreditsPayload, CodexParseError> =>
  parseSchema({
    input,
    invalidShapeMessage: "Reset credits response had an invalid shape",
    notObjectMessage: "Reset credits response was not an object",
    schema: RateLimitResetCreditsPayloadSchema,
  });

/**
 * Parses a consume-reset API response into a typed structure.
 *
 * @param input - Raw JSON value from the consume-reset endpoint.
 */
export const parseConsumeResetResponse = (
  input: unknown
): Effect.Effect<ConsumeResetResponse, CodexParseError> =>
  parseSchema({
    input,
    invalidShapeMessage: "Consume reset response had an invalid shape",
    notObjectMessage: "Consume reset response was not an object",
    schema: ConsumeResetResponseSchema,
  });
