import { completedTurnTelemetry } from '@ptah-extension/shared';
import { LaneUsageNormalizer } from '../lane-usage-normalizer';

describe('CLI adapter usage scopes', () => {
  it.each(['antigravity', 'opencode', 'copilot'])(
    '%s retains one completed turn total after earlier usage messages', (provider) => {
      const normalizer = new LaneUsageNormalizer();
      const laneId = `${provider}-lane`;
      normalizer.accept(laneId, 'turn', { inputTokens: 4, outputTokens: 2 });
      normalizer.accept(laneId, 'turn', { inputTokens: 6, outputTokens: 3 });
      const result = normalizer.accept(laneId, 'turn', {
        inputTokens: 10, outputTokens: 5, costUsd: 0.01,
      });
      expect(result).toMatchObject({ inputTokens: 10, outputTokens: 5, costUsd: 0.01 });
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
});
