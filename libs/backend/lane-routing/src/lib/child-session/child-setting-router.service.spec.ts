import { DecisionCaller } from '../decision-model/decision-caller';
import { runFixedRequest } from '../pipeline/model-refine';
import { rankChildSettings } from './child-setting-rule';
import { clampChildSettingDecision, ChildSettingRouterService } from './child-setting-router.service';

jest.mock('../pipeline/model-refine', () => ({
  ...jest.requireActual('../pipeline/model-refine'),
  runFixedRequest: jest.fn(),
}));

const run = jest.mocked(runFixedRequest);
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
const input = {
  brief: 'Coordinate CI',
  workKind: 'coordination' as const,
  models: ['claude-haiku-4', 'claude-opus-4'],
};

function outcome(model?: string, effort?: string) {
  return {
    sent: true,
    succeeded: true,
    requestCause: null,
    notFoundDetail: null,
    answers: new Map([
      ['model', { choice: model, cause: null }],
      ['effort', { choice: effort, cause: null }],
    ]),
    offered: new Map(),
    inputTokens: null,
    outputTokens: null,
  };
}

describe('ChildSettingRouterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(DecisionCaller.prototype, 'openCaller')
      .mockResolvedValue({ kind: 'structured', providerId: 'p', model: 'm' });
    jest.spyOn(DecisionCaller.prototype, 'dispatchFor').mockReturnValue({
      kind: 'structured',
      providerId: 'p',
      model: 'm',
      signal: AbortSignal.timeout(3000),
      completer: { isReady: jest.fn(), complete: jest.fn() },
    });
    jest.spyOn(DecisionCaller.prototype, 'noteLive').mockResolvedValue();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const router = () => new ChildSettingRouterService({} as never, logger);

  it.each(['o99', 'x1'])(
    'keeps the ranking result when the decision model returns an invalid label %s',
    async (label) => {
      run.mockResolvedValue(outcome(label, label) as never);
      await expect(router().route(input)).resolves.toMatchObject({
        model: 'claude-haiku-4',
        effort: 'low',
        modelSource: 'ranking',
        effortSource: 'ranking',
      });
    },
  );

  it('keeps the ranking result when the decision call exceeds 3000 ms', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(DecisionCaller.prototype, 'openCaller')
      .mockImplementation(() => new Promise(() => undefined));
    const pending = router().route(input);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toMatchObject({
      modelSource: 'ranking',
      effortSource: 'ranking',
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts no decision request when openCaller resolves after the deadline', async () => {
    jest.useFakeTimers();
    let release: (value: {
      kind: 'structured';
      providerId: string;
      model: string;
    }) => void = () => undefined;
    jest.spyOn(DecisionCaller.prototype, 'openCaller').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve as typeof release;
        }),
    );
    const pending = router().route(input);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toMatchObject({ modelSource: 'ranking' });
    release({ kind: 'structured', providerId: 'p', model: 'm' });
    await jest.advanceTimersByTimeAsync(0);
    expect(DecisionCaller.prototype.dispatchFor).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(DecisionCaller.prototype.noteLive).not.toHaveBeenCalled();
  });

  it('does not note live state when the deadline passes during the request', async () => {
    jest.useFakeTimers();
    let finish: (value: never) => void = () => undefined;
    run.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve as typeof finish;
        }),
    );
    const pending = router().route(input);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toMatchObject({ modelSource: 'ranking' });
    finish(outcome('o2', 'o3') as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(DecisionCaller.prototype.noteLive).not.toHaveBeenCalled();
  });

  it('keeps the ranking result when the decision call throws', async () => {
    run.mockRejectedValue(new Error('offline'));
    await expect(router().route(input)).resolves.toMatchObject({
      modelSource: 'ranking',
      effortSource: 'ranking',
    });
  });

  it('uses a valid model label and reports source model', async () => {
    run.mockResolvedValue(outcome('o2', 'o1') as never);
    await expect(router().route(input)).resolves.toMatchObject({
      model: 'claude-opus-4',
      modelSource: 'model',
    });
  });

  it('uses a valid effort label and reports source model', async () => {
    run.mockResolvedValue(outcome('o1', 'o3') as never);
    await expect(router().route(input)).resolves.toMatchObject({
      effort: 'high',
      effortSource: 'model',
    });
  });

  it('routes only effort when model is explicit and calls the decision model once', async () => {
    run.mockResolvedValue(outcome(undefined, 'o3') as never);
    await expect(
      router().route({ ...input, model: 'claude-opus-4' }),
    ).resolves.toMatchObject({
      model: 'claude-opus-4',
      modelSource: 'pin',
      effort: 'high',
      effortSource: 'model',
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].questions).toHaveLength(1);
  });

  it('accepts a brief longer than 8000 characters', async () => {
    run.mockResolvedValue(outcome('o2', 'o3') as never);
    await expect(
      router().route({ ...input, workKind: undefined, brief: `security ${'x'.repeat(20_000)}` }),
    ).resolves.toMatchObject({ modelSource: 'ranking' });
    expect(run.mock.calls[0][0].request).toHaveLength(8000);
  });
  it('offers only models and efforts at or above the code floor', async () => {
    run.mockResolvedValue(outcome('o1', 'o1') as never);
    const result = await router().route({ ...input, workKind: 'code', models: ['claude-haiku-4', 'claude-sonnet-5-5', 'claude-opus-5-5', 'default', 'claude-fable-5-2'] });
    expect(result).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'high', reason: { rule: 'code-work-kind' } });
    expect(run.mock.calls[0][0].questions.map((question) => Object.values(question.criteria))).toEqual([
      ['claude-sonnet-5-5', 'claude-opus-5-5'], ['high', 'xhigh', 'max'],
    ]);
  });

  it('uses the full brief for ranking and cuts only the decision request', async () => {
    run.mockResolvedValue(outcome() as never);
    const result = await router().route({ ...input, workKind: undefined, brief: `${'x'.repeat(8001)} unknown cause` });
    expect(result).toMatchObject({ model: 'claude-opus-4', effort: 'high', reason: { rule: 'deep-work-text' } });
    expect(run.mock.calls[0][0].request).toHaveLength(8000);
  });

  it('preserves both explicit pins including small/low and skips refinement', async () => {
    await expect(router().route({ ...input, workKind: 'code', model: 'claude-haiku-4', effort: 'low' })).resolves.toMatchObject({ model: 'claude-haiku-4', effort: 'low', modelSource: 'pin', effortSource: 'pin' });
    expect(run).not.toHaveBeenCalled();
  });

  it('preserves a model-only pin and applies the missing effort floor', async () => {
    run.mockResolvedValue(outcome() as never);
    await expect(router().route({ ...input, workKind: 'code', model: 'claude-haiku-4' })).resolves.toMatchObject({ model: 'claude-haiku-4', effort: 'high', modelSource: 'pin', effortSource: 'ranking' });
  });

  it('preserves effort-only low while ranking the unpinned model', async () => {
    run.mockResolvedValue(outcome() as never);
    await expect(router().route({ ...input, workKind: 'code', effort: 'low' })).resolves.toMatchObject({ model: 'claude-opus-4', effort: 'low', modelSource: 'ranking', effortSource: 'pin' });
  });

  it.each([
    { model: 'claude-haiku-4', effort: 'low' as const },
    { effort: 'low' as const },
    { model: 'claude-haiku-4' },
  ])('clamps a valid below-floor selection after refinement: %o', (selected) => {
    const catalog = ['claude-haiku-4', 'claude-sonnet-5-5'];
    const fallback = rankChildSettings({ brief: 'code', models: catalog, workKind: 'code' });
    expect(clampChildSettingDecision(fallback, selected, 1, catalog)).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'high', modelSource: 'ranking', effortSource: 'ranking', reason: { rule: 'decision-model-below-floor' } });
  });

  it('ranks balanced but offers no model options when deep work has no strong catalog entry', async () => {
    run.mockResolvedValue(outcome() as never);
    const result = await router().route({ brief: 'unknown cause', models: ['claude-haiku-4', 'claude-sonnet-5-5'] });
    expect(result.model).toBe('claude-sonnet-5-5');
    expect(result.effort).toBe('high');
    expect(run.mock.calls[0][0].questions.map((question) => question.key)).toEqual(['effort']);
  });

});
