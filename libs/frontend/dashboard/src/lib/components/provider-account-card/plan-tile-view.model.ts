import { quotaWindowView } from './plan-window.model';
import { accountingViews } from './plan-accounting.model';
import {
  classifyWindow,
  formatLocalAbsolute,
  formatRelative,
  FRESHNESS_MS,
  NEAR_LIMIT_PERCENT,
  ownerDisplayLabel,
  LocalTimeOptions,
  PlanLimitOwnerSnapshot,
  PlanWindowState,
} from '@ptah-extension/shared';
import type { PlanTileView } from './plan-tile.types';
import { selectPrimary } from './plan-window.model';
import {
  USAGE_SOURCE_LABELS,
  tileTitleLines,
  subtitleFor,
  statusNoticeText,
  statusPill,
  tileAction,
  evidenceNotice,
} from './plan-owner.model';
export * from './plan-tile.types';
export { tileTitleLines } from './plan-owner.model';
export { compactCount, compactTokens } from './plan-accounting.model';

export function buildPlanTile(
  owner: PlanLimitOwnerSnapshot,
  now: number,
  time: LocalTimeOptions,
): PlanTileView {
  const states = new Map<string, PlanWindowState>();
  for (const window of owner.windows) {
    states.set(
      window.key,
      classifyWindow(window, {
        now,
        nearLimitPercent: NEAR_LIMIT_PERCENT,
        freshnessMs: FRESHNESS_MS,
        status: owner.status,
      }),
    );
  }
  const primary = selectPrimary(owner.windows, states, now);
  const hasData =
    owner.windows.length > 0 ||
    owner.ownerEvidence.length > 0 ||
    owner.localUsage !== undefined;
  const notice = statusNoticeText(owner, hasData, now, time);
  const label = ownerDisplayLabel(owner.owner);
  const title = tileTitleLines(label);
  const subtitle = subtitleFor(owner);
  const badge = owner.account?.planType ?? null;

  const pill = primary === null
    ? statusPill(owner, owner.windows.length > 0, hasData, notice)
    : null;
  const statusNotice =
    notice?.text === pill?.text ? null : (notice?.text ?? null);
  const evidence = owner.ownerEvidence.map((e, index) =>
    evidenceNotice(e, now, time, index),
  );
  if (evidence.length > 2) {
    const hiddenEvidence = evidence.splice(2);
    evidence.push({
      key: '__more-evidence',
      text: `+${hiddenEvidence.length} more`,
      tone: 'neutral',
      title: hiddenEvidence.map((item) => item.title).join('\n'),
    });
  }
  return {
    primaryWindow:
      primary === null ? null : quotaWindowView(primary, owner, now, time),
    secondaryWindows: owner.windows
      .filter((window) => window !== primary)
      .map((window) => quotaWindowView(window, owner, now, time)),
    accounting: accountingViews(owner, now, time),
    modelUsage: owner.localUsage?.models ?? [],
    identity: subtitle,
    provenance: [
      owner.source === undefined
        ? 'Source unknown'
        : USAGE_SOURCE_LABELS[owner.source],
      owner.readAt === undefined
        ? 'Observation time unknown'
        : `Observed ${formatLocalAbsolute(owner.readAt, now, time)} (${formatRelative(owner.readAt, now)})`,
    ],
    key: owner.owner.key,
    providerId: owner.owner.providerId,
    label,
    titleName: title.name,
    titleQualifier: title.qualifier,
    planBadge: badge,
    statusPill: pill,
    statusNotice,
    action: tileAction(owner, hasData),
    evidence,
    cooldown:
      owner.cooldown !== undefined && owner.cooldown.until > now
        ? `Retrying after ${formatLocalAbsolute(owner.cooldown.until, now, time)} (${formatRelative(owner.cooldown.until, now)}) · a retry delay, not a plan reset`
        : null,
  };
}
