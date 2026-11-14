import { z } from 'zod';
import { PHASE_CONTRACT_VERSION, PHASE_KINDS, type PhaseDefinitionV1 } from './phase-contract.types';

const nonempty = z.string().trim().min(1);
const toolProfile = z.object({
  disallowedTools: z.array(nonempty),
  permission: z.enum(['allow', 'deny', 'prompt']),
}).strict();
const discipline = z.object({
  method: nonempty,
  outputContract: nonempty,
  returnValue: nonempty,
  refusals: nonempty,
  escalationProtocol: nonempty,
  reviewerStance: nonempty.optional(),
}).strict();
const definition = z.object({
  version: z.literal(PHASE_CONTRACT_VERSION),
  kind: z.enum(PHASE_KINDS),
  input: z.array(nonempty).min(1),
  deliverable: z.array(nonempty).min(1),
  verdict: z.array(nonempty).min(1),
  acceptanceStep: z.array(nonempty).min(1),
  requiredCapabilities: z.array(nonempty).min(1),
  toolProfile,
  discipline,
}).strict();
const skill = z.object({
  name: nonempty,
  path: nonempty.optional(),
  text: nonempty.optional(),
}).strict().refine(value => value.path !== undefined || value.text !== undefined);

const headings = [
  ['Method', 'method'], ['Output contract', 'outputContract'],
  ['Return value', 'returnValue'], ['Refusals', 'refusals'],
  ['Escalation protocol', 'escalationProtocol'], ['Reviewer stance', 'reviewerStance'],
] as const;

export function renderPhaseDiscipline(value: PhaseDefinitionV1['discipline']): string {
  return headings
    .filter(([heading]) => heading !== 'Reviewer stance' || value.reviewerStance)
    .map(([heading, key]) => `## ${heading}\n${value[key]}`)
    .join('\n\n');
}

/** The single wire schema for a resolved phase handoff. */
export const PhaseDispatchSchema = z.object({
  version: z.literal(PHASE_CONTRACT_VERSION),
  kind: z.enum(PHASE_KINDS),
  text: nonempty,
  definition,
  toolProfile,
  skills: z.array(skill).optional(),
}).strict().superRefine((payload, ctx) => {
  if (payload.kind !== payload.definition.kind ||
      JSON.stringify(payload.toolProfile) !== JSON.stringify(payload.definition.toolProfile) ||
      payload.text !== renderPhaseDiscipline(payload.definition.discipline)) {
    ctx.addIssue({ code: 'custom', message: 'dispatch metadata mismatch' });
  }
});
