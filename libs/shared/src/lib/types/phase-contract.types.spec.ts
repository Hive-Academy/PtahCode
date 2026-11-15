import {
  PHASE_KINDS,
  SKELETON_STEPS,
  type PackDefinitionV1,
  type SkeletonStep,
} from './phase-contract.types';

describe('skeleton and pack contract', () => {
  it('has exactly five skeleton steps', () => {
    const steps: readonly SkeletonStep[] = SKELETON_STEPS;
    expect(steps).toEqual(['clarify', 'plan', 'do', 'check', 'deliver']);
    expect(new Set(steps).size).toBe(5);
  });

  it('roundtrips a pack definition through JSON', () => {
    const pack: PackDefinitionV1 = {
      name: 'research',
      displayName: 'Research',
      workTypes: ['RESEARCH'],
      phaseFlow: ['plan', 'research', 'docs', 'completion'],
      stepMap: {
        clarify: [],
        plan: ['plan'],
        do: ['research'],
        check: ['docs'],
        deliver: ['completion'],
      },
      version: 1,
    };
    expect(JSON.parse(JSON.stringify(pack))).toEqual(pack);
  });

  it('accepts the software pack phase flow', () => {
    const pack: PackDefinitionV1 = {
      name: 'software',
      displayName: 'Software',
      workTypes: ['FEATURE', 'BUGFIX'],
      phaseFlow: [
        'plan',
        'design',
        'batch',
        'implement',
        'review',
        'tests',
        'completion',
      ],
      stepMap: {
        clarify: [],
        plan: ['plan', 'design'],
        do: ['batch', 'implement'],
        check: ['review', 'tests'],
        deliver: ['completion'],
      },
      version: 1,
    };
    expect(pack.phaseFlow.every((kind) => PHASE_KINDS.includes(kind))).toBe(
      true,
    );
    expect(pack.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});
