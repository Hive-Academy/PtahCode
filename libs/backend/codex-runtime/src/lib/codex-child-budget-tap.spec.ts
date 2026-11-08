import { CodexChildBudgetTap, CODEX_CHILD_BUDGET_MAX_ENTRIES } from './codex-child-budget-tap';
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

  it('keeps at most the cap of children and releases the oldest first', () => {
    const tap = new CodexChildBudgetTap(settings);
    const total = CODEX_CHILD_BUDGET_MAX_ENTRIES + 2;
    for (let index = 0; index < total; index++)
      tap.observe({ ...spawn, agentThreadIds: [`child-${index}`] });
    expect(tap.trackedChildren).toBe(CODEX_CHILD_BUDGET_MAX_ENTRIES);
    expect(tap.parentOf('child-0')).toBeUndefined();
    expect(tap.parentOf('child-1')).toBeUndefined();
    expect(tap.parentOf(`child-${total - 1}`)).toBe('parent');
  });

  it('keeps no usage for a thread without parent attribution', () => {
    const tap = new CodexChildBudgetTap(settings);
    const evidence = usage.type === 'usage' ? usage.evidence : undefined;
    if (!evidence) throw new Error('fixture needs evidence');
    tap.observe({ ...usage, evidence: { ...evidence, parentThreadId: undefined } });
    expect(tap.trackedChildren).toBe(0);
    tap.observe(spawn);
    const decision = tap.completeChildTurn({ parentThreadId: 'parent',
      childThreadId: 'child', turnId: 'child-turn', elapsedMs: 0, pricing: null });
    expect(decision.provenance).toBe('telemetry-unavailable');
  });

  it('measures elapsed time from the first attribution and clears it on release', () => {
    let now = 1_000;
    const tap = new CodexChildBudgetTap(settings, () => now);
    tap.observe(spawn);
    now = 1_250;
    tap.observe(spawn);
    expect(tap.elapsedMs('child')).toBe(250);
    tap.releaseChild('child');
    expect(tap.elapsedMs('child')).toBe(0);
    expect(tap.trackedChildren).toBe(0);
  });
});
