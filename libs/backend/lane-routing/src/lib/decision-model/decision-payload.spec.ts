import {
  buildDecisionPayload,
  REQUEST_TEXT_MAX_CHARS,
  type DecisionPayloadInput,
} from './decision-payload';
import { SystemOneRequestBodySchema } from './system-one.schema';
import { SystemOneClient } from './system-one.client';
import { runLaneRequest, type LaneQuestion } from '../pipeline/model-refine';

const codex = {
  laneId: 'codex',
  family: 'openai',
  model: 'gpt-5',
  limitState: 'unknown',
  score: 80,
} as const;

const glm = {
  laneId: 'glm',
  family: 'zhipu',
  model: 'glm-5.3',
  limitState: 'unknown',
  score: 75,
} as const;

const input: DecisionPayloadInput = {
  request: 'Fix the flaky auth e2e test and add a regression test',
  questions: [
    {
      kind: 'lane-choice',
      phaseId: 'implement',
      taskKind: 'implement',
      instructions:
        'Which executor should implement? Choose only from these options.',
      options: [codex, glm],
    },
  ],
  outcomeFigures: [
    { laneId: 'codex', taskKind: 'implement', delivered: 12, failed: 1 },
  ],
};

// Reconstructed from the FEATURE/Full incident in the task context.
const incidentOptions = [
  { laneId: 'kimi', family: 'moonshot', model: 'kimi-for-coding', limitState: 'confirmed-room', score: 75 },
  { laneId: 'codex', family: 'openai', model: 'gpt-5', limitState: 'unknown', score: 72 },
  { laneId: 'ollama-code', family: 'ollama', model: 'qwen3-coder', limitState: 'unknown', score: 69 },
  { laneId: 'antigravity', family: 'google', model: 'gemini-3-pro', limitState: 'unknown', score: 67 },
] as const;

const incidentPhases: readonly LaneQuestion[] = ([
  ['impl-backend', 'implement'],
  ['impl-frontend', 'implement'],
  ['code-review', 'review'],
  ['tests', 'tests'],
] as const).map(([phaseId, taskKind]) => {
  const options = phaseId === 'code-review' ? incidentOptions.slice(1) : incidentOptions;
  return {
    phaseId, taskKind, primaryCount: options.length, options,
    instructions: 'Choose the executor for this phase. Each score already includes past outcomes; pastOutcomes lists the delivered and failed run counts behind it. No entry means no verified runs were available for that executor in the outcome window.',
  };
});

describe('decision payload', () => {
  it('emits the allowlisted fields and short option labels in ranked order', () => {
    const payload = buildDecisionPayload(input);
    expect(payload).toEqual({
      state: {
        request: input.request,
        legend: expect.any(String),
        availableExecutors: {
          e1: ['codex', 'openai', 'gpt-5'],
          e2: ['glm', 'zhipu', 'glm-5.3'],
        },
        pastOutcomes: { 'codex/implement': [92, 13] },
      },
      questions: {
        implement: {
          type: 'choice',
          instructions: input.questions[0].instructions,
          criteria: { o1: 'e1 80 unknown 13', o2: 'e2 75 unknown 0' },
        },
      },
    });
  });

  it('retains figures and totals samples for offered lanes when taskKind is omitted', () => {
    const payload = buildDecisionPayload({
      ...input,
      questions: [{
        kind: 'lane-choice', phaseId: 'legacy', instructions: 'Choose a lane',
        options: [codex, glm],
      }],
      outcomeFigures: [
        ...input.outcomeFigures,
        { laneId: 'codex', taskKind: 'review', delivered: 2, failed: 3 },
        { laneId: 'codex-other', taskKind: 'review', delivered: 4, failed: 0 },
      ],
    });
    expect(payload.state.pastOutcomes).toEqual({
      'codex/implement': [92, 13],
      'codex/review': [40, 5],
    });
    expect(payload.questions['legacy'].criteria).toEqual({
      o1: 'e1 80 unknown 18', o2: 'e2 75 unknown 0',
    });
  });

  it('reuses a roster entry across phases and indexes an alternate model separately', () => {
    const payload = buildDecisionPayload({
      ...input,
      questions: [
        ...input.questions,
        {
          kind: 'lane-choice',
          phaseId: 'docs',
          taskKind: 'docs',
          instructions: 'Document?',
          options: [{ ...codex, score: 65 }, { ...codex, model: 'gpt-5-mini' }],
        },
      ],
    });
    expect(payload.state.availableExecutors).toMatchObject({
      e1: ['codex', 'openai', 'gpt-5'],
      e3: ['codex', 'openai', 'gpt-5-mini'],
    });
    expect(payload.questions['docs'].criteria).toEqual({
      o1: 'e1 65 unknown 0', o2: 'e3 80 unknown 0',
    });
  });

  it('cuts estimated input tokens for the four-phase incident by at least 50% and validates answers', async () => {
    // Captured with the unchanged builder and serializer before the B13 edits.
    const baselineBytes = 3057;
    const model = 'nimble';
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const posted: string[] = [];
    const client = new SystemOneClient({ baseUrl: 'https://example.test', model }, {
      fetch: async (_url, init) => {
        const body = String(init?.body);
        posted.push(body);
        expect(SystemOneRequestBodySchema.parse(JSON.parse(body)).state).toMatchObject({
          taskType: 'FEATURE', depth: 'Full',
        });
        return new Response(JSON.stringify({
          model,
          answers: {
            'impl-backend': { type: 'choice', choice: 'o1', confidence: 0.9 },
            'impl-frontend': { type: 'choice', choice: 'o2', confidence: 0.9 },
          },
        }));
      },
    });
    const outcome = await runLaneRequest({
      provider: 'ollama',
      request: 'Investigate and fix the issue, review the change, and run regression tests.',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: incidentPhases,
      outcomes: (laneId, taskKind) => laneId === 'codex' && taskKind === 'implement'
        ? { laneId, taskKind, delivered: 15, failed: 3 }
        : null,
      maxRequestBytes: 100_000,
      dispatch: { kind: 'system-one', caller: client, model },
      logger,
    });

    expect(posted).toHaveLength(1);
    const inputTokens = Buffer.byteLength(posted[0]) / 4;
    expect(inputTokens).toBeLessThanOrEqual(baselineBytes / 8);
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(expect.any(String), { inputTokens, inputTokensSource: 'bytes/4' });
    expect(outcome.answers.get('impl-backend')).toMatchObject({ choice: 'o1', cause: null });
    expect(outcome.answers.get('impl-frontend')).toMatchObject({ choice: 'o2', cause: null });
  });

  it('still accepts the historical request state with raw counts', () => {
    expect(SystemOneRequestBodySchema.safeParse({
      model: 'nimble',
      state: {
        request: 'Build it',
        availableExecutors: { codex: { family: 'openai', model: 'gpt-5', limitState: 'unknown', score: 80 } },
        pastOutcomes: { 'codex/implement': { delivered: 12, failed: 1 } },
      },
      questions: {},
    }).success).toBe(true);
  });

  it('passes fixed criteria through unchanged (pre-flight task type and depth)', () => {
    const payload = buildDecisionPayload({
      request: 'Plan it',
      questions: [
        {
          kind: 'fixed-criteria',
          phaseId: 'task_type',
          instructions: 'Which Ptah task type fits this request?',
          criteria: {
            BUGFIX: 'A test or feature is broken',
            FEATURE: 'A new capability',
          },
        },
      ],
      outcomeFigures: [],
    });

    expect(payload.state.availableExecutors).toEqual({});
    expect(payload.state.pastOutcomes).toEqual({});
    expect(payload.questions['task_type'].criteria).toEqual({
      BUGFIX: 'A test or feature is broken',
      FEATURE: 'A new capability',
    });
  });

  it('caps request text at the boundary', () => {
    expect(REQUEST_TEXT_MAX_CHARS).toBe(8000);
    const payload = buildDecisionPayload({
      ...input,
      request: 'a'.repeat(9000),
    });

    expect(payload.state.request).toBe('a'.repeat(8000));
  });

  it('round-trips through the request wire schema and rejects unknown fields', () => {
    const payload = buildDecisionPayload(input);

    expect(
      SystemOneRequestBodySchema.safeParse({ model: 'nimble', ...payload })
        .success,
    ).toBe(true);
    expect(
      SystemOneRequestBodySchema.safeParse({
        model: 'nimble',
        state: { ...payload.state, userPreferences: ['lanes first'] },
        questions: payload.questions,
      }).success,
    ).toBe(false);
  });

  it('lets nothing outside the pinned set leave the machine', () => {
    const leaky = { ...input, userPreferences: ['leak-me'], apiKey: 'leak-me' };
    const payload = buildDecisionPayload(leaky);

    expect(JSON.stringify(payload)).not.toContain('leak-me');
  });
});
