import type { ChildSettingSource, EffortLevel } from '@ptah-extension/shared';
import { childModelCandidates, type ChildModelTier } from './child-model-tier';

export type ChildWorkKind = 'coordination' | 'code' | 'investigation' | 'design' | 'security';
export type ChildSettingRuleId = 'coordination-only' | 'deep-work-kind' | 'deep-work-text' | 'code-work-kind' | 'unknown-kind-floor' | 'catalog-empty' | 'decision-model-below-floor';
export interface ChildSettingInput {
  readonly brief: string;
  readonly models: readonly string[];
  /** A caller-pinned model: the catalog is then not read, so it is not "empty". */
  readonly model?: string;
  readonly phaseKind?: string;
  readonly workKind?: ChildWorkKind;
}
export interface ChildSettingChoice {
  readonly model?: string;
  readonly effort?: EffortLevel;
  readonly modelSource: ChildSettingSource;
  readonly effortSource: ChildSettingSource;
  readonly reason: { readonly rule: ChildSettingRuleId; readonly input: string };
  readonly candidates: readonly string[];
}

const DEEP_PHASES = ['plan', 'architecture', 'design', 'review', 'document-review', 'visual-review', 'batch', 'completion'];
const CODE_PHASES = ['implement', 'tests', 'docs', 'research'];

export function rankChildSettings(input: ChildSettingInput): ChildSettingChoice {
  const { brief, models, phaseKind, workKind } = input;
  let rule: ChildSettingRuleId = 'unknown-kind-floor';
  let tier: ChildModelTier = 1;
  let effort: EffortLevel = 'high';
  let evidence = 'no explicit kind';
  if (workKind === 'coordination' && ![...CODE_PHASES, ...DEEP_PHASES].includes(phaseKind ?? '')) {
    rule = 'coordination-only'; tier = 0; effort = 'low'; evidence = 'workKind coordination';
  } else if (['investigation', 'design', 'security'].includes(workKind ?? '') || DEEP_PHASES.includes(phaseKind ?? '')) {
    rule = 'deep-work-kind'; tier = 2;
    evidence = DEEP_PHASES.includes(phaseKind ?? '') ? `phase.kind ${phaseKind}` : `workKind ${workKind}`;
  } else if (!phaseKind && !workKind && /root cause|unknown (?:cause|reason)|security|architectur|design|investigat/i.test(brief)) {
    rule = 'deep-work-text'; tier = 2; evidence = 'brief deep-work keyword';
  } else if (workKind === 'code' || CODE_PHASES.includes(phaseKind ?? '')) {
    rule = 'code-work-kind';
    evidence = CODE_PHASES.includes(phaseKind ?? '') ? `phase.kind ${phaseKind}` : 'workKind code';
  } else if (phaseKind || workKind) {
    evidence = phaseKind ? `phase.kind ${phaseKind}` : `workKind ${workKind}`;
  }
  const candidates = childModelCandidates(models, tier);
  const model = candidates[0];
  return {
    ...(model ? { model } : {}), effort,
    modelSource: model ? 'ranking' : 'default', effortSource: 'ranking',
    candidates, reason: { rule: models.length || input.model ? rule : 'catalog-empty', input: evidence },
  };
}
