import { PHASE_KINDS, PHASE_SHAPES } from '../contracts/route-decide-args.schema';
import { policyForPhase } from './tier-effort-policy';

describe('policyForPhase', () => {
  it.each(['plan', 'architecture'] as const)('uses R1 for %s', (kind) => {
    expect(policyForPhase(kind)).toEqual({ tier: 'opus', effort: 'high', ruleId: 'R1' });
    expect(policyForPhase(kind, 'mechanical', 8000)).toEqual({ tier: 'opus', effort: 'xhigh', ruleId: 'R1' });
  });

  it.each(['review', 'document-review', 'visual-review'] as const)('uses R2 for %s', (kind) => {
    expect(policyForPhase(kind)).toEqual({ tier: 'opus', effort: 'high', ruleId: 'R2' });
    expect(policyForPhase(kind, 'docs', 8000)).toEqual({ tier: 'opus', effort: 'xhigh', ruleId: 'R2' });
  });

  it.each(['logic', 'contract'] as const)('uses R3 for %s', (shape) => {
    expect(policyForPhase('implement', shape)).toEqual({ tier: 'sonnet', effort: 'high', ruleId: 'R3' });
    expect(policyForPhase('implement', shape, 7999)).toEqual({ tier: 'sonnet', effort: 'high', ruleId: 'R3' });
    expect(policyForPhase('implement', shape, 8000)).toEqual({ tier: 'opus', effort: 'xhigh', ruleId: 'R3' });
  });

  it.each(['mechanical', 'test', 'docs'] as const)('uses R4 buckets for %s', (shape) => {
    expect(policyForPhase('implement', shape)).toEqual({ tier: 'sonnet', effort: 'medium', ruleId: 'R4' });
    expect(policyForPhase('implement', shape, 3999)).toEqual({ tier: 'haiku', effort: 'low', ruleId: 'R4' });
    expect(policyForPhase('implement', shape, 4000)).toEqual({ tier: 'sonnet', effort: 'medium', ruleId: 'R4' });
    expect(policyForPhase('implement', shape, 11999)).toEqual({ tier: 'sonnet', effort: 'medium', ruleId: 'R4' });
    expect(policyForPhase('implement', shape, 12000)).toEqual({ tier: 'opus', effort: 'high', ruleId: 'R4' });
  });

  it('uses R5 for absent shape and review shape on an implementation', () => {
    expect(policyForPhase('implement')).toEqual({ tier: 'sonnet', effort: 'medium', ruleId: 'R5' });
    expect(policyForPhase('implement', 'review', 7999)).toEqual({ tier: 'sonnet', effort: 'medium', ruleId: 'R5' });
    expect(policyForPhase('implement', 'review', 8000)).toEqual({ tier: 'opus', effort: 'high', ruleId: 'R5' });
  });

  it.each(PHASE_KINDS)('keeps the legacy default for %s', (kind) => {
    const expected = ['plan', 'architecture', 'review', 'document-review', 'visual-review'].includes(kind) ? 'opus' : 'sonnet';
    expect(policyForPhase(kind).tier).toBe(expected);
  });

  it('never emits max', () => {
    for (const kind of PHASE_KINDS) {
      for (const shape of [undefined, ...PHASE_SHAPES]) {
        for (const weight of [undefined, 0, 3999, 4000, 7999, 8000, 11999, 12000, 200000]) {
          expect(policyForPhase(kind, shape, weight).effort).not.toBe('max');
        }
      }
    }
  });
});
