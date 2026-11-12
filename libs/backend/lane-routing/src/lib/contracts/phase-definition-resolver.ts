import matter from 'gray-matter';
import { z } from 'zod';
import { PHASE_KINDS, type PhaseDefinitionV1, type PhaseKind } from '@ptah-extension/shared';

const MATTER_OPTIONS = { language: 'yaml' } as const;
const list = z.array(z.string().trim().min(1)).min(1);
const metadataSchema = z.object({
  version: z.literal(1),
  kind: z.enum(PHASE_KINDS),
  input: list,
  deliverable: list,
  verdict: list,
  acceptanceStep: list,
  requiredCapabilities: list,
  toolProfile: z.object({
    disallowedTools: z.array(z.string().trim().min(1)),
    permission: z.enum(['allow', 'deny', 'prompt']),
  }).strict(),
}).strict();

const headings = [
  ['Method', 'method'],
  ['Output contract', 'outputContract'],
  ['Return value', 'returnValue'],
  ['Refusals', 'refusals'],
  ['Escalation protocol', 'escalationProtocol'],
  ['Reviewer stance', 'reviewerStance'],
] as const;

export type PhaseDefinitionErrorCode =
  | 'MISSING' | 'YAML_PARSE' | 'INVALID_SCHEMA' | 'KIND_MISMATCH' | 'MISSING_SECTION';

export class PhaseDefinitionError extends Error {
  constructor(readonly code: PhaseDefinitionErrorCode, readonly kind: PhaseKind) {
    super(`Phase ${kind}: ${code.toLowerCase().replaceAll('_', ' ')}`);
    this.name = 'PhaseDefinitionError';
  }
}

function sectionsFor(kind: PhaseKind, body: string): PhaseDefinitionV1['discipline'] {
  const found = new Map<string, string>();
  const matches = [...body.matchAll(/^## (.+?)\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)];
  for (const match of matches) found.set(match[1].trim(), match[2].trim());
  for (const [heading] of headings.slice(0, 5)) {
    if (!found.get(heading)) throw new PhaseDefinitionError('MISSING_SECTION', kind);
  }
  if (['review', 'document-review', 'visual-review'].includes(kind) && !found.get('Reviewer stance')) {
    throw new PhaseDefinitionError('MISSING_SECTION', kind);
  }
  return {
    method: found.get('Method')!,
    outputContract: found.get('Output contract')!,
    returnValue: found.get('Return value')!,
    refusals: found.get('Refusals')!,
    escalationProtocol: found.get('Escalation protocol')!,
    ...(found.get('Reviewer stance') ? { reviewerStance: found.get('Reviewer stance') } : {}),
  };
}

export function resolvePhaseDefinition(
  kind: PhaseKind,
  readDefinition: (kind: PhaseKind) => string,
): { text: string; toolProfile: PhaseDefinitionV1['toolProfile']; definition: PhaseDefinitionV1 } {
  let source: string;
  try {
    source = readDefinition(kind);
  } catch (_error: unknown) {
    throw new PhaseDefinitionError('MISSING', kind);
  }
  if (!source.trim()) throw new PhaseDefinitionError('MISSING', kind);
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(source, MATTER_OPTIONS);
  } catch (_error: unknown) {
    throw new PhaseDefinitionError('YAML_PARSE', kind);
  }
  const metadata = metadataSchema.safeParse(parsed.data);
  if (!metadata.success) throw new PhaseDefinitionError('INVALID_SCHEMA', kind);
  if (metadata.data.kind !== kind) throw new PhaseDefinitionError('KIND_MISMATCH', kind);
  const discipline = sectionsFor(kind, parsed.content);
  const definition: PhaseDefinitionV1 = { ...metadata.data, discipline };
  const text = headings
    .filter(([heading]) => heading !== 'Reviewer stance' || discipline.reviewerStance)
    .map(([heading, key]) => `## ${heading}\n${discipline[key]}`)
    .join('\n\n');
  return { text, toolProfile: definition.toolProfile, definition };
}
