import {
  createMockSecretStorage,
  createMockStateStorage,
  createMockWorkspaceProvider,
} from '@ptah-extension/platform-core/testing';
import { DecisionCaller } from './decision-caller';
import { DecisionModelConfig } from './decision-model.config';
import type { SystemOneClientOptions } from './system-one.client';

it.each([-1, NaN, Infinity])(
  'clamps invalid decision budget %s for both transports',
  async (remainingMs) => {
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const seen: SystemOneClientOptions[] = [];
    const caller = new DecisionCaller({
      config: new DecisionModelConfig(
        createMockWorkspaceProvider(),
        createMockSecretStorage(),
        createMockStateStorage(),
        logger,
      ),
      logger,
      structured: { isReady: async () => true, complete: async () => ({}) },
      seams: {
        systemOne: (options) => {
          seen.push(options);
          return {
            decide: async () => ({
              ok: false,
              cause: 'timeout',
              detail: 'timed out',
              notFound: false,
            }),
          };
        },
      },
    });
    const budget = {
      signal: new AbortController().signal,
      remainingMs: () => remainingMs,
    };
    const structured = caller.dispatchFor(
      { kind: 'structured', providerId: 'test', model: 'nimble' },
      budget,
    );
    if (structured.kind !== 'structured')
      throw new Error('expected structured');
    expect(structured.signal.aborted).toBe(true);

    const systemOne = caller.dispatchFor(
      {
        kind: 'system-one',
        selection: { kind: 'ollama', model: 'nimble' },
        target: {
          baseUrl: 'http://localhost:11434',
          model: 'nimble',
          locality: 'local',
          probe: 'daemon',
          timeoutMs: 3000,
          timeoutExplicit: false,
        },
        provider: 'ollama',
      },
      budget,
    );
    if (systemOne.kind !== 'system-one') throw new Error('expected System One');
    expect(systemOne.admission?.remainingMs()).toBe(0);
    await systemOne.caller.decide({
      state: { request: 'classify', availableExecutors: {}, pastOutcomes: {} },
      questions: {},
    });
    expect(seen[0].timeoutMs).toBe(0);
  },
);

it('exposes configured timeout and honors structured maxTimeoutMs override', () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const workspace = createMockWorkspaceProvider({
    config: { 'ptah.agentOrchestration.decisionModelTimeoutMs': 15_000 },
  });
  const caller = new DecisionCaller({
    config: new DecisionModelConfig(
      workspace,
      createMockSecretStorage(),
      createMockStateStorage(),
      logger,
    ),
    logger,
    structured: { isReady: async () => true, complete: async () => ({}) },
  });

  expect(caller.getConfiguredTimeoutMs()).toBe(15_000);

  const defaultDispatch = caller.dispatchFor(
    { kind: 'structured', providerId: 'test', model: 'nimble' },
    { signal: new AbortController().signal, remainingMs: () => 25_000 },
  );
  if (defaultDispatch.kind !== 'structured')
    throw new Error('expected structured');
  expect(defaultDispatch.timeoutMs).toBe(3_000);

  const extendedDispatch = caller.dispatchFor(
    { kind: 'structured', providerId: 'test', model: 'nimble' },
    {
      signal: new AbortController().signal,
      remainingMs: () => 25_000,
      maxTimeoutMs: 20_000,
    },
  );
  if (extendedDispatch.kind !== 'structured')
    throw new Error('expected structured');
  expect(extendedDispatch.timeoutMs).toBe(20_000);

  const clampedDispatch = caller.dispatchFor(
    { kind: 'structured', providerId: 'test', model: 'nimble' },
    {
      signal: new AbortController().signal,
      remainingMs: () => 12_000,
      maxTimeoutMs: 20_000,
    },
  );
  if (clampedDispatch.kind !== 'structured')
    throw new Error('expected structured');
  expect(clampedDispatch.timeoutMs).toBe(12_000);

  const mockConfigCaller = new DecisionCaller({
    config: {
      getSelection: () => ({ kind: 'unset' }),
    } as unknown as DecisionModelConfig,
    logger,
  });
  expect(mockConfigCaller.getConfiguredTimeoutMs()).toBeNull();
});

it('honors budget.maxTimeoutMs for System One transport and admission while preserving target.timeoutMs when omitted', async () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const seen: SystemOneClientOptions[] = [];
  const caller = new DecisionCaller({
    config: new DecisionModelConfig(
      createMockWorkspaceProvider(),
      createMockSecretStorage(),
      createMockStateStorage(),
      logger,
    ),
    logger,
    seams: {
      systemOne: (options) => {
        seen.push(options);
        return {
          decide: async () => ({
            ok: false,
            cause: 'timeout',
            detail: 'timed out',
            notFound: false,
          }),
        };
      },
    },
  });

  const opened = {
    kind: 'system-one' as const,
    selection: { kind: 'ollama' as const, model: 'd3:4b' },
    target: {
      baseUrl: 'http://localhost:11434',
      model: 'd3:4b',
      locality: 'local' as const,
      probe: 'daemon' as const,
      timeoutMs: 3_000,
      timeoutExplicit: false,
    },
    provider: 'ollama' as const,
  };
  const payload = {
    state: { request: 'rank skills', availableExecutors: {}, pastOutcomes: {} },
    questions: {},
  };

  // Without maxTimeoutMs (route_decide default): stays clamped to target.timeoutMs (3000).
  const defaultDispatch = caller.dispatchFor(opened, {
    signal: new AbortController().signal,
    remainingMs: () => 25_000,
  });
  if (defaultDispatch.kind !== 'system-one')
    throw new Error('expected System One');
  expect(defaultDispatch.admission?.maxTimeoutMs).toBe(3_000);
  await defaultDispatch.caller.decide(payload);
  expect(seen[0].timeoutMs).toBe(3_000);

  // With maxTimeoutMs override (skill review default 20_000): uses maxTimeoutMs in both admission and transport.
  const extendedDispatch = caller.dispatchFor(opened, {
    signal: new AbortController().signal,
    remainingMs: () => 19_750,
    maxTimeoutMs: 20_000,
  });
  if (extendedDispatch.kind !== 'system-one')
    throw new Error('expected System One');
  expect(extendedDispatch.admission?.maxTimeoutMs).toBe(20_000);
  await extendedDispatch.caller.decide(payload);
  expect(seen[1].timeoutMs).toBe(19_750);
  await extendedDispatch.caller.decide(payload, 25_000);
  expect(seen[2].timeoutMs).toBe(20_000);
});
