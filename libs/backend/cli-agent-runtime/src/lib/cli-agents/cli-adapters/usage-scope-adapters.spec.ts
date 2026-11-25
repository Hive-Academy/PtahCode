import { completedTurnTelemetry } from '@ptah-extension/shared';
import { LaneUsageNormalizer } from '../lane-usage-normalizer';

describe('CLI adapter usage scopes', () => {
  it.each(['antigravity', 'opencode', 'copilot'])(
    '%s retains one completed turn total after earlier usage messages', (provider) => {
      const normalizer = new LaneUsageNormalizer();
      const laneId = `${provider}-lane`;
      const first = normalizer.accept(laneId, 'turn', { inputTokens: 4, outputTokens: 2 });
      const second = normalizer.accept(laneId, 'turn', { inputTokens: 6, outputTokens: 3 });
      const result = normalizer.accept(laneId, 'turn', {
        inputTokens: 10, outputTokens: 5, costUsd: 0.01,
      });
      expect(result.turnTotal).toMatchObject({ inputTokens: 10, outputTokens: 5, costUsd: 0.01 });
      // The card adds increments; their sum is the durable total.
      expect([first, second, result].map((step) => step.increment.inputTokens)).toEqual([4, 2, 4]);
      expect([first, second, result].reduce((sum, step) => sum + (step.increment.outputTokens ?? 0), 0)).toBe(5);
    },
  );

  it.each(['antigravity', 'opencode', 'copilot'])(
    '%s reports missing usage without inventing zero counters', (provider) => {
      const telemetry = completedTurnTelemetry({
        turnId: `${provider}-turn`, modelId: `${provider}/model`, source: 'stream',
      });
      expect(telemetry).toMatchObject({ status: 'unavailable', reason: 'no-usage-event' });
      expect(telemetry).not.toHaveProperty('usage');
    },
  );

  it('grok sums its per-call message increments to the turn total, which then corrects nothing', () => {
    // The three `response_completed` calls of grok-p1-ptah-mcp-search-use-tool.ndjson,
    // then its `_meta.usage` turn total (the fixture replay is in provider-session-lane-handle.spec.ts).
    const normalizer = new LaneUsageNormalizer();
    const calls = [
      normalizer.accept('grok-lane', 'message', { inputTokens: 18267, outputTokens: 168 }),
      normalizer.accept('grok-lane', 'message', { inputTokens: 25092, outputTokens: 227 }),
      normalizer.accept('grok-lane', 'message', { inputTokens: 25665, outputTokens: 78 }),
    ];
    const total = normalizer.accept('grok-lane', 'turn', { inputTokens: 69024, outputTokens: 473 });
    expect(calls.map((step) => step.increment.inputTokens)).toEqual([18267, 25092, 25665]);
    expect(total.increment).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(total.turnTotal).toEqual({ inputTokens: 69024, outputTokens: 473 });
  });
});
