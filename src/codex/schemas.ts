import { Effect, Schema } from "effect";

import type {
  CodexUsagePayload,
  ConsumeResetResponse,
  RateLimitResetCreditsPayload,
} from "@/codex/types.js";
import { CodexParseError } from "@/errors/index.js";

const RateLimitWindowSnapshotSchema = Schema.Struct({
  limit_window_seconds: Schema.Number,
  reset_after_seconds: Schema.Number,
  reset_at: Schema.Number,
  used_percent: Schema.Number,
});

const RateLimitStatusDetailsSchema = Schema.Struct({
  allowed: Schema.optional(Schema.Boolean),
  limit_reached: Schema.optional(Schema.Boolean),
  primary_window: Schema.optional(Schema.NullOr(RateLimitWindowSnapshotSchema)),
  secondary_window: Schema.optional(
    Schema.NullOr(RateLimitWindowSnapshotSchema)
  ),
});

const CreditStatusDetailsSchema = Schema.Struct({
  balance: Schema.optional(Schema.NullOr(Schema.String)),
  has_credits: Schema.optional(Schema.Boolean),
  unlimited: Schema.optional(Schema.Boolean),
});

const SpendControlLimitDetailsSchema = Schema.Struct({
  limit: Schema.optional(Schema.String),
  remaining: Schema.optional(Schema.String),
  remaining_percent: Schema.optional(Schema.Number),
  reset_after_seconds: Schema.optional(Schema.Number),
  reset_at: Schema.optional(Schema.Number),
  used: Schema.optional(Schema.String),
  used_percent: Schema.optional(Schema.Number),
});

const SpendControlStatusDetailsSchema = Schema.Struct({
  individual_limit: Schema.optional(
    Schema.NullOr(SpendControlLimitDetailsSchema)
  ),
  reached: Schema.optional(Schema.Boolean),
});

const AdditionalRateLimitDetailsSchema = Schema.Struct({
  limit_name: Schema.String,
  metered_feature: Schema.String,
  rate_limit: Schema.optional(Schema.NullOr(RateLimitStatusDetailsSchema)),
});

const RateLimitReachedTypeSchema = Schema.Struct({
  type: Schema.String,
});

const RateLimitResetCreditsSummarySchema = Schema.Struct({
  available_count: Schema.Number,
});

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

const RateLimitResetCreditStatusSchema = Schema.Literal(
  "available",
  "expired",
  "redeemed"
);

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

const RateLimitResetCreditsPayloadSchema = Schema.Struct({
  available_count: Schema.optional(Schema.Number),
  credits: Schema.optional(Schema.Array(RateLimitResetCreditSchema)),
});

const ConsumeResetResponseSchema = Schema.Struct({
  code: Schema.Literal(
    "already_redeemed",
    "no_credit",
    "nothing_to_reset",
    "reset"
  ),
  windows_reset: Schema.Number,
});

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseError = (message: string, value: unknown): CodexParseError =>
  new CodexParseError({ message, value });

const parseSchema = <A, I>(params: {
  readonly input: unknown;
  readonly invalidShapeMessage: string;
  readonly notObjectMessage: string;
  readonly schema: Schema.Schema<A, I, never>;
}): Effect.Effect<A, CodexParseError> => {
  if (!isObject(params.input)) {
    return Effect.fail(parseError(params.notObjectMessage, params.input));
  }

  return Schema.decodeUnknown(params.schema)(params.input).pipe(
    Effect.mapError(() => parseError(params.invalidShapeMessage, params.input))
  );
};

export const parseUsagePayload = (
  input: unknown
): Effect.Effect<CodexUsagePayload, CodexParseError> =>
  parseSchema({
    input,
    invalidShapeMessage: "Usage response had an invalid shape",
    notObjectMessage: "Usage response was not an object",
    schema: CodexUsagePayloadSchema,
  });

export const parseResetCreditsPayload = (
  input: unknown
): Effect.Effect<RateLimitResetCreditsPayload, CodexParseError> =>
  parseSchema({
    input,
    invalidShapeMessage: "Reset credits response had an invalid shape",
    notObjectMessage: "Reset credits response was not an object",
    schema: RateLimitResetCreditsPayloadSchema,
  });

export const parseConsumeResetResponse = (
  input: unknown
): Effect.Effect<ConsumeResetResponse, CodexParseError> =>
  parseSchema({
    input,
    invalidShapeMessage: "Consume reset response had an invalid shape",
    notObjectMessage: "Consume reset response was not an object",
    schema: ConsumeResetResponseSchema,
  });
