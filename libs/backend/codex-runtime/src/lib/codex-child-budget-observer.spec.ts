import { DEFAULT_AGENT_BUDGET_SETTINGS } from '@ptah-extension/shared';
import {
  observeCodexChildBudgets,
  readCodexChildBudgetSettings,
  settleCodexChildBudgetEvent,
  type CodexChildBudgetPort,
} from './codex-child-budget-observer';
import { CodexChildBudgetTap } from './codex-child-budget-tap';
import type { CodexRuntimeEvent } from './codex-runtime.types';

const settings = {
  warnRatio: 0.5, stopWeightedTokens: 20, handoffContextTokens: 100,
  maxDurationMin: 10,
};
const port: CodexChildBudgetPort = {
  readSetting: (key) => settings[key.slice('agentBudget.'.length) as keyof typeof settings],
  pricing: () => null,
};
const base = {
  contextId: 'context', processGeneration: 1, threadId: 'parent',
  turnId: 'parent-turn', sequence: 1,
};
const spawn: CodexRuntimeEvent = {
  ...base, type: 'toolStarted', toolId: 'spawn', toolName: 'spawnAgent',
  input: {}, agentThreadIds: ['child'],
};
const counters = { uncachedInputTokens: 12, outputTokens: 4, cacheReadTokens: 3,
  cacheCreationTokens: 0, reasoningOutputTokens: 0, totalTokens: 16 };
const usage: CodexRuntimeEvent = {
  ...base, threadId: 'child', turnId: 'child-turn', sequence: 2, type: 'usage',
  usage: { inputTokens: 12, cachedInputTokens: 3, cacheWriteInputTokens: 0, outputTokens: 4 },
  evidence: {
    threadId: 'child', turnId: 'child-turn', parentThreadId: 'parent',
    modelId: 'codex-model', total: counters, last: counters, timestamp: 1,
    terminalState: 'none', resetOrStale: false, accepted: true, epoch: 0,
    cacheSemanticsAmbiguous: false, lastExceedsTotal: false, diagnostics: [],
  },
};
const terminal: CodexRuntimeEvent = {
  ...base, threadId: 'child', turnId: 'child-turn', sequence: 3,
  type: 'terminal', status: 'completed',
};

interface Subscriber {
  readonly queue: CodexRuntimeEvent[];
  wake?: () => void;
  done: boolean;
}

/** Fan-out event source with the same abort semantics as the runtime context. */
function fakeContext() {
  const subscribers = new Set<Subscriber>();
  return {
    subscribers,
    emit(event: CodexRuntimeEvent): void {
      for (const subscriber of subscribers) {
        subscriber.queue.push(event);
        subscriber.wake?.();
      }
    },
    events(signal: AbortSignal): AsyncIterable<CodexRuntimeEvent> {
      const subscriber: Subscriber = { queue: [], done: signal.aborted };
      subscribers.add(subscriber);
      signal.addEventListener('abort', () => {
        subscriber.done = true;
        subscriber.wake?.();
      }, { once: true });
      return {
        async *[Symbol.asyncIterator]() {
          try {
            for (;;) {
              const next = subscriber.queue.shift();
              if (next) {
                yield next;
                continue;
              }
              if (subscriber.done) return;
              await new Promise<void>((resolve) => (subscriber.wake = resolve));
              subscriber.wake = undefined;
            }
          } finally {
            subscribers.delete(subscriber);
          }
        },
      };
    },
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('observeCodexChildBudgets', () => {
  it('charges two child turns across a relink with missing model ids', async () => {
    const context = fakeContext();
    const logger = { warn: jest.fn() };
    const observer = observeCodexChildBudgets(context, port, logger);
    if (usage.type !== 'usage' || !usage.evidence) throw new Error('invalid fixture');
    const withoutModel = { ...usage, evidence: { ...usage.evidence, modelId: undefined } };
    context.emit(spawn);
    context.emit(withoutModel);
    context.emit(terminal);
    context.emit(spawn);
    context.emit({ ...withoutModel, turnId: 'child-turn-2' });
    context.emit({ ...terminal, turnId: 'child-turn-2' });
    await flush();
    const decisions = logger.warn.mock.calls.filter(
      ([message]) => message === '[Codex budget] Child budget decision');
    expect(decisions).toHaveLength(2);
    expect(decisions[0][1]).toMatchObject({
      coverage: 'price-weighting-degraded', inputTokens: 12,
      outputTokens: 4, modelId: 'codex/unknown',
    });
    expect(logger.warn.mock.calls.filter(([message]) =>
      message === '[Codex budget] Child model unavailable; raw tokens charged without cost'))
      .toHaveLength(1);
    observer.dispose();
  });
  it.each(['terminal-first', 'usage-first'] as const)(
    'drains a child linked by %s and charges its usage once', async (order) => {
      const context = fakeContext();
      const logger = { warn: jest.fn() };
      const observer = observeCodexChildBudgets(context, port, logger);
      const linkedTerminal = { ...terminal, parentThreadId: 'parent' };
      if (order === 'terminal-first') {
        context.emit(linkedTerminal);
        await flush();
        expect(logger.warn).not.toHaveBeenCalledWith(
          '[Codex budget] Child budget decision', expect.anything());
        context.emit(usage);
      } else {
        context.emit(usage);
        context.emit(linkedTerminal);
      }
      await flush();
      context.emit(linkedTerminal);
      await flush();
      const decisions = logger.warn.mock.calls.filter(
        ([message]) => message === '[Codex budget] Child budget decision');
      expect(decisions).toHaveLength(1);
      expect(decisions[0][1]).toMatchObject({
        inputTokens: 12, outputTokens: 4, modelId: 'codex-model', warning: true,
      });
      observer.dispose();
    },
  );
  it('uses trailing child usage during the drain and logs context advisory once after relink', async () => {
    const context = fakeContext();
    const logger = { warn: jest.fn() };
    const observer = observeCodexChildBudgets(context, port, logger);
    context.emit(spawn);
    context.emit(terminal);
    await flush();
    expect(logger.warn).not.toHaveBeenCalledWith(
      '[Codex budget] Child budget decision', expect.anything());
    if (usage.type !== 'usage' || !usage.evidence) throw new Error('invalid fixture');
    context.emit({ ...usage, evidence: { ...usage.evidence, lastRequestTotalTokens: 110 } });
    context.emit(spawn);
    context.emit(terminal);
    await flush();
    const decisions = logger.warn.mock.calls.filter(
      ([message]) => message === '[Codex budget] Child budget decision');
    expect(decisions).toHaveLength(1);
    expect(decisions[0][1]).toMatchObject({ contextTokens: 110, handoff: true,
      modelId: 'codex-model', inputTokens: 12, outputTokens: 4 });
    observer.dispose();
  });
  it('charges a child turn through one subscription and logs the decision', async () => {
    const context = fakeContext();
    const logger = { warn: jest.fn() };
    const observer = observeCodexChildBudgets(context, port, logger);
    expect(context.subscribers.size).toBe(1);
    context.emit(spawn);
    context.emit(usage);
    context.emit(terminal);
    context.emit(terminal);
    await flush();
    const decisions = logger.warn.mock.calls.filter(
      ([message]) => message === '[Codex budget] Child budget decision',
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0][1]).toMatchObject({ childThreadId: 'child', warning: true });
    expect(Object.values(decisions[0][1] as object)).not.toContain(undefined);
    observer.dispose();
  });

  it('aborts its subscription on stop and stays idempotent', async () => {
    const context = fakeContext();
    const observer = observeCodexChildBudgets(context, port, { warn: jest.fn() });
    await flush();
    observer.dispose();
    observer.dispose();
    await flush();
    expect(context.subscribers.size).toBe(0);
  });

  it('keeps observing after one charge fails', async () => {
    const context = fakeContext();
    const logger = { warn: jest.fn() };
    const pricing = jest.fn()
      .mockImplementationOnce(() => { throw new Error('catalog'); })
      .mockReturnValue(null);
    const observer = observeCodexChildBudgets(context, { ...port, pricing }, logger);
    context.emit(spawn);
    context.emit(usage);
    context.emit(terminal);
    context.emit(spawn);
    context.emit({ ...usage, turnId: 'child-turn-2' });
    context.emit({ ...terminal, turnId: 'child-turn-2' });
    await flush();
    expect(logger.warn).toHaveBeenCalledWith(
      '[Codex budget] Child budget charge failed', { errorClass: 'Error' },
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '[Codex budget] Child budget decision', expect.objectContaining({ childThreadId: 'child' }),
    );
    expect(context.subscribers.size).toBe(1);
    observer.dispose();
  });
});

describe('settleCodexChildBudgetEvent', () => {
  it('ignores a terminal of an untracked thread', () => {
    const tap = new CodexChildBudgetTap(settings);
    expect(settleCodexChildBudgetEvent(terminal, tap, { warn: jest.fn() }, () => null))
      .toBeUndefined();
  });

  it('keeps a completed turn across reconnects and charges it once', () => {
    const tap = new CodexChildBudgetTap(settings);
    const logger = { warn: jest.fn() };
    settleCodexChildBudgetEvent(spawn, tap, logger, () => null);
    settleCodexChildBudgetEvent(usage, tap, logger, () => null);
    const decision = settleCodexChildBudgetEvent(terminal, tap, logger, () => null);
    expect(decision?.provenance).toBe('child-thread');
    expect(tap.trackedChildren).toBe(1);
    expect(settleCodexChildBudgetEvent(terminal, tap, logger, () => null))
      .toBeUndefined();
  });

  it('prices a terminal without a model from the accepted usage model', () => {
    const tap = new CodexChildBudgetTap(settings);
    const pricing = jest.fn(() => null);
    settleCodexChildBudgetEvent(spawn, tap, { warn: jest.fn() }, pricing);
    settleCodexChildBudgetEvent(usage, tap, { warn: jest.fn() }, pricing);
    settleCodexChildBudgetEvent(terminal, tap, { warn: jest.fn() }, pricing);
    expect(pricing).toHaveBeenCalledWith('codex-model');
  });

  it('does not price a child from its parent when no child model was observed', () => {
    const tap = new CodexChildBudgetTap(settings);
    const pricing = jest.fn(() => null);
    const unknownModelUsage = usage.type === 'usage' && usage.evidence
      ? { ...usage, evidence: { ...usage.evidence, modelId: undefined } }
      : usage;
    settleCodexChildBudgetEvent(spawn, tap, { warn: jest.fn() }, pricing);
    settleCodexChildBudgetEvent(unknownModelUsage, tap, { warn: jest.fn() }, pricing);
    const decision = settleCodexChildBudgetEvent(terminal, tap, { warn: jest.fn() }, pricing);
    expect(pricing).not.toHaveBeenCalled();
    expect(decision?.telemetry.status).toBe('reported');
    expect(decision?.transition.coverage).toBe('price-weighting-degraded');
  });
});

describe('readCodexChildBudgetSettings', () => {
  it('passes the shared default as the fallback for each key', () => {
    const readSetting = jest.fn((_key: string, fallback: number) => fallback);
    expect(readCodexChildBudgetSettings({ readSetting }, { warn: jest.fn() }))
      .toEqual(DEFAULT_AGENT_BUDGET_SETTINGS);
    expect(readSetting).toHaveBeenCalledWith(
      'agentBudget.warnRatio', DEFAULT_AGENT_BUDGET_SETTINGS.warnRatio,
    );
    expect(readSetting).toHaveBeenCalledTimes(4);
  });

  it('uses the complete default set when one value is invalid', () => {
    const logger = { warn: jest.fn() };
    const readSetting = (key: string, fallback: number) =>
      key === 'agentBudget.warnRatio' ? 'high' : fallback;
    expect(readCodexChildBudgetSettings({ readSetting }, logger))
      .toBe(DEFAULT_AGENT_BUDGET_SETTINGS);
    expect(logger.warn).toHaveBeenCalledWith(
      '[Codex budget] Invalid agent budget settings; using defaults',
    );
  });
});
