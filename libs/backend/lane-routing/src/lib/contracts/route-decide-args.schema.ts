import { z } from 'zod';
import { PHASE_KINDS, TASK_TYPES } from '@ptah-extension/shared';
import { MACHINE_CAPABILITIES } from '../ranking/capability';

export { PHASE_KINDS } from '@ptah-extension/shared';

export const DEPTHS = ['Full', 'Partial', 'Minimal'] as const;

export const PHASE_SHAPES = [
  'mechanical',
  'logic',
  'contract',
  'test',
  'docs',
  'review',
] as const;
export const PhaseShapeSchema = z.enum(PHASE_SHAPES);
export type PhaseShape = z.infer<typeof PhaseShapeSchema>;

const PhaseSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(PHASE_KINDS),
    role: z.string().min(1).max(64).optional(),
    requiredCapabilities: z.array(z.enum(MACHINE_CAPABILITIES)).max(MACHINE_CAPABILITIES.length).optional(),
    toolProfile: z.object({ disallowedTools: z.array(z.string().trim().min(1)).max(256) }).strict().optional(),
    reviews: z.array(z.string().max(200)).max(64).optional(),
    shape: PhaseShapeSchema.optional(),
    weight: z.number().int().min(0).max(200000).optional(),
  })
  .strict();

const PinSchema = z
  .object({
    phaseId: z.string().min(1),
    executor: z.string().min(1).max(200),
    model: z.string().min(1).max(200).optional(),
  })
  .strict();

const PREFERENCE_SOURCE_MAX = 200;
const PREFERENCE_SOURCE_FORBIDDEN = /[;\r\n]/;
const PREFERENCE_SOURCE_DESCRIPTION =
  'Free text, max 200 characters, no semicolon or line break. Applies to stage gate-0.1.';
const PREFER_DESCRIPTION =
  'Candidate ids (cli id, ptahCliId, subagent:<role>, child-session) or display names; ' +
  'earlier entries rank higher.';

/**
 * Rejects a semicolon or a line break on the raw input, then trims. An
 * empty trimmed value parses as absent. The 200-character limit applies
 * to the trimmed value.
 */
const PreferenceSourceSchema = z
  .string()
  .refine((value) => !PREFERENCE_SOURCE_FORBIDDEN.test(value), {
    message: 'preferenceSource must not contain a semicolon or a line break',
  })
  .transform((value) => value.trim())
  .refine((value) => value.length <= PREFERENCE_SOURCE_MAX, {
    message: `preferenceSource must be at most ${PREFERENCE_SOURCE_MAX} characters`,
  })
  .transform((value) => (value === '' ? undefined : value))
  .describe(PREFERENCE_SOURCE_DESCRIPTION);


export const RouteDecideArgsSchema = z
  .discriminatedUnion('stage', [
    z
      .object({
        stage: z.literal('pre-flight'),
        request: z.string().trim().min(1).max(8000),
      })
      .strict(),
    z
      .object({
        stage: z.literal('gate-0.1'),
        request: z.string().trim().min(1).max(8000),
        taskType: z.enum(TASK_TYPES),
        depth: z.enum(DEPTHS),
        phases: z.array(PhaseSchema).min(1).max(100),
        pins: z
          .array(PinSchema)
          .max(100)
          .optional()
          .describe('Executors fixed to a phase. Applies to stage gate-0.1.'),
        preferenceSource: PreferenceSourceSchema.optional(),
        preferences: z
          .object({ prefer: z.array(z.string().max(200).describe(PREFER_DESCRIPTION)).max(32) })
          .strict()
          .optional()
          .describe('Candidate preferences. Applies to stage gate-0.1.'),
      })
      .strict(),
  ])
  .superRefine((args, ctx) => {
    if (args.stage !== 'gate-0.1') return;

    const phaseIds = new Set<string>();
    args.phases.forEach((phase, index) => {
      if (phaseIds.has(phase.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['phases', index, 'id'],
          message: 'phase id must be unique',
        });
      }
      phaseIds.add(phase.id);
    });

    args.phases.forEach((phase, index) => {
      phase.reviews?.forEach((reviewedId, reviewIndex) => {
        if (!phaseIds.has(reviewedId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['phases', index, 'reviews', reviewIndex],
            message: 'reviewed phase id must name a phase',
          });
        }
      });
    });

    const pinnedPhaseIds = new Set<string>();
    args.pins?.forEach((pin, index) => {
      if (!phaseIds.has(pin.phaseId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['pins', index, 'phaseId'],
          message: 'pin phase id must name a phase',
        });
      } else if (pinnedPhaseIds.has(pin.phaseId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['pins', index, 'phaseId'],
          message: 'a phase takes at most one pin',
        });
      }
      pinnedPhaseIds.add(pin.phaseId);
    });
  });

export type RouteDecideArgs = z.infer<typeof RouteDecideArgsSchema>;
