import {
  SUBAGENT_LANE_ID,
  type LaneOutcomeSummary,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import type { DecisionOutcomeFigures } from '../decision-model/decision-payload';
import { ANY_EFFORT, choiceModelOf, sentEffortBucket, type EffortBucket } from './choice-evidence';
import { dedupeByRun, isCapacityFailure } from './local-derivation';

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
      ((byModelEffort || verdict === 'failed') && isCapacityFailure(summary.failureClass))
    ) {
      continue;
    }

    const choice = byModelEffort
      ? { model: choiceModelOf(summary), effort: sentEffortBucket(summary.effort) }
      : undefined;
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
  }
  return (laneId, taskKind, model, effort = ANY_EFFORT) =>
    figures.get(JSON.stringify(byModelEffort
      ? [laneId, taskKind, model, effort]
      : [laneId, taskKind])) ?? null;
}
