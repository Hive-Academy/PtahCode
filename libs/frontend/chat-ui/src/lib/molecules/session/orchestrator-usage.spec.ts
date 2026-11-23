import type { SessionStatsEntry } from '@ptah-extension/shared';
import { orchestratorModel, orchestratorUsage } from './orchestrator-usage';
import { formatUsageCost, formatUsageTokens, usageDetailsText } from './session-usage-format';

const snapshot: SessionStatsEntry = {
  sessionId: 'session',
  model: 'dominant-subagent-model',
  totalCost: 1,
  tokenCount: 1000,
  tokens: { input: 600, output: 100, cacheRead: 200, cacheCreation: 100 },
  messageCount: 10,
  agentSessionCount: 2,
  status: 'ok',
  coverage: 'complete',
  pricingCoverage: 'full',
};

const sub = { key: 'sub:one', usage: { tokens: 120, cost: 0.25 } };
const bg = { key: 'bg:two', usage: { tokens: 280, cost: 0.25 } };

describe('Orchestrator usage', () => {
  it('uses the snapshot and its mark with zero subagent rows', () => {
    const { tokens, cost } = orchestratorUsage(snapshot, []);
    expect(formatUsageTokens(tokens)).toBe('1.0k');
    expect(formatUsageCost(cost)).toBe('$1.00');

    const provisional = orchestratorUsage({ ...snapshot, provisional: true }, []);
    expect(formatUsageTokens(provisional.tokens)).toBe('~1.0k');
    expect(formatUsageCost(provisional.cost)).toBe('~$1.00');

    const partial = orchestratorUsage({ ...snapshot, coverage: 'partial' }, []);
    expect(formatUsageTokens(partial.tokens)).toBe('≥1.0k');
    expect(formatUsageCost(partial.cost)).toBe('≥$1.00');

    const partialEstimate = orchestratorUsage({ ...snapshot, coverage: 'partial', provisional: true }, []);
    expect(formatUsageTokens(partialEstimate.tokens)).toBe('≥1.0k');
    expect(usageDetailsText(partialEstimate.tokens, 'tokens', 'Orchestrator'))
      .toContain('at least about 1,000 tokens');
  });

  it('preserves the SDK lower bound and its cause after subtracting two SDK lanes', () => {
    const usage = orchestratorUsage(
      { ...snapshot, agentSessionCount: 4, coverage: 'partial' },
      [sub, bg, { key: 'cli:one', usage: { tokens: 150, cost: 0.125 } }],
    );
    expect(formatUsageTokens(usage.tokens)).toBe('≥600');
    expect(formatUsageCost(usage.cost)).toBe('≥$0.50');
    expect(usageDetailsText(usage.tokens, 'tokens', 'Orchestrator'))
      .toBe('Orchestrator: at least about 600 tokens. Some SDK usage could not be counted');
    expect(usageDetailsText(usage.cost, 'cost', 'Orchestrator'))
      .toBe('Orchestrator: at least about $0.50. Some SDK usage could not be counted');
  });

  it('deduplicates subagent and background aliases and uses reported usage from either', () => {
    const alias = { key: 'bg:one', usage: { tokens: 120, cost: 0.5 } };
    const usage = orchestratorUsage(snapshot, [alias, sub, bg]);
    expect(usage.tokens.value).toBe(600);
    expect(usage.cost.value).toBe(0.5);

    const missingAliasCost = { ...sub, usage: { ...sub.usage, cost: null } };
    expect(orchestratorUsage(snapshot, [alias, missingAliasCost, bg]).cost.value).toBe(0.25);
  });

  it('mutes a negative result and gives its cause', () => {
    const usage = orchestratorUsage({ ...snapshot, tokenCount: 399 }, [sub, bg]);
    expect(formatUsageTokens(usage.tokens)).toBe('—');
    expect(usage.tokens.causes).toEqual(['Subagent usage exceeds the session snapshot']);
    expect(formatUsageCost(usage.cost)).toBe('~$0.50');
  });

  it('treats an exact decimal cost difference of zero as reported usage', () => {
    const usage = orchestratorUsage({ ...snapshot, totalCost: 0.3 }, [
      { ...sub, usage: { ...sub.usage, cost: 0.1 } },
      { ...bg, usage: { ...bg.usage, cost: 0.2 } },
    ]);
    expect(formatUsageCost(usage.cost)).toBe('~$0.00');
  });

  it('mutes cost when a subagent reported none and keeps the token estimate', () => {
    const usage = orchestratorUsage(snapshot, [sub, { ...bg, usage: { tokens: 280, cost: null } }]);
    expect(formatUsageCost(usage.cost)).toBe('—');
    expect(usage.cost.causes).toEqual(['A subagent reported no usage']);
    expect(formatUsageTokens(usage.tokens)).toBe('~600');
  });

  it.each([
    [null, 'SDK usage not loaded yet'],
    [{ ...snapshot, status: 'error', tokenCount: 0, totalCost: null }, 'SDK usage could not be read'],
  ] satisfies [SessionStatsEntry | null, string][])('mutes unavailable snapshot metrics', (entry, cause) => {
    const { tokens, cost } = orchestratorUsage(entry, [sub]);
    expect(formatUsageTokens(tokens)).toBe('—');
    expect(formatUsageCost(cost)).toBe('—');
    expect(tokens.causes).toEqual([cause]);
    expect(cost.causes).toEqual([cause]);
  });

  it('displays a measured empty snapshot zero but leaves its cost unavailable', () => {
    const { tokens, cost } = orchestratorUsage({
      ...snapshot, status: 'empty', tokenCount: 0, totalCost: null, pricingCoverage: 'none',
    }, []);
    expect(formatUsageTokens(tokens)).toBe('0');
    expect(formatUsageCost(cost)).toBe('—');
  });

  it('prefers the live main model, then the context model, then the unattributed label', () => {
    const context = { ...snapshot, contextSnapshot: { model: 'main-context-model', contextTokens: 203 } };
    expect(orchestratorModel({ model: 'live-main-model' }, context)).toBe('live-main-model');
    expect(orchestratorModel(null, context)).toBe('main-context-model');
    expect(orchestratorModel(null, snapshot)).toBe('Model not attributed');
  });
});
