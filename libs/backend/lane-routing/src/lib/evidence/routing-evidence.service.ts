import {
  OUTCOME_TASK_KINDS,
  type AgentGetRoutingEvidenceResult,
  type AgentRoutingEvidenceKey,
  type AgentRoutingEvidenceLane,
  type AgentRoutingEvidenceModel,
  type CliDetectionResult,
  type EffortSupport,
  type LaneOutcomeReader,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import type {
  LaneCatalogModel,
  LaneCatalogRefresher,
  LaneCatalogSnapshotReader,
} from '../catalog/lane-catalog.types';
import { MODEL_EFFORTS } from '../contracts/route-decide-result.schema';
import {
  ANY_EFFORT,
  deriveChoiceEvidence,
  type ChoiceCell,
  type EffortBucket,
  type FunnelAggregates,
  type FunnelCounts,
} from '../matrix/choice-evidence';
import { laneCandidateId, resolveLaneFamily } from '../ranking/candidate.types';
import { OUTCOME_WINDOW_DAYS, OUTCOME_WINDOW_MS } from '../routing-constants';

interface RoutingEvidenceDependencies {
  readonly catalog: Pick<LaneCatalogSnapshotReader, 'get'> & Pick<LaneCatalogRefresher, 'refreshIfDue'>;
  readonly outcomeReader?: LaneOutcomeReader;
  readonly performanceRouting: { isEnabled(): boolean };
  readonly now?: () => number;
}

const EMPTY_FUNNEL: FunnelCounts = {
  spawned: 0,
  completed: 0,
  delivered: 0,
  reviewed: 0,
  approved: 0,
  capacityDropped: 0,
  unverified: 0,
  noDeliverable: 0,
  failed: 0,
  rejected: 0,
  unresolvedRevise: 0,
  reviseRounds: 0,
};

const ZERO_AGGREGATE = { total: 0, count: 0 } as const;
const EMPTY_AGGREGATES: FunnelAggregates = {
  durationMs: ZERO_AGGREGATE,
  inputTokens: ZERO_AGGREGATE,
  outputTokens: ZERO_AGGREGATE,
  costUsd: ZERO_AGGREGATE,
};

const UNKNOWN_EFFORTS: EffortSupport = { provenance: 'unknown' };
type ModelCells = ReadonlyMap<string, readonly ChoiceCell[]>;

export class RoutingEvidenceService {
  constructor(private readonly deps: RoutingEvidenceDependencies) {}

  async read(rows: readonly CliDetectionResult[]): Promise<AgentGetRoutingEvidenceResult> {
    const { catalog, outcomeReader, performanceRouting } = this.deps;
    if (outcomeReader?.recentWorkspaceOutcomes === undefined || !outcomeReader.isPersistent()) {
      throw new Error('Routing evidence requires a readable workspace outcome store');
    }

    const nowMs = (this.deps.now ?? Date.now)();
    const enabled = performanceRouting.isEnabled();
    const laneRows = new Map(rows.map((row) => [laneCandidateId(row), row]));
    const snapshots = [...laneRows].map(([laneId, row]) => {
      const entry = catalog.get(laneId);
      if (row.installed && !row.disabled) catalog.refreshIfDue(row, nowMs);
      return { laneId, family: resolveLaneFamily(row), entry };
    });
    const summaries = await outcomeReader.recentWorkspaceOutcomes({ sinceMs: nowMs - OUTCOME_WINDOW_MS });
    const evidence = deriveChoiceEvidence(summaries, nowMs);
    const byFamily = indexCells(evidence.cells());

    const lanes = snapshots.map(({ laneId, family, entry }): AgentRoutingEvidenceLane => ({
      laneId,
      family,
      catalog: {
        status: entry?.status ?? 'never',
        fetchedAt: entry?.fetchedAt ?? null,
        lastOkAt: entry?.lastOkAt ?? null,
        modelCount: entry?.models.length ?? 0,
      },
      models: modelViews(entry?.models ?? [], byFamily.get(family)),
    }));
    return {
      windowDays: OUTCOME_WINDOW_DAYS,
      performanceRouting: enabled,
      lanes,
      laneFunnels: evidence.laneFunnels(),
      decisionModels: evidence.decisionModels(),
    };
  }
}

function indexCells(cells: readonly ChoiceCell[]): ReadonlyMap<string, ModelCells> {
  const families = new Map<string, Map<string, ChoiceCell[]>>();
  for (const cell of cells) {
    const { family, model } = cell.key;
    let models = families.get(family);
    if (models === undefined) {
      models = new Map();
      families.set(family, models);
    }
    const modelCells = models.get(model);
    if (modelCells === undefined) models.set(model, [cell]);
    else modelCells.push(cell);
  }
  return families;
}

function modelViews(
  catalogModels: readonly LaneCatalogModel[],
  byModel: ModelCells | undefined,
): AgentRoutingEvidenceModel[] {
  const models = new Map<string, AgentRoutingEvidenceModel>();
  for (const { id, efforts } of catalogModels) {
    const keys = new Map<string, AgentRoutingEvidenceKey>();
    for (const cell of byModel?.get(id) ?? []) {
      const { taskKind, effort } = cell.key;
      keys.set(keyId(taskKind, effort), keyView(taskKind, effort, cell));
    }
    const effortsToShow: EffortBucket[] = [ANY_EFFORT];
    if (efforts.provenance === 'native') {
      effortsToShow.push(...MODEL_EFFORTS.filter((effort) => efforts.supported.includes(effort)));
    }
    for (const taskKind of OUTCOME_TASK_KINDS) {
      for (const effort of effortsToShow) {
        const key = keyId(taskKind, effort);
        if (!keys.has(key)) keys.set(key, keyView(taskKind, effort));
      }
    }
    models.set(id, { model: id, inCatalog: true, efforts, keys: [...keys.values()] });
  }
  for (const [model, cells] of byModel ?? []) {
    if (models.has(model)) continue;
    const keys = cells.map((cell) => keyView(cell.key.taskKind, cell.key.effort, cell));
    models.set(model, { model, inCatalog: false, efforts: UNKNOWN_EFFORTS, keys });
  }
  return [...models.values()];
}

function keyId(taskKind: OutcomeTaskKind, effort: EffortBucket): string {
  return `${taskKind}:${effort}`;
}

function keyView(
  taskKind: OutcomeTaskKind,
  effort: EffortBucket,
  cell?: ChoiceCell,
): AgentRoutingEvidenceKey {
  return {
    taskKind,
    effort,
    funnel: cell?.funnel ?? EMPTY_FUNNEL,
    effortNotSent: cell?.effortNotSent ?? 0,
    ...(cell?.aggregates ?? EMPTY_AGGREGATES),
    score: cell?.local?.score ?? null,
    sampleCount: cell?.local?.sampleCount ?? 0,
    asOf: cell?.local?.asOf ?? null,
    stale: cell?.local?.stale ?? false,
  };
}
