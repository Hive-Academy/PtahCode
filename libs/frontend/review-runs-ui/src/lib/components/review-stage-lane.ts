import type { ReviewLaneFallback, StageRecord } from '@ptah-extension/review-contracts';

/** The lane line of a stage card: the lane that ran, its model (null = lane default), and the family when asked for. */
export interface StageLaneLine {
  readonly lane: string;
  readonly model: string | null;
  readonly family: string | null;
}

const FALLBACK_REASON_TEXT: Record<ReviewLaneFallback['reason'], string> = {
  'lane-not-listed': 'lane not listed',
  'at-limit': 'at limit',
  'model-blocked': 'model blocked',
  'model-not-offered': 'model not offered',
};

/**
 * The lane line for a stage recorded after lane pools, or null for an older or lane-less record.
 * `withFamily` appends the family on triage and verification cards; lens cards keep their own family line.
 */
export function laneLine(stage: StageRecord, withFamily: boolean): StageLaneLine | null {
  if (!stage.lane) return null;
  return { lane: stage.lane, model: stage.model ?? null, family: withFamily ? stage.family : null };
}

/** One sentence per skipped pin or pool entry. Older records (null or missing `fallback`) give none. */
export function fallbackNotes(stage: StageRecord): string[] {
  const ranOn = stage.lane ? `Ran on ${stage.lane}.` : 'No lane ran.';
  return (stage.fallback ?? []).map((entry) => {
    const reason = FALLBACK_REASON_TEXT[entry.reason];
    return entry.source === 'pin'
      ? `Fallback: pinned ${entry.lane}${entry.model ? ' / ' + entry.model : ''} was unavailable (${reason}). ${ranOn}`
      : `Fallback: pool entry ${entry.lane} skipped (${reason}). ${ranOn}`;
  });
}
