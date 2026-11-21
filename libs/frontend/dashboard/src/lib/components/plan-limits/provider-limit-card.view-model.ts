import {
  activeWindowExhaustion,
  isActiveLimitEvidence,
  classifyWindow,
  formatLocalAbsolute,
  formatRelative,
  FRESHNESS_MS,
  NEAR_LIMIT_PERCENT,
  ownerKeySuffix,
  type LocalTimeOptions,
  type PlanLimitOwnerSnapshot,
  type PlanLimitWindow,
  type PlanWindowState,
} from '@ptah-extension/shared';
import { formatElapsed } from './format-elapsed';
import type {
  PtahBadgeTone,
  PtahDescriptionItem,
  PtahMeterTone,
} from '@ptah-extension/ui';
import { buildPlanTile } from '../provider-account-card/plan-tile-view.model';
import type {
  PlanTileView,
  PlanTileActionView,
} from '../provider-account-card/plan-tile.types';
import {
  selectPrimary,
  windowFacts,
  type WindowFacts,
} from '../provider-account-card/plan-window.model';
import {
  evidenceNotice,
  tileTitleLines,
  USAGE_SOURCE_LABELS,
} from '../provider-account-card/plan-owner.model';

/** Most mini rows a card shows; the rest are counted and live in Details. */
export const MAX_MINI_ROWS = 2;

export type ProviderLimitCardState =
  | 'available'
  | 'near-limit'
  | 'limit-reached'
  | 'aged'
  | 'unknown'
  | 'not-confirmed'
  | 'estimate-only';

export interface ProviderLimitRingVm {
  /** Used percent clamped to 0..100 for the arc. */
  readonly value: number;
  readonly tone: PtahMeterTone;
  readonly centerText: string;
  /** Accessible label: "<Provider> <window> used". */
  readonly label: string;
  readonly fadeArc: boolean;
}

export interface ProviderLimitMiniRowVm {
  readonly key: string;
  readonly label: string;
  /** `null` when the denominator is unusable; `valueText` still shows. */
  readonly percent: number | null;
  readonly valueText: string;
  readonly tone: PtahMeterTone;
}

export interface ProviderLimitCardVm {
  readonly key: string;
  readonly providerId: string;
  /** Full display label ("Claude account · a6b0"); accessible names and sorting. */
  readonly label: string;
  /** Visible title: the owner label without key suffix or qualifiers. */
  readonly titleText: string;
  /** Account sub-line: qualifiers, key suffix and plan; `null` when none exist. */
  readonly accountLine: string | null;
  readonly selected: boolean;
  readonly state: ProviderLimitCardState;
  readonly statusText: string;
  /** Badge tone for the status; uncertain states stay neutral. */
  readonly statusTone: PtahBadgeTone;
  /** Glyph beside the status text so color never carries it alone. */
  readonly statusGlyph: string | null;
  readonly windowLabel: string | null;
  /** `null` when the primary window has no usable percent. */
  readonly ring: ProviderLimitRingVm | null;
  /** Finite amount shown in place of the ring ("1,200 requests used"). */
  readonly primaryValueText: string | null;
  /** Short relative reset, only when the window is exhausted. */
  readonly resetLine: string | null;
  /** A retry cooldown or status notice that must stay visible. */
  readonly notice: string | null;
  readonly miniRows: readonly ProviderLimitMiniRowVm[];
  readonly hiddenRowCount: number;
  /** One line: source and relative observation age, never raw ISO. */
  readonly sourceLine: string;
  readonly aged: boolean;
  /** Popover content; the only place absolute local times appear. */
  readonly details: readonly PtahDescriptionItem[];
  readonly action: PlanTileActionView | null;
}

export interface ProviderLimitChipVm {
  readonly key: string;
  readonly providerId: string;
  readonly label: string;
  readonly reason: string;
}

const STATE_TONES: Readonly<Partial<Record<PlanWindowState, PtahMeterTone>>> = {
  'limit-reached': 'err',
  'near-limit': 'warn',
  ok: 'accent',
};

const STATUS_TEXT: Readonly<Record<ProviderLimitCardState, string>> = {
  available: 'Available',
  'near-limit': 'Near limit',
  'limit-reached': 'Limit reached',
  aged: 'Aged',
  unknown: 'Unknown',
  'not-confirmed': 'Not confirmed',
  'estimate-only': 'Estimate only',
};

const STATUS_BADGES: Readonly<
  Record<ProviderLimitCardState, { tone: PtahBadgeTone; glyph: string | null }>
> = {
  'limit-reached': { tone: 'err', glyph: '⚠' },
  'near-limit': { tone: 'warn', glyph: '▲' },
  available: { tone: 'ok', glyph: '✓' },
  aged: { tone: 'neutral', glyph: null },
  unknown: { tone: 'neutral', glyph: null },
  'not-confirmed': { tone: 'neutral', glyph: null },
  'estimate-only': { tone: 'neutral', glyph: null },
};

/**
 * The card header's two parts from existing owner data: the bare owner
 * label as the title, and qualifiers, key suffix and plan as the account
 * line, so neither repeats the other.
 */
function titleParts(owner: PlanLimitOwnerSnapshot): {
  titleText: string;
  accountLine: string | null;
} {
  const { name, qualifier } = tileTitleLines(owner.owner.label);
  const parts = [
    qualifier,
    ownerKeySuffix(owner.owner.key),
    owner.account?.planType ?? null,
  ].filter((part): part is string => !!part);
  return {
    titleText: name,
    accountLine: parts.length ? parts.join(' · ') : null,
  };
}

function cardState(facts: WindowFacts | null): ProviderLimitCardState {
  if (facts === null) return 'unknown';
  switch (facts.state) {
    case 'limit-reached':
      return 'limit-reached';
    case 'near-limit':
      return 'near-limit';
    case 'ok':
      return 'available';
    case 'aged':
      return 'aged';
    case 'not-confirmed':
    case 'estimate-only':
      return facts.state;
    default:
      return 'unknown';
  }
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent));
}

function usablePercent(facts: WindowFacts): number | null {
  if (facts.state === 'reset-usage-unknown') return null;
  return facts.percent === undefined ? null : facts.percent;
}

function exhaustionReset(
  window: PlanLimitWindow,
  owner: PlanLimitOwnerSnapshot,
  now: number,
): number | undefined {
  return activeWindowExhaustion(window, now, {
    now,
    nearLimitPercent: NEAR_LIMIT_PERCENT,
    freshnessMs: FRESHNESS_MS,
    status: owner.status,
  })?.resetsAt;
}

function sourceLine(
  owner: PlanLimitOwnerSnapshot,
  now: number,
  aged: boolean,
): string {
  const source =
    owner.source === undefined
      ? 'Source unknown'
      : USAGE_SOURCE_LABELS[owner.source];
  const age =
    owner.readAt === undefined
      ? 'observation time unknown'
      : `observed ${formatElapsed(owner.readAt, now)}`;
  const line = `${source.charAt(0).toUpperCase()}${source.slice(1)} · ${age}`;
  return aged ? `${line} (aged)` : line;
}

function ringFor(
  facts: WindowFacts,
  state: ProviderLimitCardState,
  label: string,
  windowLabel: string,
): ProviderLimitRingVm | null {
  const percent = usablePercent(facts);
  if (percent === null) return null;
  const value = state === 'limit-reached' ? 100 : clampPercent(percent);
  const estimated =
    facts.state === 'estimate-only' || facts.estimateNote !== null;
  return {
    value,
    tone: STATE_TONES[facts.state] ?? 'neutral',
    centerText: `${estimated ? '~' : ''}${Math.round(value)}%`,
    label: `${label} ${windowLabel} used`,
    fadeArc: state === 'aged',
  };
}

function miniRow(
  window: PlanLimitWindow,
  facts: WindowFacts,
): ProviderLimitMiniRowVm {
  const percent = usablePercent(facts);
  const qualifier =
    facts.state === 'not-confirmed'
      ? 'Not confirmed: '
      : facts.state === 'estimate-only'
        ? 'Estimate only: '
        : '';
  return {
    key: window.key,
    label: window.label,
    percent: percent === null ? null : clampPercent(percent),
    valueText:
      qualifier +
      (percent === null ? facts.valueText : `${Math.round(percent)}%`),
    tone: STATE_TONES[facts.state] ?? 'neutral',
  };
}

function detailItems(
  owner: PlanLimitOwnerSnapshot,
  tile: PlanTileView,
  now: number,
  time: LocalTimeOptions,
): PtahDescriptionItem[] {
  const items: PtahDescriptionItem[] = [
    { key: 'account', term: 'Account', value: tile.label },
    {
      key: 'source',
      term: 'Source',
      value:
        owner.source === undefined
          ? 'Unknown'
          : USAGE_SOURCE_LABELS[owner.source],
    },
    {
      key: 'observed',
      term: 'Observed',
      value:
        owner.readAt === undefined
          ? 'Unknown'
          : formatLocalAbsolute(owner.readAt, now, time),
    },
  ];
  if (owner.account?.planType) {
    items.push({ key: 'plan', term: 'Plan', value: owner.account.planType });
  }
  for (const window of owner.windows) {
    const facts = windowFacts(window, owner, now, time);
    const prefix = `window:${window.key}`;
    items.push({ key: prefix, term: window.label, value: facts.valueText });
    items.push({
      key: `${prefix}:state`,
      term: `${window.label} status`,
      value: facts.state,
    });
    if (window.modelScope)
      items.push({
        key: `${prefix}:scope`,
        term: 'Model scope',
        value: window.modelScope,
      });
    items.push({
      key: `${prefix}:sources`,
      term: 'Reading sources',
      value: facts.sources.join(' | ') || 'Unknown',
    });
    if (facts.limitLine !== null)
      items.push({
        key: `${prefix}:limit`,
        term: 'Allowance',
        value: facts.limitLine,
      });
    for (const [index, resetLine] of facts.resetLines.entries()) {
      items.push({
        key: `${prefix}:reset-info:${index}`,
        term: 'Reset information',
        value: resetLine,
      });
    }
    const reset = exhaustionReset(window, owner, now) ?? window.resetsAt;
    if (reset !== undefined)
      items.push({
        key: `${prefix}:reset`,
        term: 'Resets',
        value: formatLocalAbsolute(reset, now, time),
      });
    for (const [index, note] of [facts.estimateNote, facts.note].entries()) {
      if (note !== null)
        items.push({
          key: `${prefix}:note:${index}`,
          term: 'Note',
          value: note,
        });
    }
  }
  for (const item of tile.accounting) {
    items.push({
      key: `accounting:${item.key}`,
      term: item.label,
      value: [item.valueText, ...item.provenance].join(' | '),
    });
  }
  for (const [index, model] of tile.modelUsage.entries()) {
    items.push({
      key: `model:${index}`,
      term: model.model,
      value: `${model.requests} requests`,
    });
  }
  for (const [index, evidence] of owner.ownerEvidence.entries()) {
    const notice = evidenceNotice(evidence, now, time, index);
    items.push({
      key: `evidence:${notice.key}`,
      term: 'Owner evidence',
      value: notice.title,
    });
  }
  if (tile.cooldown)
    items.push({ key: 'cooldown', term: 'Retry delay', value: tile.cooldown });
  if (tile.statusNotice)
    items.push({
      key: 'notice',
      term: 'Account notice',
      value: tile.statusNotice,
    });
  items.push({ key: 'status', term: 'Status', value: owner.status });
  return items;
}

function cardNotice(
  owner: PlanLimitOwnerSnapshot,
  tile: PlanTileView,
  now: number,
): string | null {
  const notices: string[] = [];
  if (owner.cooldown !== undefined && owner.cooldown.until > now) {
    notices.push(
      `Retrying ${formatRelative(owner.cooldown.until, now)} - a retry delay, not a plan reset`,
    );
  }
  if (owner.status === 'stale') {
    notices.push(
      `Showing cached account data; refresh failed${owner.staleSince === undefined ? '' : ` ${formatElapsed(owner.staleSince, now)}`}.`,
    );
  } else if (tile.statusNotice) notices.push(tile.statusNotice);
  for (const evidence of owner.ownerEvidence) {
    if (isActiveLimitEvidence(evidence, now)) {
      notices.push(
        `Limit hit${evidence.modelScope ? ` (${evidence.modelScope})` : ''} - window unknown`,
      );
    }
  }
  return notices.length ? notices.join(' | ') : null;
}

/** Accounting-only owners (no limit windows) show their first amount. */
function accountingText(
  accounting: readonly { readonly label: string; readonly valueText: string }[],
): string | null {
  const item = accounting[0];
  return item === undefined ? null : `${item.label}: ${item.valueText}`;
}

/** True when the owner has at least one window to show on a card. */
export function hasLimitReading(owner: PlanLimitOwnerSnapshot): boolean {
  return owner.windows.length > 0;
}

export function buildProviderLimitCard(
  owner: PlanLimitOwnerSnapshot,
  selected: boolean,
  now: number,
  time: LocalTimeOptions,
): ProviderLimitCardVm {
  const tile = buildPlanTile(owner, now, time);
  const ctx = {
    now,
    nearLimitPercent: NEAR_LIMIT_PERCENT,
    freshnessMs: FRESHNESS_MS,
    status: owner.status,
  };
  const states = new Map<string, PlanWindowState>(
    owner.windows.map((window) => [window.key, classifyWindow(window, ctx)]),
  );
  const primary =
    selectPrimary(owner.windows, states, now) ?? owner.windows[0] ?? null;
  const facts =
    primary === null ? null : windowFacts(primary, owner, now, time);
  const state = cardState(facts);
  const resetsAt =
    primary !== null && state === 'limit-reached'
      ? (exhaustionReset(primary, owner, now) ?? primary.resetsAt)
      : undefined;
  const resetLine =
    state !== 'limit-reached'
      ? null
      : resetsAt !== undefined && Number.isFinite(resetsAt) && resetsAt > now
        ? `Resets ${formatRelative(resetsAt, now)}`
        : 'Reset unknown';
  const secondary = owner.windows.filter((window) => window !== primary);
  const rows = secondary
    .slice(0, MAX_MINI_ROWS)
    .map((window) => miniRow(window, windowFacts(window, owner, now, time)));
  const ring =
    primary === null || facts === null
      ? null
      : ringFor(facts, state, tile.label, primary.label);
  const aged = state === 'aged' || owner.status === 'stale';
  const badge = STATUS_BADGES[state];
  return {
    key: tile.key,
    providerId: tile.providerId,
    label: tile.label,
    ...titleParts(owner),
    selected,
    state,
    statusText: STATUS_TEXT[state],
    statusTone: badge.tone,
    statusGlyph: badge.glyph,
    windowLabel: primary?.label ?? null,
    ring,
    primaryValueText:
      ring !== null
        ? null
        : facts !== null
          ? facts.valueText
          : accountingText(tile.accounting),
    resetLine,
    notice: cardNotice(owner, tile, now),
    miniRows: rows,
    hiddenRowCount: Math.max(0, secondary.length - rows.length),
    sourceLine: sourceLine(owner, now, aged),
    aged,
    details: detailItems(owner, tile, now, time),
    action: tile.action,
  };
}

export function buildProviderLimitChip(
  owner: PlanLimitOwnerSnapshot,
  now: number,
  time: LocalTimeOptions,
): ProviderLimitChipVm {
  const tile = buildPlanTile(owner, now, time);
  return {
    key: tile.key,
    providerId: tile.providerId,
    label: tile.label,
    reason: (
      tile.statusPill?.text ??
      tile.statusNotice ??
      'no usage source'
    ).toLowerCase(),
  };
}
