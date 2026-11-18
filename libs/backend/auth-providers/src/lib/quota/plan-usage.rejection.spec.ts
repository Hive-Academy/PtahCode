import 'reflect-metadata';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import { PlanUsageService } from './plan-usage.service';
import { cliStoreOwnerKey, quotaOwnerRefFromKey } from './provider-owner.resolver';
import type { PlanUsageReader, PlanUsageReading } from './readers/plan-usage-reader.types';

it('preserves the current Grok rejection reason on stale measurements without caching it', async () => {
  const window = { key: 'weekly' as const, kind: 'weekly' as const, label: 'Weekly',
    used: { kind: 'percent' as const, percent: 20 }, usedSource: 'provider-api' as const, observedAt: 1 };
  const read = jest.fn<ReturnType<PlanUsageReader>, Parameters<PlanUsageReader>>()
    .mockResolvedValue({ status: 'available', windowSetEstablished: true, windows: [window], fetchedAt: 1 });
  const target = { providerId: 'grok', ownerRef: quotaOwnerRefFromKey(cliStoreOwnerKey('grok', '/fixture')) };
  const service = new PlanUsageService(createMockLogger() as Partial<Logger> as Logger,
    { snapshotFor: () => ({ owner: target.ownerRef, windows: [window], ownerEvidence: [] }), recordWindowEvidence: jest.fn(), recordOwnerEvidence: jest.fn(),
      clearProviderOwnerEvidence: jest.fn(), clearOwnerEvidenceByPattern: jest.fn(), removeProviderWindowEvidence: jest.fn() },
    { resolve: jest.fn() }, { readPlanUsage: jest.fn() }, { getAccountUsage: jest.fn() }, () => 1);
  const readers: Record<string, PlanUsageReader> = Reflect.get(service, 'readers');
  readers['grok'] = read;
  await service.getOwnerSnapshot(target);
  const rejection: PlanUsageReading = { status: 'service-unavailable', statusReason: 'balance-unavailable',
    windowSetEstablished: false, windows: [] };
  read.mockResolvedValue(rejection);
  const stale = await service.getOwnerSnapshot(target, { refresh: true });
  expect(stale).toMatchObject({ status: 'stale', statusReason: 'balance-unavailable', fetchedAt: 1,
    windows: [expect.objectContaining({ observedAt: 1, used: { kind: 'percent', percent: 20 } })] });
  expect(await service.getOwnerSnapshot(target)).toMatchObject({ status: 'available', windows: [window] });
  expect((await service.getOwnerSnapshot(target)).statusReason).toBeUndefined();
});
