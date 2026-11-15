import { PhaseDefinitionError, parsePhaseDispatch, resolvePhaseDefinition, resolvePhaseDispatch } from './phase-definition-resolver';

const metadata = `---
version: 1
kind: batch
input: [plan]
deliverable: [batches]
verdict: [ready]
acceptanceStep: [check]
requiredCapabilities: [reasoning]
toolProfile:
  disallowedTools: []
  permission: prompt
---
`;
const body = `## Method
Decompose the work.

## Output contract
Write a batch list.

## Return value
Return the list.

## Refusals
Refuse unsafe requests.

## Escalation protocol
Ask the orchestrator.
`;

it('resolves a valid definition deterministically', () => {
  const first = resolvePhaseDefinition('batch', () => metadata + body);
  expect(first).toEqual(resolvePhaseDefinition('batch', () => metadata + body));
  expect(first.definition.discipline.method).toBe('Decompose the work.');
  expect(first.toolProfile.permission).toBe('prompt');
  expect(first.text).toContain('## Output contract');
});

it.each([
  ['MISSING', (): string => ''],
  ['YAML_PARSE', (): string => '---\nfoo: [bad\n---\n' + body],
  ['INVALID_SCHEMA', (): string => metadata.replace('version: 1', 'version: 3') + body],
  ['KIND_MISMATCH', (): string => metadata.replace('kind: batch', 'kind: plan') + body],
  ['MISSING_SECTION', (): string => metadata + body.replace('## Method', '## Different')],
] as const)('fails closed with %s', (code, source) => {
  try {
    resolvePhaseDefinition('batch', source);
    throw new Error('expected resolver failure');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(PhaseDefinitionError);
    if (!(error instanceof PhaseDefinitionError)) throw error;
    expect(error.code).toBe(code);
    expect(error.message).not.toContain('foo:');
  }
});

it.each(['review', 'document-review', 'visual-review'] as const)('requires reviewer stance for %s', (kind) => {
  expect(() => resolvePhaseDefinition(kind, () => metadata.replace('kind: batch', `kind: ${kind}`) + body))
    .toThrow(PhaseDefinitionError);
});

it('keeps fenced headings inside section text', () => {
  const source = metadata + body.replace('Decompose the work.', 'Decompose the work.\n\n```md\n## Method\nExample only.\n```');
  expect(resolvePhaseDefinition('batch', () => source).definition.discipline.method).toContain('## Method\nExample only.');
});

it('does not count a fenced-only section', () => {
  const source = metadata + body.replace('## Method\nDecompose the work.', '```md\n## Method\nDecompose the work.\n```');
  expect(() => resolvePhaseDefinition('batch', () => source)).toThrow(new PhaseDefinitionError('MISSING_SECTION', 'batch'));
});

it('rejects duplicate known sections', () => {
  expect(() => resolvePhaseDefinition('batch', () => metadata + body + '\n## Method\nAgain.'))
    .toThrow(new PhaseDefinitionError('INVALID_SCHEMA', 'batch'));
});

it('rejects reviewer stance on a non-review phase', () => {
  expect(() => resolvePhaseDefinition('batch', () => metadata + body + '\n## Reviewer stance\nCritique.'))
    .toThrow(new PhaseDefinitionError('INVALID_SCHEMA', 'batch'));
});

it('creates and validates a dispatch payload with host-resolved skills', () => {
  const payload = resolvePhaseDispatch('batch', () => metadata + body, [
    { name: 'reviewer', path: '/skills/reviewer/SKILL.md', text: '# Reviewer' },
  ]);
  expect(parsePhaseDispatch(payload)).toEqual(payload);
  expect(payload.kind).toBe('batch');
  expect(payload.definition.kind).toBe('batch');
  expect(payload.skills?.[0].text).toBe('# Reviewer');
});

it('rejects malformed handoffs and skills before spawn', () => {
  const payload = resolvePhaseDispatch('batch', () => metadata + body);
  expect(() => parsePhaseDispatch({ ...payload, kind: 'plan' })).toThrow(PhaseDefinitionError);
  expect(() => parsePhaseDispatch({ ...payload, text: 'unrelated' })).toThrow(PhaseDefinitionError);
  expect(() => resolvePhaseDispatch('batch', () => metadata + body, [{ name: 'missing' }]))
    .toThrow(PhaseDefinitionError);
  expect(() => resolvePhaseDispatch('batch', () => metadata.replace('version: 1', 'version: 3') + body))
    .toThrow(PhaseDefinitionError);
});

it('reads version 1 as no machine requirements and version 2 with browser', () => {
  expect(resolvePhaseDefinition('batch', () => metadata + body).definition.machineCapabilities).toEqual([]);
  const oldDispatch = resolvePhaseDispatch('batch', () => metadata + body);
  const { machineCapabilities, ...oldDefinition } = oldDispatch.definition;
  expect(machineCapabilities).toEqual([]);
  expect(parsePhaseDispatch({ ...oldDispatch, version: 1, definition: oldDefinition }).definition.machineCapabilities).toEqual([]);
  const current = metadata.replace('version: 1', 'version: 2').replace('requiredCapabilities: [reasoning]', 'requiredCapabilities: [reasoning]\nmachineCapabilities: [browser]');
  expect(resolvePhaseDefinition('batch', () => current + body).definition.machineCapabilities).toEqual(['browser']);
  expect(resolvePhaseDispatch('batch', () => current + body).definition.machineCapabilities).toEqual(['browser']);
  expect(() => resolvePhaseDefinition('batch', () => current.replace('browser', 'unknown') + body))
    .toThrow(new PhaseDefinitionError('INVALID_SCHEMA', 'batch'));
});

it('parses version 1 design without machine capabilities as an empty list', () => {
  const design = metadata.replace('kind: batch', 'kind: design');
  expect(resolvePhaseDefinition('design', () => design + body).definition.machineCapabilities).toEqual([]);
  const dispatch = resolvePhaseDispatch('design', () => design + body);
  const { machineCapabilities, ...oldDefinition } = dispatch.definition;
  expect(machineCapabilities).toEqual([]);
  expect(parsePhaseDispatch({ ...dispatch, version: 1, definition: oldDefinition }).definition.machineCapabilities).toEqual([]);
});

it('rejects version 2 without machine capabilities', () => {
  const current = metadata.replace('version: 1', 'version: 2');
  expect(() => resolvePhaseDefinition('batch', () => current + body))
    .toThrow(new PhaseDefinitionError('INVALID_SCHEMA', 'batch'));
  const legacy = resolvePhaseDispatch('batch', () => metadata + body);
  const { machineCapabilities: _machineCapabilities, ...withoutMachine } = legacy.definition;
  expect(() => parsePhaseDispatch({ ...legacy, version: 2, definition: { ...withoutMachine, version: 2 } }))
    .toThrow(new PhaseDefinitionError('INVALID_SCHEMA', 'batch'));
});

it('keeps legacy phase resolution without a skill field', () => {
  const legacy = resolvePhaseDefinition('batch', () => metadata + body);
  expect(legacy).toEqual({ text: legacy.text, definition: legacy.definition, toolProfile: legacy.toolProfile });
  expect(resolvePhaseDispatch('batch', () => metadata + body).skills).toBeUndefined();
});
