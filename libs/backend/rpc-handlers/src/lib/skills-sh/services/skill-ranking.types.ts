import { z } from 'zod';

export const skillRankingMethodSchema = z.enum([
  'decision-model',
  'session-model',
  'heuristic',
]);
export const skillRankingRequestSchema = z.object({
  workspaceRoot: z.string(),
  items: z.record(
    z.string(),
    z.object({
      kind: z.string(),
      name: z.string(),
      candidates: z.array(
        z.object({
          label: z.string(),
          name: z.string(),
          source: z.string(),
          skillId: z.string(),
          installs: z.number().finite().nonnegative(),
          description: z.string(),
        }),
      ),
    }),
  ),
});
export const skillRankingResultSchema = z.object({
  items: z.record(
    z.string(),
    z.object({
      rankedBy: skillRankingMethodSchema,
      order: z.array(z.string()),
      reason: z.string().max(140).optional(),
    }),
  ),
  rankedBy: skillRankingMethodSchema,
});

export type SkillRankingRequest = z.infer<typeof skillRankingRequestSchema>;
export type SkillRankingResult = z.infer<typeof skillRankingResultSchema>;
export type SkillRankingMethod = z.infer<typeof skillRankingMethodSchema>;
