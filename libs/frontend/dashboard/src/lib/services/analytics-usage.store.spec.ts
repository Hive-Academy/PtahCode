import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  AppStateManager,
  ClaudeRpcService,
  RpcResult,
} from '@ptah-extension/core';
import { AnalyticsUsageStore } from './analytics-usage.store';
import {
  FakeRpc,
  answerUsage,
  flush,
  usageFact,
  usageSummary as rawUsageSummary,
  type RecordedCall,
} from './dashboard-rpc.testing';

const usageSummary: typeof rawUsageSummary = (facts, options = {}) => rawUsageSummary(facts, {
  ...options,
  sources: options.sources ?? [{ sourceId: 'claude-ledger', status: 'complete', coverageStart: '2026-01-01' }],
});

describe('AnalyticsUsageStore previous-period deltas', () => {
  let rpc: FakeRpc;
  let store: AnalyticsUsageStore;

  beforeEach(() => {
    rpc = new FakeRpc();
    TestBed.configureTestingModule({
      providers: [
        { provide: ClaudeRpcService, useValue: rpc },
        {
          provide: AppStateManager,
          useValue: { workspaceInfo: signal({ path: '/ws/a' }) },
        },
      ],
    });
    store = TestBed.inject(AnalyticsUsageStore);
  });

  const callFor = (range: number): RecordedCall | undefined =>
    rpc
      .of('analytics:spendSummary')
      .filter((c) => (c.params as { range: number }).range === range)
      .at(-1);

  const current30 = usageSummary(
    [usageFact({ day: '2026-10-18', costUsd: 3, outputTokens: 150 })],
    { range: 30 },
  );
  // previous 30 days of 2026-09-21 .. 2026-10-20 start at 2026-08-22.
  const wider90 = usageSummary(
    [usageFact({ day: '2026-09-01', costUsd: 2, outputTokens: 25 })],
    { range: 90 },
  );

  it('requests the next wider range in parallel and exposes the deltas', async () => {
    void store.load();
    expect(rpc.of('analytics:spendSummary')).toHaveLength(2);
    const main = callFor(30);
    const wider = callFor(90);
    expect(main && wider).toBeTruthy();
    if (!main || !wider) return;
    expect(wider.params).toEqual({ range: 90, workspace: '/ws/a' });
    answerUsage(main, current30);
    answerUsage(wider, wider90);
    await flush();
    expect(store.previousPeriod()?.fromDay).toBe('2026-08-22');
    expect(store.previousPeriod()?.facts).toHaveLength(1);
    expect(store.kpiDeltas().spend).toBeCloseTo(0.5);
    expect(store.kpiDeltas().tokens).toBeCloseTo(1);
  });

  it('keeps the summary and no loadError when the wider request fails', async () => {
    void store.load();
    const main = callFor(30);
    const wider = callFor(90);
    if (!main || !wider) throw new Error('missing calls');
    wider.reply.resolve(new RpcResult<never>(false, undefined, 'boom'));
    answerUsage(main, current30);
    await flush();
    expect(store.summary()).toEqual(current30);
    expect(store.loadError()).toBeNull();
    expect(store.previousPeriod()).toBeNull();
    expect(store.kpiDeltas()).toEqual({ spend: null, tokens: null });
  });

  it('makes one request and null deltas for the 90-day range', async () => {
    store.setRange(90);
    expect(rpc.of('analytics:spendSummary')).toHaveLength(1);
    const main = callFor(90);
    if (!main) throw new Error('missing call');
    answerUsage(main, usageSummary([usageFact()], { range: 90 }));
    await flush();
    expect(store.kpiDeltas()).toEqual({ spend: null, tokens: null });
  });

  it('ignores a wider answer from a superseded load', async () => {
    void store.load();
    const staleWider = callFor(90);
    store.setRange(7);
    if (!staleWider) throw new Error('missing call');
    answerUsage(staleWider, wider90);
    await flush();
    expect(store.previousPeriod()).toBeNull();
  });
  it.each(['main-first', 'wider-first', 'wider-fails', 'main-fails'] as const)(
    'refresh never mixes generations: %s', async (order) => {
      void store.load();
      const initialMain = callFor(30);
      const initialWider = callFor(90);
      if (!initialMain || !initialWider) throw new Error('missing initial calls');
      answerUsage(initialMain, current30);
      answerUsage(initialWider, wider90);
      await flush();
      expect(store.kpiDeltas().spend).toBeCloseTo(0.5);
      store.refresh();
      expect(store.previousPeriod()).toBeNull();
      const main = callFor(30);
      const wider = callFor(90);
      if (!main || !wider) throw new Error('missing refresh calls');
      const updated = { ...current30, facts: [usageFact({ costUsd: 8 })] };
      const denominator = { ...wider90, facts: [usageFact({ day: '2026-09-01', costUsd: 4 })] };
      if (order === 'wider-first' || order === 'main-fails') {
        answerUsage(wider, denominator);
        await flush();
        expect(store.previousPeriod()).toBeNull();
        if (order === 'main-fails') main.reply.resolve(new RpcResult<never>(false, undefined, 'failed'));
        else answerUsage(main, updated);
      } else {
        answerUsage(main, updated);
        await flush();
        expect(store.previousPeriod()).toBeNull();
        if (order === 'wider-fails') wider.reply.resolve(new RpcResult<never>(false, undefined, 'failed'));
        else answerUsage(wider, denominator);
      }
      await flush();
      if (order.endsWith('fails')) expect(store.kpiDeltas()).toEqual({ spend: null, tokens: null });
      else expect(store.kpiDeltas().spend).toBe(1);
    },
  );

});
