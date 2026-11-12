import { PhaseDefinitionError, resolvePhaseDefinition } from './phase-definition-resolver';

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
  ['INVALID_SCHEMA', (): string => metadata.replace('version: 1', 'version: 2') + body],
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
