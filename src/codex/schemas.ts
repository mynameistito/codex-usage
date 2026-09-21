/**
 * Effect schemas and parsers for Codex API response payloads.
 */
import { Effect, Exit, Schema } from "effect";

import type {
  CodexUsagePayload,
  ConsumeResetResponse,
  RateLimitResetCreditsPayload,
  JsonValue,
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
const RateLimitResetCreditStatusSchema = Schema.Literals([
  "available",
  "expired",
  "redeemed",
]);

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
  code: Schema.Literals([
    "already_redeemed",
    "no_credit",
    "nothing_to_reset",
    "reset",
  ]),
  windows_reset: Schema.Number,
});

/** Returns whether `value` is a non-null, non-array object. */
interface JsonObject {
  readonly [key: string]: JsonValue;
}

const isObject = (value: JsonValue): value is JsonObject =>
  value !== null && !Array.isArray(value);

/** Builds a tagged parse error for the rejected API payload. */
const parseError = (message: string, value: JsonValue): CodexParseError =>
  new CodexParseError({ message, value });

/** Maps a schema decode failure into a `CodexParseError`. */
const invalidPayloadError = (
  invalidPayloadMessage: string,
  value: JsonObject
): CodexParseError => parseError(invalidPayloadMessage, value);

/**
 * Decodes an API payload with `schema`, preserving Effect parse diagnostics on
 * shape mismatches while keeping dedicated messages for non-object inputs.
 */
const parseSchema = <A>(params: {
  readonly input: JsonValue;
  readonly invalidPayloadMessage: string;
  readonly notObjectMessage: string;
  readonly schema: Schema.ConstraintDecoder<A, never>;
}): Effect.Effect<A, CodexParseError> => {
  const { input } = params;
  if (!isObject(input)) {
    return Effect.fail(parseError(params.notObjectMessage, input));
  }

  const decoded = Schema.decodeUnknownExit(params.schema)(input);
  if (Exit.isFailure(decoded)) {
    return Effect.fail(
      invalidPayloadError(params.invalidPayloadMessage, input)
    );
  }

  return Effect.succeed(decoded.value);
};

/**
 * Parses a Codex usage API payload into a typed structure.
 *
 * @param input - Raw JSON value from the usage endpoint.
 */
export const parseUsagePayload = (
  input: JsonValue
): Effect.Effect<CodexUsagePayload, CodexParseError> =>
  parseSchema({
    input,
    invalidPayloadMessage: "Usage response had an invalid shape",
    notObjectMessage: "Usage response was not an object",
    schema: CodexUsagePayloadSchema,
  });

/**
 * Parses a rate-limit reset credits API payload into a typed structure.
 *
 * @param input - Raw JSON value from the reset-credits endpoint.
 */
export const parseResetCreditsPayload = (
  input: JsonValue
): Effect.Effect<RateLimitResetCreditsPayload, CodexParseError> =>
  parseSchema({
    input,
    invalidPayloadMessage: "Reset credits response had an invalid shape",
    notObjectMessage: "Reset credits response was not an object",
    schema: RateLimitResetCreditsPayloadSchema,
  });

/**
 * Parses a consume-reset API response into a typed structure.
 *
 * @param input - Raw JSON value from the consume-reset endpoint.
 */
export const parseConsumeResetResponse = (
  input: JsonValue
): Effect.Effect<ConsumeResetResponse, CodexParseError> =>
  parseSchema({
    input,
    invalidPayloadMessage: "Consume reset response had an invalid shape",
    notObjectMessage: "Consume reset response was not an object",
    schema: ConsumeResetResponseSchema,
  });
