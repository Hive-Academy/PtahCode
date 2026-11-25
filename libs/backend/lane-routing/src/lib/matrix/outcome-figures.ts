import {
  LANE_DEFAULT_MODEL,
  SUBAGENT_LANE_ID,
  type LaneOutcomeSummary,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import type { DecisionOutcomeFigures } from '../decision-model/decision-payload';
import { ANY_EFFORT, choiceModelOf, sentEffortBucket, type EffortBucket } from './choice-evidence';
import { dedupeByRun, isExcludedFromRates } from './local-derivation';
import { FAMILY_PROFILE_MODEL } from './matrix.types';

export type OutcomeFigureLookup = (
  laneId: string,
  taskKind: OutcomeTaskKind,
  model?: string,
  effort?: EffortBucket,
) => DecisionOutcomeFigures | null;

export const EMPTY_OUTCOME_FIGURES: OutcomeFigureLookup = () => null;

/** Aggregate verified delivery results by lane and task kind, optionally by choice. */
export function outcomeFiguresFrom(
  summaries: readonly LaneOutcomeSummary[],
  { byModelEffort }: { readonly byModelEffort: boolean } = { byModelEffort: false },
): OutcomeFigureLookup {
  const figures = new Map<string, DecisionOutcomeFigures>();
  const add = (
    laneId: string,
    taskKind: OutcomeTaskKind,
    verdict: LaneOutcomeSummary['verdict'],
    choice?: { model: string; effort: EffortBucket },
  ): void => {
    const key = JSON.stringify(choice === undefined
      ? [laneId, taskKind]
      : [laneId, taskKind, choice.model, choice.effort]);
    const previous = figures.get(key);
    figures.set(key, {
      laneId,
      taskKind,
      ...choice,
      delivered: (previous?.delivered ?? 0) + (verdict === 'delivered' ? 1 : 0),
      failed:
        (previous?.failed ?? 0) +
        (verdict === 'failed' || verdict === 'no-deliverable' ? 1 : 0),
    });
  };

  for (const summary of dedupeByRun(summaries)) {
    const { laneId, taskKind, verdict } = summary;
    if (
      laneId === SUBAGENT_LANE_ID ||
      !/\S/.test(laneId) ||
      taskKind === null
    ) {
      continue;
    }
    if (
      verdict === 'unverified' ||
      ((byModelEffort || verdict === 'failed') && isExcludedFromRates(summary.failureClass))
    ) {
      continue;
    }

    if (!byModelEffort) {
      add(laneId, taskKind, verdict);
      continue;
    }
    const model = choiceModelOf(summary);
    const effort = sentEffortBucket(summary.effort);
    const models = summary.model === LANE_DEFAULT_MODEL && model !== FAMILY_PROFILE_MODEL
      ? [model, FAMILY_PROFILE_MODEL]
      : [model];
    for (const model of models) {
      add(laneId, taskKind, verdict, { model, effort });
      if (effort !== ANY_EFFORT) {
        add(laneId, taskKind, verdict, { model, effort: ANY_EFFORT });
      }
    }
  }
  return (laneId, taskKind, model, effort = ANY_EFFORT) => {
    if (!byModelEffort) return figures.get(JSON.stringify([laneId, taskKind])) ?? null;
    return figures.get(JSON.stringify([laneId, taskKind, model, effort]))
      ?? figures.get(JSON.stringify([laneId, taskKind, model, ANY_EFFORT]))
      ?? null;
  };
}
