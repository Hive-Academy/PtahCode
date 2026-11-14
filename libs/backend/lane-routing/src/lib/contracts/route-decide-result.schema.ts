import { z } from 'zod';
import {
  OUTCOME_TASK_KINDS,
  TASK_TYPES,
  PHASE_KINDS,
  type OutcomeRoutingSource,
} from '@ptah-extension/shared';
import type { LaneModelEntry } from '../lane-model-listing.port';
import {
  MAX_DECISION_REQUESTS,
  SCORE_MAX,
  SCORE_MIN,
} from '../routing-constants';
import { DEPTHS } from './route-decide-args.schema';

export const FALLBACK_CAUSES = [
  'timeout',
  'unreachable',
  'auth',
  'provider-error',
  'bad-output',
  'low-confidence',
  'payload-too-large',
  'question-limit',
] as const;
export const EXCLUSION_RULES = [
  'at-limit',
  'disabled',
  'not-installed',
  'missing-capability',
  'capability-unknown',
  'reviewer-family',
  'pruned',
  'not-listed',
] as const;
/** A listed model's provenance, plus `lane-default` for unknown or auto models. */
export const PROVENANCE = [
  'reported',
  'fallback',
  'configured',
  'tier',
  'lane-default',
] as const satisfies readonly (LaneModelEntry['provenance'] | 'lane-default')[];

type RoutedSource = Exclude<OutcomeRoutingSource, 'not-routed'>;

const CHOSEN_SOURCES = [
  'model',
  'ranking',
  'pin',
] as const satisfies readonly RoutedSource[];
const UNAVAILABLE_SOURCES = [
  'pin',
  'ranking',
] as const satisfies readonly RoutedSource[];

const ConfidenceSchema = z.number().min(0).max(1).nullable();
const FallbackCauseSchema = z.enum(FALLBACK_CAUSES).nullable();
const ModelProposalSchema = z
  .object({
    option: z.string(),
    confidence: ConfidenceSchema,
  })
  .strict()
  .nullable();
const ExcludedSchema = z
  .object({
    phaseId: z.string(),
    candidate: z.string(),
    rule: z.enum(EXCLUSION_RULES),
    capability: z.literal('browser').optional(),
  })
  .strict();

/** A lane is spawned by `cli` or `ptahCliId`; a subagent by its `role`. */
const ChosenExecutorSchema = z
  .object({
    kind: z.enum(['lane', 'subagent', 'child-session']),
    id: z.string().refine((id) => id !== 'unavailable'),
    cli: z.string().optional(),
    ptahCliId: z.string().optional(),
    role: z.string().optional(),
    phaseKind: z.enum(PHASE_KINDS).optional(),
    family: z.string(),
  })
  .strict()
  .superRefine((executor, ctx) => {
    if (
      executor.kind === 'lane' &&
      executor.cli === undefined &&
      executor.ptahCliId === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['cli'],
        message: 'a lane executor needs cli or ptahCliId',
      });
    }
    if (executor.kind === 'subagent' && executor.role === undefined && executor.phaseKind === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['role'],
        message: 'a subagent executor needs a role or phase kind',
      });
    }
    if (executor.kind === 'child-session' && executor.id !== 'child-session') {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'a new child session has kind identity' });
    }
  });

export const MODEL_TIERS = ['haiku', 'sonnet', 'opus'] as const;
export const ModelTierSchema = z.enum(MODEL_TIERS);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const MODEL_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const ModelEffortSchema = z.enum(MODEL_EFFORTS);
export type ModelEffort = z.infer<typeof ModelEffortSchema>;

export const ChosenEntrySchema = z
  .object({
    phaseId: z.string(),
    status: z.literal('chosen'),
    executor: ChosenExecutorSchema,
    model: z.string(),
    tier: ModelTierSchema,
    effort: ModelEffortSchema,
    provenance: z.enum(PROVENANCE),
    score: z.number().int().min(SCORE_MIN).max(SCORE_MAX),
    source: z.enum(CHOSEN_SOURCES),
    taskKind: z.enum(OUTCOME_TASK_KINDS),
    confidence: ConfidenceSchema,
    fallbackCause: FallbackCauseSchema,
    modelProposal: ModelProposalSchema,
    reason: z.string(),
  })
  .strict();

/**
 * Cross-field rules (Requirement 2.3): `source` is `pin` exactly when the
 * exclusion reason is `pin-unavailable`, that reason names the rule the pin
 * broke, and `reviewer-family` needs the skill's disclosed fallback.
 */
export const UnavailableEntrySchema = z
  .object({
    phaseId: z.string(),
    status: z.literal('unavailable'),
    executor: z.literal('unavailable'),
    exclusionReason: z.enum([
      'no-eligible-candidate',
      'reviewer-family',
      'pin-unavailable',
      'missing-capability',
    ]),
    excludedBy: z.array(
      z
        .object({
          candidate: z.string(),
          rule: z.enum(EXCLUSION_RULES),
          capability: z.literal('browser').optional(),
        })
        .strict(),
    ),
    pinRule: z.enum(EXCLUSION_RULES).nullable(),
    needsDisclosedFallback: z.boolean(),
    source: z.enum(UNAVAILABLE_SOURCES),
    model: z.null(),
    tier: ModelTierSchema,
    effort: ModelEffortSchema,
    provenance: z.null(),
    score: z.null(),
    confidence: z.null(),
    fallbackCause: z.null(),
    reason: z.string(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const pinUnavailable = entry.exclusionReason === 'pin-unavailable';
    if (pinUnavailable !== (entry.source === 'pin')) {
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message:
          "source must be 'pin' exactly when exclusionReason is 'pin-unavailable'",
      });
    }
    if (pinUnavailable && entry.pinRule === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['pinRule'],
        message: 'a pin-unavailable entry must name the rule the pin broke',
      });
    }
    if (
      entry.exclusionReason === 'reviewer-family' &&
      !entry.needsDisclosedFallback
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['needsDisclosedFallback'],
        message: 'a reviewer-family entry needs the disclosed fallback',
      });
    }
  });

const UsageSchema = z
  .object({
    requests: z.number().int().min(0).max(MAX_DECISION_REQUESTS),
    inputTokens: z.number().int().nullable(),
    outputTokens: z.number().int().nullable(),
    costUsd: z.number().nullable(),
  })
  .strict();

/** Null with source `skill-table` is the skill-table signal (Requirement 2.2). */
const AnswerSchema = <T extends z.ZodType>(value: T) =>
  z
    .object({
      value: value.nullable(),
      source: z.enum(['model', 'skill-table']),
      confidence: ConfidenceSchema,
      fallbackCause: FallbackCauseSchema,
      modelProposal: ModelProposalSchema,
    })
    .strict()
    .superRefine((parsed, ctx) => {
      // Inside the generic factory TypeScript cannot resolve the `value` key
      // of `z.output<ZodNullable<T>>`; the widened view keeps it checked.
      const answer: { readonly source: string; readonly value?: unknown } =
        parsed;
      if (answer.source === 'model' && answer.value === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'a model answer must carry a value',
        });
      }
    });

export const PreflightResultSchema = z
  .object({
    stage: z.literal('pre-flight'),
    taskType: AnswerSchema(z.enum(TASK_TYPES)),
    depth: AnswerSchema(z.enum(DEPTHS)),
    overallConfidence: ConfidenceSchema,
    reasons: z.array(z.string()),
    usage: UsageSchema,
  })
  .strict();

export const GateResultSchema = z
  .object({
    stage: z.literal('gate-0.1'),
    roster: z.array(
      z.discriminatedUnion('status', [
        ChosenEntrySchema,
        UnavailableEntrySchema,
      ]),
    ),
    overallSource: z.enum(['model', 'ranking', 'mixed']),
    overallConfidence: ConfidenceSchema,
    excluded: z.array(ExcludedSchema),
    reasons: z.array(z.string()),
    usage: UsageSchema,
  })
  .strict();

export const RouteDecideResultSchema = z.discriminatedUnion('stage', [
  PreflightResultSchema,
  GateResultSchema,
]);

export type PreflightResult = z.infer<typeof PreflightResultSchema>;
export type GateResult = z.infer<typeof GateResultSchema>;
export type RouteDecideResult = z.infer<typeof RouteDecideResultSchema>;
export type ChosenEntry = z.infer<typeof ChosenEntrySchema>;
export type UnavailableEntry = z.infer<typeof UnavailableEntrySchema>;
