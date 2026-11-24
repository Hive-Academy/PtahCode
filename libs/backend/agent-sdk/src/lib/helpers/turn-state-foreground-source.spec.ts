import type { Logger } from '@ptah-extension/vscode-core';
import type { GeneratingSession } from './session-turn-state.registry';
import {
  STALE_GENERATING_CEILING_MS,
  TurnStateForegroundSource,
  type ForegroundSourceClock,
  type PromptWaitSource,
} from './turn-state-foreground-source';

/**
 * TASK_2026_437 C14 — the foreground signal must not hold background work
 * forever behind a `generating` record whose teardown never ran. Fake registry,
 * fake clock: the ceiling is an hour.
 */

function createLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createClock(start = 0) {
  let now = start;
  let nextId = 1;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const clock: ForegroundSourceClock = {
    now: () => now,
    setTimeout: (callback, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };
  return {
    clock,
    get pendingCount() {
      return pending.size;
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.callback();
        }
      }
    },
  };
}

function createRegistry() {
  let sessions: GeneratingSession[] = [];
  const listeners = new Set<() => void>();
  return {
    listeners,
    source: {
      generatingSessions: () => sessions,
      onGeneratingChange: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    set(next: GeneratingSession[]) {
      sessions = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function setup() {
  const logger = createLogger();
  const clock = createClock(10_000);
  const registry = createRegistry();
  const source = new TurnStateForegroundSource(
    registry.source,
    logger as unknown as Logger,
    clock.clock,
  );
  return { logger, clock, registry, source };
}

describe('TurnStateForegroundSource', () => {
  it('is busy while a session generates and idle when none does', () => {
    const { registry, source } = setup();
    expect(source.isForegroundBusy()).toBe(false);
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    expect(source.isForegroundBusy()).toBe(true);
    registry.set([]);
    expect(source.isForegroundBusy()).toBe(false);
  });

  it('forwards registry notifications to its listeners', () => {
    const { registry, source } = setup();
    const listener = jest.fn();
    source.onForegroundChange(listener);
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops counting a record at the stale ceiling, notifies, and warns once', () => {
    const { registry, source, clock, logger } = setup();
    const listener = jest.fn(() => source.isForegroundBusy());
    source.onForegroundChange(listener);
    registry.set([{ sessionId: 'stuck', since: 10_000 }]);
    expect(source.isForegroundBusy()).toBe(true);
    listener.mockClear();

    clock.advance(STALE_GENERATING_CEILING_MS - 1);
    expect(listener).not.toHaveBeenCalled();
    clock.advance(1);

    // The timer re-notified, so the governor re-reads without any transition.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveLastReturnedWith(false);
    expect(source.isForegroundBusy()).toBe(false);
    expect(source.isForegroundBusy()).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('past the stale ceiling'),
      expect.objectContaining({
        sessionId: 'stuck',
        staleCeilingMs: STALE_GENERATING_CEILING_MS,
      }),
    );
  });

  it('stays busy for a fresh session beside a stale one', () => {
    const { registry, source, clock } = setup();
    source.onForegroundChange(() => undefined);
    registry.set([{ sessionId: 'stuck', since: 10_000 }]);
    clock.advance(STALE_GENERATING_CEILING_MS);
    registry.set([
      { sessionId: 'stuck', since: 10_000 },
      { sessionId: 'live', since: clock.clock.now() },
    ]);
    expect(source.isForegroundBusy()).toBe(true);
  });

  it('warns again for a NEW stale turn after the old one settled', () => {
    const { registry, source, clock, logger } = setup();
    source.onForegroundChange(() => undefined);
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    clock.advance(STALE_GENERATING_CEILING_MS);
    source.isForegroundBusy();
    registry.set([]);
    source.isForegroundBusy();

    const since = clock.clock.now();
    registry.set([{ sessionId: 's1', since }]);
    clock.advance(STALE_GENERATING_CEILING_MS);
    source.isForegroundBusy();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('isolates a throwing listener', () => {
    const { registry, source, logger } = setup();
    const later = jest.fn();
    source.onForegroundChange(() => {
      throw new Error('boom');
    });
    source.onForegroundChange(later);
    expect(() => registry.set([])).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[TurnStateForegroundSource] foreground listener threw',
      { reason: 'boom' },
    );
  });

  it('unsubscribes from the registry and clears its timer when the last listener leaves', () => {
    const { registry, source, clock } = setup();
    const unsubscribe = source.onForegroundChange(() => undefined);
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    source.isForegroundBusy();
    expect(clock.pendingCount).toBe(1);

    unsubscribe();
    expect(registry.listeners.size).toBe(0);
    expect(clock.pendingCount).toBe(0);
  });
});

/**
 * A session blocked on a permission / AskUserQuestion prompt is not foreground
 * work: the benchmark kept the code indexer deferred behind such waits.
 */
describe('TurnStateForegroundSource — prompt waits', () => {
  function setupWithPrompts() {
    const logger = createLogger();
    const clock = createClock(10_000);
    const registry = createRegistry();
    const waiting = new Set<string>();
    const promptListeners = new Set<() => void>();
    const prompts: PromptWaitSource = {
      isSessionWaitingOnPrompt: (id) => waiting.has(id),
      onPromptWaitChange: (listener) => {
        promptListeners.add(listener);
        return () => {
          promptListeners.delete(listener);
        };
      },
    };
    const source = new TurnStateForegroundSource(
      registry.source,
      logger as unknown as Logger,
      clock.clock,
      undefined,
      () => prompts,
    );
    const setWaiting = (id: string, on: boolean) => {
      if (on) waiting.add(id);
      else waiting.delete(id);
      for (const listener of [...promptListeners]) listener();
    };
    return { logger, clock, registry, source, setWaiting, promptListeners };
  }

  it('is not busy while the only generating session waits on a prompt', () => {
    const { registry, source, setWaiting } = setupWithPrompts();
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    expect(source.isForegroundBusy()).toBe(true);
    setWaiting('s1', true);
    expect(source.isForegroundBusy()).toBe(false);
  });

  it('is busy again, and notifies, when the prompt is answered', () => {
    const { registry, source, setWaiting } = setupWithPrompts();
    const listener = jest.fn(() => source.isForegroundBusy());
    source.onForegroundChange(listener);
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    setWaiting('s1', true);
    expect(listener).toHaveLastReturnedWith(false);
    setWaiting('s1', false);
    expect(listener).toHaveLastReturnedWith(true);
    expect(source.isForegroundBusy()).toBe(true);
  });

  it('stays busy for a working session beside a waiting one', () => {
    const { registry, source, setWaiting } = setupWithPrompts();
    registry.set([
      { sessionId: 'waiting', since: 10_000 },
      { sessionId: 'working', since: 10_000 },
    ]);
    setWaiting('waiting', true);
    expect(source.isForegroundBusy()).toBe(true);
    registry.set([{ sessionId: 'waiting', since: 10_000 }]);
    expect(source.isForegroundBusy()).toBe(false);
  });

  it('does not arm the stale timer for a waiting session, and re-arms on answer', () => {
    const { registry, source, clock, setWaiting } = setupWithPrompts();
    source.onForegroundChange(() => undefined);
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    setWaiting('s1', true);
    expect(source.isForegroundBusy()).toBe(false);
    expect(clock.pendingCount).toBe(0);
    setWaiting('s1', false);
    expect(source.isForegroundBusy()).toBe(true);
    expect(clock.pendingCount).toBe(1);
  });

  it('subscribes to prompt changes once and unsubscribes with the last listener', () => {
    const { source, promptListeners } = setupWithPrompts();
    const offA = source.onForegroundChange(() => undefined);
    const offB = source.onForegroundChange(() => undefined);
    expect(promptListeners.size).toBe(1);
    offA();
    expect(promptListeners.size).toBe(1);
    offB();
    expect(promptListeners.size).toBe(0);
  });

  it('falls back to the plain turn signal when the prompt source cannot be built', () => {
    const logger = createLogger();
    const registry = createRegistry();
    const source = new TurnStateForegroundSource(
      registry.source,
      logger as unknown as Logger,
      createClock(10_000).clock,
      undefined,
      () => {
        throw new Error('handler unavailable');
      },
    );
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    expect(source.isForegroundBusy()).toBe(true);
    expect(source.isForegroundBusy()).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn when an idle read finds the prompt source not built yet', () => {
    const logger = createLogger();
    const registry = createRegistry();
    const source = new TurnStateForegroundSource(
      registry.source,
      logger as unknown as Logger,
      createClock(10_000).clock,
      undefined,
      () => {
        throw new Error('webview manager not registered yet');
      },
    );
    expect(source.isForegroundBusy()).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('subscribes on a later read when the prompt source was not ready at subscription', () => {
    const logger = createLogger();
    const registry = createRegistry();
    const waiting = new Set<string>();
    const promptListeners = new Set<() => void>();
    let ready = false;
    const prompts: PromptWaitSource = {
      isSessionWaitingOnPrompt: (id) => waiting.has(id),
      onPromptWaitChange: (listener) => {
        promptListeners.add(listener);
        return () => {
          promptListeners.delete(listener);
        };
      },
    };
    const provider = jest.fn(() => {
      if (!ready) throw new Error('webview manager not registered yet');
      return prompts;
    });
    const source = new TurnStateForegroundSource(
      registry.source,
      logger as unknown as Logger,
      createClock(10_000).clock,
      undefined,
      provider,
    );
    const listener = jest.fn(() => source.isForegroundBusy());
    source.onForegroundChange(listener);
    expect(promptListeners.size).toBe(0);

    ready = true;
    registry.set([{ sessionId: 's1', since: 10_000 }]);
    expect(source.isForegroundBusy()).toBe(true);
    expect(promptListeners.size).toBe(1);

    waiting.add('s1');
    for (const notify of [...promptListeners]) notify();
    expect(listener).toHaveLastReturnedWith(false);
    // Resolved once the source is ready, not on every read.
    source.isForegroundBusy();
    expect(provider).toHaveBeenCalledTimes(2);
  });
});
