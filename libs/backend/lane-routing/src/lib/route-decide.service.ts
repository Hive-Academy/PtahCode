/**
 * Route-decide pipeline (part A §6, Batch 21).
 *
 * Gather, constrain, score, spread, then at most two decision-model
 * requests. A live System One 404/405 is handed to
 * `recheckAfterLiveNotFound`. This service never calls `markUnsupported`
 * (decision #46, R3-2).
 */
import { randomUUID } from 'node:crypto';
import {
  GateResultSchema,
  PreflightResultSchema,
  type GateResult,
  type PreflightResult,
  type RouteDecideResult,
} from './contracts/route-decide-result.schema';
import {
  RouteDecideArgsSchema,
  type RouteDecideArgs,
} from './contracts/route-decide-args.schema';
import {
  DECISION_MODEL_TIMEOUT_MIN_MS,
  isRetiredRole,
  loggableErrorName,
  type LoggableErrorName,
  type RouteSpawnFacts,
} from '@ptah-extension/shared';
import type { LaneCatalogRefresher, LaneCatalogSnapshotReader } from './catalog/lane-catalog.types';
import type { DecisionModelConfig } from './decision-model/decision-model.config';
import { DecisionCaller } from './decision-model/decision-caller';
import type { StructuredDecisionCompleter } from './decision-model/structured-decision.port';
import type { SystemOneClientOptions, SystemOneFetch } from './decision-model/system-one.client';
import {
  ollamaPsUrl,
  residentFromPsBody,
  SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS,
} from './decision-model/system-one.residency';
import type { LaneModelListing } from './lane-model-listing.port';
import type { LaneRoutingLogger } from './lane-routing-logger';
import type { OutcomeFigureLookup } from './matrix/outcome-figures';
import type { RouteCandidateSource } from './route-candidate-source.port';
import type { PhaseDefinitionReader } from './phase-definition-reader.port';
import type { RotationPick } from './ranking/rotation.store';
import { assembleGateResult } from './pipeline/assemble-gate';
import {
  emptyTally,
  noteUsage,
  preflightQuestions,
  readPreflight,
  usageOf,
} from './pipeline/preflight-answer';
import {
  gatherRouteCall,
  type GatheredCall,
  type RouteMatrix,
  type RouteRotation,
} from './pipeline/gather';
import {
  runFixedRequest,
  runLaneRequest,
  type ModelDispatch,
  type ModelRequestOutcome,
  type SystemOneCaller,
} from './pipeline/model-refine';
import {
  dispatchMode,
  implementersOf,
  isReviewPhase,
  laneQuestion,
  planRoutePhases,
  storePass,
  type DispatchMode,
  type GateArgs,
  type OpenedCaller,
  type PassContext,
  type PhasePlan,
  type PhaseResolution,
} from './pipeline/phase-plan';
import { isSendable } from './pipeline/phase-resolve';
import { emptyOutcome } from './pipeline/model-call';
import {
  capRouteDeadline,
  createRouteDeadline,
  withinBudget,
  type RouteDeadline,
} from './pipeline/route-deadline';
import type { RoutingCandidate } from './ranking/candidate.types';
import {
  emptyRotationState,
  rotationKey,
  withPick,
  type RotationState,
} from './ranking/rotation.store';
import { overallConfidence } from './reasons/confidence';
import { compilePreflightReasons } from './reasons/compile-reasons';
import { gateSummary, preflightSummary, type DecisionSummaryFacts } from './reasons/decision-summary';
import { RouteRecordRegistry, type RouteRecordReader } from './route/route-record.registry';
import type { PreflightReuseCache } from './scope/preflight-reuse-cache';
import type { RoutingRulesSetting } from './scope/routing-rules-setting';
import {
  DECISION_QUESTIONS_PER_CALL,
  DECISION_REQUEST_TIMEOUT_MS,
  MODEL_LISTING_BUDGET_MS,
  MIN_OPTIONS_PER_PHASE,
  QUESTIONS_PER_REQUEST,
  REQUEST_SIZE_LIMIT_BYTES,
  ROUTE_DEADLINE_MS,
  ROUTE_RETURN_RESERVE_MS,
} from './routing-constants';

export interface RouteDecideSeams {
  readonly now?: () => number;
  readonly monotonicNow?: () => number;
  readonly residencyFetch?: SystemOneFetch;
  readonly maxRequestBytes?: number;
  readonly listingBudgetMs?: number;
  /** Receives the options the default client would use, including the timeout. */
  readonly systemOne?: (options: SystemOneClientOptions) => SystemOneCaller;
}

export interface RouteDecideDependencies {
  readonly routingRulesSetting?: Pick<RoutingRulesSetting, 'read'>;
  readonly rotationSetting?: { isEnabled(): boolean };
  readonly performanceRouting?: { isEnabled(): boolean };
  readonly catalog?: Pick<LaneCatalogSnapshotReader, 'get'> & LaneCatalogRefresher;
  readonly newRouteId?: () => string;
  readonly config: DecisionModelConfig;
  readonly readPrefillTokensPerSecond?: () => unknown;
  readonly matrix: RouteMatrix;
  readonly rotation: RouteRotation;
  readonly logger: LaneRoutingLogger;
  readonly listing?: LaneModelListing;
  readonly structured?: StructuredDecisionCompleter;
  readonly reuse?: PreflightReuseCache;
  readonly phaseDefinitionReader?: PhaseDefinitionReader;
  readonly seams?: RouteDecideSeams;
}

const ROTATION_SAVE_TIMEOUT_MS = 1000;

type PreflightArgs = Extract<RouteDecideArgs, { stage: 'pre-flight' }>;

/**
 * Plain class. The register function builds it with `useFactory` because
 * the listing and structured ports are optional and the seams are not
 * constructor tokens.
 */
export interface RotationStateReader {
  getLastPicks(): { readonly entries: readonly RotationPick[]; readonly reason: string | null };
}

export class RouteDecideService implements RotationStateReader, RouteRecordReader {
  private rotationWrites = Promise.resolve();
  private readonly decisionCaller: DecisionCaller;
  private readonly routeRecords = new RouteRecordRegistry();

  constructor(private readonly deps: RouteDecideDependencies) {
    this.decisionCaller = new DecisionCaller(deps);
  }

  getLastPicks(): { readonly entries: readonly RotationPick[]; readonly reason: string | null } {
    const loaded = this.deps.rotation.load();
    return { entries: loaded.state.entries, reason: loaded.reason };
  }

  spawnFacts(routeId: string, phaseId: string): RouteSpawnFacts | null {
    return this.routeRecords.spawnFacts(routeId, phaseId);
  }

  async decide(
    args: unknown,
    source: RouteCandidateSource,
    context?: { readonly sessionKey?: string; readonly deadlineAtMs?: number },
  ): Promise<RouteDecideResult> {
    const started = this.nowMs;
    const monotonicNow = this.deps.seams?.monotonicNow ?? (() => performance.now());
    const enteredAt = monotonicNow();
    let stage: 'pre-flight' | 'gate-0.1' | 'unknown' = 'unknown';
    try {
      const parsed = RouteDecideArgsSchema.safeParse(args);
      if (!parsed.success) {
        throw schemaError('invalid route decide args', parsed.error);
      }
      stage = parsed.data.stage;
      const suppliedDeadline = context?.deadlineAtMs;
      const deadline = createRouteDeadline(
        suppliedDeadline !== undefined && Number.isFinite(suppliedDeadline)
          ? suppliedDeadline
          : enteredAt + ROUTE_DEADLINE_MS[stage],
        monotonicNow,
      );
      const ioDeadline = createRouteDeadline(
        deadline.deadlineAtMs - ROUTE_RETURN_RESERVE_MS,
        monotonicNow,
      );
      if (parsed.data.stage === 'pre-flight') {
        if (context?.sessionKey !== undefined && this.deps.reuse !== undefined) {
          const fingerprint = JSON.stringify(this.deps.config.getSelection());
          const cached = this.deps.reuse.get(context.sessionKey, fingerprint);
          if (cached !== null) {
            const reused = PreflightResultSchema.safeParse({
              ...cached,
              reasons: [...cached.reasons, 'reused host pre-flight result'],
              usage: {
                requests: 0,
                inputTokens: null,
                outputTokens: null,
                costUsd: null,
              },
            });
            if (!reused.success) {
              throw schemaError(
                'route decide result failed schema',
                reused.error,
              );
            }
            this.logSummary(() => preflightSummary(reused.data, {
              durationMs: this.nowMs - started, caller: 'unset', model: null,
              timeoutMs: null, reused: true, outcomeFigures: 0,
            }));
            return reused.data;
          }
        }
        return await this.decidePreflight(parsed.data, started, ioDeadline);
      }
      return await this.decideGate(parsed.data, source, started, deadline, ioDeadline);
    } catch (error: unknown) {
      this.logSummary(() => ({
        stage, outcome: 'error', name: errorFacts(error).name,
        durationMs: this.nowMs - started,
      }));
      throw error;
    }
  }

  private async decidePreflight(
    args: PreflightArgs,
    started: number,
    deadline: RouteDeadline,
  ): Promise<PreflightResult> {
    const caller = await this.openCaller(deadline);
    const tally = emptyTally();
    let outcome: ModelRequestOutcome | null = null;
    if (caller.kind === 'system-one' || caller.kind === 'structured') {
      outcome = await this.requestWithinDeadline(caller, deadline, (dispatch) => runFixedRequest({
        request: args.request,
        questions: preflightQuestions(),
        maxRequestBytes: this.maxBytes,
        dispatch,
        logger: this.deps.logger,
      }));
      noteUsage(tally, outcome);
    }
    const read = readPreflight(caller, outcome);
    const reasons = compilePreflightReasons({
      answers: [read.taskType.facts, read.depth.facts],
      missingInputs: [],
    });
    const result: PreflightResult = {
      stage: 'pre-flight',
      taskType: read.taskType.answer,
      depth: read.depth.answer,
      overallConfidence: overallConfidence([
        {
          source: read.taskType.answer.source,
          reportedConfidence: read.taskType.answer.confidence,
        },
        {
          source: read.depth.answer.source,
          reportedConfidence: read.depth.answer.confidence,
        },
      ]),
      reasons: outcome?.requestReason === undefined ? [...reasons] : [...reasons, outcome.requestReason],
      usage: usageOf(tally),
    };
    const validated = PreflightResultSchema.safeParse(result);
    if (!validated.success) {
      throw schemaError('route decide result failed schema', validated.error);
    }
    this.logSummary(() => preflightSummary(validated.data, this.summaryFacts(caller, started, 0)));
    return validated.data;
  }

  private async decideGate(
    args: GateArgs,
    source: RouteCandidateSource,
    started: number,
    deadline: RouteDeadline,
    ioDeadline: RouteDeadline,
  ): Promise<GateResult> {
    const choice = this.deps.performanceRouting?.isEnabled() ?? false;
    const routeId = (this.deps.newRouteId ?? randomUUID)();
    const rotate = this.deps.rotationSetting?.isEnabled() ?? true;
    const routingRules = this.deps.routingRulesSetting?.read();
    const [caller, gathered] = await Promise.all([
      this.openCaller(ioDeadline),
      gatherRouteCall({
        source,
        listing: this.deps.listing,
        choice,
        catalog: this.deps.catalog,
        matrix: this.deps.matrix,
        rotation: this.deps.rotation,
        logger: this.deps.logger,
        nowMs: this.nowMs,
        listingBudgetMs: this.listingBudget,
        deadline: ioDeadline,
        phases: args.phases,
        phaseDefinitionReader: this.deps.phaseDefinitionReader,
      }),
    ]);
    const mode = dispatchMode(caller);
    const phases = gathered.resolvedPhases ?? args.phases;
    const effectiveArgs: GateArgs = { ...args, phases };
    const toolNamesByPhase = gathered.toolNamesByPhase;
    const inputRowIds: string[] = [];
    const remember = (candidates: readonly RoutingCandidate[]): void => {
      for (const candidate of candidates) {
        if (!inputRowIds.includes(candidate.id)) inputRowIds.push(candidate.id);
      }
    };

    let cursor = gathered.rotation;
    const nonReview = phases.filter((phase) => !isReviewPhase(phase.kind));
    const pass1 = planRoutePhases(
      nonReview,
      effectiveArgs,
      gathered,
      cursor,
      true,
      [],
      remember,
      rotate,
      toolNamesByPhase,
      routingRules,
    );
    cursor = pass1.cursor;
    const pass1Run = await this.runPass(
      pass1.plans, args, caller, mode, gathered.matrix.outcomeFigures, ioDeadline,
    );
    const resolutions = new Map<string, PhaseResolution>();
    const plans = new Map<string, PhasePlan>();
    storePass(pass1.plans, pass1Run.context, plans, resolutions);

    const reviews = phases.filter((phase) => isReviewPhase(phase.kind));
    const pass2 = planRoutePhases(
      reviews,
      effectiveArgs,
      gathered,
      cursor,
      false,
      implementersOf(pass1.plans, resolutions),
      remember,
      rotate,
      toolNamesByPhase,
      routingRules,
    );
    const pass2Run = await this.runPass(
      pass2.plans, args, caller, mode, gathered.matrix.outcomeFigures, ioDeadline,
    );
    storePass(pass2.plans, pass2Run.context, plans, resolutions);

    const tally = emptyTally();
    noteUsage(tally, pass1Run.outcome);
    noteUsage(tally, pass2Run.outcome);
    const result = assembleGateResult(
      args,
      gathered,
      plans,
      resolutions,
      inputRowIds,
      tally,
      [pass1Run.outcome, pass2Run.outcome],
      routeId,
    );
    const costReasons = new Map<string, string>();
    for (const [pass, run] of [[pass1, pass1Run], [pass2, pass2Run]] as const) {
      const reason = run.outcome?.requestReason;
      if (reason === undefined) continue;
      for (const plan of pass.plans) costReasons.set(plan.phaseId, reason);
    }
    const deadlineReads = gathered.deadlineReads;
    const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
    const pinById = new Map(args.pins?.map((pin) => [pin.phaseId, pin.executor]));
    const validated = GateResultSchema.safeParse(costReasons.size > 0 || deadlineReads !== undefined ? {
      ...result,
      roster: result.roster.map((row) => {
        const costReason = costReasons.get(row.phaseId);
        if (row.fallbackCause === 'deadline' && costReason !== undefined) {
          return { ...row, reason: `${row.reason}; ${costReason}` };
        }
        if (row.status === 'unavailable' && deadlineReads !== undefined && unavailableReadTimedOut(
          row,
          phaseById.get(row.phaseId)?.role,
          pinById.get(row.phaseId),
          plans.get(row.phaseId)?.inventory ?? [],
          deadlineReads,
        )) {
          return {
            ...row,
            reason: `${row.reason}; route deadline reached`,
            ...(row.explanation === undefined ? {} : {
              explanation: `${row.explanation}; route deadline reached`,
            }),
          };
        }
        return row;
      }),
    } : result);
    if (!validated.success) {
      throw schemaError('route decide result failed schema', validated.error);
    }
    this.routeRecords.store(routeId, validated.data.roster, decisionModelIdOf(caller));
    if (!gathered.rotationUnavailable) {
      let picks = emptyRotationState();
      for (const row of validated.data.roster) {
        if (row.status === 'chosen') {
          picks = withPick(picks, rotationKey(row.phaseId, row.taskKind), row.executor.id);
        }
      }
      if (picks.entries.length > 0) this.queueRotationWrite(picks, deadline);
    }
    this.logSummary(() => gateSummary(validated.data, this.summaryFacts(
      caller, started,
      (pass1Run.outcome?.outcomeFigures ?? 0) + (pass2Run.outcome?.outcomeFigures ?? 0),
    )));
    return validated.data;
  }

  private async openCaller(deadline: RouteDeadline): Promise<OpenedCaller> {
    const opened = await withinBudget(deadline, () => this.decisionCaller.openCaller());
    if (opened.kind === 'ok') return opened.value;
    if (opened.kind === 'error') throw opened.error;
    return { kind: 'blocked', cause: 'deadline' };
  }

  private async requestWithinDeadline(
    caller: Extract<OpenedCaller, { kind: 'system-one' | 'structured' }>,
    deadline: RouteDeadline,
    run: (dispatch: ModelDispatch) => Promise<ModelRequestOutcome>,
  ): Promise<ModelRequestOutcome> {
    if (!(deadline.remainingMs() >= DECISION_MODEL_TIMEOUT_MIN_MS)) return emptyOutcome('deadline');
    if (caller.kind === 'system-one' && caller.target.locality === 'local' && caller.target.probe === 'daemon') {
      const url = ollamaPsUrl(caller.target.baseUrl);
      const residency = await withinBudget(
        capRouteDeadline(deadline, SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS),
        async (signal) => {
          if (url === null) return null;
          const response: Awaited<ReturnType<SystemOneFetch>> & Partial<Pick<Response, 'body'>> =
            await (this.deps.seams?.residencyFetch ?? fetch)(url, { method: 'GET', signal });
          if (!response.ok) {
            void response.body?.cancel().catch(() => {
              // degradation-audit: optional-capability - the HTTP failure is logged below.
            });
            return { status: response.status };
          }
          return residentFromPsBody(await response.text(), caller.target.model);
        },
      );
      if (residency.kind === 'error') {
        this.deps.logger.debug('[lane-routing] residency probe failed', errorFacts(residency.error));
      } else if (residency.kind === 'deadline') {
        this.deps.logger.debug('[lane-routing] residency probe timed out');
      } else if (typeof residency.value === 'object' && residency.value !== null) {
        this.deps.logger.debug('[lane-routing] residency probe returned an HTTP error', residency.value);
      }
      if (!(deadline.remainingMs() >= DECISION_MODEL_TIMEOUT_MIN_MS)) return emptyOutcome('deadline');
      if (residency.kind !== 'ok' || residency.value !== true) return emptyOutcome('model-cold');
    }

    let sent = false;
    const configuredTimeoutMs = caller.kind === 'system-one'
      ? caller.target.timeoutMs
      : DECISION_REQUEST_TIMEOUT_MS;
    let cappedByDeadline = false;
    let cappedStructuredSignal: AbortSignal | undefined;
    const result = await withinBudget(deadline, async (signal) => {
      // Arm the outer timer before synchronous payload fitting begins.
      await Promise.resolve();
      const timeoutCapMs = Math.floor(deadline.remainingMs());
      if (!(timeoutCapMs >= DECISION_MODEL_TIMEOUT_MIN_MS)) return emptyOutcome('deadline');
      const dispatch = this.decisionCaller.dispatchFor(caller, { signal, remainingMs: deadline.remainingMs });
      if (dispatch.kind === 'system-one') {
        return run({
          ...dispatch,
          caller: {
            decide: (payload, capMs) => {
              sent = true;
              cappedByDeadline = (capMs ?? timeoutCapMs) <= configuredTimeoutMs;
              return dispatch.caller.decide(payload, capMs);
            },
          },
        });
      }
      if (timeoutCapMs <= configuredTimeoutMs) cappedStructuredSignal = dispatch.signal;
      return run({
        ...dispatch,
        completer: {
          isReady: (id) => dispatch.completer.isReady(id),
          complete: async (input) => {
            sent = true;
            try {
              return await dispatch.completer.complete(input);
            } catch (error: unknown) {
              if (signal.aborted || cappedStructuredSignal?.aborted) {
                throw dispatch.signal.reason;
              }
              throw error;
            }
          },
        },
      });
    });
    if (result.kind === 'error') throw result.error;
    if (result.kind === 'deadline') return { ...emptyOutcome('deadline'), sent };
    void this.decisionCaller.noteLive(caller, result.value).catch(
      (error: unknown) => this.logBackgroundFailure('decision model live recheck failed', error),
    );
    return (cappedByDeadline && result.value.requestCause === 'timeout') ||
      (result.value.requestCause !== null && cappedStructuredSignal?.aborted === true)
      ? { ...result.value, requestCause: 'deadline' }
      : result.value;
  }

  private logBackgroundFailure(message: string, error: unknown): void {
    try {
      this.deps.logger.warn(`[lane-routing] ${message}`, errorFacts(error));
    } catch {
      // degradation-audit: optional-capability - a broken logger cannot reject background work.
    }
  }

  private summaryFacts(caller: OpenedCaller, started: number, outcomeFigures: number): DecisionSummaryFacts {
    return {
      durationMs: this.nowMs - started,
      caller: caller.kind,
      model: caller.kind === 'system-one' ? caller.target.model : caller.kind === 'structured' ? caller.model : null,
      timeoutMs: caller.kind === 'system-one' ? caller.target.timeoutMs : null,
      reused: false,
      outcomeFigures,
    };
  }

  private logSummary(build: () => Record<string, unknown>): void {
    try {
      this.deps.logger.info('[lane-routing] route decided', build());
    } catch (error: unknown) {
      // degradation-audit: reported - summary logging must not interrupt a completed route
      try {
        this.deps.logger.warn('[lane-routing] route summary failed', errorFacts(error));
      } catch {
        // degradation-audit: optional-capability - a broken host logger cannot interrupt routing
      }
    }
  }

  private async runPass(
    plans: readonly PhasePlan[],
    args: GateArgs,
    caller: OpenedCaller,
    mode: DispatchMode,
    outcomes: OutcomeFigureLookup,
    deadline: RouteDeadline,
  ): Promise<{
    readonly outcome: ModelRequestOutcome | null;
    readonly context: PassContext;
  }> {
    const sendable = mode === 'ranking' ? [] : plans.filter(isSendable);
    sendable.sort((a, b) =>
      Number(laneQuestion(b).primaryCount >= MIN_OPTIONS_PER_PHASE) -
      Number(laneQuestion(a).primaryCount >= MIN_OPTIONS_PER_PHASE),
    );
    const isSystemOne = caller.kind === 'system-one';
    const cap = isSystemOne ? DECISION_QUESTIONS_PER_CALL : QUESTIONS_PER_REQUEST;
    const send = sendable.slice(0, cap);
    const capped = new Set(sendable.slice(cap).map((plan) => plan.phaseId));
    let outcome: ModelRequestOutcome | null = null;
    if (
      mode === 'model' &&
      send.length > 0 &&
      (caller.kind === 'system-one' || caller.kind === 'structured')
    ) {
      outcome = await this.requestWithinDeadline(caller, deadline, (dispatch) => runLaneRequest({
        provider:
          caller.kind === 'structured' ? 'structuredOutput' : caller.provider,
        request: args.request,
        taskType: args.taskType,
        depth: args.depth,
        phases: send.map(laneQuestion),
        outcomes,
        maxRequestBytes: this.maxBytes,
        dispatch,
        logger: this.deps.logger,
      }));
      if (isSystemOne && capped.size > 0) outcome = { ...outcome, questionCap: capped };
    }
    return {
      outcome,
      context: {
        mode,
        blockedCause: caller.kind === 'blocked' ? caller.cause : null,
        limited: isSystemOne ? new Set() : capped,
        outcome,
      },
    };
  }

  private queueRotationWrite(picks: RotationState, deadline: RouteDeadline): void {
    this.rotationWrites = this.rotationWrites.then(async () => {
      if (deadline.remainingMs() <= 0) return;
      const saved = await withinBudget(
        capRouteDeadline(deadline, ROTATION_SAVE_TIMEOUT_MS),
        () => this.deps.rotation.save(picks),
      );
      if (saved.kind === 'deadline') {
        this.logBackgroundFailure('rotation state save timed out', new Error());
      } else if (saved.kind === 'error') {
        this.logBackgroundFailure('rotation state could not be saved', saved.error);
      }
    }).catch((error: unknown) => this.logBackgroundFailure('rotation state could not be saved', error));
  }

  private get nowMs(): number {
    return this.deps.seams?.now?.() ?? Date.now();
  }

  private get maxBytes(): number {
    return this.deps.seams?.maxRequestBytes ?? REQUEST_SIZE_LIMIT_BYTES;
  }

  private get listingBudget(): number {
    return this.deps.seams?.listingBudgetMs ?? MODEL_LISTING_BUDGET_MS;
  }
}

function schemaError(
  prefix: string,
  error: {
    readonly issues: readonly {
      readonly path: readonly PropertyKey[];
      readonly message: string;
    }[];
  },
): Error {
  const first = error.issues[0];
  const path =
    first !== undefined && first.path.length > 0
      ? first.path.map((part) => String(part)).join('.')
      : 'stage';
  return new Error(`${prefix} at ${path}: ${first?.message ?? 'invalid'}`);
}

/**
 * Log facts of a rejection from the key store, the target resolver or the
 * rotation store. Its `name` and `code` are set by that dependency and can
 * carry a key (a key can even equal a real Node code), so only the fixed
 * `loggableErrorName` category is logged and the code is never read.
 */
function unavailableReadTimedOut(
  row: Extract<GateResult['roster'][number], { status: 'unavailable' }>,
  role: string | undefined,
  pin: string | undefined,
  inventory: readonly RoutingCandidate[],
  reads: NonNullable<GatheredCall['deadlineReads']>,
): boolean {
  if (reads.rows && (pin === undefined ||
    row.pinRule === 'not-listed' && pin !== 'child-session' && !pin.startsWith('subagent:'))) {
    return true;
  }
  if (reads.roles && role !== undefined && !isRetiredRole(role) &&
      (pin === undefined || row.pinRule === 'not-listed' && pin === `subagent:${role}`)) {
    return true;
  }
  const capabilityBlocked = row.exclusionReason === 'missing-capability' ||
    row.pinRule === 'missing-capability' || row.pinRule === 'capability-unknown';
  if (!capabilityBlocked) return false;
  if (reads.phaseDefinitions?.has(row.phaseId)) return true;

  const timedOut = reads.tools?.get(row.phaseId);
  if (timedOut === undefined) return false;
  if (pin === undefined) {
    return row.excludedBy.some((entry) => entry.rule === 'capability-unknown' && timedOut.has(entry.candidate));
  }
  if (row.pinRule !== 'capability-unknown') return false;
  const target = inventory.find((candidate) => candidate.id === pin) ??
    inventory.find((candidate) => candidate.kind === 'lane' && candidate.cli === pin);
  return target !== undefined && timedOut.has(target.id);
}

function decisionModelIdOf(caller: OpenedCaller): string | null {
  if (caller.kind === 'system-one') return `${caller.selection.kind}:${caller.target.model}`;
  if (caller.kind === 'structured') return `structured:${caller.providerId}/${caller.model}`;
  return null;
}

function errorFacts(error: unknown): { readonly name: LoggableErrorName } {
  return { name: loggableErrorName(error) };
}
