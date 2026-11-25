import {
  createMockSecretStorage,
  createMockStateStorage,
  createMockWorkspaceProvider,
} from '@ptah-extension/platform-core/testing';
import { DecisionCaller } from '../decision-model/decision-caller';
import { DecisionModelConfig } from '../decision-model/decision-model.config';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import type { SystemOneTarget } from '../decision-model/decision-model.config';
import type { DecisionPayload } from '../decision-model/decision-payload';
import type { StructuredDecisionCompleter } from '../decision-model/structured-decision.port';
import {
  SystemOneClient,
  type SystemOneFetch,
  type SystemOneCallResult,
  type SystemOneClientOptions,
} from '../decision-model/system-one.client';
import {
  SYSTEM_ONE_KEEP_ALIVE,
  SYSTEM_ONE_LOAD_TIMEOUT_MS,
  SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS,
} from '../decision-model/system-one.residency';
import {
  DECISION_REQUEST_TIMEOUT_MS,
  DECISION_REQUEST_TIMEOUT_REMOTE_MS,
  DECISION_RETURN_MARGIN_MS,
} from '../routing-constants';
import { callStructured, callSystemOne } from './model-call';
import { runFixedRequest, systemOneClientOptions } from './model-refine';
import { PrefillRateStore } from './prefill-rate.store';

const BUDGET = DECISION_REQUEST_TIMEOUT_MS + DECISION_RETURN_MARGIN_MS;

const LOCAL_TARGET: SystemOneTarget = {
  baseUrl: 'http://127.0.0.1:11434',
  model: 'nimble',
  probe: 'daemon',
  locality: 'local',
  timeoutMs: DECISION_REQUEST_TIMEOUT_MS,
  timeoutExplicit: false,
};

const REMOTE_TARGET: SystemOneTarget = {
  baseUrl: 'https://ollama.com',
  model: 'clef:27b-cloud',
  apiKey: 'test-key',
  probe: 'endpoint',
  locality: 'remote',
  timeoutMs: DECISION_REQUEST_TIMEOUT_REMOTE_MS,
  timeoutExplicit: false,
};

const PAYLOAD: DecisionPayload = {
  state: {
    request: 'describe the change',
    availableExecutors: {},
    pastOutcomes: {},
  },
  questions: {},
};

/** Rejects only when the request's abort signal fires; counts its calls. */
function hangingFetch(): { readonly fetch: SystemOneFetch; calls: number } {
  const record = {
    calls: 0,
    fetch: ((_url, init) => {
      record.calls += 1;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('test fetch requires an abort signal'));
          return;
        }
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      });
    }) satisfies SystemOneFetch,
  };
  return record;
}

function quietLogger(): LaneRoutingLogger {
  return {
    debug() {
      return undefined;
    },
    info() {
      return undefined;
    },
    warn() {
      return undefined;
    },
    error() {
      return undefined;
    },
  };
}

function completer(
  complete: StructuredDecisionCompleter['complete'],
): StructuredDecisionCompleter {
  return { isReady: async () => true, complete };
}

describe('callStructured deadline', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns timeout when the structured completer never settles', async () => {
    jest.useFakeTimers();
    const clear = jest.spyOn(global, 'clearTimeout');
    const pending = callStructured(
      {
        kind: 'structured',
        completer: completer(() => new Promise(() => undefined)),
        providerId: 'ollama',
        model: 'nimble',
        signal: new AbortController().signal,
      },
      'prompt',
      { type: 'object' },
      new Map(),
      [],
      quietLogger(),
    );

    await jest.advanceTimersByTimeAsync(BUDGET + 1);
    const outcome = await pending;

    expect(outcome).toMatchObject({
      sent: true,
      succeeded: false,
      requestCause: 'timeout',
      notFoundDetail: null,
    });
    expect(clear).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    clear.mockRestore();
  });
});

describe('System One target timeout (DC8, 5.4)', () => {
  it('gives the client the timeout of the resolved target', () => {
    expect(systemOneClientOptions(LOCAL_TARGET)).toEqual({
      baseUrl: LOCAL_TARGET.baseUrl,
      model: LOCAL_TARGET.model,
      timeoutMs: DECISION_REQUEST_TIMEOUT_MS,
      keepAlive: SYSTEM_ONE_KEEP_ALIVE,
      coldTimeoutMs: SYSTEM_ONE_LOAD_TIMEOUT_MS,
    });
    expect(systemOneClientOptions(REMOTE_TARGET)).toEqual({
      baseUrl: REMOTE_TARGET.baseUrl,
      model: REMOTE_TARGET.model,
      apiKey: 'test-key',
      timeoutMs: DECISION_REQUEST_TIMEOUT_REMOTE_MS,
    });
  });

  it('reports a timed-out remote call as a timeout cause, once, with no answers', async () => {
    const hanging = hangingFetch();
    const client = new SystemOneClient(
      systemOneClientOptions({ ...REMOTE_TARGET, timeoutMs: 20 }),
      { fetch: hanging.fetch },
    );

    const outcome = await callSystemOne(client, PAYLOAD, new Map(), [
      { phaseId: 'task_type', labels: ['o1', 'o2'] },
    ]);

    expect(outcome).toMatchObject({
      sent: true,
      succeeded: false,
      requestCause: 'timeout',
      notFoundDetail: null,
      inputTokens: null,
      outputTokens: null,
    });
    expect(outcome.answers.size).toBe(0);
    expect(hanging.calls).toBe(1);
  });

  it('caps a cold call at a saved timeout', async () => {
    const savedMs = 5_000;
    const options = systemOneClientOptions({
      ...LOCAL_TARGET,
      timeoutMs: savedMs,
      timeoutExplicit: true,
    });
    expect(options).toEqual({
      baseUrl: LOCAL_TARGET.baseUrl,
      model: LOCAL_TARGET.model,
      timeoutMs: savedMs,
      keepAlive: SYSTEM_ONE_KEEP_ALIVE,
    });

    const budgets = await budgetsFor(options, { models: [] });
    const requestBudgets = budgets.filter(
      (ms) => ms !== SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS,
    );
    expect(requestBudgets).toEqual([savedMs]);
    expect(budgets).not.toContain(SYSTEM_ONE_LOAD_TIMEOUT_MS);
  });

  it('uses the load budget on a residency miss when no timeout is saved', async () => {
    const options = systemOneClientOptions(LOCAL_TARGET);
    expect(options.coldTimeoutMs).toBe(SYSTEM_ONE_LOAD_TIMEOUT_MS);

    const budgets = await budgetsFor(options, { models: [] });
    expect(budgets).toContain(SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS);
    expect(budgets).toContain(SYSTEM_ONE_LOAD_TIMEOUT_MS);
  });
});

/** Records every `AbortSignal.timeout` budget while one cold-or-warm call runs. */
async function budgetsFor(
  options: ReturnType<typeof systemOneClientOptions>,
  psBody: { readonly models: readonly { readonly name: string }[] },
): Promise<readonly number[]> {
  const budgets: number[] = [];
  const timeout = jest
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation((ms: number) => {
      budgets.push(ms);
      return new AbortController().signal;
    });
  const fetch: SystemOneFetch = (url) => {
    const body =
      new URL(url).pathname === '/api/ps'
        ? psBody
        : { model: 'nimble', answers: {} };
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
  };
  try {
    const client = new SystemOneClient(options, { fetch });
    await client.decide(PAYLOAD);
    return budgets;
  } finally {
    timeout.mockRestore();
  }
}


describe('System One admission and token measurement', () => {
  const reply: SystemOneCallResult = {
    ok: true,
    result: { model: 'nimble', answers: {}, usage: { input_tokens: 80 } },
  };

  function admissionTest(remainingMs = 1000) {
    let now = 0;
    const rates = new PrefillRateStore();
    const abort = new AbortController();
    const logger = { ...quietLogger(), debug: jest.fn() };
    const metrics = {
      promptTokens: 100,
      logger,
      admission: { targetKey: 'target', rates, maxTimeoutMs: 3000, remainingMs: () => remainingMs, now: () => now, signal: abort.signal },
    };
    return { metrics, rates, abort, logger, advance: (ms: number) => { now += ms; } };
  }

  it('skips over-budget estimates and dispatches at the cost boundary', async () => {
    const { metrics, rates, advance, logger } = admissionTest(1250);
    const decide = jest.fn(async () => {
      advance(1000);
      return reply;
    });
    rates.recordCompleted('target', 99, 1000);
    const skipped = await callSystemOne({ decide }, PAYLOAD, new Map(), [], metrics);
    expect(skipped).toMatchObject({
      sent: false, requestCause: 'deadline',
      requestReason: 'estimated decision model cost 1261 ms exceeds 1250 ms remaining',
    });
    expect(decide).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();

    rates.recordAbort('target', 100, 1000);
    const atBoundary = {
      ...metrics,
      admission: { ...metrics.admission, configuredRate: 100 },
    };
    const sent = await callSystemOne({ decide }, PAYLOAD, new Map(), [], atBoundary);
    expect(sent).toMatchObject({ sent: true, inputTokens: 80 });
    expect(decide).toHaveBeenCalledWith(PAYLOAD, 1250);
    expect(rates.rate('target')).toBeCloseTo(93.3);
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(expect.any(String), { inputTokens: 80, inputTokensSource: 'usage' });
  });

  it('skips estimates that fit the route deadline but exceed the target timeout', async () => {
    const { metrics } = admissionTest(7750);
    const decide = jest.fn(async () => reply);
    const configured = {
      ...metrics,
      admission: { ...metrics.admission, configuredRate: 25 },
    };

    await expect(callSystemOne({ decide }, PAYLOAD, new Map(), [], configured))
      .resolves.toMatchObject({
        sent: false, requestCause: 'deadline',
        requestReason: 'estimated decision model cost 4250 ms exceeds 3000 ms remaining',
      });
    expect(decide).not.toHaveBeenCalled();
  });

  it('releases admission if setup throws after reserving the target', async () => {
    const { metrics } = admissionTest();
    const decide = jest.fn(async () => reply);
    const broken = {
      ...metrics,
      admission: { ...metrics.admission, now: () => { throw new Error('clock failed'); } },
    };

    await expect(callSystemOne({ decide }, PAYLOAD, new Map(), [], broken)).rejects.toThrow('clock failed');
    expect(decide).not.toHaveBeenCalled();
    await expect(callSystemOne({ decide }, PAYLOAD, new Map(), [], metrics)).resolves.toMatchObject({ sent: true });
  });

  it('releases an aborted target before transport settles and preserves the next reservation', async () => {
    const { metrics, abort, rates, advance } = admissionTest(3000);
    let finishFirst: (value: SystemOneCallResult) => void = () => undefined;
    const first = callSystemOne({
      decide: () => new Promise<SystemOneCallResult>((resolve) => { finishFirst = resolve; }),
    }, PAYLOAD, new Map(), [], metrics);

    advance(1000);
    abort.abort();
    const next = {
      ...metrics,
      admission: { ...metrics.admission, signal: new AbortController().signal },
    };
    let finishSecond: (value: SystemOneCallResult) => void = () => undefined;
    const decide = jest.fn(() => new Promise<SystemOneCallResult>((resolve) => { finishSecond = resolve; }));
    const second = callSystemOne({ decide }, PAYLOAD, new Map(), [], next);
    expect(decide).toHaveBeenCalledTimes(1);

    finishFirst(reply);
    await first;
    await expect(callSystemOne({ decide }, PAYLOAD, new Map(), [], next))
      .resolves.toMatchObject({ sent: false, requestCause: 'model-busy' });

    finishSecond(reply);
    await second;
    expect(rates.tryStart('target')).toBe(true);
  });

  it('reads the configured override and caps the actual client timeout after fitting', async () => {
    const readRate = jest.fn((): number | undefined => undefined);
    let now = 0;
    let remaining = 3000;
    const workspace = createMockWorkspaceProvider();
    const logger = { ...quietLogger(), warn: jest.fn() };
    const seen: SystemOneClientOptions[] = [];
    const caller = new DecisionCaller({
      config: new DecisionModelConfig(workspace, createMockSecretStorage(), createMockStateStorage(), logger),
      logger,
      readPrefillTokensPerSecond: readRate,
      seams: {
        monotonicNow: () => now,
        systemOne: (options) => {
          seen.push(options);
          return {
            decide: async () => {
              now += 1000;
              return { ok: true, result: { model: 'nimble', answers: {}, usage: { input_tokens: 1 } } };
            },
          };
        },
      },
    });
    const run = () => {
      const dispatch = caller.dispatchFor({
        kind: 'system-one',
        selection: { kind: 'ollama-cloud', model: REMOTE_TARGET.model },
        provider: 'ollama',
        target: { ...REMOTE_TARGET, timeoutMs: 15000, timeoutExplicit: true },
      }, { remainingMs: () => remaining, signal: new AbortController().signal });
      return runFixedRequest({
        request: 'classify',
        questions: [{ key: 'q', instructions: 'Choose', criteria: { o1: 'A', o2: 'B' } }],
        maxRequestBytes: 100_000,
        dispatch,
        logger,
      });
    };

    expect((await run()).sent).toBe(true);
    expect(seen[0].timeoutMs).toBe(3000);
    expect(await run()).toMatchObject({
      sent: false, requestCause: 'deadline', requestReason: expect.stringContaining('estimated decision model cost'),
    });
    expect(seen).toHaveLength(1);
    readRate.mockReturnValueOnce(0);
    expect((await run()).sent).toBe(false);
    readRate.mockImplementationOnce(() => { throw new Error('private details'); });
    expect((await run()).sent).toBe(false);
    readRate.mockReturnValue(1000);
    remaining = 1500;
    expect((await run()).sent).toBe(true);
    expect(seen[1].timeoutMs).toBe(1500);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[lane-routing] decision model prefill setting could not be read', { name: 'Error' },
    );
  });

  it('skips overlapping requests for the same target and keeps other targets independent', async () => {
    const { metrics, advance } = admissionTest();
    let finish: (value: SystemOneCallResult) => void = () => undefined;
    const decide = jest.fn(() => new Promise<SystemOneCallResult>((resolve) => { finish = resolve; }));
    const first = callSystemOne({ decide }, PAYLOAD, new Map(), [], metrics);
    expect(await callSystemOne({ decide }, PAYLOAD, new Map(), [], metrics))
      .toMatchObject({ sent: false, requestCause: 'model-busy' });
    const other = { ...metrics, admission: { ...metrics.admission, targetKey: 'other' } };
    expect((await callSystemOne({ decide: async () => reply }, PAYLOAD, new Map(), [], other)).sent).toBe(true);
    expect(decide).toHaveBeenCalledTimes(1);
    advance(100);
    finish(reply);
    await first;
    expect((await callSystemOne({ decide: async () => reply }, PAYLOAD, new Map(), [], metrics)).sent)
      .toBe(true);
  });

  it('lowers the rate and logs the estimated input once if the route aborts before transport settles', async () => {
    const { metrics, rates, abort, advance, logger } = admissionTest(2000);
    rates.recordCompleted('target', 200, 1000);
    let finish: (value: SystemOneCallResult) => void = () => undefined;
    const pending = callSystemOne({
      decide: () => new Promise<SystemOneCallResult>((resolve) => { finish = resolve; }),
    }, PAYLOAD, new Map(), [], metrics);

    advance(1500);
    abort.abort();
    expect(rates.rate('target')).toBeCloseTo(100 / 1.5);
    expect(logger.debug).toHaveBeenCalledWith(expect.any(String), { inputTokens: 100, inputTokensSource: 'bytes/4' });
    finish(reply);
    await pending;
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(rates.rate('target')).toBeCloseTo(100 / 1.5);
  });
});
