import { z } from 'zod';
import {
  EFFORT_DISPOSITIONS,
  LANE_FAILURE_CLASSES,
  MAX_OUTCOME_EFFORT_LENGTH,
  OUTCOME_EFFORT_SOURCES,
  OUTCOME_MODEL_SOURCES,
  OUTCOME_ROUTING_SOURCES,
  OUTCOME_TASK_KIND_SOURCES,
  OUTCOME_TASK_KINDS,
  PHASE_KINDS,
  VALUE_PROVENANCE,
} from '@ptah-extension/shared';

export const OutcomeTargetSchema = z.union([
  z.object({ runId: z.string().min(1).max(200) }).strict(),
  z.object({ agentId: z.string().min(1).max(200) }).strict(),
]);

export const OutcomeReportArgsSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('deliverables'),
      target: OutcomeTargetSchema,
      paths: z
        .array(z.string().min(1).max(1024))
        .max(20)
        .describe(
          'Deliverable files: absolute paths inside the workspace, or workspace-relative paths. At most 20.',
        ),
      taskKind: z.enum(OUTCOME_TASK_KINDS).optional(),
      taskId: z.string().min(1).max(200).optional(),
      routingSource: z.enum(OUTCOME_ROUTING_SOURCES).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('review'),
      target: OutcomeTargetSchema,
      verdict: z.enum(['approved', 'rejected', 'revise']),
      reviewerRunId: z.string().min(1).max(200).optional(),
    })
    .strict(),
]);

const nonnegative = z.number().finite().nonnegative();
const RESOLVED_VALUE_PROVENANCE = ['native', 'unknown'] as const;
const outcomeModelId = z.string().min(1).max(200).nullable().default(null);
const outcomeEffort = z
  .string()
  .min(1)
  .max(MAX_OUTCOME_EFFORT_LENGTH)
  .nullable()
  .default(null);
export const LaneOutcomeRowSchema = z.object({
  runId: z.string().min(1),
  executorKind: z.enum(['cli', 'ptah-cli', 'subagent']),
  laneId: z.string().min(1),
  agentId: z.string().min(1),
  subagentSessionId: z.string().min(1).nullable().optional(),
  parentSessionId: z.string().min(1).nullable().optional(),
  workspaceRoot: z.string().min(1).nullable().optional(),
  family: z.string().min(1),
  provider: z.string().nullable(),
  model: z.string().min(1),
  role: z.string().nullable(),
  taskKind: z.enum(OUTCOME_TASK_KINDS).nullable(),
  taskKindSource: z.enum(OUTCOME_TASK_KIND_SOURCES).nullable().default(null),
  /** Null for rows before migration 0075 and for lanes without a phase. */
  phaseKind: z.enum(PHASE_KINDS).nullable().default(null),
  taskId: z.string().nullable(),
  verdict: z.enum(['delivered', 'no-deliverable', 'unverified', 'failed']),
  failureClass: z.enum(LANE_FAILURE_CLASSES).nullable(),
  startedAt: nonnegative.nullable(),
  endedAt: nonnegative,
  durationMs: nonnegative.nullable(),
  inputTokens: nonnegative.nullable(),
  outputTokens: nonnegative.nullable(),
  costUsd: nonnegative.nullable(),
  routingSource: z.enum(OUTCOME_ROUTING_SOURCES),
  reviseRounds: nonnegative.int(),
  finalReview: z.enum(['approved', 'rejected']).nullable(),
  deliverablesDeclaredAt: nonnegative.nullable(),
  telemetryJoin: z.enum([
    'matched',
    'unmatched',
    'ambiguous',
    'unavailable',
    'not-applicable',
  ]),
  skillsLoaded: z.array(z.string()).nullable(),
  sessionEvidenceClass: z.string().nullable(),
  modelSource: z.enum(OUTCOME_MODEL_SOURCES).nullable().default(null),
  resolvedModel: outcomeModelId,
  resolvedModelProvenance: z
    .enum(RESOLVED_VALUE_PROVENANCE)
    .nullable()
    .default(null),
  requestedEffort: outcomeEffort,
  effort: outcomeEffort,
  effortSource: z.enum(OUTCOME_EFFORT_SOURCES).nullable().default(null),
  effortProvenance: z.enum(VALUE_PROVENANCE).nullable().default(null),
  effortDisposition: z.enum(EFFORT_DISPOSITIONS).nullable().default(null),
  resolvedEffort: outcomeEffort,
  resolvedEffortProvenance: z
    .enum(RESOLVED_VALUE_PROVENANCE)
    .nullable()
    .default(null),
  routedModel: outcomeModelId,
  routedEffort: outcomeEffort,
  decisionModel: z.string().max(128).nullable().default(null),
  proposalConfidence: z
    .number()
    .finite()
    .min(0)
    .max(1)
    .nullable()
    .default(null),
});
