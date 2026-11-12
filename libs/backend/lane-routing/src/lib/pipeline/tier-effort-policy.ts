import type { PhaseShape } from '../contracts/route-decide-args.schema';
import type { ModelEffort, ModelTier } from '../contracts/route-decide-result.schema';
import type { PhaseKind } from '../ranking/hard-constraints';

export interface PhasePolicy {
  readonly tier: ModelTier;
  readonly effort: ModelEffort;
  readonly ruleId: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
}

/** First matching rule wins. An omitted weight selects the middle bucket. */
export function policyForPhase(
  kind: PhaseKind,
  shape?: PhaseShape,
  weight?: number,
): PhasePolicy {
  if (kind === 'plan' || kind === 'architecture' || kind === 'batch') {
    return { tier: 'opus', effort: weight !== undefined && weight >= 8000 ? 'xhigh' : 'high', ruleId: 'R1' };
  }
  if (kind === 'review' || kind === 'document-review' || kind === 'visual-review' || kind === 'completion') {
    return { tier: 'opus', effort: weight !== undefined && weight >= 8000 ? 'xhigh' : 'high', ruleId: 'R2' };
  }
  if (shape === 'contract' || shape === 'logic') {
    return weight !== undefined && weight >= 8000
      ? { tier: 'opus', effort: 'xhigh', ruleId: 'R3' }
      : { tier: 'sonnet', effort: 'high', ruleId: 'R3' };
  }
  if (shape === 'mechanical' || shape === 'test' || shape === 'docs') {
    if (weight !== undefined && weight < 4000) return { tier: 'haiku', effort: 'low', ruleId: 'R4' };
    if (weight !== undefined && weight >= 12000) return { tier: 'opus', effort: 'high', ruleId: 'R4' };
    return { tier: 'sonnet', effort: 'medium', ruleId: 'R4' };
  }
  return weight !== undefined && weight >= 8000
    ? { tier: 'opus', effort: 'high', ruleId: 'R5' }
    : { tier: 'sonnet', effort: 'medium', ruleId: 'R5' };
}
