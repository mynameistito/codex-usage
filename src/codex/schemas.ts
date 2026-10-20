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
  allowed: Schema.optionalKey(Schema.Boolean),
  limit_reached: Schema.optionalKey(Schema.Boolean),
  primary_window: Schema.optionalKey(
    Schema.NullOr(RateLimitWindowSnapshotSchema)
  ),
  secondary_window: Schema.optionalKey(
    Schema.NullOr(RateLimitWindowSnapshotSchema)
  ),
});

/** Schema for prepaid credit status details in usage responses. */
const CreditStatusDetailsSchema = Schema.Struct({
  balance: Schema.optionalKey(Schema.NullOr(Schema.String)),
  has_credits: Schema.optionalKey(Schema.Boolean),
  unlimited: Schema.optionalKey(Schema.Boolean),
});

/** Schema for individual spend-control limit details in usage responses. */
const SpendControlLimitDetailsSchema = Schema.Struct({
  limit: Schema.optionalKey(Schema.String),
  remaining: Schema.optionalKey(Schema.String),
  remaining_percent: Schema.optionalKey(Schema.Number),
  reset_after_seconds: Schema.optionalKey(Schema.Number),
  reset_at: Schema.optionalKey(Schema.Number),
  used: Schema.optionalKey(Schema.String),
  used_percent: Schema.optionalKey(Schema.Number),
});

/** Schema for spend-control status details in usage responses. */
const SpendControlStatusDetailsSchema = Schema.Struct({
  individual_limit: Schema.optionalKey(
    Schema.NullOr(SpendControlLimitDetailsSchema)
  ),
  reached: Schema.optionalKey(Schema.Boolean),
});

/** Schema for additional metered rate limits in usage responses. */
const AdditionalRateLimitDetailsSchema = Schema.Struct({
  limit_name: Schema.String,
  metered_feature: Schema.String,
  rate_limit: Schema.optionalKey(Schema.NullOr(RateLimitStatusDetailsSchema)),
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
  additional_rate_limits: Schema.optionalKey(
    Schema.NullOr(Schema.Array(AdditionalRateLimitDetailsSchema))
  ),
  credits: Schema.optionalKey(Schema.NullOr(CreditStatusDetailsSchema)),
  plan_type: Schema.String,
  rate_limit: Schema.optionalKey(Schema.NullOr(RateLimitStatusDetailsSchema)),
  rate_limit_reached_type: Schema.optionalKey(
    Schema.NullOr(RateLimitReachedTypeSchema)
  ),
  rate_limit_reset_credits: Schema.optionalKey(
    Schema.NullOr(RateLimitResetCreditsSummarySchema)
  ),
  spend_control: Schema.optionalKey(
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
  description: Schema.optionalKey(Schema.String),
  expires_at: Schema.optionalKey(Schema.String),
  granted_at: Schema.optionalKey(Schema.String),
  id: Schema.optionalKey(Schema.String),
  profile_user_id: Schema.optionalKey(Schema.String),
  redeemed_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.optionalKey(RateLimitResetCreditStatusSchema),
  title: Schema.optionalKey(Schema.String),
});

/** Schema for the Codex reset-credits list response payload. */
const RateLimitResetCreditsPayloadSchema = Schema.Struct({
  available_count: Schema.optionalKey(Schema.Number),
  credits: Schema.optionalKey(Schema.Array(RateLimitResetCreditSchema)),
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

/** Returns whether `value` is a non-null, non-array object.
 * @param value - JSON value to inspect.
 * @returns Whether the value is an object.
 */
type JsonObject = Readonly<Record<string, JsonValue>>;

const isObject = (value: JsonValue): value is JsonObject =>
  value !== null && !Array.isArray(value);

/** Builds a tagged parse error for the rejected API payload.
 * @param message - Parse failure message.
 * @param value - Rejected JSON value.
 * @returns Typed parse error.
 */
const parseError = (message: string, value: JsonValue): CodexParseError =>
  new CodexParseError({ message, value });

/** Maps a schema decode failure into a `CodexParseError`.
 * @param invalidPayloadMessage - Message for invalid payload shapes.
 * @param value - Rejected object value.
 * @returns Typed parse error.
 */
const invalidPayloadError = (
  invalidPayloadMessage: string,
  value: JsonObject
): CodexParseError => parseError(invalidPayloadMessage, value);

/**
 * Decodes an API payload with `schema`, preserving Effect parse diagnostics on
 * shape mismatches while keeping dedicated messages for non-object inputs.
 * @param params - Input, messages, and decoder for the payload.
 * @returns Decoded payload or a typed parse error.
 */
const parseSchema = <A>(params: {
  readonly input: JsonValue;
  readonly invalidPayloadMessage: string;
  readonly notObjectMessage: string;
  readonly schema: Schema.ConstraintDecoder<A>;
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
 * @returns Parsed usage payload or a typed parse error.
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
 * @returns Parsed reset-credit payload or a typed parse error.
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
 * @returns Parsed consume-reset response or a typed parse error.
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
