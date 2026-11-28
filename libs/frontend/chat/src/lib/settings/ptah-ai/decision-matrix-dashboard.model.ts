import {
  OUTCOME_TASK_KINDS,
  type AgentCapabilityMatrixValueCell,
  type AgentGetCapabilityMatrixResult,
  type AgentGetRoutingEvidenceResult,
  type AgentRoutingEvidenceKey,
  type AgentRoutingEvidenceLane,
  type AgentRoutingEvidenceModel,
  type AgentRoutingFunnel,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import type { PtahChartSegment } from '@ptah-extension/ui';

const ZERO: AgentRoutingFunnel = {
  spawned: 0, completed: 0, delivered: 0, reviewed: 0, approved: 0,
  capacityDropped: 0, failed: 0, noDeliverable: 0, rejected: 0,
  unverified: 0, unresolvedRevise: 0, reviseRounds: 0,
};
const stages = [
  ['spawned', 'Spawned'], ['completed', 'Completed'], ['delivered', 'Delivered'],
  ['reviewed', 'Reviewed'], ['approved', 'Approved'],
] as const;
const palette = [
  'var(--ptah-gold)', 'var(--ptah-state-info, oklch(var(--in)))', 'var(--ptah-chart-warn)',
  'var(--ptah-state-ok)', 'var(--ptah-state-err)',
] as const;
const outcomes = [
  ['approved', 'Approved', 'var(--ptah-state-ok)'],
  ['failed', 'Failed', 'var(--ptah-state-err)'],
  ['noDeliverable', 'No deliverable', 'var(--ptah-chart-warn)'],
  ['rejected', 'Rejected', 'var(--ptah-gold)'],
  ['unverified', 'Unverified', 'var(--ptah-series-other)'],
] as const;
const catalogLabels = {
  ok: 'Ready', timeout: 'Timed out', error: 'Failed', empty: 'Empty', never: 'Never fetched',
} satisfies Record<AgentRoutingEvidenceLane['catalog']['status'], string>;

// The routing engine uses the same 5-point band, on its additive ranking totals.
const ROTATION_MARGIN = 5;

export interface DashboardRow {
  readonly id: string;
  readonly laneId: string | null;
  readonly family: string;
  readonly model: string;
  readonly inCatalog: boolean | null;
  readonly effortSupport: AgentRoutingEvidenceModel['efforts'] | null;
  readonly measured: ReadonlyMap<OutcomeTaskKind, MeasuredCell>;
  readonly ratings: ReadonlyMap<OutcomeTaskKind, AgentCapabilityMatrixValueCell>;
}

function sumFunnels(funnels: readonly AgentRoutingFunnel[]): AgentRoutingFunnel {
  const total = { ...ZERO };
  for (const funnel of funnels) {
    for (const field of Object.keys(ZERO) as (keyof AgentRoutingFunnel)[]) {
      total[field] += funnel[field];
    }
  }
  return total;
}

function boundedPercent(value: number, total: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, value / total * 100));
}

export function percent(value: number, total: number): number | null {
  const share = boundedPercent(value, total);
  return share === null ? null : Math.round(share);
}

function pipeline(funnel: AgentRoutingFunnel) {
  return stages.map(([field, label], index) => {
    const delta = index === 0 ? 0 : funnel[stages[index - 1][0]] - funnel[field];
    return { label, value: funnel[field], drop: delta > 0 ? delta : null };
  });
}

function segmentsFor(funnel: AgentRoutingFunnel): PtahChartSegment[] {
  return [
    ...outcomes.map(([field, label, color]) => ({ label, color, value: funnel[field] })),
    { label: 'Capacity drop-outs', color: 'var(--ptah-state-info, oklch(var(--in)))', value: funnel.capacityDropped },
    { label: 'Unresolved revisions', color: 'var(--ptah-series-4)', value: funnel.unresolvedRevise },
    { label: 'Awaiting review', color: 'var(--ptah-series-3)', value: Math.max(0, funnel.delivered - funnel.reviewed) },
  ];
}

function otherOutcomes(funnel: AgentRoutingFunnel) {
  return [
    { label: 'Failed', value: funnel.failed },
    { label: 'No deliverable', value: funnel.noDeliverable },
    { label: 'Rejected', value: funnel.rejected },
    { label: 'Unverified', value: funnel.unverified },
    { label: 'Unresolved revisions', value: funnel.unresolvedRevise },
    { label: 'Revision rounds', value: funnel.reviseRounds },
    { label: 'Capacity drop-outs', value: funnel.capacityDropped },
  ];
}

function measuredCell(keys: readonly AgentRoutingEvidenceKey[], task: OutcomeTaskKind) {
  const entries = keys.filter((key) => key.taskKind === task);
  const observed = entries.filter((key) => key.funnel.spawned > 0 || key.sampleCount > 0);
  const specific = observed.filter((key) => key.effort !== '*');
  const wildcard = observed.find((key) => key.effort === '*');
  const counts = wildcard ? [wildcard] : specific;
  const scored = wildcard ?? (specific.length === 1 ? specific[0] : undefined);
  const funnel = sumFunnels(counts.map((key) => key.funnel));
  if (!funnel.spawned && !counts.some((key) => key.sampleCount > 0)) return null;
  const efforts = specific.map<PtahChartSegment & { score: number | null; stale: boolean }>((key, index) => ({
    label: key.effort, value: key.funnel.spawned, color: palette[index % palette.length],
    score: key.score, stale: key.stale,
  }));
  const unbucketed = funnel.spawned - efforts.reduce((total, effort) => total + effort.value, 0);
  if (efforts.length && unbucketed > 0) {
    efforts.push({ label: 'No tracked effort', value: unbucketed, color: 'var(--ptah-series-other)', score: null, stale: false });
  }
  return {
    score: scored?.score ?? null,
    sampleCount: counts.reduce((total, key) => total + key.sampleCount, 0),
    stale: scored ? scored.stale : counts.some((key) => key.stale),
    asOf: scored ? scored.asOf : counts.reduce<string | null>((latest, { asOf }) => {
      if (asOf === null) return latest;
      return latest === null || Date.parse(asOf) > Date.parse(latest) ? asOf : latest;
    }, null),
    funnel,
    stages: pipeline(funnel),
    efforts,
    other: [
      ...otherOutcomes(funnel),
      { label: 'Effort not sent', value: counts.reduce((total, key) => total + key.effortNotSent, 0) },
    ],
  };
}

type MeasuredCell = NonNullable<ReturnType<typeof measuredCell>>;

function dashboardRows(
  lanes: AgentGetRoutingEvidenceResult['lanes'],
  profiles: AgentGetCapabilityMatrixResult['profiles'],
): DashboardRow[] {
  const rows = new Map<string, DashboardRow>();
  function row(laneId: string | null, family: string, model: string): DashboardRow {
    const id = JSON.stringify([laneId, family, model]);
    return rows.get(id) ?? { id, laneId, family, model, inCatalog: null, effortSupport: null, measured: new Map(), ratings: new Map() };
  }
  for (const lane of lanes) {
    for (const model of lane.models) {
      const current = row(lane.laneId, lane.family, model.model);
      const measured = new Map<OutcomeTaskKind, MeasuredCell>();
      for (const task of OUTCOME_TASK_KINDS) {
        const cell = measuredCell(model.keys, task);
        if (cell) measured.set(task, cell);
      }
      rows.set(current.id, { ...current, inCatalog: model.inCatalog, effortSupport: model.efforts, measured });
    }
  }
  for (const profile of profiles) {
    const ratings = new Map<OutcomeTaskKind, AgentCapabilityMatrixValueCell>();
    for (const task of OUTCOME_TASK_KINDS) {
      const cell = profile.cells[task];
      if (cell.kind === 'value') ratings.set(task, cell);
    }
    const matching = lanes.filter((lane) => lane.family === profile.family);
    for (const laneId of matching.length ? matching.map((lane) => lane.laneId) : [null]) {
      const current = row(laneId, profile.family, profile.model);
      rows.set(current.id, { ...current, ratings });
    }
  }
  return [...rows.values()];
}

function picksFor(rows: readonly DashboardRow[]) {
  return OUTCOME_TASK_KINDS.map((task) => {
    const candidates = rows.flatMap((row) => {
      const score = row.measured.get(task)?.score;
      const catalogModel = row.inCatalog === true && row.model !== '*';
      return row.laneId !== null && score != null ? [{ laneId: row.laneId, model: row.model, score, catalogModel }] : [];
    }).sort((a, b) => b.score - a.score || Number(b.catalogModel) - Number(a.catalogModel));
    const winner = candidates[0] ?? null;
    const runnerUp = candidates.find((candidate) => candidate.laneId !== winner?.laneId) ?? null;
    return { task, winner, runnerUp, close: winner !== null && runnerUp !== null && winner.score - runnerUp.score <= ROTATION_MARGIN };
  });
}

export function dashboardModel(
  evidence: AgentGetRoutingEvidenceResult | null,
  capability: AgentGetCapabilityMatrixResult | null,
) {
  const lanes = evidence?.lanes ?? [];
  const measuredRows = dashboardRows(lanes, []);
  const rows = capability ? dashboardRows(lanes, capability.profiles) : measuredRows;
  const byLane = new Map<string, AgentRoutingFunnel>();
  for (const { laneId, funnel } of evidence?.laneFunnels ?? []) {
    byLane.set(laneId, sumFunnels([byLane.get(laneId) ?? ZERO, funnel]));
  }
  const funnel = sumFunnels([...byLane.values()]);
  const populatedLanes = [...byLane].filter(([, counts]) => counts.spawned > 0);
  const losses = segmentsFor(funnel).slice(1, 5);
  const lostTotal = losses.reduce((total, segment) => total + segment.value, 0);
  const mix = populatedLanes.map(([laneId, counts]) => ({
    laneId, segments: segmentsFor(counts),
    approval: percent(counts.approved, counts.spawned),
  }));
  const workloads = populatedLanes.map(([laneId, counts], index) => ({
    laneId, value: counts.spawned,
    share: percent(counts.spawned, funnel.spawned), color: palette[index % palette.length],
  }));
  const decisionModels = (evidence?.decisionModels ?? []).map((model) => ({
    ...model, pipeline: pipeline(model.funnel), other: otherOutcomes(model.funnel),
  }));
  const catalogs = lanes.map(({ laneId, catalog }) => ({ laneId, ...catalog, label: catalogLabels[catalog.status] }));
  const coverage = measuredRows.reduce(
    (count, row) => count + [...row.measured.values()].filter((cell) => cell.sampleCount > 0).length, 0,
  );
  return {
    rows, measuredRows: measuredRows.filter((row) => row.measured.size > 0), funnel, catalogs, decisionModels,
    picks: picksFor(measuredRows),
    pipeline: pipeline(funnel),
    losses, lostTotal, lostShare: boundedPercent(lostTotal, funnel.spawned) ?? 0,
    mix, workloads, mixLegend: segmentsFor(ZERO),
    kpis: [
      { label: 'Approved on review', value: funnel.approved, max: funnel.reviewed, unit: 'reviewed runs' },
      { label: 'Delivered', value: funnel.delivered, max: funnel.spawned, unit: 'spawned runs' },
      { label: 'Matrix coverage', value: coverage, max: measuredRows.length * OUTCOME_TASK_KINDS.length, unit: 'cells sampled' },
      { label: 'Catalogs ready', value: catalogs.filter((catalog) => catalog.status === 'ok').length, max: catalogs.length, unit: 'lane catalogs' },
    ],
  };
}
