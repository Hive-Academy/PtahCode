import type { LaneRoutingLogger } from '../lane-routing-logger';
import type { SystemOneTarget } from '../decision-model/decision-model.config';
import type { DecisionPayload } from '../decision-model/decision-payload';
import type { StructuredDecisionCompleter } from '../decision-model/structured-decision.port';
import {
  SystemOneClient,
  type SystemOneFetch,
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
import { systemOneClientOptions } from './model-refine';

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
