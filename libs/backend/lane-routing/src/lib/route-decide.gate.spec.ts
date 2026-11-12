import {
  createMockSecretStorage,
  createMockStateStorage,
  createMockWorkspaceProvider,
} from '@ptah-extension/platform-core/testing';
import type {
  CliDetectionResult,
  CliType,
  LaneLimitState,
} from '@ptah-extension/shared';

import { GateResultSchema } from './contracts/route-decide-result.schema';
import type { DecisionPayload } from './decision-model/decision-payload';
import { DecisionModelConfig } from './decision-model/decision-model.config';
import {
  SYSTEM_ONE_CONTROL_PATH,
  type DecisionModelStatusDto,
} from './decision-model/decision-model.types';
import type { StructuredDecisionCompleter } from './decision-model/structured-decision.port';
import {
  SYSTEM_ONE_PATH,
  type SystemOneCallResult,
  type SystemOneClientOptions,
  type SystemOneFetch,
} from './decision-model/system-one.client';
import type { LaneModelListing } from './lane-model-listing.port';
import type { LaneRoutingLogger } from './lane-routing-logger';
import { FAMILY_PROFILE_MODEL } from './matrix/matrix.types';
import { EMPTY_OUTCOME_FIGURES } from './matrix/outcome-figures';
import type { RouteMatrix } from './pipeline/gather';
import { systemOneClientOptions } from './pipeline/model-refine';
import { BUILTIN_SUBAGENT_ROLES } from './pipeline/phase-plan';
import {
  emptyRotationState,
  type RotationState,
} from './ranking/rotation.store';
import type { RouteCandidateSource } from './route-candidate-source.port';
import {
  RouteDecideService,
  type RouteDecideSeams,
} from './route-decide.service';
import {
  DECISION_REQUEST_TIMEOUT_MS,
  QUESTIONS_PER_REQUEST,
} from './routing-constants';

const SELECTION_KEY = 'ptah.agentOrchestration.decisionModel';
const OLLAMA = { kind: 'ollama', model: 'nimble' } as const;
const LIVE_DETAIL = 'model "nimble" not found';
const VERSION_PATH = '/api/version';
const GO_NOT_FOUND = { status: 404, body: '404 page not found' };
const VERSION_OK = { status: 200, body: '{"version":"0.40.0"}' };
const MODEL_REQUIRED = { status: 400, body: '{"error":"model is required"}' };

interface FakeRoute {
  readonly status: number;
  readonly body: string;
}

function testLogger(): LaneRoutingLogger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function lane(cli: CliType): CliDetectionResult {
  return { cli, installed: true, messagingMode: 'none' };
}

const THREE = [lane('codex'), lane('grok'), lane('opencode')] as const;

function neutralMatrix(): RouteMatrix {
  return {
    load: async () => ({
      outcomeFigures: EMPTY_OUTCOME_FIGURES,
      reasons: [],
      resolve: (family, model, taskKind) => ({
        family,
        model,
        profileModel: FAMILY_PROFILE_MODEL,
        taskKind,
        cell: { kind: 'unknown' },
        score: 50,
        noProfile: true,
      }),
    }),
  };
}

function memoryRotation(): {
  load(): { state: RotationState; reason: null };
  save(state: RotationState): Promise<{ persisted: boolean }>;
} {
  let state = emptyRotationState();
  return {
    load: () => ({ state, reason: null }),
    save: async (next) => {
      state = next;
      return { persisted: true };
    },
  };
}

function candidateSource(
  rows:
    | readonly CliDetectionResult[]
    | (() => Promise<readonly CliDetectionResult[]>),
  limits?: ReadonlyMap<string, LaneLimitState> | null,
): RouteCandidateSource {
  return {
    rows: typeof rows === 'function' ? rows : async () => rows,
    limits: async () => (limits === undefined ? new Map() : limits),
    roles: async () => [],
  };
}

function listingOf(list: LaneModelListing['list']): LaneModelListing {
  return { list };
}

function fakeFetch(routes: Record<string, FakeRoute>): SystemOneFetch {
  return async (url) => {
    const path = new URL(url).pathname;
    const route = routes[path] ?? GO_NOT_FOUND;
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      text: async () => route.body,
    };
  };
}

function configFor(
  selection: unknown,
  fetchImpl: SystemOneFetch,
  structured?: StructuredDecisionCompleter,
): DecisionModelConfig {
  return new DecisionModelConfig(
    createMockWorkspaceProvider({
      config: selection === undefined ? {} : { [SELECTION_KEY]: selection },
    }),
    createMockSecretStorage(),
    createMockStateStorage(),
    testLogger(),
    structured,
    { fetch: fetchImpl, now: () => 1_000 },
  );
}

function answersFor(
  payload: DecisionPayload,
  choice: (
    key: string,
    index: number,
  ) => { readonly choice: string; readonly confidence?: number },
): SystemOneCallResult {
  const answers: Record<
    string,
    {
      type: 'choice';
      choice: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    }
  > = {};
  Object.keys(payload.questions).forEach((key, index) => {
    const picked = choice(key, index);
    answers[key] = {
      type: 'choice',
      choice: picked.choice,
      ...(picked.confidence !== undefined
        ? { confidence: picked.confidence }
        : {}),
    };
  });
  return {
    ok: true,
    result: {
      model: 'nimble',
      answers,
      usage: { input_tokens: 10, output_tokens: 4 },
    },
  };
}

function harness(options: {
  readonly selection?: unknown;
  readonly rows?: readonly CliDetectionResult[];
  readonly limits?: ReadonlyMap<string, LaneLimitState> | null;
  readonly listing?: LaneModelListing;
  readonly structured?: StructuredDecisionCompleter;
  readonly fetchImpl?: SystemOneFetch;
  readonly seams?: RouteDecideSeams;
  readonly reply?: (
    payload: DecisionPayload,
    index: number,
  ) => SystemOneCallResult;
  readonly rotation?: ReturnType<typeof memoryRotation>;
  readonly rotate?: boolean;
  readonly matrix?: RouteMatrix;
  readonly logger?: LaneRoutingLogger;
}) {
  const calls: DecisionPayload[] = [];
  const seen: SystemOneClientOptions[] = [];
  const rotation = options.rotation ?? memoryRotation();
  const rows = jest.fn(async () => options.rows ?? [...THREE]);
  const source: RouteCandidateSource = {
    rows,
    limits: async () =>
      options.limits === undefined ? new Map() : options.limits,
    roles: async () => [],
  };
  const service = new RouteDecideService({
    rotationSetting: { isEnabled: () => options.rotate ?? true },
    config: configFor(
      options.selection === undefined ? OLLAMA : options.selection,
      options.fetchImpl ??
        (async (url) => {
          throw new Error(`unexpected probe ${url}`);
        }),
      options.structured,
    ),
    matrix: options.matrix ?? neutralMatrix(),
    rotation,
    logger: options.logger ?? testLogger(),
    listing:
      options.listing ??
      listingOf(async () => [{ id: 'listed', provenance: 'reported' }]),
    ...(options.structured !== undefined
      ? { structured: options.structured }
      : {}),
    seams: {
      listingBudgetMs: options.seams?.listingBudgetMs,
      maxRequestBytes: options.seams?.maxRequestBytes,
      now: options.seams?.now,
      systemOne: (clientOptions) => {
        seen.push(clientOptions);
        if (options.seams?.systemOne !== undefined)
          return options.seams.systemOne(clientOptions);
        return {
          decide: async (payload) => {
            const index = calls.length;
            calls.push(payload);
            return (
              options.reply?.(payload, index) ??
              answersFor(payload, () => ({ choice: 'o1', confidence: 0.9 }))
            );
          },
        };
      },
    },
  });
  return { service, source, calls, seen, rows, rotation };
}

function implement(id = 'build') {
  return {
    stage: 'gate-0.1' as const,
    request: 'ship the change',
    taskType: 'FEATURE' as const,
    depth: 'Full' as const,
    phases: [{ id, kind: 'implement' as const }],
  };
}

describe('gate phase policy roster', () => {
  it.each(['batch', 'completion'] as const)('routes %s to an eligible lane', async (kind) => {
    const run = harness({ rotate: false, selection: { kind: 'unset' } });
    const result = await run.service.decide({ ...implement(), phases: [{ id: kind, kind }] }, run.source);
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(result.roster[0]).toMatchObject({ status: 'chosen', executor: { id: 'codex' }, taskKind: 'plan' });
  });

  it.each(['batch', 'completion'] as const)('leaves %s to the orchestrator with no lane', async (kind) => {
    const run = harness({ rows: [], rotate: false, selection: { kind: 'unset' } });
    const result = await run.service.decide({ ...implement(), phases: [{ id: kind, kind }] }, run.source);
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(result.roster[0]).toMatchObject({ status: 'unavailable', executor: 'unavailable', exclusionReason: 'no-eligible-candidate' });
    expect(result.roster[0].reason).toContain('No executor; the orchestrator does this phase');
    expect(result.roster[0].reason).not.toContain('-Infinity');
  });

  it.each(['batch', 'completion'] as const)('accepts an explicit role for %s', async (kind) => {
    const run = harness({ rows: [], rotate: false, selection: { kind: 'unset' } });
    const role = [...BUILTIN_SUBAGENT_ROLES][0];
    const result = await run.service.decide({ ...implement(), phases: [{ id: kind, kind, role }] }, run.source);
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(result.roster[0]).toMatchObject({ status: 'chosen', taskKind: 'plan' });
    expect(result.roster[0].reason).not.toContain('No executor; the orchestrator does this phase');
  });
  it('keeps the legacy executor and adds the default policy to its row', async () => {
    const run = harness({ rotate: false, selection: { kind: 'unset' } });
    const result = await run.service.decide(implement(), run.source);
    expect(GateResultSchema.safeParse(result).success).toBe(true);
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0]).toMatchObject({
      status: 'chosen',
      executor: { id: 'codex' },
      tier: 'sonnet',
      effort: 'medium',
    });
    expect(result.roster[0].reason).toMatch(
      /; policy R5; tier sonnet, effort medium, shape unset, weight unset$/,
    );
  });

  it('applies weighted policy without changing executor eligibility or choice', async () => {
    const phases = [
      { id: 'mechanical', kind: 'implement' as const, shape: 'mechanical' as const, weight: 2000 },
      { id: 'logic', kind: 'implement' as const, shape: 'logic' as const, weight: 9000 },
      { id: 'review', kind: 'review' as const, shape: 'docs' as const, weight: 2000 },
    ];
    const baseline = harness({ rotate: false, selection: { kind: 'unset' } });
    const weighted = harness({ rotate: false, selection: { kind: 'unset' } });
    const baseResult = await baseline.service.decide(
      { ...implement(), phases: phases.map(({ id, kind }) => ({ id, kind })) }, baseline.source,
    );
    const result = await weighted.service.decide({ ...implement(), phases }, weighted.source);
    expect(GateResultSchema.safeParse(baseResult).success).toBe(true);
    expect(GateResultSchema.safeParse(result).success).toBe(true);
    if (baseResult.stage !== 'gate-0.1' || result.stage !== 'gate-0.1')
      throw new Error('expected gate results');
    expect(result.roster.map((row) => row.executor)).toEqual(
      baseResult.roster.map((row) => row.executor),
    );
    expect(result.roster).toEqual([
      expect.objectContaining({ phaseId: 'mechanical', tier: 'haiku', effort: 'low', reason: expect.stringMatching(/; policy R4; tier haiku, effort low, shape mechanical, weight 2000$/) }),
      expect.objectContaining({ phaseId: 'logic', tier: 'opus', effort: 'xhigh', reason: expect.stringMatching(/; policy R3; tier opus, effort xhigh, shape logic, weight 9000$/) }),
      expect.objectContaining({ phaseId: 'review', tier: 'opus', effort: 'high', reason: expect.stringMatching(/; policy R2; tier opus, effort high, shape docs, weight 2000$/) }),
    ]);
  });

  it('uses a pinned subagent tier while retaining policy effort', async () => {
    const run = harness({ rotate: false, selection: { kind: 'unset' } });
    const result = await run.service.decide({
      ...implement(),
      phases: [{ id: 'build', kind: 'implement', shape: 'mechanical', weight: 2000 }],
      pins: [{ phaseId: 'build', executor: 'subagent:backend-developer', model: 'sonnet' }],
    }, run.source);
    expect(GateResultSchema.safeParse(result).success).toBe(true);
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(result.roster[0]).toMatchObject({
      status: 'chosen', source: 'pin', executor: { id: 'subagent:backend-developer' },
      model: 'sonnet', tier: 'sonnet', effort: 'low', provenance: 'tier',
    });
    expect(result.roster[0].reason).toMatch(/; policy R4; tier sonnet, effort low, shape mechanical, weight 2000$/);
  });

  it('keeps policy fields and fallback text when the decision model times out', async () => {
    const run = harness({ reply: () => ({ ok: false, cause: 'timeout', notFound: false, detail: 'slow' }) });
    const result = await run.service.decide(implement(), run.source);
    expect(GateResultSchema.safeParse(result).success).toBe(true);
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(result.roster[0]).toMatchObject({ status: 'chosen', source: 'ranking', fallbackCause: 'timeout', tier: 'sonnet', effort: 'medium' });
    expect(result.roster[0].reason).toContain('timeout');
    expect(result.roster[0].reason).toMatch(/; policy R5; tier sonnet, effort medium, shape unset, weight unset$/);
  });

  it('keeps policy fields and unavailability text on a null-model row', async () => {
    const limits = new Map<string, LaneLimitState>([
      ['codex', 'at-limit'], ['grok', 'at-limit'], ['opencode', 'at-limit'],
    ]);
    const run = harness({ limits });
    const result = await run.service.decide({
      ...implement(),
      phases: [{ id: 'build', kind: 'implement', role: 'custom-role', shape: 'logic', weight: 9000 }],
    }, run.source);
    expect(GateResultSchema.safeParse(result).success).toBe(true);
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(result.roster[0]).toMatchObject({ status: 'unavailable', model: null, exclusionReason: 'no-eligible-candidate', tier: 'opus', effort: 'xhigh' });
    expect(result.roster[0].reason).toContain('exclusion reason no-eligible-candidate');
    expect(result.roster[0].reason).toMatch(/; policy R3; tier opus, effort xhigh, shape logic, weight 9000$/);
  });
});

describe('route decide outcome figures', () => {
  it('passes only offered lane and phase-kind figures to the captured payload', async () => {
    const matrix: RouteMatrix = {
      load: async (input) => ({
        ...(await neutralMatrix().load(input)),
        outcomeFigures: (laneId, taskKind) => ({
          laneId,
          taskKind,
          delivered: 3,
          failed: 1,
        }),
      }),
    };
    const run = harness({ matrix });
    await run.service.decide(implement(), run.source);
    expect(run.calls).toHaveLength(1);
    const payload = run.calls[0];
    const offered = Object.keys(payload.state.availableExecutors).filter(
      (id) => id !== 'subagent',
    );
    expect(offered.length).toBeGreaterThan(0);
    expect(Object.keys(payload.state.pastOutcomes).sort()).toEqual(
      offered.map((id) => `${id}/implement`).sort(),
    );
    for (const id of offered) {
      expect(payload.state.pastOutcomes[`${id}/implement`]).toEqual({
        delivered: 3,
        failed: 1,
      });
    }
  });
});

const READY_ROUTES: Record<string, FakeRoute> = {
  [VERSION_PATH]: VERSION_OK,
  [SYSTEM_ONE_PATH]: MODEL_REQUIRED,
  [SYSTEM_ONE_CONTROL_PATH]: GO_NOT_FOUND,
};

const UNSUPPORTED_ROUTES: Record<string, FakeRoute> = {
  [VERSION_PATH]: VERSION_OK,
  [SYSTEM_ONE_PATH]: GO_NOT_FOUND,
  [SYSTEM_ONE_CONTROL_PATH]: GO_NOT_FOUND,
};

function notFoundReply(): SystemOneCallResult {
  return {
    ok: false,
    cause: 'provider-error',
    notFound: true,
    detail: LIVE_DETAIL,
  };
}

describe('route decide gate', () => {
  it('logs one safe gate summary after routing and survives a throwing logger', async () => {
    const logger = testLogger();
    const run = harness({ logger, seams: { now: () => 200 } });
    await run.service.decide({ ...implement(), request: 'SECRET REQUEST' }, run.source);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('[lane-routing] route decided', expect.objectContaining({
      stage: 'gate-0.1', outcome: 'ok', durationMs: 0, requests: 1, outcomeFigures: 0,
      phases: [expect.objectContaining({ phaseId: 'build', status: 'chosen', source: expect.any(String) })],
    }));
    const meta = JSON.stringify((logger.info as jest.Mock).mock.calls[0][1]);
    expect(meta).not.toMatch(/SECRET REQUEST|reasons|excludedBy|apiKey|baseUrl/);

    const broken = testLogger();
    broken.info = jest.fn(() => { throw new Error('secret error'); });
    const next = harness({ logger: broken });
    await expect(next.service.decide(implement(), next.source)).resolves.toMatchObject({ stage: 'gate-0.1' });
    expect(broken.warn).toHaveBeenCalledWith('[lane-routing] route summary failed', { name: expect.any(String) });
  });

  it('logs one error summary and rethrows a gate failure unchanged', async () => {
    const logger = testLogger();
    const failure = new Error('SECRET FAILURE');
    failure.name = 'SECRET NAME';
    logger.warn = jest.fn(() => { throw failure; });
    const run = harness({ logger, seams: { now: () => 200 } });
    const failingSource = {
      ...run.source,
      rows: jest.fn(async () => { throw new Error('source unavailable'); }),
    };

    await expect(run.service.decide(implement(), failingSource)).rejects.toBe(failure);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('[lane-routing] route decided', {
      stage: 'gate-0.1', outcome: 'error', name: 'other', durationMs: 0,
    });
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toMatch(/SECRET/);
  });

  it('keeps a ready row when a live notFound is re-checked', async () => {
    const { service, source, config } = probeHarness(READY_ROUTES);
    const mark = jest.spyOn(config, 'markUnsupported');
    const recheck = jest.spyOn(config, 'recheckAfterLiveNotFound');
    const success = jest.spyOn(config, 'recordLiveSuccess');

    const result = await service.decide(implement(), source);
    const status = await config.getStatus();

    expect(recheck).toHaveBeenCalledTimes(1);
    expect(mark).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(status.state).toBe('ready');
    expect(status.detail).toContain(`last call failed: ${LIVE_DETAIL}`);
    expect(result.stage).toBe('gate-0.1');
    expect(GateResultSchema.safeParse(result).success).toBe(true);
  });

  it('shows unsupported-endpoint when the re-check probe agrees', async () => {
    const { service, source, config } = probeHarness(UNSUPPORTED_ROUTES);
    const mark = jest.spyOn(config, 'markUnsupported');
    const recheck = jest.spyOn(config, 'recheckAfterLiveNotFound');

    await service.decide(implement(), source);
    const status: DecisionModelStatusDto = await config.getStatus();

    expect(recheck).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledTimes(1);
    const markOrder = mark.mock.invocationCallOrder[0];
    const recheckOrder = recheck.mock.invocationCallOrder[0];
    expect(markOrder).toBeGreaterThan(recheckOrder ?? 0);
    expect(status.state).toBe('unsupported-endpoint');
  });

  it('passes the decision timeout to the system one factory', async () => {
    const { service, source, seen } = harness({
      reply: () => ({
        ok: false,
        cause: 'timeout',
        notFound: false,
        detail: 'slow',
      }),
    });
    await service.decide(implement(), source);
    expect(seen[0]?.timeoutMs).toBe(DECISION_REQUEST_TIMEOUT_MS);
    expect(
      systemOneClientOptions({
        baseUrl: 'http://127.0.0.1:11434',
        model: 'nimble',
        probe: 'daemon',
        locality: 'local',
        timeoutMs: DECISION_REQUEST_TIMEOUT_MS,
        timeoutExplicit: false,
      }).timeoutMs,
    ).toBe(DECISION_REQUEST_TIMEOUT_MS);
  });

  it('ranks without a model call when the selection is unset', async () => {
    const { service, source, calls, rows } = harness({
      selection: { kind: 'unset' },
    });
    const result = await service.decide(implement(), source);
    expect(rows).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({
      stage: 'gate-0.1',
      overallSource: 'ranking',
      usage: { requests: 0, costUsd: null },
    });
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      source: 'ranking',
      fallbackCause: null,
    });
  });

  it('names the invalid field and does not call the candidate source', async () => {
    const { service, calls } = harness({});
    const unused = candidateSource([]);
    const rows = jest.spyOn(unused, 'rows');
    await expect(
      service.decide({ stage: 'gate-0.1', request: 'x' }, unused),
    ).rejects.toThrow(/invalid route decide args at taskType/);
    expect(rows).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('drops an invented choice and never copies it into the result', async () => {
    const { service, source } = harness({
      reply: () => ({
        ok: true,
        result: {
          model: 'nimble',
          answers: {
            build: {
              type: 'choice',
              choice: 'invented-lane',
              probabilities: { 'invented-model': 0.99 },
            },
          },
        },
      }),
    });
    const result = await service.decide(implement(), source);
    const text = JSON.stringify(result);
    expect(text).not.toContain('invented-lane');
    expect(text).not.toContain('invented-model');
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      source: 'ranking',
      fallbackCause: 'bad-output',
      modelProposal: null,
    });
  });

  it('accepts only an offered option', async () => {
    const { service, source } = harness({
      reply: (payload) =>
        answersFor(payload, () => ({ choice: 'o2', confidence: 0.8 })),
    });
    const result = await service.decide(implement(), source);
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      source: 'model',
      fallbackCause: null,
      confidence: 0.8,
    });
    if (entry?.status === 'chosen') expect(entry.executor.id).toBe('grok');
  });

  it('rotates equal lanes across three decisions before the subagent', async () => {
    const built = harness({});
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const result = await built.service.decide(implement(), built.source);
      const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
      if (entry?.status !== 'chosen') throw new Error('expected a choice');
      ids.push(entry.executor.id);
    }
    expect(ids).toEqual(['codex', 'grok', 'opencode']);
  });

  it('keeps the first ranking choice and cursor when rotation is off', async () => {
    const built = harness({ rotate: false, selection: { kind: 'unset' } });
    for (let index = 0; index < 2; index += 1) {
      const result = await built.service.decide(implement(), built.source);
      const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
      expect(entry?.status).toBe('chosen');
      if (entry?.status === 'chosen') expect(entry.executor.id).toBe('codex');
    }
    expect(built.rotation.load().state.entries).toMatchObject([{ candidateId: 'codex' }]);
  });

  it('keeps a review off the implementer family, including after request 1 fails', async () => {
    const args = {
      stage: 'gate-0.1' as const,
      request: 'ship the change',
      taskType: 'FEATURE' as const,
      depth: 'Full' as const,
      phases: [
        { id: 'build', kind: 'implement' as const },
        { id: 'check', kind: 'review' as const, reviews: ['build'] },
      ],
    };
    const accepted = harness({
      reply: (payload) =>
        answersFor(payload, () => ({ choice: 'o1', confidence: 0.9 })),
    });
    await accepted.service.decide(args, accepted.source);
    expect(JSON.stringify(accepted.calls[1])).not.toContain('lane codex');

    let attempt = 0;
    const failed = harness({
      reply: (payload) => {
        attempt += 1;
        if (attempt === 1)
          return {
            ok: false,
            cause: 'provider-error',
            notFound: false,
            detail: 'down',
          };
        return answersFor(payload, () => ({ choice: 'o1', confidence: 0.9 }));
      },
    });
    const result = await failed.service.decide(args, failed.source);
    expect(JSON.stringify(failed.calls[1])).not.toContain('lane codex');
    const build = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(build).toMatchObject({ status: 'chosen', source: 'ranking' });
    if (build?.status === 'chosen') expect(build.executor.id).toBe('codex');
  });

  it('reports no eligible candidate when every lane is at limit and the role is not a subagent', async () => {
    const limits = new Map<string, LaneLimitState>([
      ['codex', 'at-limit'],
      ['grok', 'at-limit'],
      ['opencode', 'at-limit'],
    ]);
    const { service, source, calls } = harness({ limits });
    const result = await service.decide(
      {
        ...implement(),
        phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
      },
      source,
    );
    expect(calls).toHaveLength(0);
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'unavailable',
      exclusionReason: 'no-eligible-candidate',
      source: 'ranking',
      confidence: null,
    });
    if (entry?.status === 'unavailable') {
      expect(entry.excludedBy.map((item) => item.rule)).toEqual([
        'at-limit',
        'at-limit',
        'at-limit',
      ]);
    }
    expect(
      result.stage === 'gate-0.1' ? result.overallConfidence : 1,
    ).toBeNull();
  });

  it('chooses the built-in subagent when every lane is at limit', async () => {
    const limits = new Map<string, LaneLimitState>([
      ['codex', 'at-limit'],
      ['grok', 'at-limit'],
      ['opencode', 'at-limit'],
    ]);
    const { service, source, calls } = harness({ limits });
    const result = await service.decide(implement(), source);
    expect(calls).toHaveLength(0);
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      source: 'ranking',
      executor: { kind: 'subagent', id: 'subagent:backend-developer' },
    });
    if (entry?.status === 'chosen')
      expect(entry.reason).toContain('only eligible candidate');
  });

  it.each([
    'timeout',
    'unreachable',
    'auth',
    'provider-error',
    'bad-output',
  ] as const)('falls back to ranking on %s', async (cause) => {
    const { service, source } = harness({
      reply: () => ({ ok: false, cause, notFound: false, detail: 'down' }),
    });
    const result = await service.decide(implement(), source);
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      source: 'ranking',
      fallbackCause: cause,
    });
  });

  it('falls back on low confidence and keeps the offered label as the proposal', async () => {
    const { service, source } = harness({
      reply: (payload) =>
        answersFor(payload, () => ({ choice: 'o1', confidence: 0.2 })),
    });
    const result = await service.decide(implement(), source);
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      source: 'ranking',
      fallbackCause: 'low-confidence',
      modelProposal: { option: 'o1', confidence: 0.2 },
      confidence: null,
    });
  });

  it('does not send a body that stays over the cap at two options', async () => {
    const { service, source, calls } = harness({
      seams: { maxRequestBytes: 1 },
    });
    const result = await service.decide(implement(), source);
    expect(calls).toHaveLength(0);
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      source: 'ranking',
      fallbackCause: 'payload-too-large',
    });
    expect(result.stage === 'gate-0.1' ? result.usage.requests : 1).toBe(0);
  });

  it('caps one request at 32 questions and marks the rest question-limit', async () => {
    const phases = Array.from({ length: 70 }, (_, index) => ({
      id: `p${index}`,
      kind: 'implement' as const,
    }));
    const { service, source, calls } = harness({});
    const result = await service.decide({ ...implement(), phases }, source);
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]?.questions ?? {})).toHaveLength(
      QUESTIONS_PER_REQUEST,
    );
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(result.roster).toHaveLength(70);
    expect(result.usage.requests).toBeLessThanOrEqual(2);
    expect(result.roster[0]).toMatchObject({
      source: 'model',
      fallbackCause: null,
    });
    expect(result.roster[32]).toMatchObject({
      source: 'ranking',
      fallbackCause: 'question-limit',
    });
    expect(
      result.roster.filter(
        (entry) =>
          entry.status === 'chosen' && entry.fallbackCause === 'question-limit',
      ),
    ).toHaveLength(38);
  });

  it('keeps a fast model list when a sibling misses the budget', async () => {
    const listing = listingOf((row, signal) => {
      if (row.cli !== 'codex') {
        return Promise.resolve([
          { id: 'fast-model', provenance: 'configured' },
        ]);
      }
      return new Promise((resolve, reject) => {
        const onAbort = (): void => {
          signal.removeEventListener('abort', onAbort);
          reject(new Error('listing timed out'));
        };
        if (signal.aborted) {
          reject(new Error('listing timed out'));
          return;
        }
        signal.addEventListener('abort', onAbort);
      });
    });
    const { service, source, calls } = harness({
      listing,
      seams: { listingBudgetMs: 30 },
    });
    const result = await service.decide(implement(), source);
    const text = JSON.stringify(calls[0]);
    expect(text).toContain('fast-model');
    expect(text).toContain('lane-default');
    if (result.stage !== 'gate-0.1') throw new Error('expected a gate result');
    expect(
      result.reasons.filter((reason) => reason === 'models unknown'),
    ).toHaveLength(1);
  });

  it('takes the minimum model confidence and ignores unavailable entries', async () => {
    const both = harness({
      reply: (payload) =>
        answersFor(payload, (_key, index) => ({
          choice: 'o1',
          confidence: index === 0 ? 0.9 : 0.6,
        })),
    });
    const paired = await both.service.decide(
      {
        ...implement(),
        phases: [
          { id: 'one', kind: 'implement' },
          { id: 'two', kind: 'implement' },
        ],
      },
      both.source,
    );
    expect(paired).toMatchObject({
      overallConfidence: 0.6,
      overallSource: 'model',
    });

    const mixed = harness({
      reply: (payload) =>
        answersFor(payload, () => ({ choice: 'o1', confidence: 0.8 })),
    });
    const withSingle = await mixed.service.decide(
      {
        ...implement(),
        phases: [
          { id: 'build', kind: 'implement' },
          { id: 'look', kind: 'visual-review' },
        ],
      },
      mixed.source,
    );
    expect(withSingle).toMatchObject({
      overallConfidence: 0.8,
      overallSource: 'mixed',
    });

    const missing = harness({
      reply: (payload) =>
        answersFor(payload, (_key, index) => ({
          choice: 'o1',
          ...(index === 0 ? { confidence: 0.8 } : {}),
        })),
    });
    const withNull = await missing.service.decide(
      {
        ...implement(),
        phases: [
          { id: 'one', kind: 'implement' },
          { id: 'two', kind: 'implement' },
        ],
      },
      missing.source,
    );
    expect(withNull).toMatchObject({
      overallConfidence: null,
      overallSource: 'model',
    });
  });

  it('leaves structured confidence null and says none was reported', async () => {
    const complete = jest.fn(async () => ({ build: 'o1' }));
    const { service, source, calls } = harness({
      selection: {
        kind: 'structured',
        providerId: 'anthropic',
        model: 'claude',
      },
      structured: { isReady: async () => true, complete },
    });
    const result = await service.decide(implement(), source);
    expect(calls).toHaveLength(0);
    expect(complete).toHaveBeenCalledTimes(1);
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      source: 'model',
      confidence: null,
      fallbackCause: null,
    });
    expect(result).toMatchObject({ overallConfidence: null });
    if (entry?.status === 'chosen')
      expect(entry.reason).toContain('no confidence reported');
  });

  it('does not call the model when the Jev key is missing', async () => {
    const { service, source, calls } = harness({
      selection: { kind: 'jev', model: 'jev-1.13.0' },
    });
    const result = await service.decide(implement(), source);
    expect(calls).toHaveLength(0);
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({ source: 'ranking', fallbackCause: 'auth' });
  });

  it('does not emit an invalid pin model id', async () => {
    const { service, source, calls } = harness({});
    const result = await service.decide(
      {
        ...implement(),
        pins: [{ phaseId: 'build', executor: 'grok', model: 'not-a-model' }],
      },
      source,
    );
    expect(calls).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('not-a-model');
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      source: 'pin',
      model: 'lane-default',
    });
    if (entry?.status === 'chosen') expect(entry.executor.id).toBe('grok');
  });

  it('still offers the built-in subagent when the agent list throws', async () => {
    const rows = jest.fn(async () => {
      throw new Error('agent list down');
    });
    const { service, calls } = harness({});
    const result = await service.decide(implement(), {
      rows,
      limits: async () => new Map(),
      roles: async () => [],
    });
    expect(calls).toHaveLength(0);
    const text = JSON.stringify(result);
    expect(text).not.toContain('agent list down');
    expect(text).toContain('agent-list-unavailable');
    const entry = result.stage === 'gate-0.1' ? result.roster[0] : undefined;
    expect(entry).toMatchObject({
      status: 'chosen',
      executor: { kind: 'subagent', id: 'subagent:backend-developer' },
    });
  });
});

function probeHarness(routes: Record<string, FakeRoute>) {
  const calls: DecisionPayload[] = [];
  const fetchImpl = fakeFetch(routes);
  const config = configFor(OLLAMA, fetchImpl);
  const source = candidateSource([...THREE]);
  const service = new RouteDecideService({
    config,
    matrix: neutralMatrix(),
    rotation: memoryRotation(),
    logger: testLogger(),
    listing: listingOf(async () => [{ id: 'listed', provenance: 'reported' }]),
    seams: {
      systemOne: () => ({
        decide: async (payload) => {
          calls.push(payload);
          return notFoundReply();
        },
      }),
    },
  });
  return { service, source, config, calls };
}

describe('route decide gate: selection and target come from one snapshot (R1-3)', () => {
  const CUSTOM_A = {
    kind: 'custom',
    baseUrl: 'https://a.example',
    model: 'model-a',
  } as const;
  const CUSTOM_B = {
    kind: 'custom',
    baseUrl: 'https://b.example',
    model: 'model-b',
  } as const;
  const SENTINEL = 'sk-r13-sentinel-0c4e';

  function snapshotHarness() {
    const requests: string[] = [];
    const workspace = createMockWorkspaceProvider({
      config: { [SELECTION_KEY]: CUSTOM_A },
    });
    const secrets = createMockSecretStorage();
    const storage = createMockStateStorage();
    const logger = testLogger();
    const config = new DecisionModelConfig(
      workspace,
      secrets,
      storage,
      logger,
      undefined,
      {
        fetch: async (url) => {
          requests.push(url);
          return { ok: false, status: 404, text: async () => 'not found' };
        },
        now: () => 1_000,
      },
    );
    const seen: SystemOneClientOptions[] = [];
    const service = new RouteDecideService({
      config,
      matrix: neutralMatrix(),
      rotation: memoryRotation(),
      logger,
      listing: listingOf(async () => [
        { id: 'listed', provenance: 'reported' },
      ]),
      seams: {
        systemOne: (options) => {
          seen.push(options);
          return { decide: async () => notFoundReply() };
        },
      },
    });
    return {
      config,
      service,
      workspace,
      secrets,
      storage,
      logger,
      seen,
      requests,
    };
  }

  it('a selection change between the two reads cannot pair A with the endpoint of B', async () => {
    const h = snapshotHarness();
    jest
      .spyOn(h.config, 'getSelection')
      .mockReturnValueOnce(CUSTOM_A)
      .mockReturnValue(CUSTOM_B);
    const recheck = jest.spyOn(h.config, 'recheckAfterLiveNotFound');

    await h.service.decide(implement(), candidateSource([...THREE]));

    expect(h.seen).toHaveLength(1);
    expect(h.seen[0]).toMatchObject({
      baseUrl: CUSTOM_A.baseUrl,
      model: CUSTOM_A.model,
    });
    expect(recheck).toHaveBeenCalledWith(
      { selection: CUSTOM_A, baseUrl: CUSTOM_A.baseUrl },
      LIVE_DETAIL,
    );
    // The 404 belongs to A, which is no longer current: no probe, no mark.
    expect(h.requests).toEqual([]);
    expect(h.storage.update).not.toHaveBeenCalled();
  });

  it('a selection saved while the key is read does not change the opened target', async () => {
    const h = snapshotHarness();
    // No custom key is stored: the read answers undefined after the save.
    h.secrets.get.mockImplementationOnce(async () => {
      await h.workspace.setConfiguration(
        'ptah',
        'agentOrchestration.decisionModel',
        CUSTOM_B,
      );
      return undefined;
    });
    const recheck = jest.spyOn(h.config, 'recheckAfterLiveNotFound');

    await h.service.decide(implement(), candidateSource([...THREE]));

    expect(h.config.getSelection()).toEqual(CUSTOM_B);
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0]).toMatchObject({
      baseUrl: CUSTOM_A.baseUrl,
      model: CUSTOM_A.model,
    });
    expect(recheck).toHaveBeenCalledWith(
      { selection: CUSTOM_A, baseUrl: CUSTOM_A.baseUrl },
      LIVE_DETAIL,
    );
    expect(h.requests).toEqual([]);
    expect(h.storage.update).not.toHaveBeenCalled();
  });

  it('a key-store rejection naming the key logs a fixed category (R1-1)', async () => {
    const h = snapshotHarness();
    const hostile = Object.assign(new Error('rejected'), {
      code: `Bearer ${SENTINEL}`,
    });
    hostile.name = `Authorization: Bearer ${SENTINEL}`;
    h.secrets.get.mockRejectedValue(hostile);

    await h.service.decide(implement(), candidateSource([...THREE]));

    expect(h.logger.warn).toHaveBeenCalledWith(
      '[lane-routing] decision model target could not be resolved',
      { name: 'other' },
    );
    expect(JSON.stringify(jest.mocked(h.logger.warn).mock.calls)).not.toContain(
      SENTINEL,
    );
    expect(h.seen).toEqual([]);
  });

  it('never logs a code, even a real Node code a key could equal', async () => {
    const h = snapshotHarness();
    const failure = Object.assign(new Error(`open ${SENTINEL}`), {
      code: 'EACCES',
    });
    h.secrets.get.mockRejectedValue(failure);

    await h.service.decide(implement(), candidateSource([...THREE]));

    expect(h.logger.warn).toHaveBeenCalledWith(
      '[lane-routing] decision model target could not be resolved',
      { name: 'Error' },
    );
    expect(JSON.stringify(jest.mocked(h.logger.warn).mock.calls)).not.toContain(
      'EACCES',
    );
  });

  it('drops a code shaped like a Node code that is not on the allowlist (R2-1)', async () => {
    const h = snapshotHarness();
    const secretShaped = 'ESK4LIVE9X2QZ7';
    h.secrets.get.mockRejectedValue(
      Object.assign(new Error('rejected'), { code: secretShaped }),
    );

    await h.service.decide(implement(), candidateSource([...THREE]));

    expect(h.logger.warn).toHaveBeenCalledWith(
      '[lane-routing] decision model target could not be resolved',
      { name: 'Error' },
    );
    expect(JSON.stringify(jest.mocked(h.logger.warn).mock.calls)).not.toContain(
      secretShaped,
    );
  });
});
