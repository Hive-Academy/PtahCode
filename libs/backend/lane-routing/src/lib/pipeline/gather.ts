import type {
  CliDetectionResult,
  LaneLimitState,
  PhaseKind,
} from '@ptah-extension/shared';
import { SUBAGENT_LANE_ID } from '@ptah-extension/shared';
import {
  effectiveMachineCapabilities,
  PhaseDefinitionError,
  resolvePhaseDefinition,
} from '../contracts/phase-definition-resolver';
import type { RouteDecideArgs } from '../contracts/route-decide-args.schema';
import type {
  LimitEvidence,
  ModelListStatus,
} from '../contracts/route-decide-result.schema';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import type {
  LaneModelEntry,
  LaneModelListing,
} from '../lane-model-listing.port';
import {
  MATRIX_INVALID_PREFIX,
  NO_OUTCOME_HISTORY_REASON,
  OUTCOMES_UNAVAILABLE_REASON,
  type CapabilityMatrixSnapshot,
  type MatrixLoadInput,
  type MatrixOutcomeQuery,
} from '../matrix/capability-matrix.store';
import { FAMILY_PROFILE_MODEL } from '../matrix/matrix.types';
import { EMPTY_OUTCOME_FIGURES } from '../matrix/outcome-figures';
import type { PhaseDefinitionReader } from '../phase-definition-reader.port';
import {
  laneCandidateId,
  toLaneCandidate,
  type LaneCandidate,
} from '../ranking/candidate.types';
import {
  emptyRotationState,
  ROTATION_UNAVAILABLE_REASON,
  type RotationLoad,
  type RotationState,
} from '../ranking/rotation.store';
import type { FallbackModel, ListedModel } from '../ranking/score';
import { MISSING_INPUTS, type MissingInput } from '../reasons/compile-reasons';
import type { RouteCandidateSource } from '../route-candidate-source.port';
import { GATHER_BUDGET_MS, NEUTRAL_SCORE } from '../routing-constants';
import { readCandidateToolsDetailed } from './candidate-tools';
import {
  capRouteDeadline,
  createRouteDeadline,
  withinBudget,
  type RouteDeadline,
} from './route-deadline';

type GatePhases = Extract<RouteDecideArgs, { stage: 'gate-0.1' }>['phases'];

/**
 * Gather (data-flow step 4). One deadline races each input and each model list
 * on its own; a late or failed row stays eligible as `lane-default` and records
 * `models unknown for <lane> (<status>)`. Other missing inputs are recorded and
 * do not reject the call (Requirements 4.5, 11.2, 11.5).
 */

export interface LaneModelFacts {
  readonly models: readonly ListedModel[];
  readonly configuredModel?: FallbackModel;
  readonly status?: ModelListStatus;
}

export interface GatheredCall {
  readonly childSessionEligible?: boolean;
  readonly lanes: readonly LaneCandidate[];
  readonly roles: readonly string[];
  readonly matrix: CapabilityMatrixSnapshot;
  readonly rotation: RotationState;
  readonly rotationUnavailable: boolean;
  readonly models: ReadonlyMap<string, LaneModelFacts>;
  readonly missing: readonly MissingInput[];
  /** Store phrases and per-lane/gather diagnostics not covered by `missing`. */
  readonly detailReasons: readonly string[];
  /** Wall-clock timestamp captured for this gather, used for evidence age. */
  readonly nowMs?: number;
  /** Phases with resolved machine capabilities when `phases` was provided. */
  readonly resolvedPhases?: GatePhases;
  /** Candidate tool lists by phase when `phases` was provided. */
  readonly toolNamesByPhase?: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly string[] | null>
  >;
}

export interface RouteMatrix {
  load(input: MatrixLoadInput): Promise<CapabilityMatrixSnapshot>;
}

export interface RouteRotation {
  load(): RotationLoad;
  save(state: RotationState): Promise<{ readonly persisted: boolean }>;
}

export async function gatherRouteCall(input: {
  readonly source: RouteCandidateSource;
  readonly listing: LaneModelListing | undefined;
  readonly matrix: RouteMatrix;
  readonly rotation: RouteRotation;
  readonly logger: LaneRoutingLogger;
  readonly nowMs: number;
  readonly listingBudgetMs: number;
  readonly deadline?: RouteDeadline;
  readonly gatherBudgetMs?: number;
  readonly phases?: GatePhases;
  readonly phaseDefinitionReader?: PhaseDefinitionReader;
}): Promise<GatheredCall> {
  const gatherDeadline =
    input.deadline === undefined
      ? undefined
      : capRouteDeadline(
          input.deadline,
          input.gatherBudgetMs ?? GATHER_BUDGET_MS,
        );

  // Synchronous state reads do not await I/O.
  const rotation = loadRotation(input.rotation, input.logger);
  let childSessionEligible = false;
  let childEligibilityReason: string | undefined;
  try {
    childSessionEligible = input.source.childSessionEligible?.() ?? false;
  } catch (error: unknown) {
    input.logger.warn(
      '[lane-routing] child session eligibility could not be checked',
      logFacts(error),
    );
    childEligibilityReason = 'Child session eligibility could not be checked';
  }

  // Start row-independent reads immediately in parallel with rows().
  const rowsPromise = readRows(input.source, input.logger, gatherDeadline);
  const rolesPromise = readRoles(input.source, input.logger, gatherDeadline);
  const phaseDefsPromise =
    input.phases === undefined
      ? Promise.resolve(undefined)
      : resolvePhaseDefinitions(
          input.phases,
          input.phaseDefinitionReader,
          input.logger,
          gatherDeadline,
        );

  const rows = await rowsPromise;
  const rowSnapshot = [...rows.rows];

  const [limits, roles, listed, matrix, phaseDefs] = await Promise.all([
    readLimits(input.source, rowSnapshot, input.logger, gatherDeadline),
    rolesPromise,
    listModels(
      input.listing,
      rowSnapshot,
      input.listingBudgetMs,
      input.logger,
      gatherDeadline,
    ),
    loadMatrix(
      input.matrix,
      rowSnapshot,
      input.nowMs,
      input.logger,
      gatherDeadline,
    ),
    phaseDefsPromise,
  ]);

  const lanes = rowSnapshot.map((row) =>
    toLaneCandidate(row, limits.map, limits.evidence),
  );

  const toolResult =
    phaseDefs === undefined
      ? undefined
      : await readCandidateToolsDetailed(
          phaseDefs.phases,
          { lanes, roles: roles.roles, childSessionEligible },
          input.source,
          input.logger,
          gatherDeadline,
        );

  const matrixNotes = classifyMatrixReasons(matrix.reasons);
  const missing = orderedMissing([
    ...(rows.failed ? (['agent-list'] as const) : []),
    ...(limits.failed ? (['limits'] as const) : []),
    ...(roles.failed ? (['roles'] as const) : []),
    ...(listed.failed && listed.reasons.length === 0
      ? (['model-lists'] as const)
      : []),
    ...matrixNotes.missing,
    ...(rotation.reason !== null ? (['rotation-store'] as const) : []),
  ]);

  const detailReasons: string[] = [
    ...matrixNotes.extra,
    ...listed.reasons,
    ...(phaseDefs?.reasons ?? []),
    ...(toolResult?.timedOutPhases.map(
      (phaseId) => `tool evidence unavailable for phase ${phaseId} (timeout)`,
    ) ?? []),
    ...(childEligibilityReason ? [childEligibilityReason] : []),
  ];

  return {
    childSessionEligible,
    lanes,
    roles: [...roles.roles],
    matrix,
    rotation: rotation.state,
    rotationUnavailable: rotation.reason !== null,
    models: listed.byLaneId,
    missing,
    detailReasons,
    nowMs: input.nowMs,
    ...(phaseDefs === undefined ? {} : { resolvedPhases: phaseDefs.phases }),
    ...(toolResult === undefined ? {} : { toolNamesByPhase: toolResult.byPhase }),
  };
}

async function readRows(
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<{
  readonly rows: readonly CliDetectionResult[];
  readonly failed: boolean;
}> {
  if (deadline !== undefined) {
    const raced = await withinBudget(
      deadline,
      () => source.rows(),
      (error) => {
        logger.warn(
          '[lane-routing] agent list rejected after deadline',
          logFacts(error),
        );
      },
    );
    if (raced.kind === 'ok') return { rows: raced.value, failed: false };
    if (raced.kind === 'deadline') {
      logger.warn('[lane-routing] agent list timed out');
      return { rows: [], failed: true };
    }
    logger.warn('[lane-routing] agent list failed', logFacts(raced.error));
    return { rows: [], failed: true };
  }
  try {
    const rows = await source.rows();
    return { rows, failed: false };
  } catch (error: unknown) {
    logger.warn('[lane-routing] agent list failed', logFacts(error));
    return { rows: [], failed: true };
  }
}

async function readLimits(
  source: RouteCandidateSource,
  rows: readonly CliDetectionResult[],
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<{
  readonly map: ReadonlyMap<string, LaneLimitState> | null;
  readonly evidence: ReadonlyMap<string, LimitEvidence> | null;
  readonly failed: boolean;
}> {
  const readEvidence = source.limitEvidence;
  if (readEvidence !== undefined) {
    if (deadline !== undefined) {
      const raced = await withinBudget(
        deadline,
        () => readEvidence(rows),
        (error) => {
          logger.warn(
            '[lane-routing] lane limit evidence rejected after deadline',
            logFacts(error),
          );
        },
      );
      if (raced.kind === 'ok') {
        const evidence = raced.value === null ? null : new Map(raced.value);
        return { map: null, evidence, failed: evidence === null };
      }
      if (raced.kind === 'deadline') {
        logger.warn('[lane-routing] lane limit evidence timed out');
        return { map: null, evidence: null, failed: true };
      }
      logger.warn(
        '[lane-routing] lane limit evidence failed',
        logFacts(raced.error),
      );
      return { map: null, evidence: null, failed: true };
    }
    try {
      const raw = await readEvidence(rows);
      const evidence = raw === null ? null : new Map(raw);
      return { map: null, evidence, failed: evidence === null };
    } catch (error: unknown) {
      logger.warn('[lane-routing] lane limit evidence failed', logFacts(error));
      return { map: null, evidence: null, failed: true };
    }
  }

  if (deadline !== undefined) {
    const raced = await withinBudget(
      deadline,
      () => source.limits(rows),
      (error) => {
        logger.warn(
          '[lane-routing] lane limits rejected after deadline',
          logFacts(error),
        );
      },
    );
    if (raced.kind === 'ok') {
      const map = raced.value === null ? null : new Map(raced.value);
      return { map, evidence: null, failed: map === null };
    }
    if (raced.kind === 'deadline') {
      logger.warn('[lane-routing] lane limits timed out');
      return { map: null, evidence: null, failed: true };
    }
    logger.warn('[lane-routing] lane limits failed', logFacts(raced.error));
    return { map: null, evidence: null, failed: true };
  }
  try {
    const raw = await source.limits(rows);
    const map = raw === null ? null : new Map(raw);
    return { map, evidence: null, failed: map === null };
  } catch (error: unknown) {
    logger.warn('[lane-routing] lane limits failed', logFacts(error));
    return { map: null, evidence: null, failed: true };
  }
}

async function readRoles(
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<{ readonly roles: readonly string[]; readonly failed: boolean }> {
  if (deadline !== undefined) {
    const raced = await withinBudget(
      deadline,
      () => source.roles(),
      (error) => {
        logger.warn(
          '[lane-routing] role list rejected after deadline',
          logFacts(error),
        );
      },
    );
    if (raced.kind === 'ok') return { roles: raced.value, failed: false };
    if (raced.kind === 'deadline') {
      logger.warn('[lane-routing] role list timed out');
      return { roles: [], failed: true };
    }
    logger.warn('[lane-routing] role list failed', logFacts(raced.error));
    return { roles: [], failed: true };
  }
  try {
    const roles = await source.roles();
    return { roles, failed: false };
  } catch (error: unknown) {
    logger.warn('[lane-routing] role list failed', logFacts(error));
    return { roles: [], failed: true };
  }
}

async function listModels(
  listing: LaneModelListing | undefined,
  rows: readonly CliDetectionResult[],
  budgetMs: number,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<{
  readonly byLaneId: ReadonlyMap<string, LaneModelFacts>;
  readonly failed: boolean;
  readonly reasons: readonly string[];
}> {
  if (rows.length === 0) {
    return { byLaneId: new Map(), failed: false, reasons: [] };
  }
  if (listing === undefined) {
    logger.warn('[lane-routing] model listing is not registered');
    const byLaneId = new Map<string, LaneModelFacts>();
    const reasons: string[] = [];
    for (const row of rows) {
      const id = laneCandidateId(row);
      byLaneId.set(id, { models: [], status: 'unregistered' });
      reasons.push(modelUnknownReason(id, 'unregistered'));
    }
    return { byLaneId, failed: true, reasons };
  }
  const pairs = await Promise.all(
    rows.map(async (row) => {
      const result = await listOne(listing, row, budgetMs, logger, deadline);
      return [laneCandidateId(row), result] as const;
    }),
  );
  const byLaneId = new Map<string, LaneModelFacts>();
  const reasons: string[] = [];
  let failed = false;
  for (const [id, result] of pairs) {
    if (result.status !== 'ok') {
      failed = true;
      byLaneId.set(id, { models: [], status: result.status });
      reasons.push(modelUnknownReason(id, result.status));
      continue;
    }
    byLaneId.set(id, { ...factsFrom(result.models), status: 'ok' });
  }
  return { byLaneId, failed, reasons };
}

function modelUnknownReason(
  laneId: string,
  status: Exclude<ModelListStatus, 'ok'>,
): string {
  return `models unknown for ${laneId} (${status})`;
}

type ListOneResult =
  | { readonly status: 'ok'; readonly models: readonly LaneModelEntry[] }
  | { readonly status: 'timeout' | 'error' | 'empty' };

/**
 * Race one row against the listing budget (and optional call deadline).
 * A deadline abort is always classified as `timeout` regardless of callback
 * settlement order, and losing promises are observed so they never surface as
 * unhandled rejections.
 */
async function listOne(
  listing: LaneModelListing,
  row: CliDetectionResult,
  budgetMs: number,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<ListOneResult> {
  const rowDeadline =
    deadline !== undefined
      ? capRouteDeadline(deadline, budgetMs)
      : createRouteDeadline(performance.now() + budgetMs);
  const raced = await withinBudget(
    rowDeadline,
    (signal) => listing.list(row, signal),
    (error) => {
      logger.warn('[lane-routing] model list rejected after deadline', {
        cli: row.cli,
        ...logFacts(error),
      });
    },
  );
  if (raced.kind === 'deadline') {
    return { status: 'timeout' };
  }
  if (raced.kind === 'error') {
    logger.warn('[lane-routing] model list failed', {
      cli: row.cli,
      ...logFacts(raced.error),
    });
    return { status: 'error' };
  }
  if (raced.value.length === 0) {
    return { status: 'empty' };
  }
  return { status: 'ok', models: raced.value };
}

function factsFrom(entries: readonly LaneModelEntry[]): LaneModelFacts {
  const models: ListedModel[] = [];
  let configured: FallbackModel | undefined;
  for (const entry of entries) {
    models.push({
      id: entry.id,
      provenance: entry.provenance,
      ...(entry.auto === true ? { auto: true } : {}),
    });
    if (configured === undefined && entry.provenance === 'configured') {
      configured = { id: entry.id, provenance: 'configured' };
    }
  }
  return configured === undefined
    ? { models }
    : { models, configuredModel: configured };
}

async function loadMatrix(
  matrix: RouteMatrix,
  rows: readonly CliDetectionResult[],
  nowMs: number,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<CapabilityMatrixSnapshot> {
  const outcomeQueries: MatrixOutcomeQuery[] = rows.map((row) => ({
    laneId: laneCandidateId(row),
    subagent: false,
  }));
  outcomeQueries.push({ laneId: SUBAGENT_LANE_ID, subagent: true });
  if (deadline !== undefined) {
    const raced = await withinBudget(
      deadline,
      () => matrix.load({ nowMs, outcomeQueries }),
      (error) => {
        logger.warn(
          '[lane-routing] capability matrix rejected after deadline',
          logFacts(error),
        );
      },
    );
    if (raced.kind === 'ok') return raced.value;
    if (raced.kind === 'deadline') {
      logger.warn('[lane-routing] capability matrix load timed out');
      return neutralSnapshot('timeout');
    }
    logger.warn(
      '[lane-routing] capability matrix could not be loaded',
      logFacts(raced.error),
    );
    return neutralSnapshot('unreadable');
  }
  try {
    return await matrix.load({ nowMs, outcomeQueries });
  } catch (error: unknown) {
    logger.warn(
      '[lane-routing] capability matrix could not be loaded',
      logFacts(error),
    );
    return neutralSnapshot('unreadable');
  }
}

function neutralSnapshot(cause: 'unreadable' | 'timeout'): CapabilityMatrixSnapshot {
  return {
    outcomeFigures: EMPTY_OUTCOME_FIGURES,
    reasons: [
      `${MATRIX_INVALID_PREFIX} capability-matrix.json (${cause})`,
      OUTCOMES_UNAVAILABLE_REASON,
    ],
    resolve: (family, model, taskKind) => ({
      family,
      model,
      profileModel: FAMILY_PROFILE_MODEL,
      taskKind,
      layers: {},
      cell: { kind: 'unknown' },
      score: NEUTRAL_SCORE,
      noProfile: true,
    }),
  };
}

async function resolvePhaseDefinitions(
  phases: GatePhases,
  reader: PhaseDefinitionReader | undefined,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<{ readonly phases: GatePhases; readonly reasons: readonly string[] }> {
  const kindsToRead: PhaseKind[] = [];
  for (const phase of phases) {
    if (
      phase.requiredCapabilities === undefined &&
      !kindsToRead.includes(phase.kind)
    ) {
      kindsToRead.push(phase.kind);
    }
  }

  const resolvedByKind = new Map<PhaseKind, GatePhases[number]['requiredCapabilities']>();
  const reasons: string[] = [];

  await Promise.all(
    kindsToRead.map(async (kind) => {
      const legacy = legacyCapabilities(kind);
      if (reader === undefined) {
        resolvedByKind.set(kind, legacy);
        return;
      }
      if (deadline !== undefined) {
        const raced = await withinBudget(
          deadline,
          () => reader.read(kind),
          (error) => {
            logger.warn(
              '[lane-routing] phase definition rejected after deadline',
              { kind, ...logFacts(error) },
            );
          },
        );
        if (raced.kind === 'deadline') {
          logger.warn(
            '[lane-routing] phase definition timed out; using legacy machine capabilities',
            { kind },
          );
          reasons.push(`phase definition unavailable for ${kind} (timeout)`);
          resolvedByKind.set(kind, legacy);
          return;
        }
        if (raced.kind === 'error') {
          logger.warn(
            '[lane-routing] phase definition unavailable; using legacy machine capabilities',
            {
              kind,
              errorName:
                raced.error instanceof Error ? raced.error.name : 'unknown',
              code:
                raced.error instanceof PhaseDefinitionError
                  ? raced.error.code
                  : undefined,
            },
          );
          resolvedByKind.set(kind, legacy);
          return;
        }
        resolvedByKind.set(kind, parsePhaseCapabilities(kind, raced.value, logger, legacy));
        return;
      }
      try {
        const text = await reader.read(kind);
        resolvedByKind.set(kind, parsePhaseCapabilities(kind, text, logger, legacy));
      } catch (error: unknown) {
        logger.warn(
          '[lane-routing] phase definition unavailable; using legacy machine capabilities',
          {
            kind,
            errorName: error instanceof Error ? error.name : 'unknown',
            code: error instanceof PhaseDefinitionError ? error.code : undefined,
          },
        );
        resolvedByKind.set(kind, legacy);
      }
    }),
  );

  const resolvedPhases = phases.map((phase) =>
    phase.requiredCapabilities !== undefined
      ? phase
      : {
          ...phase,
          requiredCapabilities:
            resolvedByKind.get(phase.kind) ?? legacyCapabilities(phase.kind),
        },
  );
  return { phases: resolvedPhases, reasons };
}

function parsePhaseCapabilities(
  kind: PhaseKind,
  text: string,
  logger: LaneRoutingLogger,
  legacy: GatePhases[number]['requiredCapabilities'],
): GatePhases[number]['requiredCapabilities'] {
  try {
    const definition = resolvePhaseDefinition(kind, () => text).definition;
    if (definition.version === 1) {
      logger.warn(
        '[lane-routing] version 1 phase definition; using legacy machine capabilities',
        { kind },
      );
    }
    return [...effectiveMachineCapabilities(definition)];
  } catch (error: unknown) {
    logger.warn(
      '[lane-routing] phase definition unavailable; using legacy machine capabilities',
      {
        kind,
        errorName: error instanceof Error ? error.name : 'unknown',
        code: error instanceof PhaseDefinitionError ? error.code : undefined,
      },
    );
    return legacy;
  }
}

function legacyCapabilities(
  kind: PhaseKind,
): NonNullable<GatePhases[number]['requiredCapabilities']> {
  return kind === 'visual-review' || kind === 'design' ? ['browser'] : [];
}

function loadRotation(
  rotation: RouteRotation,
  logger: LaneRoutingLogger,
): RotationLoad {
  try {
    return rotation.load();
  } catch (error: unknown) {
    logger.warn(
      '[lane-routing] rotation state could not be read',
      logFacts(error),
    );
    return { state: emptyRotationState(), reason: ROTATION_UNAVAILABLE_REASON };
  }
}

function classifyMatrixReasons(reasons: readonly string[]): {
  readonly missing: readonly MissingInput[];
  readonly extra: readonly string[];
} {
  const missing: MissingInput[] = [];
  const extra: string[] = [];
  for (const reason of reasons) {
    if (reason.startsWith(MATRIX_INVALID_PREFIX)) {
      pushMissing(missing, 'matrix-file');
      extra.push(reason);
      continue;
    }
    if (reason === NO_OUTCOME_HISTORY_REASON) {
      pushMissing(missing, 'outcome-history');
      continue;
    }
    if (reason.length > 0) extra.push(reason);
  }
  return { missing, extra };
}

function pushMissing(list: MissingInput[], item: MissingInput): void {
  if (!list.includes(item)) list.push(item);
}

function orderedMissing(items: readonly MissingInput[]): MissingInput[] {
  return MISSING_INPUTS.filter((item) => items.includes(item));
}

function logFacts(error: unknown): {
  readonly name: string;
  readonly code?: string;
} {
  const name = error instanceof Error ? error.name : 'UnknownError';
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string') return { name, code };
  }
  return { name };
}
