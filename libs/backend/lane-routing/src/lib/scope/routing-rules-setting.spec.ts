import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import {
  ROUTING_RULES_SETTING_KEY,
  type RoutingRule,
} from '@ptah-extension/shared';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import {
  MAX_ROUTING_RULES,
  RoutingRulesSetting,
  matchRoutingRule,
  readRoutingRules,
} from './routing-rules-setting';

function createLogger(): {
  readonly logger: LaneRoutingLogger;
  readonly warn: jest.Mock;
} {
  const warn = jest.fn();
  return {
    warn,
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn,
      error: jest.fn(),
    },
  };
}

describe('readRoutingRules', () => {
  it('returns zero rules and zero diagnostics when the setting is undefined', () => {
    expect(readRoutingRules(undefined)).toEqual({ rules: [], diagnostics: [] });
  });

  it.each([null, 'invalid', 42, true, { id: 'not-array' }])(
    'returns zero rules and one diagnostic for a non-array value (%p)',
    (raw) => {
      const result = readRoutingRules(raw);
      expect(result.rules).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatch(/array/i);
    },
  );

  it('drops and reports an invalid sibling rule while loading valid siblings in order', () => {
    const result = readRoutingRules([
      {
        id: 'ui-opus',
        match: { kind: 'design' },
        set: { minTier: 'opus', prefer: ['  codex  '] },
      },
      {
        id: 'bad-tier',
        match: { kind: 'implement' },
        set: { minTier: 'ultra' },
      },
      {
        id: 'bad-unknown-field',
        match: { kind: 'review' },
        set: { effort: 'high' },
        extra: true,
      },
      'not-an-object',
      {
        id: 'empty-set',
        match: {},
        set: {},
      },
      {
        id: 'review-fast',
        match: { kind: ['review', 'document-review'], taskType: 'BUGFIX' },
        set: { maxTier: 'sonnet', effort: 'medium', exclude: ['  grok '] },
      },
    ]);

    expect(result.rules).toEqual([
      {
        id: 'ui-opus',
        match: { kind: 'design' },
        set: { minTier: 'opus', prefer: ['codex'] },
      },
      {
        id: 'review-fast',
        match: { kind: ['review', 'document-review'], taskType: 'BUGFIX' },
        set: { maxTier: 'sonnet', effort: 'medium', exclude: ['grok'] },
      },
    ]);
    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics[0]).toMatch(/^routing rule bad-tier: /);
    expect(result.diagnostics[1]).toMatch(/^routing rule bad-unknown-field: /);
    expect(result.diagnostics[2]).toMatch(/^routing rule 3: /);
    expect(result.diagnostics[3]).toBe(
      'routing rule empty-set: set must specify at least one field',
    );
  });

  it('keeps the first rule on duplicate ids and reports later duplicates', () => {
    const result = readRoutingRules([
      {
        id: 'dup-rule',
        match: { kind: 'implement' },
        set: { minTier: 'sonnet' },
      },
      {
        id: 'dup-rule',
        match: { kind: 'review' },
        set: { minTier: 'opus' },
      },
      {
        id: 'dup-rule',
        match: { kind: 'tests' },
        set: { effort: 'low' },
      },
    ]);

    expect(result.rules).toEqual([
      {
        id: 'dup-rule',
        match: { kind: 'implement' },
        set: { minTier: 'sonnet' },
      },
    ]);
    expect(result.diagnostics).toEqual([
      'routing rule dup-rule: duplicate id',
      'routing rule dup-rule: duplicate id',
    ]);
  });

  it('reports and drops a rule whose minTier is above maxTier', () => {
    const result = readRoutingRules([
      {
        id: 'reversed-bounds',
        match: { shape: 'logic' },
        set: { minTier: 'opus', maxTier: 'sonnet' },
      },
      {
        id: 'equal-bounds',
        match: { shape: 'logic' },
        set: { minTier: 'sonnet', maxTier: 'sonnet' },
      },
    ]);

    expect(result.rules).toEqual([
      {
        id: 'equal-bounds',
        match: { shape: 'logic' },
        set: { minTier: 'sonnet', maxTier: 'sonnet' },
      },
    ]);
    expect(result.diagnostics).toEqual([
      'routing rule reversed-bounds: minTier opus is above maxTier sonnet',
    ]);
  });

  it('drops rules with invalid ids, empty match arrays, or blank selectors without echoing unsafe text', () => {
    const result = readRoutingRules([
      {
        id: 'bad;id\nnewline',
        match: {},
        set: { effort: 'high' },
      },
      {
        id: 'empty-kind-array',
        match: { kind: [] },
        set: { effort: 'high' },
      },
      {
        id: 'blank-selector',
        match: {},
        set: { prefer: ['   '] },
      },
    ]);

    expect(result.rules).toEqual([]);
    expect(result.diagnostics).toHaveLength(3);
    expect(result.diagnostics[0]).toMatch(/^routing rule 0: /);
    expect(result.diagnostics[1]).toMatch(/^routing rule empty-kind-array: /);
    expect(result.diagnostics[2]).toMatch(/^routing rule blank-selector: /);
    for (const diagnostic of result.diagnostics) {
      expect(diagnostic).not.toMatch(/[;\r\n]/);
    }
  });

  it('caps the rule list at 64 entries and reports truncation once', () => {
    const many = Array.from({ length: MAX_ROUTING_RULES + 3 }, (_, idx) => ({
      id: `rule-${idx}`,
      match: {},
      set: { effort: 'medium' },
    }));

    const result = readRoutingRules(many);
    expect(result.rules).toHaveLength(MAX_ROUTING_RULES);
    expect(result.rules[0]?.id).toBe('rule-0');
    expect(result.rules[MAX_ROUTING_RULES - 1]?.id).toBe(
      `rule-${MAX_ROUTING_RULES - 1}`,
    );
    expect(result.diagnostics).toEqual([
      `routing rules list truncated to ${MAX_ROUTING_RULES} entries`,
    ]);
  });
});

describe('matchRoutingRule', () => {
  const rules: readonly RoutingRule[] = [
    {
      id: 'first-specific',
      match: {
        kind: ['implement', 'tests'],
        shape: ['logic', 'contract'],
        taskType: ['FEATURE', 'BUGFIX'],
        role: ['backend-developer', 'frontend-developer'],
      },
      set: { minTier: 'opus' },
    },
    {
      id: 'second-broader',
      match: { kind: 'implement', taskType: 'FEATURE' },
      set: { effort: 'high' },
    },
    {
      id: 'catch-all',
      match: {},
      set: { maxTier: 'sonnet' },
    },
  ];

  it('combines match fields with AND across fields and OR inside an array field', () => {
    expect(
      matchRoutingRule(
        { kind: 'tests', shape: 'contract', role: 'frontend-developer' },
        'BUGFIX',
        rules,
      )?.id,
    ).toBe('first-specific');

    expect(
      matchRoutingRule(
        { kind: 'implement', shape: 'mechanical', role: 'backend-developer' },
        'FEATURE',
        rules,
      )?.id,
    ).toBe('second-broader');

    expect(
      matchRoutingRule(
        { kind: 'implement', shape: 'logic' },
        'FEATURE',
        rules,
      )?.id,
    ).toBe('second-broader');
  });

  it('picks the first matching rule when multiple rules match', () => {
    expect(
      matchRoutingRule(
        { kind: 'implement', shape: 'logic', role: 'backend-developer' },
        'FEATURE',
        rules,
      )?.id,
    ).toBe('first-specific');
  });

  it('matches every phase with an empty match object and returns undefined when no rule matches', () => {
    expect(
      matchRoutingRule({ kind: 'research' }, 'RESEARCH', rules)?.id,
    ).toBe('catch-all');

    expect(
      matchRoutingRule(
        { kind: 'research' },
        'RESEARCH',
        rules.slice(0, 2),
      ),
    ).toBeUndefined();
  });
});

describe('RoutingRulesSetting', () => {
  it('reads and validates rules from ptah.agentOrchestration.routingRules', () => {
    const getConfiguration = jest.fn().mockReturnValue([
      {
        id: 'ui-opus',
        match: { kind: 'design' },
        set: { minTier: 'opus' },
      },
    ]);
    const workspace = { getConfiguration } as unknown as IWorkspaceProvider;
    const { logger } = createLogger();

    const setting = new RoutingRulesSetting(workspace, logger);
    const result = setting.read();

    expect(getConfiguration).toHaveBeenCalledWith(
      'ptah',
      ROUTING_RULES_SETTING_KEY,
    );
    expect(result).toEqual({
      rules: [
        {
          id: 'ui-opus',
          match: { kind: 'design' },
          set: { minTier: 'opus' },
        },
      ],
      diagnostics: [],
    });
  });

  it('returns zero rules and one diagnostic without throwing when configuration read fails', () => {
    const getConfiguration = jest.fn().mockImplementation(() => {
      throw new TypeError('settings backend unavailable');
    });
    const workspace = { getConfiguration } as unknown as IWorkspaceProvider;
    const { logger, warn } = createLogger();

    const setting = new RoutingRulesSetting(workspace, logger);
    const result = setting.read();

    expect(result).toEqual({
      rules: [],
      diagnostics: ['routing rules setting could not be read'],
    });
    expect(warn).toHaveBeenCalledWith('Routing rules setting read failed', {
      code: 'TypeError',
    });
  });
});
