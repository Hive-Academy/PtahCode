import { AgentBudgetPolicy, initialAgentBudgetSnapshot, registerModelContextWindows, replaceProviderContextWindows, type AgentBudgetSettings } from '@ptah-extension/shared';
import { SubagentContextLimits, type SubagentContextState } from './subagent-context-limit';
import { countSubagentUsage } from './subagent-request-accounting';

const settings: AgentBudgetSettings = { handoffContextTokens: 650_000, warnRatio: 0.85, stopWeightedTokens: 3_000_000, maxDurationMin: 90 };
const route = { kind: 'proxy' as const, providerId: 'batch2-provider' };
const message = { message: { model: 'batch2-model' } };
afterEach(() => replaceProviderContextWindows('batch2-provider', []));
it('caps handoff at 90% of verified route capacity, preserving a smaller user cap', () => {
  registerModelContextWindows([{ id: 'batch2-model', contextLength: 200_000 }], route.providerId);
  const limits = new SubagentContextLimits();
  expect(limits.settings(settings, {}, message, route).handoffContextTokens).toBe(180_000);
  expect(limits.settings({ ...settings, handoffContextTokens: 150_000 }, {}, message, route).handoffContextTokens).toBe(150_000);
  expect(limits.settings(settings, {}, message, { ...route, providerId: 'other' }).handoffContextTokens).toBe(650_000);
});
it('uses native SDK result usage and falls back when capacity or route is unknown', () => {
  const limits = new SubagentContextLimits();
  const native = { kind: 'native' as const, providerId: null };
  limits.observe({ modelUsage: { 'batch2-model': { contextWindow: 200_000 } } }, native);
  expect(limits.settings(settings, {}, message, native).handoffContextTokens).toBe(180_000);
  limits.observe({ modelUsage: { 'batch2-model': { contextWindow: 200_000 } } }, route);
  expect(limits.settings(settings, {}, message, route).handoffContextTokens).toBe(650_000);
  expect(limits.settings(settings, {}, message).handoffContextTokens).toBe(650_000);
  const state: SubagentContextState = {};
  limits.settings(settings, state, message, native);
  expect(limits.settings(settings, state, { message: { model: 'unknown' } }, native).handoffContextTokens).toBe(650_000);
});
it('warns at the effective threshold and deduplicates streamed blocks without a context stop', () => {
  registerModelContextWindows([{ id: 'batch2-model', contextLength: 200_000 }], route.providerId);
  const limits = new SubagentContextLimits();
  const state = { policySnapshot: { ...initialAgentBudgetSnapshot }, startedAt: Date.now(), requestSequence: 0,
    lastWeighted: 0, lastRaw: 0, weightedUsed: 0, contextTokens: 0, costUnavailableLogged: false,
    stopFired: false, stopInFlight: false, initialContext: undefined as number | undefined, warningRequestCount: undefined as number | undefined };
  const effective = limits.settings(settings, state, message, route);
  const usage = { inputTokens: 153_000, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const logger = { info: jest.fn(), warn: jest.fn() };
  for (let i = 0; i < 2; i++) countSubagentUsage(state, { id: 'request1', model: 'batch2-model' }, usage, effective, new AgentBudgetPolicy(effective), 'session', 'task', logger);
  expect(state.policySnapshot.warned).toBe(true);
  expect(state.warningRequestCount).toBe(1);
  expect(state.requestSequence).toBe(1);
  expect(state.initialContext).toBe(153_000);
  expect(state.policySnapshot.stopped).toBe(false);
});

it('uses the setting on the first turn without a result and warns once per session', () => {
  const limits = new SubagentContextLimits();
  const logger = { warn: jest.fn() };
  const state: SubagentContextState = {};
  expect(limits.settings(settings, state, message, { kind: 'native', providerId: 'anthropic' }).handoffContextTokens).toBe(650_000);
  limits.warnUnknown('first', state, logger); limits.warnUnknown('first', state, logger);
  expect(logger.warn).toHaveBeenCalledTimes(1);
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('model-relative limit is not applied'), expect.objectContaining({ sessionId: 'first' }));
});
it('keeps exact model variants separate and takes the smaller conflicting window', () => {
  const limits = new SubagentContextLimits();
  const native = { kind: 'native' as const, providerId: 'anthropic' };
  limits.observe({ modelUsage: { 'model[1m]': { contextWindow: 1_000_000 }, model: { contextWindow: 200_000 } } }, native);
  limits.observe({ modelUsage: { model: { contextWindow: 1_000_000 } } }, native);
  expect(limits.settings(settings, {}, { message: { model: 'model' } }, native).handoffContextTokens).toBe(180_000);
  expect(limits.settings(settings, {}, { message: { model: 'model[1m]' } }, native).handoffContextTokens).toBe(650_000);
  expect(limits.settings(settings, {}, { message: { model: 'other' } }, native).handoffContextTokens).toBe(650_000);
});
