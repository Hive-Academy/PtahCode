import { FILE_BASED_SETTINGS_DEFAULTS } from '@ptah-extension/platform-core';
import { CODEX_DEFAULT_LANE_BUDGETS, resolveCodexLaneBudgets } from './codex-lane-budgets';

describe('resolveCodexLaneBudgets', () => {
  it('maps registered global defaults', () => {
    expect(CODEX_DEFAULT_LANE_BUDGETS).toEqual({
      autoCompactTokens: 127500,
      toolOutputTokenLimit: FILE_BASED_SETTINGS_DEFAULTS['compaction.toolOutputBudgetTokens'],
      webSearch: FILE_BASED_SETTINGS_DEFAULTS['agentOrchestration.codexWebSearch'],
    });
    expect(resolveCodexLaneBudgets(undefined)).toEqual({
      budgets: CODEX_DEFAULT_LANE_BUDGETS, warnings: [],
    });
  });

  it('derives custom global budgets', () => {
    expect(resolveCodexLaneBudgets({
      warnRatio: 0.75, handoffContextTokens: 100001,
      toolOutputTokenLimit: 4000, webSearch: false,
    })).toEqual({
      budgets: { autoCompactTokens: 75000, toolOutputTokenLimit: 4000, webSearch: false },
      warnings: [],
    });
  });

  it.each([0, -1, 1, Number.NaN, Number.POSITIVE_INFINITY, '0.8'])(
    'falls back for invalid ratio %p', (warnRatio) => {
      const result = resolveCodexLaneBudgets({ warnRatio, handoffContextTokens: 100000 });
      expect(result.budgets.autoCompactTokens).toBe(127500);
      expect(result.warnings).toHaveLength(1);
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null])(
    'falls back for invalid context %p', (handoffContextTokens) => {
      const result = resolveCodexLaneBudgets({ warnRatio: 0.5, handoffContextTokens });
      expect(result.budgets.autoCompactTokens).toBe(127500);
      expect(result.warnings).toHaveLength(1);
    },
  );

  it('falls back for invalid output and web search', () => {
    const result = resolveCodexLaneBudgets({ toolOutputTokenLimit: 0, webSearch: 'false' });
    expect(result.budgets).toEqual(CODEX_DEFAULT_LANE_BUDGETS);
    expect(result.warnings).toHaveLength(2);
  });
});
