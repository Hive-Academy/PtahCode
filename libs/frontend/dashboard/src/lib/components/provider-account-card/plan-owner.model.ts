import {
  formatLocalAbsolute,
  isActiveLimitEvidence,
  PLAN_LIMIT_SOURCE_LABELS,
  LocalTimeOptions,
  OwnerLimitEvidence,
  PlanLimitOwnerSnapshot,
  PlanLimitStatusReason,
  PlanLimitUnavailableReason,
  ProviderAccountUsageStatus,
  UsageSourceLabel,
} from '@ptah-extension/shared';
import type {
  Tone,
  PlanTileStatusPillView,
  PlanTileNoticeView,
  PlanTileActionView,
} from './plan-tile.types';
import { resetPhrase } from './plan-window.model';

export const USAGE_SOURCE_LABELS: Readonly<Record<UsageSourceLabel, string>> = {
  'provider-api': 'provider API',
  'cli-command': 'CLI command',
  'local-state': 'local state',
  'session-sdk': 'session SDK',
  'local-rpc': 'local RPC',
};

/** One sentence per failure status (design §4); `stale` has its own notice. */
export const STATUS_SENTENCES: Partial<
  Record<ProviderAccountUsageStatus, string>
> = {
  'unsupported-auth':
    'No plan windows: this account signs in with an API key, which has no subscription limits.',
  'unsupported-config':
    'Usage cannot be read: the provider is not configured for a usage read.',
  'provider-unsupported':
    'Usage cannot be read: this provider has no usage source.',
  'cli-unavailable': 'Usage cannot be read: the provider CLI was not found.',
  'cli-version-unsupported':
    'Usage cannot be read: the installed provider CLI version does not report usage.',
  'service-unavailable':
    'Usage unavailable: the provider’s usage service did not return a readable response. No values are shown.',
};

/**
 * Plain action text for one typed status reason — the single map the tile
 * asks; the backend extends only data, never UI. One entry for every
 * `PlanLimitStatusReason` in the shared DTO, so a new reason fails to
 * compile here until it gets its sentence.
 */
export const PLAN_LIMIT_REASON_LABELS: Readonly<
  Record<PlanLimitStatusReason, string>
> = {
  'no-oauth': 'Not signed in to Antigravity (OAuth)',
  'no-local-server': 'Antigravity app is not running',
  'cli-unavailable': 'Antigravity CLI usage unavailable',
  'cli-not-found': 'Antigravity CLI (agy) not found',
  'cli-timeout': 'Antigravity CLI did not respond in time',
  'cli-not-signed-in': 'Sign in to the Antigravity CLI (run agy once)',
  'cli-exit-error': 'Antigravity CLI exited with an error',
  'cli-parse-failed': 'Antigravity CLI usage output not recognized',
  'cli-backoff': 'Antigravity CLI usage read paused after a failure',
  'usage-budget-exhausted': 'Usage read did not finish in time',
  'account-unverified':
    'Antigravity CLI account could not be matched to this account',
  'api-key-no-subscription-quota':
    'No subscription quota for API-key login; local usage only',
  'balance-unavailable':
    'Plan limits unavailable right now; showing request counts',
  'prepaid-balance-unavailable': 'Prepaid balance unavailable right now',
  'balance-auth-rejected':
    'API key cannot read plan limits; showing request counts',
  'usage-auth-rejected': 'API key cannot read request counts',
};

/** The one route-level unavailable reason: no session to read from. */
export const NO_OPEN_SESSION_LABEL =
  'No open session to read this account’s usage from.';

/**
 * The label for a typed reason, or `null` when the reason is not known.
 * Covers `PlanLimitStatusReason` and `PlanLimitUnavailableReason`; a runtime
 * value the map does not know falls back to `null`, never to a fabricated
 * sentence.
 */
export function planLimitReasonLabel(
  reason: PlanLimitStatusReason | PlanLimitUnavailableReason | undefined,
): string | null {
  if (reason === undefined) return null;
  if (reason === 'no-open-session') return NO_OPEN_SESSION_LABEL;
  return Object.hasOwn(PLAN_LIMIT_REASON_LABELS, reason)
    ? PLAN_LIMIT_REASON_LABELS[reason]
    : null;
}

/**
 * The header's two lines: the name with the
 * key suffix on line 1, the label's parenthesized qualifiers ("(owner
 * unknown)", "(key unavailable)") on a smaller muted second line, so the
 * meaningful part is never truncated away. A label without parentheses has
 * one line and `null` qualifiers. Whitespace the removal leaves behind is
 * collapsed away.
 */
export function tileTitleLines(label: string): {
  name: string;
  qualifier: string | null;
} {
  const qualifierParts = label.match(/\([^()]*\)/g);
  if (qualifierParts === null) return { name: label, qualifier: null };
  const name = label
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, qualifier: qualifierParts.join(' ') };
}
export function subtitleFor(owner: PlanLimitOwnerSnapshot): string {
  if (owner.owner.identityKind === 'unknown') {
    const reasons: Record<string, string> = {
      'missing-account-email': 'Signed in · account email not shared',
      'codex-not-read': 'Account not read yet',
      'unrouted-daemon': 'Local Ollama daemon',
      'missing-api-key': 'No API key configured',
      'unresolved-route': 'Account identity unavailable',
    };
    return reasons[owner.unknownReason ?? ''] ?? 'Account identity unavailable';
  }
  const base =
    owner.activity !== undefined
      ? 'Subscription quota and account activity'
      : 'Subscription quota';
  const plan = owner.account?.planType;
  return plan ? `${base} · Plan: ${plan}` : base;
}

export function statusNoticeText(
  owner: PlanLimitOwnerSnapshot,
  hasData: boolean,
  now: number,
  time: LocalTimeOptions,
): { text: string; tone: Tone } | null {
  if (owner.status === 'stale') {
    const when =
      owner.staleSince !== undefined
        ? ` at ${formatLocalAbsolute(owner.staleSince, now, time)}`
        : '';
    return {
      text: `Showing cached account data; refresh failed${when}.`,
      tone: 'warning',
    };
  }
  // A typed statusReason beats every generic per-provider sentence for a
  // window-less owner (review defect 3): "Antigravity CLI usage output not
  // recognized" names the cause; "Open Antigravity" is only the fallback.
  const reason = planLimitReasonLabel(owner.statusReason);
  if (reason !== null) return { text: reason, tone: 'neutral' };
  const text =
    owner.status === 'service-unavailable'
      ? serviceUnavailableText(owner, hasData)
      : null;
  if (text !== null) return { text, tone: 'neutral' };
  if (
    owner.status === 'no-usage-source' &&
    owner.localUsage &&
    owner.windows.length === 0 &&
    owner.ownerEvidence.length === 0
  ) {
    return { text: 'Local usage only', tone: 'neutral' };
  }
  if (hasData) return null;
  const noDataText = noDataStatusText(owner);
  return noDataText === undefined
    ? null
    : { text: noDataText, tone: 'neutral' };
}

/**
 * A ledger-only owner arrives as `service-unavailable` (no live read was
 * made): its recorded evidence is past evidence, not a read failure.
 */
export function serviceUnavailableText(
  owner: PlanLimitOwnerSnapshot,
  hasData: boolean,
): string | null {
  if (owner.unavailableReason === 'no-open-session') {
    return hasData
      ? 'No open session to read this account’s usage from; showing the last recorded limit evidence.'
      : 'No open session to read this account’s usage from.';
  }
  if (hasData) {
    return 'No live usage read; showing the last recorded limit evidence.';
  }
  // Fallback only: a typed statusReason has already won (statusNoticeText).
  if (owner.owner.providerId === 'antigravity') {
    return 'Open Antigravity to read local quota';
  }
  return null;
}

/** The tile's sentence for an owner with no windows, evidence or local usage. */
export function noDataStatusText(
  owner: PlanLimitOwnerSnapshot,
): string | undefined {
  const providerId = owner.owner.providerId;
  switch (owner.status) {
    case 'available':
      return 'No plan limits reported';
    case 'unsupported-auth':
      if (providerId === 'ollama-cloud') {
        return 'API key rejected — check the key';
      }
      // The Antigravity keyring login was refused by Google (revoked or
      // expired): an authentication problem, not a missing local app.
      if (providerId === 'antigravity') {
        return 'Antigravity sign-in rejected — sign in to Antigravity again';
      }
      // OpenCode's stored login was rejected (401) or has expired.
      if (providerId === 'opencode') {
        return 'OpenCode sign-in expired — sign in to OpenCode again';
      }
      return 'No plan limits (API key)';
    case 'unsupported-config':
      if (providerId === 'ollama-cloud') return 'No API key configured';
      break;
    case 'no-usage-source':
      return providerId === 'opencode'
        ? 'Sign in to OpenCode Go'
        : 'No usage source available';
  }
  return STATUS_SENTENCES[owner.status];
}

/**
 * The status pill that reserves the bar slot: the precise cause of the
 * missing bar. Windows that exist but are ineligible name that fact; an
 * owner without windows names its typed reason first, then its status
 * notice or sentence.
 */
export function statusPill(
  owner: PlanLimitOwnerSnapshot,
  windowsExist: boolean,
  hasData: boolean,
  notice: { text: string; tone: Tone } | null,
): PlanTileStatusPillView {
  if (windowsExist) {
    return {
      text: 'No plan window reports a known usage with a future reset',
      tone: pillTone(owner.status, notice),
    };
  }
  // A typed statusReason wins for every provider (review defect 3); the
  // notice and the per-status sentences are only fallbacks.
  const text =
    planLimitReasonLabel(owner.statusReason) ??
    notice?.text ??
    noDataStatusText(owner) ??
    planLimitReasonLabel(owner.unavailableReason) ??
    'Usage unavailable';
  return { text, tone: pillTone(owner.status, notice) };
}

export function pillTone(
  status: ProviderAccountUsageStatus,
  notice: { tone: Tone } | null,
): Tone {
  if (notice && notice.tone !== 'info') return notice.tone;
  if (
    status === 'stale' ||
    status === 'cli-unavailable' ||
    status === 'cli-version-unsupported'
  ) {
    return 'warning';
  }
  return 'neutral';
}

/**
 * One inline action, wired only to navigation that already exists in the
 * webview: "Go to chat" for the no-open-session reason, "Add key" for
 * Ollama Cloud's missing key. Reasons without an existing handler stay
 * without an action.
 */
export function tileAction(
  owner: PlanLimitOwnerSnapshot,
  hasData: boolean,
): PlanTileActionView | null {
  if (owner.windows.length > 0) return null;
  if (
    owner.status === 'service-unavailable' &&
    owner.unavailableReason === 'no-open-session'
  ) {
    return {
      kind: 'open-session',
      label: 'Go to chat',
      providerId: owner.owner.providerId,
    };
  }
  if (
    !hasData &&
    owner.status === 'unsupported-config' &&
    owner.owner.providerId === 'ollama-cloud'
  ) {
    return {
      kind: 'add-key',
      label: 'Add key',
      providerId: owner.owner.providerId,
    };
  }
  return null;
}

export function evidenceNotice(
  evidence: OwnerLimitEvidence,
  now: number,
  time: LocalTimeOptions,
  index: number,
): PlanTileNoticeView {
  const key = `${evidence.source}:${evidence.observedAt}:${index}`;
  const scope = evidence.modelScope ? ` (${evidence.modelScope})` : '';
  const hit = formatLocalAbsolute(evidence.observedAt, now, time);
  const source = PLAN_LIMIT_SOURCE_LABELS[evidence.source];
  if (evidence.source === 'estimated') {
    const text = `Estimated limit hit${scope} ${hit} (unconfirmed, informational) · window unknown · ${resetPhrase(evidence.resetsAt, now, time)}`;
    return { key, text, tone: 'neutral', title: `${text} · Source: ${source}` };
  }
  if (isActiveLimitEvidence(evidence, now)) {
    const text = `Limit hit${scope} ${hit} · window unknown · ${resetPhrase(evidence.resetsAt, now, time)}`;
    return { key, text, tone: 'warning', title: `${text} · Source: ${source}` };
  }
  // Expired: only evidence with a known, passed reset reaches here.
  const text = `Limit hit${scope} ${hit} · window unknown · ${resetPhrase(evidence.resetsAt, now, time)} · expired`;
  return { key, text, tone: 'neutral', title: `${text} · Source: ${source}` };
}
