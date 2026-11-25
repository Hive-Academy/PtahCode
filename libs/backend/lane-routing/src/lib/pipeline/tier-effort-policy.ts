import type { RoutingRule } from '@ptah-extension/shared';
import type { PhaseShape } from '../contracts/route-decide-args.schema';
import type { ModelEffort, ModelTier } from '../contracts/route-decide-result.schema';
import type { PhaseKind } from '../ranking/hard-constraints';

export interface PhasePolicy {
  readonly tier: ModelTier;
  readonly effort: ModelEffort;
  readonly ruleId: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  readonly condition?: string;
}

export interface ResolvedPhasePolicy extends PhasePolicy {
  readonly condition: string;
}

export interface AppliedRoutingRulePolicy extends PhasePolicy {
  readonly appliedRuleId?: string;
  readonly note: string | null;
}

const TIER_ORDER: Readonly<Record<ModelTier, number>> = {
  haiku: 0,
  sonnet: 1,
  opus: 2,
};

/** First matching rule wins. An omitted weight selects the middle bucket. */
export function policyForPhase(
  kind: PhaseKind,
  shape?: PhaseShape,
  weight?: number,
): ResolvedPhasePolicy {
  if (kind === 'plan' || kind === 'architecture' || kind === 'batch') {
    if (weight !== undefined && weight >= 8000) {
      return {
        tier: 'opus',
        effort: 'xhigh',
        ruleId: 'R1',
        condition: `R1 kind=${kind} weight>=8000`,
      };
    }
    return {
      tier: 'opus',
      effort: 'high',
      ruleId: 'R1',
      condition:
        weight === undefined
          ? `R1 kind=${kind} weight omitted`
          : `R1 kind=${kind} weight<8000`,
    };
  }
  if (
    kind === 'review' ||
    kind === 'document-review' ||
    kind === 'visual-review' ||
    kind === 'completion'
  ) {
    if (weight !== undefined && weight >= 8000) {
      return {
        tier: 'opus',
        effort: 'xhigh',
        ruleId: 'R2',
        condition: `R2 kind=${kind} weight>=8000`,
      };
    }
    return {
      tier: 'opus',
      effort: 'high',
      ruleId: 'R2',
      condition:
        weight === undefined
          ? `R2 kind=${kind} weight omitted`
          : `R2 kind=${kind} weight<8000`,
    };
  }
  if (shape === 'contract' || shape === 'logic') {
    if (weight !== undefined && weight >= 8000) {
      return {
        tier: 'opus',
        effort: 'xhigh',
        ruleId: 'R3',
        condition: `R3 shape=${shape} weight>=8000`,
      };
    }
    return {
      tier: 'sonnet',
      effort: 'high',
      ruleId: 'R3',
      condition:
        weight === undefined
          ? `R3 shape=${shape} weight omitted`
          : `R3 shape=${shape} weight<8000`,
    };
  }
  if (shape === 'mechanical' || shape === 'test' || shape === 'docs') {
    if (weight !== undefined && weight < 4000) {
      return {
        tier: 'haiku',
        effort: 'low',
        ruleId: 'R4',
        condition: `R4 shape=${shape} weight<4000`,
      };
    }
    if (weight !== undefined && weight >= 12000) {
      return {
        tier: 'opus',
        effort: 'high',
        ruleId: 'R4',
        condition: `R4 shape=${shape} weight>=12000`,
      };
    }
    return {
      tier: 'sonnet',
      effort: 'medium',
      ruleId: 'R4',
      condition:
        weight === undefined
          ? `R4 shape=${shape} weight omitted`
          : `R4 shape=${shape} 4000<=weight<12000`,
    };
  }
  const shapeLabel = shape ?? 'unset';
  if (weight !== undefined && weight >= 8000) {
    return {
      tier: 'opus',
      effort: 'high',
      ruleId: 'R5',
      condition: `R5 shape=${shapeLabel} weight>=8000`,
    };
  }
  return {
    tier: 'sonnet',
    effort: 'medium',
    ruleId: 'R5',
    condition:
      weight === undefined
        ? `R5 shape=${shapeLabel} weight omitted`
        : `R5 shape=${shapeLabel} weight<8000`,
  };
}

/**
 * Clamps the policy tier to `[rule.set.minTier, rule.set.maxTier]`
 * (`haiku < sonnet < opus`) and replaces effort when `rule.set.effort` is set.
 */
export function applyRoutingRule(
  policy: PhasePolicy,
  rule?: RoutingRule,
): AppliedRoutingRulePolicy {
  if (rule === undefined) {
    return { ...policy, note: null };
  }

  let effectiveTier: ModelTier = policy.tier;
  if (
    rule.set.minTier !== undefined &&
    TIER_ORDER[effectiveTier] < TIER_ORDER[rule.set.minTier]
  ) {
    effectiveTier = rule.set.minTier;
  }
  if (
    rule.set.maxTier !== undefined &&
    TIER_ORDER[effectiveTier] > TIER_ORDER[rule.set.maxTier]
  ) {
    effectiveTier = rule.set.maxTier;
  }

  const effectiveEffort: ModelEffort = rule.set.effort ?? policy.effort;

  const changes: string[] = [];
  if (effectiveTier !== policy.tier) {
    const verb =
      TIER_ORDER[effectiveTier] > TIER_ORDER[policy.tier]
        ? 'raised'
        : 'capped';
    changes.push(`${verb} tier ${policy.tier}->${effectiveTier}`);
  }
  if (effectiveEffort !== policy.effort) {
    changes.push(`set effort ${policy.effort}->${effectiveEffort}`);
  }

  return {
    ...policy,
    tier: effectiveTier,
    effort: effectiveEffort,
    appliedRuleId: rule.id,
    note:
      changes.length > 0 ? `rule ${rule.id} ${changes.join(', ')}` : null,
  };
}
