import matter from 'gray-matter';
import { z } from 'zod';
import { PhaseDispatchSchema, renderPhaseDiscipline } from '@ptah-extension/shared/schemas';
import { PHASE_KINDS, PHASE_CONTRACT_VERSION, type PhaseDefinitionV1, type PhaseDispatchV1, type PhaseKind, type PhaseSkillV1 } from '@ptah-extension/shared';

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
  // Keep heading rules aligned with scripts/validate-orchestration-skill.ts.
  const scan = maskFences(body);
  const matches = [...scan.matchAll(/^## ([^\r\n]+)\r?$/gm)];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const heading = match[1].trim();
    if (!headings.some(([known]) => known === heading)) continue;
    if (found.has(heading)) throw new PhaseDefinitionError('INVALID_SCHEMA', kind);
    const start = match.index! + match[0].length;
    found.set(heading, body.slice(start, matches[index + 1]?.index ?? body.length).trim());
  }
  for (const [heading] of headings.slice(0, 5)) {
    if (!found.get(heading)) throw new PhaseDefinitionError('MISSING_SECTION', kind);
  }
  if (['review', 'document-review', 'visual-review'].includes(kind) && !found.get('Reviewer stance')) {
    throw new PhaseDefinitionError('MISSING_SECTION', kind);
  }
  if (!['review', 'document-review', 'visual-review'].includes(kind) && found.has('Reviewer stance')) {
    throw new PhaseDefinitionError('INVALID_SCHEMA', kind);
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

function maskFences(body: string): string {
  let fence: { marker: string; length: number } | undefined;
  return body.replace(/^.*(?:\n|$)/gm, line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (!fence && marker) fence = { marker: marker[0], length: marker.length };
    else if (fence && marker?.[0] === fence.marker && marker.length >= fence.length) fence = undefined;
    return fence || marker ? line.replace(/[^\r\n]/g, ' ') : line;
  });
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
  const text = renderDiscipline(discipline);
  return { text, toolProfile: definition.toolProfile, definition };
}

function renderDiscipline(discipline: PhaseDefinitionV1['discipline']): string {
  return renderPhaseDiscipline(discipline);
}

/** Validate a handoff before any executor is started. */
export function parsePhaseDispatch(payload: unknown): PhaseDispatchV1 {
  const result = PhaseDispatchSchema.safeParse(payload);
  if (!result.success) {
    const rawKind = typeof payload === 'object' && payload !== null && 'kind' in payload
      ? payload.kind : undefined;
    const kind = z.enum(PHASE_KINDS).safeParse(rawKind).data ?? 'batch';
    throw new PhaseDefinitionError('INVALID_SCHEMA', kind);
  }
  return result.data;
}

/** Existing callers may continue using resolvePhaseDefinition without skills. */
export function resolvePhaseDispatch(
  kind: PhaseKind,
  readDefinition: (kind: PhaseKind) => string,
  skills?: readonly PhaseSkillV1[],
): PhaseDispatchV1 {
  const resolved = resolvePhaseDefinition(kind, readDefinition);
  return parsePhaseDispatch({
    version: PHASE_CONTRACT_VERSION,
    kind,
    text: resolved.text,
    definition: resolved.definition,
    toolProfile: resolved.toolProfile,
    ...(skills === undefined ? {} : { skills }),
  });
}
