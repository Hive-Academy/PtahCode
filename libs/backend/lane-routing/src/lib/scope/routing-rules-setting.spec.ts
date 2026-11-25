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

  it('drops and reports a throwing entry getter while keeping valid siblings on both sides', () => {
    const throwingMatchEntry = {
      id: 'exploding-match',
      get match(): unknown {
        throw new Error('match getter failed');
      },
      set: { effort: 'high' },
    };
    const throwingIdLabelEntry = {
      idReads: 0,
      get id(): string {
        this.idReads += 1;
        if (this.idReads > 1) {
          throw new Error('id getter failed on label read');
        }
        return 'flaky-id';
      },
      match: { kind: 'invalid-kind' },
      set: { effort: 'high' },
    };

    const entries: unknown[] = [
      {
        id: 'before-throw',
        match: { kind: 'design' },
        set: { minTier: 'opus' },
      },
      throwingMatchEntry,
      throwingIdLabelEntry,
      {
        id: 'after-throw',
        match: { kind: 'review' },
        set: { maxTier: 'sonnet' },
      },
    ];

    const result = readRoutingRules(entries);

    expect(result.rules).toEqual([
      {
        id: 'before-throw',
        match: { kind: 'design' },
        set: { minTier: 'opus' },
      },
      {
        id: 'after-throw',
        match: { kind: 'review' },
        set: { maxTier: 'sonnet' },
      },
    ]);
    expect(result.diagnostics).toEqual([
      'routing rule 1: unreadable entry',
      'routing rule 2: unreadable entry',
    ]);
  });

  it('isolates a throwing array slot getter and a throwing top-level proxy without aborting or throwing', () => {
    const arrayWithThrowingSlot: unknown[] = [
      {
        id: 'first-valid',
        match: { kind: 'implement' },
        set: { effort: 'medium' },
      },
      undefined,
      {
        id: 'last-valid',
        match: { kind: 'tests' },
        set: { effort: 'low' },
      },
    ];
    Object.defineProperty(arrayWithThrowingSlot, 1, {
      enumerable: true,
      get() {
        throw new Error('slot 1 unreadable');
      },
    });

    const slotResult = readRoutingRules(arrayWithThrowingSlot);
    expect(slotResult.rules.map((r) => r.id)).toEqual([
      'first-valid',
      'last-valid',
    ]);
    expect(slotResult.diagnostics).toEqual(['routing rule 1: unreadable entry']);

    const throwingProxy = new Proxy([], {
      get(_target, prop) {
        if (prop === 'length') {
          throw new Error('length unreadable');
        }
        return undefined;
      },
    });
    expect(readRoutingRules(throwingProxy)).toEqual({
      rules: [],
      diagnostics: ['routing rules setting could not be read'],
    });
  });

  it('removes C1 controls and Unicode line separators from diagnostics', () => {
    const result = readRoutingRules([
      {
        id: 'c1-key',
        match: {},
        set: { effort: 'high' },
        'csi\u009b[2Jnel\u0085ls\u2028ps\u2029end': true,
      },
    ]);

    expect(result.rules).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatch(/^routing rule c1-key: /);
    expect(result.diagnostics[0]).not.toMatch(/[\u0080-\u009f\u2028\u2029]/);
  });

  it('sanitizes control characters, semicolons, line breaks, and length in diagnostics for unknown properties', () => {
    const unsafeKey = `bad;key\nwith\r\u001b\u0000\u007fctrl_${'x'.repeat(200)}`;
    const result = readRoutingRules([
      {
        id: 'unsafe-key-rule',
        match: { kind: 'implement' },
        set: { effort: 'high' },
        [unsafeKey]: true,
      },
      {
        id: 'short-unsafe-key',
        match: { kind: 'design' },
        set: { effort: 'medium' },
        'semi;line\nbreak\u001besc': true,
      },
      {
        id: 'valid-sibling',
        match: { kind: 'review' },
        set: { maxTier: 'sonnet' },
      },
    ]);

    expect(result.rules.map((r) => r.id)).toEqual(['valid-sibling']);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toMatch(/^routing rule unsafe-key-rule: /);
    expect(result.diagnostics[0]).toMatch(/\.\.\.$/);
    expect(result.diagnostics[1]).toMatch(/^routing rule short-unsafe-key: /);

    for (const diagnostic of result.diagnostics) {
      expect(diagnostic.length).toBeLessThanOrEqual(160);
      expect(diagnostic).not.toMatch(/[;\r\n]/);
      expect(diagnostic).not.toMatch(/\s{2,}/);
      for (let i = 0; i < diagnostic.length; i += 1) {
        const code = diagnostic.charCodeAt(i);
        expect(code).toBeGreaterThan(0x1f);
        expect(code).not.toBe(0x7f);
      }
    }
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

  it('trims padded phase and rule roles case-sensitively without mutating the phase', () => {
    const parsed = readRoutingRules([
      {
        id: 'single-role',
        match: { role: '  backend-developer  ' },
        set: { minTier: 'opus' },
      },
      {
        id: 'role-array',
        match: { role: ['  frontend-developer ', ' qa-engineer  '] },
        set: { effort: 'high' },
      },
      {
        id: 'catch-all',
        match: {},
        set: { maxTier: 'sonnet' },
      },
    ]);
    expect(parsed.diagnostics).toEqual([]);

    const paddedSinglePhase = {
      kind: 'implement' as const,
      role: '  backend-developer ',
    };
    expect(
      matchRoutingRule(paddedSinglePhase, 'FEATURE', parsed.rules)?.id,
    ).toBe('single-role');
    expect(paddedSinglePhase.role).toBe('  backend-developer ');

    expect(
      matchRoutingRule(
        { kind: 'implement', role: ' frontend-developer  ' },
        'FEATURE',
        parsed.rules,
      )?.id,
    ).toBe('role-array');

    // Direct call with un-normalized rule role also trims consistently.
    const unnormalizedRules: readonly RoutingRule[] = [
      {
        id: 'direct-padded-role',
        match: { role: '  security-reviewer  ' },
        set: { minTier: 'opus' },
      },
    ];
    expect(
      matchRoutingRule(
        { kind: 'review', role: 'security-reviewer ' },
        'FEATURE',
        unnormalizedRules,
      )?.id,
    ).toBe('direct-padded-role');

    // Case-sensitive comparison and blank phase role do not match role-scoped rules.
    expect(
      matchRoutingRule(
        { kind: 'implement', role: 'Backend-Developer' },
        'FEATURE',
        parsed.rules,
      )?.id,
    ).toBe('catch-all');
    expect(
      matchRoutingRule(
        { kind: 'implement', role: '   ' },
        'FEATURE',
        parsed.rules,
      )?.id,
    ).toBe('catch-all');
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
