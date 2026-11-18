import type {
  PlanLimitOwnerSnapshot,
  PlanLimitWindow,
} from '@ptah-extension/shared';
export const NOW = Date.UTC(2026, 10, 18, 12);
export const TIME = { timeZone: 'UTC', zoneNameLocale: 'en-GB' };
export function windowFixture(
  overrides: Partial<PlanLimitWindow> = {},
): PlanLimitWindow {
  return {
    key: 'weekly',
    kind: 'weekly',
    label: 'Weekly',
    used: { kind: 'percent', percent: 94 },
    usedSource: 'provider-api',
    resetSource: 'provider-api',
    observedAt: NOW,
    lastResetAt: NOW - 60000,
    resetsAt: NOW + 3600000,
    ...overrides,
  };
}
export function ownerFixture(
  overrides: Partial<PlanLimitOwnerSnapshot> = {},
): PlanLimitOwnerSnapshot {
  return {
    owner: {
      key: 'account-one',
      providerId: 'anthropic',
      identityKind: 'account',
      label: 'Account',
    },
    status: 'available',
    windowSetEstablished: true,
    windows: [windowFixture()],
    ownerEvidence: [],
    ...overrides,
  };
}
