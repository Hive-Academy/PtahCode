import 'reflect-metadata';
import { resolvePhaseDispatch } from '@ptah-extension/lane-routing';
import { childPhasePolicyRefusal } from './child-phase-policy';

const source = `---
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
## Method
Plan.
## Output contract
Write.
## Return value
Return.
## Refusals
Refuse.
## Escalation protocol
Ask.
`;

it('refuses a child that drops a caller denial', () => {
  const phase = resolvePhaseDispatch('batch', () => source);
  expect(childPhasePolicyRefusal({ kind: 'agent', capability: 'privileged', disallowedTools: ['ptah_search_files'] }, phase))
    .toContain('PHASE_DENIALS_REQUIRED');
});

it('accepts equal and larger child denial lists', () => {
  const phase = resolvePhaseDispatch('batch', () => source.replace('disallowedTools: []', 'disallowedTools: [ptah_search_files]'));
  const binding = { kind: 'agent' as const, capability: 'privileged' as const, disallowedTools: ['ptah_search_files'] };
  expect(childPhasePolicyRefusal(binding, phase)).toBeUndefined();
  const larger = resolvePhaseDispatch('batch', () => source.replace('disallowedTools: []', 'disallowedTools: [ptah_search_files, ptah_agent_spawn]'));
  expect(childPhasePolicyRefusal(binding, larger)).toBeUndefined();
});

it('preserves main behavior for a caller without phase denials', () => {
  expect(childPhasePolicyRefusal(undefined, undefined)).toBeUndefined();
});

it('refuses a malformed caller denial list before checking the child', () => {
  const malformed = { kind: 'agent' as const, capability: 'privileged' as const,
    phaseKind: 'batch' as const, disallowedTools: [''] };
  expect(childPhasePolicyRefusal(malformed, undefined)).toContain('binding is malformed');
});
