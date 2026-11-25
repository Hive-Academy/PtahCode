import { skillDocumentSlug } from '@ptah-extension/shared';
import { z } from 'zod';

export const SKILL_JUDGE_TRANSPORT_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: { type: 'array', items: { type: 'object' } },
  },
};

export const skillJudgeEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
});
export const skillJudgeItemIdSchema = z.object({ itemId: z.string() });

const reason = z.string().trim().min(1).max(280);
const candidateId = z
  .string()
  .trim()
  .min(1)
  .transform((id) => id.toLowerCase());
const proposalName = z.string().trim().min(1).max(64);

export const skillJudgeInstallSchema = z.object({
  verdict: z.literal('install'),
  candidateId,
  reason,
});

export const skillJudgeRejectionSchema = z.object({ candidateId, reason });

const outcomeSchema = z.discriminatedUnion('verdict', [
  skillJudgeInstallSchema,
  z.object({
    verdict: z.literal('build'),
    reason,
    proposal: z.object({
      name: proposalName.refine((name) => skillDocumentSlug(name) !== ''),
      description: z.string().trim().min(1).max(280),
      proposalRef: proposalName.optional(),
    }),
  }),
  z.object({ verdict: z.literal('no-skill'), reason }),
]);

export const skillJudgeItemSchema = z.object({
  outcomes: z.array(outcomeSchema).min(1),
  rejections: z.unknown().optional(),
});

export type ValidatedSkillJudgeOutcome = z.infer<typeof outcomeSchema>;
