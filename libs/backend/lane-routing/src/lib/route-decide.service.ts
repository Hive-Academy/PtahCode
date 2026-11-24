/**
 * Route-decide pipeline (part A §6, Batch 21).
 *
 * Gather, constrain, score, spread, then at most two decision-model
 * requests. A live System One 404/405 is handed to
 * `recheckAfterLiveNotFound`. This service never calls `markUnsupported`
 * (decision #46, R3-2).
 */
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
  loggableErrorName,
  type LoggableErrorName,
} from '@ptah-extension/shared';
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
} from './ranking/rotation.store';
import { overallConfidence } from './reasons/confidence';
import { compilePreflightReasons } from './reasons/compile-reasons';
import { gateSummary, preflightSummary, type DecisionSummaryFacts } from './reasons/decision-summary';
import type { PreflightReuseCache } from './scope/preflight-reuse-cache';
import type { RoutingRulesSetting } from './scope/routing-rules-setting';
import {
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
  readonly config: DecisionModelConfig;
  readonly matrix: RouteMatrix;
  readonly rotation: RouteRotation;
  readonly logger: LaneRoutingLogger;
  readonly listing?: LaneModelListing;
  readonly structured?: StructuredDecisionCompleter;
  readonly reuse?: PreflightReuseCache;
  readonly phaseDefinitionReader?: PhaseDefinitionReader;
  readonly seams?: RouteDecideSeams;
}

type PreflightArgs = Extract<RouteDecideArgs, { stage: 'pre-flight' }>;

/**
 * Plain class. The register function builds it with `useFactory` because
 * the listing and structured ports are optional and the seams are not
 * constructor tokens.
 */
export interface RotationStateReader {
  getLastPicks(): { readonly entries: readonly RotationPick[]; readonly reason: string | null };
}

export class RouteDecideService implements RotationStateReader {
  private rotationWrites = Promise.resolve();
  private readonly decisionCaller: DecisionCaller;

  constructor(private readonly deps: RouteDecideDependencies) {
    this.decisionCaller = new DecisionCaller(deps);
  }

  getLastPicks(): { readonly entries: readonly RotationPick[]; readonly reason: string | null } {
    const loaded = this.deps.rotation.load();
    return { entries: loaded.state.entries, reason: loaded.reason };
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
      const deadline = createRouteDeadline(
        context?.deadlineAtMs ?? enteredAt + ROUTE_DEADLINE_MS[stage],
        monotonicNow,
      );
      const ioDeadline = createRouteDeadline(
        deadline.deadlineAtMs - ROUTE_RETURN_RESERVE_MS,
        monotonicNow,
      );
      if (parsed.data.stage === 'pre-flight') {
        if (ioDeadline.remainingMs() > 0 && context?.sessionKey !== undefined && this.deps.reuse !== undefined) {
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
      reasons: [...reasons],
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
    const rotate = this.deps.rotationSetting?.isEnabled() ?? true;
    const routingRules = this.deps.routingRulesSetting?.read();
    const [caller, gathered] = await Promise.all([
      this.openCaller(ioDeadline),
      gatherRouteCall({
        source,
        listing: this.deps.listing,
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
    );
    const validated = GateResultSchema.safeParse(ioDeadline.remainingMs() === 0 ? {
      ...result,
      roster: result.roster.map((row) => row.status === 'unavailable'
        ? { ...row, reason: `${row.reason}; route deadline reached` }
        : row),
    } : result);
    if (!validated.success) {
      throw schemaError('route decide result failed schema', validated.error);
    }
    this.rotationWrites = this.rotationWrites.then(async () => {
      if (deadline.remainingMs() > 0) await this.persistRotation(gathered, validated.data);
    }).catch((error: unknown) => this.logBackgroundFailure('rotation state could not be saved', error));
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
    if (deadline.remainingMs() < DECISION_MODEL_TIMEOUT_MIN_MS) return emptyOutcome('deadline');
    if (caller.kind === 'system-one' && caller.target.locality === 'local' && caller.target.probe === 'daemon') {
      const url = ollamaPsUrl(caller.target.baseUrl);
      const residency = await withinBudget(
        capRouteDeadline(deadline, SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS),
        async (signal) => {
          if (url === null) return null;
          const response = await (this.deps.seams?.residencyFetch ?? fetch)(url, { method: 'GET', signal });
          return response.ok ? residentFromPsBody(await response.text(), caller.target.model) : null;
        },
      );
      if (deadline.remainingMs() < DECISION_MODEL_TIMEOUT_MIN_MS) return emptyOutcome('deadline');
      if (residency.kind !== 'ok' || residency.value !== true) return emptyOutcome('model-cold');
    }

    let sent = false;
    const result = await withinBudget(deadline, async (signal) => {
      // Arm the outer timer before synchronous payload fitting begins.
      await Promise.resolve();
      const timeoutCapMs = Math.floor(deadline.remainingMs());
      if (timeoutCapMs < DECISION_MODEL_TIMEOUT_MIN_MS) return emptyOutcome('deadline');
      const dispatch = this.decisionCaller.dispatchFor(caller, { signal, timeoutCapMs });
      if (dispatch.kind === 'system-one') {
        return run({
          ...dispatch,
          caller: {
            decide: (payload) => {
              sent = true;
              return dispatch.caller.decide(payload);
            },
          },
        });
      }
      return run({
        ...dispatch,
        completer: {
          isReady: (id) => dispatch.completer.isReady(id),
          complete: (input) => {
            sent = true;
            return dispatch.completer.complete(input);
          },
        },
      });
    });
    if (result.kind === 'error') throw result.error;
    if (result.kind === 'deadline') return { ...emptyOutcome('deadline'), sent };
    void this.decisionCaller.noteLive(caller, result.value).catch(
      (error: unknown) => this.logBackgroundFailure('decision model live recheck failed', error),
    );
    return result.value;
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
    const send = sendable.slice(0, QUESTIONS_PER_REQUEST);
    const limited = new Set(
      sendable.slice(QUESTIONS_PER_REQUEST).map((plan) => plan.phaseId),
    );
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
        phases: send.map(laneQuestion),
        outcomes,
        maxRequestBytes: this.maxBytes,
        dispatch,
        logger: this.deps.logger,
      }));
    }
    return {
      outcome,
      context: {
        mode,
        blockedCause: caller.kind === 'blocked' ? caller.cause : null,
        limited,
        outcome,
      },
    };
  }

  private async persistRotation(
    gathered: GatheredCall,
    result: GateResult,
  ): Promise<void> {
    if (gathered.rotationUnavailable) return;
    const chosen = result.roster.filter((entry) => entry.status === 'chosen');
    if (chosen.length === 0) return;
    let picks = emptyRotationState();
    for (const entry of chosen) {
      picks = withPick(
        picks,
        rotationKey(entry.phaseId, entry.taskKind),
        entry.executor.id,
      );
    }
    await this.deps.rotation.save(picks);
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
function errorFacts(error: unknown): { readonly name: LoggableErrorName } {
  return { name: loggableErrorName(error) };
}
