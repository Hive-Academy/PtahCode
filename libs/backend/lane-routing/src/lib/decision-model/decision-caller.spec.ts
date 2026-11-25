import {
  createMockSecretStorage,
  createMockStateStorage,
  createMockWorkspaceProvider,
} from '@ptah-extension/platform-core/testing';
import { DecisionCaller } from './decision-caller';
import { DecisionModelConfig } from './decision-model.config';
import type { SystemOneClientOptions } from './system-one.client';

it.each([-1, NaN, Infinity])('clamps invalid decision budget %s for both transports', async (remainingMs) => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const seen: SystemOneClientOptions[] = [];
  const caller = new DecisionCaller({
    config: new DecisionModelConfig(
      createMockWorkspaceProvider(), createMockSecretStorage(), createMockStateStorage(), logger,
    ),
    logger,
    structured: { isReady: async () => true, complete: async () => ({}) },
    seams: {
      systemOne: (options) => {
        seen.push(options);
        return { decide: async () => ({ ok: false, cause: 'timeout', detail: 'timed out', notFound: false }) };
      },
    },
  });
  const budget = { signal: new AbortController().signal, remainingMs: () => remainingMs };
  const structured = caller.dispatchFor({ kind: 'structured', providerId: 'test', model: 'nimble' }, budget);
  if (structured.kind !== 'structured') throw new Error('expected structured');
  expect(structured.signal.aborted).toBe(true);

  const systemOne = caller.dispatchFor({
    kind: 'system-one',
    selection: { kind: 'ollama', model: 'nimble' },
    target: {
      baseUrl: 'http://localhost:11434', model: 'nimble', locality: 'local',
      probe: 'daemon', timeoutMs: 3000, timeoutExplicit: false,
    },
    provider: 'ollama',
  }, budget);
  if (systemOne.kind !== 'system-one') throw new Error('expected System One');
  expect(systemOne.admission?.remainingMs()).toBe(0);
  await systemOne.caller.decide({
    state: { request: 'classify', availableExecutors: {}, pastOutcomes: {} },
    questions: {},
  });
  expect(seen[0].timeoutMs).toBe(0);
});
