import type { RoutingRule } from '@ptah-extension/shared';
import { PHASE_KINDS, PHASE_SHAPES } from '../contracts/route-decide-args.schema';
import { applyRoutingRule, policyForPhase } from './tier-effort-policy';

describe('policyForPhase', () => {
  it.each(['plan', 'architecture', 'batch'] as const)(
    'uses R1 and reports condition for %s across omitted, 7999, and 8000',
    (kind) => {
      expect(policyForPhase(kind)).toEqual({
        tier: 'opus',
        effort: 'high',
        ruleId: 'R1',
        condition: `R1 kind=${kind} weight omitted`,
      });
      expect(policyForPhase(kind, 'mechanical', 7999)).toEqual({
        tier: 'opus',
        effort: 'high',
        ruleId: 'R1',
        condition: `R1 kind=${kind} weight<8000`,
      });
      expect(policyForPhase(kind, 'mechanical', 8000)).toEqual({
        tier: 'opus',
        effort: 'xhigh',
        ruleId: 'R1',
        condition: `R1 kind=${kind} weight>=8000`,
      });
    },
  );

  it.each(['review', 'document-review', 'visual-review', 'completion'] as const)(
    'uses R2 and reports condition for %s across omitted, 7999, and 8000',
    (kind) => {
      expect(policyForPhase(kind)).toEqual({
        tier: 'opus',
        effort: 'high',
        ruleId: 'R2',
        condition: `R2 kind=${kind} weight omitted`,
      });
      expect(policyForPhase(kind, 'docs', 7999)).toEqual({
        tier: 'opus',
        effort: 'high',
        ruleId: 'R2',
        condition: `R2 kind=${kind} weight<8000`,
      });
      expect(policyForPhase(kind, 'docs', 8000)).toEqual({
        tier: 'opus',
        effort: 'xhigh',
        ruleId: 'R2',
        condition: `R2 kind=${kind} weight>=8000`,
      });
    },
  );

  it.each(['logic', 'contract'] as const)(
    'uses R3 and reports condition for %s across omitted, 7999, and 8000',
    (shape) => {
      expect(policyForPhase('implement', shape)).toEqual({
        tier: 'sonnet',
        effort: 'high',
        ruleId: 'R3',
        condition: `R3 shape=${shape} weight omitted`,
      });
      expect(policyForPhase('implement', shape, 7999)).toEqual({
        tier: 'sonnet',
        effort: 'high',
        ruleId: 'R3',
        condition: `R3 shape=${shape} weight<8000`,
      });
      expect(policyForPhase('implement', shape, 8000)).toEqual({
        tier: 'opus',
        effort: 'xhigh',
        ruleId: 'R3',
        condition: `R3 shape=${shape} weight>=8000`,
      });
    },
  );

  it.each(['mechanical', 'test', 'docs'] as const)(
    'uses R4 buckets and reports condition for %s across omitted, 3999/4000, and 11999/12000',
    (shape) => {
      expect(policyForPhase('implement', shape)).toEqual({
        tier: 'sonnet',
        effort: 'medium',
        ruleId: 'R4',
        condition: `R4 shape=${shape} weight omitted`,
      });
      expect(policyForPhase('implement', shape, 3999)).toEqual({
        tier: 'haiku',
        effort: 'low',
        ruleId: 'R4',
        condition: `R4 shape=${shape} weight<4000`,
      });
      expect(policyForPhase('implement', shape, 4000)).toEqual({
        tier: 'sonnet',
        effort: 'medium',
        ruleId: 'R4',
        condition: `R4 shape=${shape} 4000<=weight<12000`,
      });
      expect(policyForPhase('implement', shape, 11999)).toEqual({
        tier: 'sonnet',
        effort: 'medium',
        ruleId: 'R4',
        condition: `R4 shape=${shape} 4000<=weight<12000`,
      });
      expect(policyForPhase('implement', shape, 12000)).toEqual({
        tier: 'opus',
        effort: 'high',
        ruleId: 'R4',
        condition: `R4 shape=${shape} weight>=12000`,
      });
    },
  );

  it('uses R5 and reports condition for absent shape and review shape across omitted, 7999, and 8000', () => {
    expect(policyForPhase('implement')).toEqual({
      tier: 'sonnet',
      effort: 'medium',
      ruleId: 'R5',
      condition: 'R5 shape=unset weight omitted',
    });
    expect(policyForPhase('implement', undefined, 7999)).toEqual({
      tier: 'sonnet',
      effort: 'medium',
      ruleId: 'R5',
      condition: 'R5 shape=unset weight<8000',
    });
    expect(policyForPhase('implement', undefined, 8000)).toEqual({
      tier: 'opus',
      effort: 'high',
      ruleId: 'R5',
      condition: 'R5 shape=unset weight>=8000',
    });
    expect(policyForPhase('implement', 'review')).toEqual({
      tier: 'sonnet',
      effort: 'medium',
      ruleId: 'R5',
      condition: 'R5 shape=review weight omitted',
    });
    expect(policyForPhase('implement', 'review', 7999)).toEqual({
      tier: 'sonnet',
      effort: 'medium',
      ruleId: 'R5',
      condition: 'R5 shape=review weight<8000',
    });
    expect(policyForPhase('implement', 'review', 8000)).toEqual({
      tier: 'opus',
      effort: 'high',
      ruleId: 'R5',
      condition: 'R5 shape=review weight>=8000',
    });
  });

  it.each(PHASE_KINDS)('keeps the legacy default for %s', (kind) => {
    const expected = [
      'plan',
      'architecture',
      'batch',
      'review',
      'document-review',
      'visual-review',
      'completion',
    ].includes(kind)
      ? 'opus'
      : 'sonnet';
    expect(policyForPhase(kind).tier).toBe(expected);
  });

  it('never emits max', () => {
    for (const kind of PHASE_KINDS) {
      for (const shape of [undefined, ...PHASE_SHAPES]) {
        for (const weight of [
          undefined,
          0,
          3999,
          4000,
          7999,
          8000,
          11999,
          12000,
          200000,
        ]) {
          const policy = policyForPhase(kind, shape, weight);
          expect(policy.effort).not.toBe('max');
          expect(policy.condition).not.toMatch(/[;\r\n]/);
        }
      }
    }
  });
});

describe('applyRoutingRule', () => {
  it('clamps tier up when minTier is above the policy tier', () => {
    const base = policyForPhase('implement', 'logic', 5000);
    const rule: RoutingRule = {
      id: 'ui-opus',
      match: { kind: 'implement' },
      set: { minTier: 'opus' },
    };

    const applied = applyRoutingRule(base, rule);
    expect(applied).toEqual({
      ...base,
      tier: 'opus',
      effort: 'high',
      appliedRuleId: 'ui-opus',
      note: 'rule ui-opus raised tier sonnet->opus',
    });
  });

  it('clamps tier down when maxTier is below the policy tier', () => {
    const base = policyForPhase('implement', 'logic', 10000);
    const rule: RoutingRule = {
      id: 'cap-sonnet',
      match: { shape: 'logic' },
      set: { maxTier: 'sonnet' },
    };

    const applied = applyRoutingRule(base, rule);
    expect(applied).toEqual({
      ...base,
      tier: 'sonnet',
      effort: 'xhigh',
      appliedRuleId: 'cap-sonnet',
      note: 'rule cap-sonnet capped tier opus->sonnet',
    });
  });

  it('replaces effort independently and alongside tier clamping', () => {
    const base = policyForPhase('implement', 'mechanical', 2000);
    const effortOnly: RoutingRule = {
      id: 'deep-mech',
      match: { shape: 'mechanical' },
      set: { effort: 'high' },
    };
    expect(applyRoutingRule(base, effortOnly)).toEqual({
      ...base,
      tier: 'haiku',
      effort: 'high',
      appliedRuleId: 'deep-mech',
      note: 'rule deep-mech set effort low->high',
    });

    const both: RoutingRule = {
      id: 'boost-both',
      match: { shape: 'mechanical' },
      set: { minTier: 'sonnet', effort: 'xhigh' },
    };
    expect(applyRoutingRule(base, both)).toEqual({
      ...base,
      tier: 'sonnet',
      effort: 'xhigh',
      appliedRuleId: 'boost-both',
      note: 'rule boost-both raised tier haiku->sonnet, set effort low->xhigh',
    });
  });

  it('returns null note when no rule is given or when the rule leaves tier and effort unchanged', () => {
    const base = policyForPhase('implement', 'logic', 5000);
    expect(applyRoutingRule(base)).toEqual({ ...base, note: null });

    const noopRule: RoutingRule = {
      id: 'prefer-only',
      match: { kind: 'implement' },
      set: { minTier: 'haiku', maxTier: 'opus', prefer: ['codex'] },
    };
    expect(applyRoutingRule(base, noopRule)).toEqual({
      ...base,
      appliedRuleId: 'prefer-only',
      note: null,
    });
  });
});
