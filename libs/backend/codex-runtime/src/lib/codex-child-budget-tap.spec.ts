import { CodexChildBudgetTap } from './codex-child-budget-tap';
import type { CodexRuntimeEvent } from './codex-runtime.types';

const settings = {
  warnRatio: 0.5, stopWeightedTokens: 20, handoffContextTokens: 100,
  maxDurationMin: 10,
};
const base = {
  contextId: 'context', processGeneration: 1, threadId: 'parent',
  turnId: 'parent-turn', sequence: 1,
};
const spawn: CodexRuntimeEvent = {
  ...base, type: 'toolStarted', toolId: 'spawn', toolName: 'spawnAgent',
  input: {}, agentThreadIds: ['child'],
};
const usage: CodexRuntimeEvent = {
  ...base, threadId: 'child', turnId: 'child-turn', sequence: 2,
  type: 'usage',
  usage: { inputTokens: 12, cachedInputTokens: 3, cacheWriteInputTokens: 0,
    outputTokens: 4 },
  evidence: {
    threadId: 'child', turnId: 'child-turn', parentThreadId: 'parent',
    modelId: 'codex-model', total: { uncachedInputTokens: 12, outputTokens: 4,
      cacheReadTokens: 3, cacheCreationTokens: 0, reasoningOutputTokens: 0,
      totalTokens: 16 },
    last: { uncachedInputTokens: 12, outputTokens: 4, cacheReadTokens: 3,
      cacheCreationTokens: 0, reasoningOutputTokens: 0, totalTokens: 16 },
    timestamp: 1, terminalState: 'none', resetOrStale: false, accepted: true,
    epoch: 0, cacheSemanticsAmbiguous: false, lastExceedsTotal: false,
    diagnostics: [],
  },
};

describe('CodexChildBudgetTap', () => {
  it('charges each child turn once using full input and cache split', () => {
    const tap = new CodexChildBudgetTap(settings);
    tap.observe(spawn);
    tap.observe(usage);
    const input = { parentThreadId: 'parent', childThreadId: 'child',
      turnId: 'child-turn', elapsedMs: 100, pricing: null };
    const first = tap.completeChildTurn(input);
    expect(first.provenance).toBe('child-thread');
    expect(first.telemetry).toMatchObject({ status: 'reported', usage: {
      inputTokens: 12, outputTokens: 4,
      cacheReadTokens: { status: 'reported', value: 3 },
    } });
    expect(first.transition.snapshot.rawTokens).toBe(16);
    expect(tap.completeChildTurn(input)).toBe(first);
  });

  it('reports unavailable after a completed child without usage', () => {
    const tap = new CodexChildBudgetTap(settings);
    tap.observe(spawn);
    const decision = tap.completeChildTurn({ parentThreadId: 'parent',
      childThreadId: 'child', turnId: 'child-turn', modelId: 'codex-model',
      elapsedMs: 100, pricing: null });
    expect(decision.telemetry).toMatchObject({ status: 'unavailable',
      reason: 'no-usage-event' });
    expect(decision.transition.stopReason).toBe('telemetry-unavailable');
  });

  it('marks an explicitly isolated fallback as parent-delta', () => {
    const tap = new CodexChildBudgetTap(settings);
    tap.observe(spawn);
    const decision = tap.completeChildTurn({ parentThreadId: 'parent',
      childThreadId: 'child', turnId: 'child-turn', modelId: 'codex-model',
      parentDelta: { inputTokens: 3, outputTokens: 2 },
      elapsedMs: 100, pricing: null });
    expect(decision.provenance).toBe('parent-delta');
    expect(decision.transition.snapshot.rawTokens).toBe(5);
  });
});
