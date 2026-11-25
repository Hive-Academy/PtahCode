import { z } from 'zod';
import {
  AGENT_MESSAGE_MAX_CHARS,
  AgentId,
  LANE_TURN_MAX_FILES,
  LANE_TURN_MAX_IMAGES,
} from '@ptah-extension/shared';

export const AGENT_MESSAGE_ENVELOPE_INDEX_KEY = 'ptah:agent-message-envelopes:v2';
export const AGENT_MESSAGE_BODY_PREFIX = 'ptah:agent-message-body:v2:';

const timestamp = z.number().int().nonnegative();
const agentIdSchema = z.string().refine(AgentId.validate).transform(AgentId.from);
const senderSchema = z.union([
  z.object({ kind: z.literal('user') }).strict(),
  z.object({
    kind: z.literal('parent'),
    sessionId: z.string().min(1).max(200).optional(),
  }).strict(),
  z.object({
    kind: z.literal('lane'),
    agentId: agentIdSchema,
    name: z.string().min(1).max(200).optional(),
    parentSessionId: z.string().min(1).max(200).optional(),
    verified: z.boolean(),
  }).strict(),
  z.enum(['user', 'parent']).transform((kind) => ({ kind })),
]);

/** Model / effort ids: the RPC boundary allows the same characters. */
const turnSettingSchema = z.string().min(1).max(200);

/**
 * The per-turn request of a held message, without image bytes: images stay
 * in host memory (`AgentMessageAttachmentStore`) and only their count is
 * durable, so a restart can say they were lost.
 */
export const AgentMessageEnvelopeTurnSchema = z.object({
  model: turnSettingSchema.optional(),
  reasoningEffort: turnSettingSchema.optional(),
  files: z.array(z.string().min(1).max(4096)).max(LANE_TURN_MAX_FILES).optional(),
  imageCount: z.number().int().positive().max(LANE_TURN_MAX_IMAGES).optional(),
}).strict();

export const AgentMessageEnvelopeSchema = z.object({
  id: z.string().uuid(),
  targetAgentId: agentIdSchema,
  laneLineageId: agentIdSchema,
  actualAgentId: agentIdSchema.optional(),
  parentSessionId: z.string().min(1).max(200).optional(),
  sender: senderSchema,
  senderKey: z.string().min(1).max(300),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
  state: z.enum([
    'not-started', 'dispatching', 'started', 'settled', 'blocked-retryable',
    'outcome-unknown', 'failed', 'expired', 'cancelled',
  ]),
  attemptId: z.string().uuid().optional(),
  everDispatched: z.boolean().optional(),
  /**
   * The text may have reached the lane: an adapter call accepted it
   * (`started`) or threw after it began. Unlike `everDispatched`, which the
   * journal sets before the adapter call, it gates the semantic ack of an
   * `outcome-unknown` envelope. Absent on records written before acks.
   */
  maybeDelivered: z.boolean().optional(),
  route: z.enum(['live', 'cold']).optional(),
  mode: z.enum(['steer', 'queue-next-turn', 'interrupt-resume', 'start-turn', 'unsupported']),
  delivery: z.enum(['queue', 'now']),
  allowPartialTurnLoss: z.boolean().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  terminalAt: timestamp.optional(),
  turnSeq: z.number().int().positive().optional(),
  cliSessionId: z.string().optional(),
  reason: z.string().max(200).optional(),
  lastError: z.string().max(200).optional(),
  attemptCount: z.number().int().nonnegative(),
  nextRetryAt: timestamp.optional(),
  limit: z.object({
    known: z.boolean(),
    resetAt: timestamp.optional(),
  }).strict().optional(),
  partialTurnLost: z.boolean().optional(),
  turnOutcome: z.enum(['completed', 'failed', 'stopped']).optional(),
  bodyBytes: z.number().int().nonnegative().optional(),
  /**
   * A body record is stored although `bodyBytes` is 0: an image-only message
   * has empty text. Read through `hasStoredBody`; cleared with the body.
   */
  bodyStored: z.literal(true).optional(),
  ackState: z.enum(['pending', 'read', 'acted', 'rejected', 'unavailable']).optional(),
  ackAt: timestamp.optional(),
  ackNote: z.string().max(500).optional(),
  /** Settings and attachment summary of the turn this message starts. */
  turn: AgentMessageEnvelopeTurnSchema.optional(),
  /**
   * Delivered as a raw provider `/command` (no Ptah header, no ack line). The
   * decision is recorded once, so a retry or a scheduler re-offer delivers it
   * the same way. Named apart from `delivery` (`queue` | `now`), which this
   * schema already uses.
   */
  rawDelivery: z.object({ raw: z.literal(true) }).strict().optional(),
}).strict();

export const AgentMessageEnvelopeIndexSchema = z.object({
  version: z.literal(1),
  records: z.array(z.unknown()),
}).strict();

export const AgentMessageBodySchema = z.object({
  text: z.string().max(AGENT_MESSAGE_MAX_CHARS),
  envelopeId: z.string().uuid(),
  targetAgentId: agentIdSchema,
  parentSessionId: z.string().min(1).max(200).optional(),
  createdAt: timestamp,
}).strict();

export type AgentMessageEnvelope = z.infer<typeof AgentMessageEnvelopeSchema>;
export type AgentMessageBody = z.infer<typeof AgentMessageBodySchema>;
export type AgentMessageEnvelopeTurn = z.infer<typeof AgentMessageEnvelopeTurnSchema>;
export type NewEnvelope = Omit<AgentMessageEnvelope,
  'id' | 'state' | 'createdAt' | 'updatedAt' | 'attemptCount' | 'attemptId' |
  'everDispatched' | 'terminalAt' | 'nextRetryAt'
> & {
  readonly id?: string;
  readonly state?: AgentMessageEnvelope['state'];
  readonly createdAt?: number;
  readonly updatedAt?: number;
  readonly attemptCount?: number;
  readonly terminalAt?: number;
  readonly nextRetryAt?: number;
};
/** The semantic ack fields, written apart from transport transitions. */
export type EnvelopeAckPatch = Pick<AgentMessageEnvelope, 'ackState' | 'ackAt' | 'ackNote'>;
/** `turn` is written once at `put`; a transition never rewrites what the user asked for. */
export type EnvelopePatch =Partial<Omit<AgentMessageEnvelope,
  'id' | 'targetAgentId' | 'laneLineageId' | 'sender' | 'senderKey' |
  'idempotencyKey' | 'createdAt' | 'turn'
>>;

/**
 * True when the envelope has a stored body record: text (`bodyBytes` > 0), or
 * the empty text of an image-only message (`bodyStored`).
 */
export function hasStoredBody(envelope: {
  readonly bodyBytes?: number;
  readonly bodyStored?: true;
}): boolean {
  return (envelope.bodyBytes ?? 0) > 0 || envelope.bodyStored === true;
}
