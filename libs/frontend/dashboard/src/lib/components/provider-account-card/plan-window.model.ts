import {
  activeEstimatedExhaustion,
  activeWindowExhaustion,
  classifyWindow,
  formatLocalAbsolute,
  formatLocalWithRelative,
  formatRelative,
  formatUsed,
  FRESHNESS_MS,
  NEAR_LIMIT_PERCENT,
  PLAN_LIMIT_SOURCE_LABELS,
  resetPassage,
  usedPercent,
  windowFieldSources,
  windowObservedAt,
  LocalTimeOptions,
  PlanLimitOwnerSnapshot,
  PlanLimitWindow,
  PlanWindowState,
} from '@ptah-extension/shared';
import type { Tone } from './plan-tile.types';

/** Bar fill tone per window state; every state not listed is neutral. */
export const BAR_TONES: Readonly<Partial<Record<PlanWindowState, Tone>>> = {
  'limit-reached': 'error',
  'near-limit': 'warning',
  ok: 'success',
};

export const STATE_CHIPS: Readonly<
  Record<PlanWindowState, { glyph: string; text: string; tone: Tone } | null>
> = {
  'limit-reached': { glyph: '■', text: 'Limit reached', tone: 'error' },
  'near-limit': { glyph: '▲', text: 'Near limit', tone: 'warning' },
  aged: { glyph: '◷', text: 'Aged', tone: 'neutral' },
  'usage-unknown': { glyph: '?', text: 'Usage unknown', tone: 'neutral' },
  'not-confirmed': { glyph: '?', text: 'Not confirmed', tone: 'neutral' },
  'reset-usage-unknown': {
    glyph: '↻',
    text: 'Reset · usage unknown',
    tone: 'neutral',
  },
  'estimate-only': { glyph: '~', text: 'Estimate only', tone: 'neutral' },
  ok: null,
};

// ---------------------------------------------------------------------------
// Per-window facts for primary and supporting readings
// ---------------------------------------------------------------------------

export interface WindowFacts {
  readonly state: PlanWindowState;
  readonly percent: number | undefined;
  readonly valueText: string;
  readonly limitLine: string | null;
  readonly resetLines: readonly string[];
  readonly note: string | null;
  readonly estimateNote: string | null;
  readonly sources: readonly string[];
}

export function windowFacts(
  window: PlanLimitWindow,
  owner: PlanLimitOwnerSnapshot,
  now: number,
  time: LocalTimeOptions,
): WindowFacts {
  const classification = {
    now,
    nearLimitPercent: NEAR_LIMIT_PERCENT,
    freshnessMs: FRESHNESS_MS,
    status: owner.status,
  };
  const state = classifyWindow(window, classification);
  const percent = usedPercent(window.used);
  const amount = window.used?.kind === 'amount' && Number.isFinite(window.used.amount)
    ? window.used : null;
  const showValue = (percent !== undefined || amount !== null) && state !== 'reset-usage-unknown';
  const at = (instant: number) => formatLocalWithRelative(instant, now, time);

  let limitLine: string | null = null;
  let resetLines: string[] = [];
  let note: string | null = null;
  if (state === 'limit-reached') {
    const resetsAt = activeWindowExhaustion(
      window,
      now,
      classification,
    )?.resetsAt;
    limitLine =
      resetsAt !== undefined
        ? `Limit reached — resets ${at(resetsAt)}`
        : 'Limit reached — reset unknown';
  } else if (state === 'reset-usage-unknown') {
    const passage = resetPassage(window, now);
    if (passage !== undefined) {
      resetLines = [
        `Reset ${formatLocalAbsolute(passage.passedAt, now, time)} (${formatRelative(passage.passedAt, now)}) came after the last observation (${formatLocalAbsolute(passage.lastObservedAt, now, time)}): current usage unknown.`,
        passage.nextResetAt !== undefined
          ? `Next reset ${at(passage.nextResetAt)}`
          : 'Next reset unknown',
      ];
    }
  } else {
    resetLines = [resetText(window.resetsAt, now, time)];
    if (state === 'aged') {
      note = `${owner.status === 'stale' ? 'cached, ' : ''}observed ${formatRelative(windowObservedAt(window), now)}`;
    } else if (state === 'not-confirmed') {
      note = 'last reset unknown: freshness cannot be confirmed';
    }
  }

  const estimated = activeEstimatedExhaustion(window, now);
  return {
    state,
    percent,
    valueText: showValue
      ? amount !== null && percent === undefined
        ? `${amount.amount.toLocaleString('en-US')} ${amount.unit} used`
        : `${formatUsed(window.used)} used`
      : 'Used: unknown',
    limitLine,
    resetLines,
    note,
    estimateNote:
      state !== 'limit-reached' && estimated !== undefined
        ? `Estimated limit hit (unconfirmed, informational) · ${resetPhrase(estimated.resetsAt, now, time)}`
        : null,
    sources: sourceLabels(window),
  };
}

/** "resets <time> · in …", "reset passed <time> · … ago" or "reset unknown". */
export function resetPhrase(
  resetsAt: number | undefined,
  now: number,
  time: LocalTimeOptions,
): string {
  if (resetsAt === undefined || !Number.isFinite(resetsAt)) {
    return 'reset unknown';
  }
  const when = formatLocalWithRelative(resetsAt, now, time);
  return resetsAt <= now ? `reset passed ${when}` : `resets ${when}`;
}

/** `resetPhrase` as the leading words of a line. */
export function resetText(
  resetsAt: number | undefined,
  now: number,
  time: LocalTimeOptions,
): string {
  if (resetsAt !== undefined && Number.isFinite(resetsAt) && resetsAt > now) {
    return `Resets ${formatRelative(resetsAt, now)} (${formatLocalAbsolute(resetsAt, now, time)})`;
  }
  const phrase = resetPhrase(resetsAt, now, time);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export function sourceLabels(window: PlanLimitWindow): string[] {
  return windowFieldSources(window).map(
    ({ source, fields }) =>
      `${fields.length === 3 ? '' : `${fields.join(' · ')} `}${PLAN_LIMIT_SOURCE_LABELS[source]}`,
  );
}

// ---------------------------------------------------------------------------
// Primary selection
// ---------------------------------------------------------------------------

/**
 * The most constrained eligible window: finite used percentage and a known,
 * future reset. Highest percent, then nearest reset, then stable window key.
 * A `reset-usage-unknown` window is never eligible — its value was
 * invalidated by a reset and must not be shown as a bar.
 */
export function selectPrimary(
  windows: readonly PlanLimitWindow[],
  states: ReadonlyMap<string, PlanWindowState>,
  now: number,
): PlanLimitWindow | null {
  let best: {
    window: PlanLimitWindow;
    percent: number;
    resetsIn: number;
  } | null = null;
  for (const window of windows) {
    const state = states.get(window.key);
    if (state === undefined || state === 'reset-usage-unknown') continue;
    const percent = usedPercent(window.used);
    if (percent === undefined) continue;
    const resetsAt = window.resetsAt;
    if (
      resetsAt === undefined ||
      !Number.isFinite(resetsAt) ||
      resetsAt <= now
    ) {
      continue;
    }
    const resetsIn = resetsAt - now;
    if (
      best === null ||
      percent > best.percent ||
      (percent === best.percent &&
        (resetsIn < best.resetsIn ||
          (resetsIn === best.resetsIn && window.key < best.window.key)))
    ) {
      best = { window, percent, resetsIn };
    }
  }
  return best?.window ?? null;
}

export function quotaWindowView(
  window: PlanLimitWindow,
  owner: PlanLimitOwnerSnapshot,
  now: number,
  time: LocalTimeOptions,
): import('./plan-tile.types').PlanQuotaWindowView {
  const facts = windowFacts(window, owner, now, time);
  const observed = windowObservedAt(window);
  return {
    key: window.key,
    label: window.label,
    modelScope: window.modelScope ?? null,
    valueText:
      facts.state === 'reset-usage-unknown' ? 'Usage unknown' : facts.valueText,
    allowanceText:
      window.used?.kind === 'amount' &&
      facts.percent !== undefined &&
      facts.state !== 'reset-usage-unknown'
        ? `${Math.round(facts.percent)}% of allowance`
        : window.used?.kind === 'amount' && Number.isFinite(window.used.amount) && facts.state !== 'reset-usage-unknown'
          ? 'Allowance unknown'
          : null,
    percent:
      facts.state === 'reset-usage-unknown' ? null : (facts.percent ?? null),
    tone: BAR_TONES[facts.state] ?? 'neutral',
    // A reached limit can record its reset only on the exhaustion evidence;
    // that line, not the absent window reset, is the reset the user needs.
    resetText:
      facts.limitLine ??
      (facts.resetLines.join(' · ') || resetText(window.resetsAt, now, time)),
    qualifier:
      facts.state === 'estimate-only'
        ? 'Estimated'
        : facts.state === 'reset-usage-unknown'
          ? 'Reset passed · usage unknown'
          : facts.state === 'usage-unknown' &&
              window.used?.kind === 'amount' &&
              Number.isFinite(window.used.amount)
            ? null
            : (STATE_CHIPS[facts.state]?.text ?? facts.note),
    provenance: [
      ...(facts.sources.length ? facts.sources : ['Source unknown']),
      ...(window.used !== undefined
        ? [
            `Used source: ${window.usedSource === undefined ? 'Source unknown' : PLAN_LIMIT_SOURCE_LABELS[window.usedSource]}`,
          ]
        : []),
      ...(window.resetsAt !== undefined
        ? [
            `Reset source: ${window.resetSource === undefined ? 'Source unknown' : PLAN_LIMIT_SOURCE_LABELS[window.resetSource]}; ${Number.isFinite(window.observedAt) ? `observed ${formatLocalWithRelative(window.observedAt, now, time)}` : 'Observation time unknown'}`,
          ]
        : []),
      Number.isFinite(observed)
        ? `Observed ${formatLocalWithRelative(observed, now, time)}`
        : 'Observation time unknown',
      ...(facts.note ? [facts.note] : []),
      ...(facts.estimateNote ? [facts.estimateNote] : []),
    ],
  };
}
