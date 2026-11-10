import { DecisionCaller } from '../decision-model/decision-caller';
import { runFixedRequest } from '../pipeline/model-refine';
import { ChildSettingRouterService } from './child-setting-router.service';

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
      router().route({ ...input, brief: `security ${'x'.repeat(20_000)}` }),
    ).resolves.toMatchObject({ modelSource: 'model' });
    expect(run.mock.calls[0][0].request).toHaveLength(8000);
  });
});
