import {
  activeWindowExhaustion,
  activeEstimatedExhaustion,
  isActiveLimitEvidence,
  planOwnerProviderId,
  usedPercent,
  type PlanLimitOwnerSnapshot,
  type LocalTimeOptions,
} from '@ptah-extension/shared';
import { type PlanTileView, buildPlanTile } from './plan-tile-view.model';
export interface GroupedProviderAccount {
  readonly owner: PlanLimitOwnerSnapshot;
  readonly view: PlanTileView;
  readonly isSelectedProvider: boolean;
  readonly group: 'selected' | 'other' | 'withoutReadings';
  readonly groupingReason: string;
}
export function groupProviderAccounts(
  owners: readonly PlanLimitOwnerSnapshot[],
  activeProviderId: string,
  now: number,
  time: LocalTimeOptions,
) {
  // The chat provider id names a runtime (`antigravity-cli`); its plan owners
  // carry the provider-session profile (`antigravity`).
  const selectedOwnerId = planOwnerProviderId(activeProviderId);
  const seen = new Set<string>();
  const records = owners
    .filter((owner) => {
      if (seen.has(owner.owner.key)) return false;
      seen.add(owner.owner.key);
      return true;
    })
    .map<GroupedProviderAccount>((owner) => {
      const view = buildPlanTile(owner, now, time);
      const isSelectedProvider = owner.owner.providerId === selectedOwnerId;
      const hasReading =
        owner.windows.some(
          (window) =>
            usedPercent(window.used) !== undefined ||
            (window.used?.kind === 'amount' && Number.isFinite(window.used.amount)) ||
            activeWindowExhaustion(window, now) !== undefined ||
            activeEstimatedExhaustion(window, now) !== undefined,
        ) ||
        view.accounting.length > 0 ||
        owner.ownerEvidence.some((evidence) =>
          isActiveLimitEvidence(evidence, now),
        ) ||
        (owner.cooldown?.until ?? 0) > now;
      const group = isSelectedProvider
        ? 'selected'
        : hasReading
          ? 'other'
          : 'withoutReadings';
      return {
        owner,
        view,
        isSelectedProvider,
        group,
        groupingReason: isSelectedProvider
          ? 'Selected for chat'
          : hasReading
            ? 'Reported usage or active evidence'
            : 'Without usage readings',
      };
    });
  return {
    selected: records.filter((record) => record.group === 'selected'),
    other: records.filter((record) => record.group === 'other'),
    withoutReadings: records.filter(
      (record) => record.group === 'withoutReadings',
    ),
  };
}
