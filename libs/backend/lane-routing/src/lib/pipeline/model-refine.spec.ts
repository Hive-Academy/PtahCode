import {
  buildDecisionPayload,
  type DecisionPayload,
} from '../decision-model/decision-payload';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import {
  serializeSystemOneRequest,
  SYSTEM_ONE_MAX_REQUEST_BYTES,
  SystemOneClient,
} from '../decision-model/system-one.client';
import { SYSTEM_ONE_KEEP_ALIVE } from '../decision-model/system-one.residency';
import { runFixedRequest, runLaneRequest, type LaneQuestion } from './model-refine';

const logger: LaneRoutingLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const lanes = ['codex', 'grok', 'opencode', 'fourth'].map((laneId) => ({
  laneId,
  family: laneId,
  model: 'test-model',
  limitState: 'unknown' as const,
  score: 80,
}));

const phases: LaneQuestion[] = [
  { phaseId: 'build', taskKind: 'implement', instructions: 'Choose', primaryCount: lanes.length, options: lanes },
];

function capture() {
  const payloads: DecisionPayload[] = [];
  const caller = {
    decide: async (payload: DecisionPayload) => {
      payloads.push(payload);
      return {
        ok: false as const,
        cause: 'provider-error' as const,
        notFound: false,
        detail: 'unavailable',
      };
    },
  };
  return { payloads, dispatch: { kind: 'system-one' as const, caller, model: 'nimble' } };
}

const outcomes = (laneId: string, taskKind: LaneQuestion['taskKind']) => ({
  laneId, taskKind, delivered: 2, failed: 1,
});

describe('runLaneRequest outcome figures', () => {
  it('drops alternates across phases before pruning primary lanes and omits unsendable phases', async () => {
    const primary = [
      { ...phases[0], phaseId: 'first', primaryCount: 2, options: [lanes[0], lanes[1]] },
      { ...phases[0], phaseId: 'second' },
    ];
    const baseline = capture();
    await runLaneRequest({ provider: 'ollama', request: 'ship', phases: primary,
      outcomes: () => null, maxRequestBytes: 100_000, dispatch: baseline.dispatch, logger });
    const cap = requestBytes('nimble', baseline.payloads[0]);
    const withAlternates: LaneQuestion[] = [
      { ...primary[0], options: [...primary[0].options, { ...lanes[0], model: 'alternate' }] },
      primary[1],
      { ...phases[0], phaseId: 'third', primaryCount: 1,
        options: [lanes[0], { ...lanes[0], model: 'alternate' }] },
    ];
    const captured = capture();
    const result = await runLaneRequest({ provider: 'ollama', request: 'ship',
      phases: withAlternates, outcomes: () => null, maxRequestBytes: cap,
      dispatch: captured.dispatch, logger });
    expect(result.sent).toBe(true);
    expect(Object.keys(captured.payloads[0].questions)).toEqual(['first', 'second']);
    expect(result.offered.get('first')).toEqual(primary[0].options);
    expect(result.offered.get('second')).toEqual(primary[1].options);
    expect(result.offered.has('third')).toBe(false);
    expect(Object.keys(captured.payloads[0].questions['first'].criteria)).toEqual(['o1', 'o2']);
  });
  it('sends only offered pairs and deduplicates repeated phase/kind pairs', async () => {
    const captured = capture();
    const result = await runLaneRequest({
      provider: 'ollama', request: 'ship',
      phases: [phases[0], { ...phases[0], phaseId: 'ship' }],
      outcomes, maxRequestBytes: 100_000,
      dispatch: captured.dispatch, logger,
    });
    expect(result.outcomeFigures).toBe(4);
    expect(Object.keys(captured.payloads[0].state.pastOutcomes)).toEqual(
      lanes.map((lane) => `${lane.laneId}/implement`),
    );
    expect(captured.payloads[0].state.pastOutcomes['codex/implement']).toEqual({
      delivered: 2, failed: 1,
    });
  });

  it('skips subagent options and other task kinds', async () => {
    const captured = capture();
    const lookedUp: string[] = [];
    await runLaneRequest({
      provider: 'ollama', request: 'ship',
      phases: [{ ...phases[0], options: [lanes[0], { ...lanes[1], laneId: 'subagent' }] }],
      outcomes: (laneId, taskKind) => {
        lookedUp.push(`${laneId}/${taskKind}`);
        return outcomes(laneId, taskKind);
      },
      maxRequestBytes: 100_000, dispatch: captured.dispatch, logger,
    });
    expect(lookedUp).toEqual(['codex/implement']);
    expect(Object.keys(captured.payloads[0].state.pastOutcomes)).toEqual(['codex/implement']);
  });

  it('looks up each phase using its own task kind', async () => {
    const captured = capture();
    const lookedUp: string[] = [];
    await runLaneRequest({
      provider: 'ollama', request: 'ship',
      phases: [
        { ...phases[0], options: lanes.slice(0, 2) },
        { ...phases[0], phaseId: 'check', taskKind: 'review', options: lanes.slice(1, 3) },
      ],
      outcomes: (laneId, taskKind) => {
        lookedUp.push(`${laneId}/${taskKind}`);
        return outcomes(laneId, taskKind);
      },
      maxRequestBytes: 100_000, dispatch: captured.dispatch, logger,
    });
    expect(lookedUp).toEqual([
      'codex/implement', 'grok/implement', 'grok/review', 'opencode/review',
    ]);
    expect(Object.keys(captured.payloads[0].state.pastOutcomes)).toEqual(lookedUp);
  });

  it('recomputes figures as option width shrinks under the byte cap', async () => {
    const wide = capture();
    await runLaneRequest({
      provider: 'ollama', request: 'ship', phases, outcomes,
      maxRequestBytes: 100_000, dispatch: wide.dispatch, logger,
    });
    const bytes = new TextEncoder().encode(JSON.stringify({
      model: 'nimble', ...wide.payloads[0],
    })).byteLength;
    const narrow = capture();
    const result = await runLaneRequest({
      provider: 'ollama', request: 'ship', phases, outcomes,
      maxRequestBytes: bytes - 1, dispatch: narrow.dispatch, logger,
    });
    expect(result.outcomeFigures).toBe(3);
    expect(Object.keys(narrow.payloads[0].state.pastOutcomes)).toEqual(
      lanes.slice(0, 3).map((lane) => `${lane.laneId}/implement`),
    );
  });

  it('includes the same figures in a structured prompt', async () => {
    const prompts: string[] = [];
    const result = await runLaneRequest({
      provider: 'structuredOutput', request: 'ship', phases,
      outcomes, maxRequestBytes: 100_000, logger,
      dispatch: {
        kind: 'structured', providerId: 'test', model: 'nimble',
        signal: new AbortController().signal,
        completer: {
          isReady: async () => true,
          complete: async (request) => {
            prompts.push(request.prompt);
            return { build: 'o1' };
          },
        },
      },
    });
    expect(result.outcomeFigures).toBe(4);
    expect(prompts[0]).toContain('past outcomes codex/implement: delivered 2, failed 1');
  });

  it('sends no figures for fixed pre-flight questions', async () => {
    const captured = capture();
    const result = await runFixedRequest({
      request: 'classify',
      questions: [{ key: 'task_type', instructions: 'Classify', criteria: { FEATURE: 'Feature' } }],
      maxRequestBytes: 100_000, dispatch: captured.dispatch, logger,
    });
    expect(result.outcomeFigures).toBe(0);
    expect(captured.payloads[0].state.pastOutcomes).toEqual({});
  });
});

describe('System One body cap includes keep_alive', () => {
  it('refuses a body that fits without keep_alive and not with it', async () => {
    const model = 'nimble';
    const keepAlive = SYSTEM_ONE_KEEP_ALIVE;
    const fitted = fixedRequestOnKeepAliveBoundary(model, keepAlive);
    const payload = buildDecisionPayload({
      request: fitted.request,
      questions: [
        {
          kind: 'fixed-criteria',
          phaseId: fitted.questions[0].key,
          instructions: fitted.questions[0].instructions,
          criteria: fitted.questions[0].criteria,
        },
      ],
      outcomeFigures: [],
    });
    const without = requestBytes(model, payload);
    const withKeep = requestBytes(model, payload, keepAlive);
    expect(without).toBeLessThanOrEqual(SYSTEM_ONE_MAX_REQUEST_BYTES);
    expect(withKeep).toBeGreaterThan(SYSTEM_ONE_MAX_REQUEST_BYTES);

    const accepted = await runFixedRequest({
      request: fitted.request,
      questions: fitted.questions,
      maxRequestBytes: SYSTEM_ONE_MAX_REQUEST_BYTES,
      dispatch: {
        kind: 'system-one',
        model,
        caller: {
          decide: async () => ({
            ok: true,
            result: { model, answers: {} },
          }),
        },
      },
      logger,
    });
    expect(accepted.sent).toBe(true);

    const fetches: string[] = [];
    const client = new SystemOneClient(
      {
        baseUrl: 'http://127.0.0.1:11434',
        model,
        keepAlive,
      },
      {
        fetch: (_url, init) => {
          fetches.push(init?.body ?? '');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ model, answers: {} }),
          });
        },
      },
    );
    const refused = await runFixedRequest({
      request: fitted.request,
      questions: fitted.questions,
      maxRequestBytes: SYSTEM_ONE_MAX_REQUEST_BYTES,
      dispatch: { kind: 'system-one', caller: client, model, keepAlive },
      logger,
    });
    expect(refused.sent).toBe(false);
    expect(refused.requestCause).toBe('payload-too-large');
    expect(fetches).toEqual([]);

    const direct = await client.decide(payload);
    expect(direct).toMatchObject({ ok: false, cause: 'payload-too-large' });
  });
});

function requestBytes(
  model: string,
  payload: DecisionPayload,
  keepAlive?: string,
): number {
  return new TextEncoder()
    .encode(serializeSystemOneRequest({ model, payload, keepAlive }))
    .byteLength;
}

/**
 * A fixed question whose System One body is at most 64 KiB without
 * `keep_alive` and over that cap with it. Fixed criteria are not narrowed,
 * so the fit must refuse rather than hand the body to the client.
 */
function fixedRequestOnKeepAliveBoundary(
  model: string,
  keepAlive: string,
): {
  readonly request: string;
  readonly questions: readonly [
    { readonly key: string; readonly instructions: string; readonly criteria: { readonly FEATURE: string } },
  ];
} {
  const request = 'classify';
  const key = 'task_type';
  const instructions = 'Classify';
  const measure = (pad: string): { readonly without: number; readonly withKeep: number } => {
    const payload = buildDecisionPayload({
      request,
      questions: [
        {
          kind: 'fixed-criteria',
          phaseId: key,
          instructions,
          criteria: { FEATURE: pad },
        },
      ],
      outcomeFigures: [],
    });
    return {
      without: requestBytes(model, payload),
      withKeep: requestBytes(model, payload, keepAlive),
    };
  };
  const base = measure('a');
  if (base.withKeep > SYSTEM_ONE_MAX_REQUEST_BYTES) {
    throw new Error('base payload already exceeds the cap');
  }
  const pad = 'a'.repeat(1 + (SYSTEM_ONE_MAX_REQUEST_BYTES - base.withKeep + 1));
  const sized = measure(pad);
  if (
    sized.without > SYSTEM_ONE_MAX_REQUEST_BYTES ||
    sized.withKeep <= SYSTEM_ONE_MAX_REQUEST_BYTES
  ) {
    throw new Error(
      `keep_alive boundary missed without=${sized.without} with=${sized.withKeep}`,
    );
  }
  return {
    request,
    questions: [{ key, instructions, criteria: { FEATURE: pad } }],
  };
}
