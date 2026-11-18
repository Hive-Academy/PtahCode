import { z } from 'zod';
import type { SkillRankingRequest } from './skill-ranking.types';

// Validate each item separately so a malformed sibling cannot discard useful rankings.
export const skillRankingSessionSchema = z.object({
  items: z.record(z.string(), z.unknown()),
});

export function skillRankingItemSchema(labels: readonly string[]) {
  const allowed = new Set(labels);
  return z
    .object({
      order: z.array(z.string().refine((label) => allowed.has(label))).min(1),
      // Decision: cap explanations at 140 characters; excessive text does not lose a ranking.
      reason: z
        .string()
        .transform((reason) => reason.slice(0, 140))
        .optional(),
    })
    .transform(({ order, reason }) => ({
      order: [...new Set([...order, ...labels])],
      ...(reason === undefined ? {} : { reason }),
    }));
}

/** The model sees enums scoped to each item, never a global pool of labels. */
export function skillRankingJsonSchema(
  items: SkillRankingRequest['items'],
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(items),
        properties: Object.fromEntries(
          Object.entries(items).map(([key, item]) => [
            key,
            {
              type: 'object',
              additionalProperties: false,
              required: ['order'],
              properties: {
                order: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: item.candidates.map((candidate) => candidate.label),
                  },
                },
                reason: { type: 'string', maxLength: 140 },
              },
            },
          ]),
        ),
      },
    },
  };
}
