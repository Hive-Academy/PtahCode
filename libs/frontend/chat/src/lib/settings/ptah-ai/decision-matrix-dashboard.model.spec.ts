import { dashboardModel, percent } from './decision-matrix-dashboard.model';
import { evidence, evidenceKey, evidenceLane, funnel, ratings } from './decision-matrix-dashboard.fixtures';

describe('decision matrix dashboard aggregation', () => {
  it('uses wildcard effort counts once and preserves measured and rating values', () => {
    const dashboard = dashboardModel(evidence, ratings);
    expect(dashboard.funnel.spawned).toBe(20);
    expect(dashboard.pipeline.map(({ value, drop }) => [value, drop])).toEqual([
      [20, null], [18, 2], [14, 4], [12, 2], [8, 4],
    ]);
    expect(dashboard.kpis.map(({ value, max }) => [value, max])).toEqual([
      [8, 12], [14, 20], [2, 12], [2, 2],
    ]);
    expect(dashboard.lostTotal).toBe(6);
    expect(dashboard.mix.map(({ segments, approval }) => ({
      runs: segments.reduce((total, segment) => total + segment.value, 0), approval,
    }))).toEqual([{ runs: 10, approval: 40 }, { runs: 10, approval: 40 }]);
    expect(dashboard.workloads.map(({ share }) => share)).toEqual([50, 50]);
    const measured = dashboard.rows[0].measured.get('implement');
    expect(measured?.efforts.map(({ label, value }) => [label, value])).toEqual([
      ['high', 7], ['No tracked effort', 3],
    ]);
    expect(measured?.other).toContainEqual({ label: 'Effort not sent', value: 3 });
    expect(dashboard.rows[0].ratings.get('implement')?.sourceRef).toBe('benchmark-v2');
    expect(dashboard.picks.find(({ task }) => task === 'implement')).toMatchObject({
      winner: { laneId: 'alpha', score: 80 }, runnerUp: { laneId: 'beta', score: 75 }, close: true,
    });
    expect(dashboard.picks.find(({ task }) => task === 'docs')?.winner).toBeNull();
  });

  it('uses concrete effort counts when the wildcard is missing without averaging scores', () => {
    const keys = [
      { ...evidenceKey, effort: 'high' },
      { ...evidenceKey, effort: 'low', score: 12, asOf: '2026-11-10', funnel: { ...funnel, spawned: 0 } },
    ];
    const dashboard = dashboardModel({ ...evidence, lanes: [evidenceLane('alpha', keys)] }, null);
    const cell = dashboard.rows[0].measured.get('implement');
    expect(cell?.score).toBeNull();
    expect(cell?.sampleCount).toBe(12);
    expect(cell?.funnel.spawned).toBe(10);
    expect(cell?.stale).toBe(true);
    expect(cell?.asOf).toBe('2026-11-10');
    expect(cell?.efforts).toEqual([
      expect.objectContaining({ label: 'high', value: 10, score: 80, stale: true }),
      expect.objectContaining({ label: 'low', value: 0, score: 12, stale: true }),
    ]);
  });

  it('uses exact lane totals when defaults overlap resolved models and lanes share a family', () => {
    const alpha = evidence.lanes[0];
    const named = alpha.models[0];
    const shared = {
      ...alpha,
      models: [
        { ...named, model: '*', inCatalog: false },
        { ...named, model: 'retired', inCatalog: false },
        named,
        { ...named, model: 'unused', keys: [] },
      ],
    };
    const dashboard = dashboardModel({
      ...evidence,
      lanes: [shared, { ...shared, laneId: 'second-alpha' }],
      laneFunnels: [
        { laneId: 'alpha', family: 'alpha', funnel },
        { laneId: 'second-alpha', family: 'alpha', funnel },
      ],
    }, null);
    expect(dashboard.funnel.spawned).toBe(20);
    expect(dashboard.mix.map(({ laneId, approval }) => [laneId, approval]))
      .toEqual([['alpha', 40], ['second-alpha', 40]]);
    expect(dashboard.workloads.map(({ laneId, value }) => [laneId, value]))
      .toEqual([['alpha', 10], ['second-alpha', 10]]);
    expect(dashboard.measuredRows.some(({ model }) => model === 'unused')).toBe(false);
    expect(dashboard.kpis[2].max).toBe(48);
    expect(dashboard.picks.find(({ task }) => task === 'implement')?.winner?.model).toBe('model-a');
  });

  it('clamps chart shares and only shows positive drops between pipeline stages', () => {
    const counts = { ...funnel, spawned: 2, completed: 2, delivered: 2, reviewed: 3, approved: 3, failed: 5 };
    const dashboard = dashboardModel({
      ...evidence,
      laneFunnels: [{ laneId: 'alpha', family: 'alpha', funnel: counts }],
    }, null);
    expect(dashboard.pipeline.map(({ drop }) => drop)).toEqual([null, null, null, null, null]);
    expect(dashboard.lostShare).toBe(100);
    expect(dashboard.mix[0].approval).toBe(100);
    expect(dashboard.mix[0].segments.find(({ label }) => label === 'Awaiting review')?.value).toBe(0);
    expect(percent(-1, 2)).toBe(0);
    expect(percent(Number.NaN, 2)).toBeNull();
    expect(percent(1, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('keeps empty denominators unavailable', () => {
    const dashboard = dashboardModel(null, ratings);
    expect(dashboard.kpis.every(({ max }) => percent(0, max) === null)).toBe(true);
    expect(dashboard.workloads).toEqual([]);
    expect(dashboard.rows[0].laneId).toBeNull();
  });
});
