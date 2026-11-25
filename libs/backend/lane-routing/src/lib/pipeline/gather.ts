import type {
  CliDetectionResult,
  LaneLimitState,
  PhaseKind,
} from '@ptah-extension/shared';
import { SUBAGENT_LANE_ID } from '@ptah-extension/shared';
import type {
  LaneCatalogRefresher,
  LaneCatalogSnapshotReader,
} from '../catalog/lane-catalog.types';
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
import {
  readCandidateToolsIncremental,
  sanitizeGatherReason,
} from './candidate-tools';
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
  readonly deadlineReads?: {
    readonly rows?: boolean;
    readonly roles?: boolean;
    readonly phaseDefinitions?: ReadonlySet<string>;
    readonly tools?: ReadonlyMap<string, ReadonlySet<string>>;
  };
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
  readonly choice?: boolean;
  readonly catalog?: Pick<LaneCatalogSnapshotReader, 'get'> & LaneCatalogRefresher;
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
  const phaseDefs =
    input.phases === undefined
      ? undefined
      : startPhaseDefinitions(
          input.phases,
          input.phaseDefinitionReader,
          input.logger,
          gatherDeadline,
        );

  // Build provisional lane identities from rows so tool proofs start as soon as
  // candidate identities and phase requirements are known, independent of
  // limits, model lists, matrix, and (for non-custom-role candidates) roles.
  const provisionalLanesPromise = rowsPromise.then((rowsResult) =>
    rowsResult.rows.map((row) => toLaneCandidate(row, null, null)),
  );
  const provisionalRolesPromise = rolesPromise.then(
    (rolesResult) => rolesResult.roles,
  );
  const toolResultPromise =
    phaseDefs === undefined
      ? Promise.resolve(undefined)
      : readCandidateToolsIncremental(
          phaseDefs.phasePromises,
          {
            lanes: provisionalLanesPromise,
            roles: provisionalRolesPromise,
            childSessionEligible,
          },
          input.source,
          input.logger,
          gatherDeadline,
        );
  // A rows failure rethrows below before Promise.all observes the derived
  // reads, so mark them handled now. Promise.all still sees their outcome.
  observeLateFailure(provisionalLanesPromise);
  observeLateFailure(provisionalRolesPromise);
  observeLateFailure(toolResultPromise);
  observeLateFailure(rolesPromise);
  if (phaseDefs !== undefined) {
    phaseDefs.phasePromises.forEach(observeLateFailure);
    observeLateFailure(phaseDefs.reasonsPromise);
    observeLateFailure(phaseDefs.timedOutPhasesPromise);
  }

  const rows = await rowsPromise;
  const rowSnapshot = [...rows.rows];

  if (phaseDefs !== undefined) {
    // Let ready tool-proof reactions (provisional lane proofs and immediately
    // settled phase definitions or tool reads) start and observe their settled
    // outcomes before invoking independent adapters whose synchronous setup
    // could spend the remaining deadline budget.
    await provisionalLanesPromise;
    await flushReadyToolProofTurns();
  }

  const [
    limits,
    roles,
    listed,
    matrix,
    resolvedPhases,
    phaseDefReasons,
    timedOutPhaseDefinitions,
    toolResult,
  ] = await Promise.all([
    readLimits(input.source, rowSnapshot, input.logger, gatherDeadline),
    rolesPromise,
    input.choice === true && input.catalog !== undefined
      ? readCatalogModels(
          input.catalog,
          rowSnapshot,
          input.nowMs,
          input.listingBudgetMs,
          input.logger,
          gatherDeadline,
        )
      : listModels(
          // Without a catalog, on mode keeps today's listing path.
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
      input.choice,
      gatherDeadline,
    ),
    phaseDefs === undefined
      ? Promise.resolve(undefined)
      : Promise.all(phaseDefs.phasePromises),
    phaseDefs === undefined
      ? Promise.resolve<readonly string[]>([])
      : phaseDefs.reasonsPromise,
    phaseDefs?.timedOutPhasesPromise,
    toolResultPromise,
  ]);

  const lanes = rowSnapshot.map((row) =>
    toLaneCandidate(row, limits.map, limits.evidence),
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
    ...phaseDefReasons,
    ...(toolResult?.reasons ?? []),
    ...(childEligibilityReason ? [childEligibilityReason] : []),
  ];

  return {
    childSessionEligible,
    ...(rows.timedOut || roles.timedOut || timedOutPhaseDefinitions?.size || toolResult?.timedOutCandidatesByPhase.size
      ? { deadlineReads: {
          rows: rows.timedOut,
          roles: roles.timedOut,
          phaseDefinitions: timedOutPhaseDefinitions,
          tools: toolResult?.timedOutCandidatesByPhase,
        } }
      : {}),
    lanes,
    roles: [...roles.roles],
    matrix,
    rotation: rotation.state,
    rotationUnavailable: rotation.reason !== null,
    models: listed.byLaneId,
    missing,
    detailReasons,
    nowMs: input.nowMs,
    ...(resolvedPhases === undefined ? {} : { resolvedPhases }),
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
  readonly timedOut?: true;
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
      return { rows: [], failed: true, timedOut: true };
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
): Promise<{ readonly roles: readonly string[]; readonly failed: boolean; readonly timedOut?: true }> {
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
      return { roles: [], failed: true, timedOut: true };
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

async function readCatalogModels(
  catalog: Pick<LaneCatalogSnapshotReader, 'get'> & LaneCatalogRefresher,
  rows: readonly CliDetectionResult[],
  nowMs: number,
  budgetMs: number,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<Awaited<ReturnType<typeof listModels>>> {
  const pairs = await Promise.all(
    rows.map(async (row) => {
      const id = laneCandidateId(row);
      let entry = catalog.get(id);
      catalog.refreshIfDue(row, nowMs);
      if (entry?.lastOkAt == null) {
        const rowDeadline =
          deadline === undefined
            ? createRouteDeadline(performance.now() + budgetMs)
            : capRouteDeadline(deadline, budgetMs);
        // The catalog owns the refresh lifetime, so only the route's wait is bounded here.
        const raced = await withinBudget(
          rowDeadline,
          () => catalog.refresh(row, nowMs),
          (error) => logger.warn('[lane-routing] catalog refresh rejected after deadline', {
            laneId: id,
            ...logFacts(error),
          }),
        );
        if (raced.kind === 'deadline') {
          return { id, facts: { models: [], status: 'timeout' } as const };
        }
        if (raced.kind === 'error') {
          logger.warn('[lane-routing] catalog refresh failed', {
            laneId: id,
            ...logFacts(raced.error),
          });
          return { id, facts: { models: [], status: 'error' } as const };
        }
        entry = raced.value;
      }

      if (entry.lastOkAt === null) {
        const status = entry.status === 'timeout' || entry.status === 'error'
          ? entry.status
          : 'empty';
        return { id, facts: { models: [], status } as const };
      }

      const ageMs = Math.max(0, nowMs - entry.lastOkAt);
      return {
        id,
        facts: { ...factsFrom(entry.models), status: 'ok' } as const,
        reason: entry.status === 'ok'
          ? undefined
          : `catalog for ${id} is ${ageMs}ms old (${entry.status})`,
      };
    }),
  );
  const byLaneId = new Map<string, LaneModelFacts>();
  const reasons: string[] = [];
  let failed = false;
  for (const { id, facts, reason } of pairs) {
    byLaneId.set(id, facts);
    if (facts.status !== 'ok') {
      failed = true;
      reasons.push(modelUnknownReason(id, facts.status));
    } else if (reason !== undefined) {
      reasons.push(reason);
    }
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
      ...(entry.efforts === undefined ? {} : { efforts: entry.efforts }),
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
  choice?: boolean,
  deadline?: RouteDeadline,
): Promise<CapabilityMatrixSnapshot> {
  const outcomeQueries: MatrixOutcomeQuery[] = rows.map((row) => ({
    laneId: laneCandidateId(row),
    subagent: false,
  }));
  outcomeQueries.push({ laneId: SUBAGENT_LANE_ID, subagent: true });
  const loadInput: MatrixLoadInput = {
    nowMs,
    outcomeQueries,
    ...(choice === true ? { choice: true } : {}),
  };
  if (deadline !== undefined) {
    const raced = await withinBudget(
      deadline,
      () => matrix.load(loadInput),
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
    return await matrix.load(loadInput);
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

type GatePhase = GatePhases[number];
type PhaseDefinitionFailureCause = 'timeout' | 'error' | 'invalid';

interface PhaseDefinitionOutcome {
  readonly timedOut?: true;
  readonly capabilities: GatePhase['requiredCapabilities'];
  readonly reason?: string;
}

const MAX_PHASE_KIND_LABEL_CHARS = 64;
const READY_TOOL_PROOF_MICROTASK_TURNS = 6;

async function flushReadyToolProofTurns(): Promise<void> {
  for (let turn = 0; turn < READY_TOOL_PROOF_MICROTASK_TURNS; turn += 1) {
    await Promise.resolve();
  }
}

function phaseDefinitionUnavailableReason(
  kind: PhaseKind,
  cause: PhaseDefinitionFailureCause,
): string {
  const safeKind =
    sanitizeGatherReason(String(kind), MAX_PHASE_KIND_LABEL_CHARS) || 'unknown';
  return sanitizeGatherReason(
    `phase definition unavailable for ${safeKind} (${cause})`,
  );
}

function phaseDefinitionErrorCause(
  error: unknown,
): Exclude<PhaseDefinitionFailureCause, 'timeout'> {
  return error instanceof PhaseDefinitionError && error.code !== 'MISSING'
    ? 'invalid'
    : 'error';
}

function startPhaseDefinitions(
  phases: GatePhases,
  reader: PhaseDefinitionReader | undefined,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): {
  readonly phasePromises: readonly Promise<GatePhase>[];
  readonly reasonsPromise: Promise<readonly string[]>;
  readonly timedOutPhasesPromise: Promise<ReadonlySet<string>>;
} {
  const kindsToRead: PhaseKind[] = [];
  for (const phase of phases) {
    if (
      phase.requiredCapabilities === undefined &&
      !kindsToRead.includes(phase.kind)
    ) {
      kindsToRead.push(phase.kind);
    }
  }

  const outcomeByKind = new Map<PhaseKind, Promise<PhaseDefinitionOutcome>>();
  const outcomePromises: Promise<PhaseDefinitionOutcome>[] = [];
  for (const kind of kindsToRead) {
    const promise = readOnePhaseDefinition(kind, reader, logger, deadline);
    outcomeByKind.set(kind, promise);
    outcomePromises.push(promise);
  }

  const phasePromises: readonly Promise<GatePhase>[] = phases.map((phase) => {
    if (phase.requiredCapabilities !== undefined) {
      return Promise.resolve(phase);
    }
    const pending = outcomeByKind.get(phase.kind);
    if (pending === undefined) {
      return Promise.resolve({
        ...phase,
        requiredCapabilities: legacyCapabilities(phase.kind),
      });
    }
    return pending.then((outcome) => ({
      ...phase,
      requiredCapabilities:
        outcome.capabilities ?? legacyCapabilities(phase.kind),
    }));
  });

  const outcomes = Promise.all(outcomePromises);
  const reasonsPromise = outcomes.then((outcomes) => {
    const reasons: string[] = [];
    for (const outcome of outcomes) {
      if (outcome.reason !== undefined) {
        reasons.push(outcome.reason);
      }
    }
    return reasons;
  });

  const timedOutPhasesPromise = outcomes.then((outcomes) => {
    const timedOutKinds = new Set(kindsToRead.filter((_, index) => outcomes[index].timedOut));
    return new Set(phases
      .filter((phase) => phase.requiredCapabilities === undefined && timedOutKinds.has(phase.kind))
      .map((phase) => phase.id));
  });

  return { phasePromises, reasonsPromise, timedOutPhasesPromise };
}

function warnPhaseDefUnavailable(
  logger: LaneRoutingLogger,
  kind: PhaseKind,
  error: unknown,
): void {
  logger.warn(
    '[lane-routing] phase definition unavailable; using legacy machine capabilities',
    {
      kind,
      errorName: error instanceof Error ? error.name : 'unknown',
      code: error instanceof PhaseDefinitionError ? error.code : undefined,
    },
  );
}

async function readOnePhaseDefinition(
  kind: PhaseKind,
  reader: PhaseDefinitionReader | undefined,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<PhaseDefinitionOutcome> {
  const legacy = legacyCapabilities(kind);
  if (reader === undefined) {
    return { capabilities: legacy };
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
      return {
        capabilities: legacy,
        timedOut: true,
        reason: phaseDefinitionUnavailableReason(kind, 'timeout'),
      };
    }
    if (raced.kind === 'error') {
      warnPhaseDefUnavailable(logger, kind, raced.error);
      return {
        capabilities: legacy,
        reason: phaseDefinitionUnavailableReason(
          kind,
          phaseDefinitionErrorCause(raced.error),
        ),
      };
    }
    return parsePhaseCapabilities(kind, raced.value, logger, legacy);
  }
  try {
    const text = await reader.read(kind);
    return parsePhaseCapabilities(kind, text, logger, legacy);
  } catch (error: unknown) {
    warnPhaseDefUnavailable(logger, kind, error);
    return {
      capabilities: legacy,
      reason: phaseDefinitionUnavailableReason(
        kind,
        phaseDefinitionErrorCause(error),
      ),
    };
  }
}

function parsePhaseCapabilities(
  kind: PhaseKind,
  text: string,
  logger: LaneRoutingLogger,
  legacy: GatePhase['requiredCapabilities'],
): PhaseDefinitionOutcome {
  try {
    const definition = resolvePhaseDefinition(kind, () => text).definition;
    if (definition.version === 1) {
      logger.warn(
        '[lane-routing] version 1 phase definition; using legacy machine capabilities',
        { kind },
      );
    }
    return { capabilities: [...effectiveMachineCapabilities(definition)] };
  } catch (error: unknown) {
    warnPhaseDefUnavailable(logger, kind, error);
    return {
      capabilities: legacy,
      reason: phaseDefinitionUnavailableReason(kind, 'invalid'),
    };
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

/** Marks a started read as handled; its awaiting caller still sees the outcome. */
function observeLateFailure(promise: Promise<unknown>): void {
  // degradation-audit: reported - the caller that awaits this promise logs and handles its rejection.
  promise.catch(() => undefined);
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
