import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GateResultSchema,
  RouteDecideService,
  type CandidateTrace,
  type DecisionModelConfig,
  type GateResult,
  type RouteCandidateSource,
  type RouteDecideResult,
} from '@ptah-extension/lane-routing';
import type { CliDetectionResult, RoutingRule } from '@ptah-extension/shared';
import {
  countTokens,
  countTokensPiecewise,
} from '@ptah-extension/tool-output-reducers';
import {
  applyToolResultBudget,
  getToolResultBudget,
  ROUTE_DECIDE_RESULT_BUDGET,
} from './tool-result-budget';
import {
  ROUTING_UNAVAILABLE_MESSAGE,
  RoutingUnavailableError,
  buildRouteNamespace,
  type RouteNamespace,
} from '../namespace-builders/route-namespace.builder';
import {
  handleRouteToolCall,
  routeFailureText,
  type RouteToolLogger,
} from './route-tool-handlers';

const RESULT: RouteDecideResult = {
  stage: 'pre-flight',
  taskType: {
    value: null,
    source: 'skill-table',
    confidence: null,
    fallbackCause: null,
    modelProposal: null,
  },
  depth: {
    value: null,
    source: 'skill-table',
    confidence: null,
    fallbackCause: null,
    modelProposal: null,
  },
  overallConfidence: null,
  reasons: [],
  usage: {
    requests: 0,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
  },
};

function logger(): RouteToolLogger & { warn: jest.Mock } {
  return { warn: jest.fn() };
}

function route(
  decide: RouteNamespace['decide'] = jest.fn().mockResolvedValue(RESULT),
): RouteNamespace & { decide: jest.Mock } {
  const mock = jest.fn(decide);
  return { decide: mock };
}

describe('handleRouteToolCall', () => {
  it('names the invalid field and does not call the service', async () => {
    const log = logger();
    const api = route();

    const reply = await handleRouteToolCall(
      { stage: 'pre-flight', request: 'x', extra: true },
      api,
      log,
    );

    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('extra');
    expect(reply.text).toContain('ptah_route_decide');
    expect(api.decide).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('names a missing field at the root when the argument is not an object', async () => {
    const api = route();
    const reply = await handleRouteToolCall(null, api, logger());
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('(root)');
    expect(api.decide).not.toHaveBeenCalled();
  });

  it('names a duplicate phase id and does not call the service', async () => {
    const api = route();
    const reply = await handleRouteToolCall(
      {
        stage: 'gate-0.1',
        request: 'staff it',
        taskType: 'FEATURE',
        depth: 'Full',
        phases: [
          { id: 'build', kind: 'implement' },
          { id: 'build', kind: 'review' },
        ],
      },
      api,
      logger(),
    );
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('phases.1.id');
    expect(api.decide).not.toHaveBeenCalled();
  });

  it('passes the parsed arguments through and returns the result JSON', async () => {
    const api = route();
    const started = performance.now();
    const reply = await handleRouteToolCall(
      { stage: 'pre-flight', request: '  ship the parser  ' },
      api,
      logger(),
    );
    expect(reply).toEqual({ isError: false, text: JSON.stringify(RESULT) });
    expect(api.decide).toHaveBeenCalledTimes(1);
    expect(api.decide).toHaveBeenCalledWith({
      stage: 'pre-flight',
      request: 'ship the parser',
    }, { deadlineAtMs: expect.any(Number) });
    expect(api.decide.mock.calls[0]?.[1].deadlineAtMs).toBeGreaterThanOrEqual(started + 4000);
    expect(api.decide.mock.calls[0]?.[1].deadlineAtMs).toBeLessThanOrEqual(performance.now() + 4000);
  });

  const cachedSessionKey = 'private-session-key';
  const cachedResult: RouteDecideResult = {
    ...RESULT,
    reasons: ['reused host pre-flight result'],
  };
  const freshResult: RouteDecideResult = {
    ...RESULT,
    usage: { ...RESULT.usage, requests: 1 },
  };

  function routeWithSessionAwareService() {
    const decide = jest.fn(
      async (
        _args: unknown,
        _source: unknown,
        context?: { readonly sessionKey?: string },
      ): Promise<RouteDecideResult> =>
        context?.sessionKey === cachedSessionKey ? cachedResult : freshResult,
    );
    const namespace = buildRouteNamespace({ hasIDECapabilities: false,
      agent: {
        list: jest.fn(),
        limits: jest.fn(),
        listRoles: jest.fn(),
      },
      container: {
        isRegistered: () => true,
        resolve: jest.fn().mockReturnValue({ decide }),
      },
    });
    return { namespace, decide };
  }

  it('forwards a matching session key for host pre-flight reuse without exposing it', async () => {
    const { namespace, decide } = routeWithSessionAwareService();
    const reply = await handleRouteToolCall(
      { stage: 'pre-flight', request: 'ship the parser' },
      namespace,
      logger(),
      { sessionKey: cachedSessionKey },
    );

    expect(decide).toHaveBeenCalledWith(
      { stage: 'pre-flight', request: 'ship the parser' },
      expect.anything(),
      { sessionKey: cachedSessionKey, deadlineAtMs: expect.any(Number) },
    );
    expect(reply).toEqual({
      isError: false,
      text: JSON.stringify(cachedResult),
    });
    expect(reply.text).not.toContain(cachedSessionKey);
  });

  it('forwards a different session key and returns the fresh pre-flight result', async () => {
    const { namespace, decide } = routeWithSessionAwareService();
    const sessionKey = 'other-private-session-key';
    const reply = await handleRouteToolCall(
      { stage: 'pre-flight', request: 'ship the parser' },
      namespace,
      logger(),
      { sessionKey },
    );

    expect(decide).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      sessionKey,
      deadlineAtMs: expect.any(Number),
    });
    expect(reply).toEqual({
      isError: false,
      text: JSON.stringify(freshResult),
    });
    expect(reply.text).not.toContain(sessionKey);
  });

  it('forwards a deadline without a session key', async () => {
    const { namespace, decide } = routeWithSessionAwareService();
    const reply = await handleRouteToolCall(
      { stage: 'pre-flight', request: 'ship the parser' },
      namespace,
      logger(),
    );

    expect(decide).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { deadlineAtMs: expect.any(Number) },
    );
    expect(reply).toEqual({
      isError: false,
      text: JSON.stringify(freshResult),
    });
  });

  const hundredPhases = Array.from({ length: 100 }, (_, index) => ({
    id: `phase-${index}`,
    kind: 'implement' as const,
  }));

  const MAX_CHARS = ROUTE_DECIDE_RESULT_BUDGET.chars;
  const MAX_TOKENS = ROUTE_DECIDE_RESULT_BUDGET.tokens;

  function hundredPhaseResult(reasonRepeats: number): GateResult {
    return withReasons(() =>
      'Selected by the routing policy. '.repeat(reasonRepeats),
    );
  }

  const CLIS = ['codex', 'grok', 'gemini', 'copilot', 'ptah-cli'];

  /**
   * A reason as `compile-reasons` writes it: scores, ranks and quota numbers
   * that differ per phase. Such text is token-dense (about 2.4 chars/token),
   * far denser than the 4 chars/token a char-derived budget assumes.
   */
  function scoredReason(phase: number, length: number): string {
    let text = '';
    let k = phase * 31 + 7;
    while (text.length < length) {
      text += `${CLIS[k % CLIS.length]} ${(k * 37) % 100}/${(k * 11) % 97}=0.${(k * 7919) % 1000}; `;
      k++;
    }
    return text.slice(0, length);
  }

  function withReasons(reason: (phase: number) => string): GateResult {
    return {
      stage: 'gate-0.1',
      roster: hundredPhases.map((phase, index) => ({
        phaseId: phase.id,
        status: 'chosen' as const,
        executor: {
          kind: 'lane' as const,
          id: 'cli-agent',
          cli: 'codex',
          family: 'codex',
        },
        model: 'model-name',
        tier: 'sonnet' as const,
        effort: 'medium' as const,
        provenance: 'configured' as const,
        score: 1,
        source: 'ranking' as const,
        taskKind: 'implement' as const,
        confidence: 0.8,
        fallbackCause: null,
        modelProposal: null,
        reason: reason(index),
      })),
      overallSource: 'ranking',
      overallConfidence: 0.8,
      excluded: [],
      reasons: [],
      usage: {
        requests: 0,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
      },
    };
  }

  function callWith(result: RouteDecideResult) {
    return handleRouteToolCall(
      {
        stage: 'gate-0.1',
        request: 'staff the implementation',
        taskType: 'FEATURE',
        depth: 'Full',
        phases: hundredPhases,
      },
      route(jest.fn().mockResolvedValue(result)),
      logger(),
    );
  }

  it('returns a schema-maximum 100-phase route result whole', async () => {
    const result = hundredPhaseResult(8);
    const measuredChars = JSON.stringify(result).length;
    expect(measuredChars).toBe(57_775);
    expect(measuredChars).toBeLessThanOrEqual(MAX_CHARS);

    const reply = await callWith(result);
    expect(reply.isError).toBe(false);
    expect(JSON.parse(reply.text)).toEqual(result);
  });

  function withTrace(result: GateResult): GateResult {
    const candidates: CandidateTrace[] = [
      { candidate: 'cli-agent', displayName: 'Selected', total: 80, disposition: 'chosen' },
      { candidate: 'less-strong', displayName: 'Other', total: 70, disposition: 'ranked' },
      { candidate: 'runner-up', displayName: 'Runner up', total: 75, disposition: 'excluded', rule: 'pruned', cause: 'option-cap' },
      ...Array.from({ length: 18 }, (_, i): CandidateTrace => ({
        candidate: `excluded-${i}`, displayName: 'Excluded', total: 90, disposition: 'excluded', rule: 'at-limit',
      })),
    ];
    return {
      ...result,
      roster: result.roster.map((row) => ({ ...row, candidates, explanation: 'Score and selection explanation.' })),
    };
  }

  it('forwards the eight-second gate deadline', async () => {
    const api = route(jest.fn().mockResolvedValue(withReasons(() => 'Selected')));
    const started = performance.now();
    await handleRouteToolCall({
      stage: 'gate-0.1', request: 'staff it', taskType: 'FEATURE', depth: 'Full', phases: hundredPhases,
    }, api, logger(), { sessionKey: 'gate-session' });
    expect(api.decide).toHaveBeenCalledWith(expect.anything(), {
      sessionKey: 'gate-session', deadlineAtMs: expect.any(Number),
    });
    expect(api.decide.mock.calls[0]?.[1].deadlineAtMs).toBeGreaterThanOrEqual(started + 8000);
    expect(api.decide.mock.calls[0]?.[1].deadlineAtMs).toBeLessThanOrEqual(performance.now() + 8000);
  });

  it('keeps the chosen candidate and strongest eligible alternative when the shortlist fits', async () => {
    const result = withTrace(withReasons(() => 'Selected'));
    expect(JSON.stringify(result).length).toBeGreaterThan(MAX_CHARS);

    const reply = await callWith(result);

    expect(reply.isError).toBe(false);
    const compacted = GateResultSchema.parse(JSON.parse(reply.text));
    expect(compacted.roster).toHaveLength(100);
    for (const row of compacted.roster) {
      expect(row.candidates?.map((entry) => entry.candidate)).toEqual(['cli-agent', 'runner-up']);
      expect(row.traceOmitted).toBe(19);
    }
    expect(result.roster[0]?.candidates).toHaveLength(21);
  });

  it('fits a dense 100-phase trace by dropping candidate details without changing legacy fields', async () => {
    const legacy = withReasons((phase) => scoredReason(phase, 250));
    const result = withTrace(legacy);
    const reply = await callWith(result);

    expect(reply.isError).toBe(false);
    expect(reply.text.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(countTokens(reply.text)).toBeLessThanOrEqual(MAX_TOKENS);
    const compacted = GateResultSchema.parse(JSON.parse(reply.text));
    expect(compacted.roster).toHaveLength(100);
    expect(compacted.roster.some((row) => (row.traceOmitted ?? 0) > 19)).toBe(true);
    for (const [index, row] of compacted.roster.entries()) {
      expect(row).toMatchObject(legacy.roster[index]);
      expect((row.candidates?.length ?? 0) + (row.traceOmitted ?? 0)).toBe(21);
    }
  });

  it('keeps omission counts and shortens explanations after removing candidate details', async () => {
    const result = withTrace(withReasons(() => 'Selected. '.repeat(16)));
    const explanation = 'Expanded explanation. '.repeat(40);
    result.roster = result.roster.map((row) => ({ ...row, explanation }));
    const reply = await callWith(result);

    expect(reply.isError).toBe(false);
    const compacted = GateResultSchema.parse(JSON.parse(reply.text));
    for (const row of compacted.roster) {
      expect(row.candidates).toBeUndefined();
      expect(row.traceOmitted).toBe(21);
      expect(row.explanation).toBe(`${explanation.slice(0, 95)}…`);
    }
  });

  it('returns the legacy roster when even the omission counts cannot fit', async () => {
    const legacy = withReasons(() => 'Selected. '.repeat(29) + 'chosen by routing policy.');
    const legacyText = JSON.stringify(legacy);
    expect(legacyText.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(legacyText.length).toBeGreaterThan(MAX_CHARS - 1000);
    const reply = await callWith(withTrace(legacy));

    expect(reply).toEqual({ isError: false, text: legacyText });
  });

  it('returns a tool error, never a cut prefix, for an over-limit route result', async () => {
    const result = hundredPhaseResult(32);
    expect(JSON.stringify(result).length).toBeGreaterThan(MAX_CHARS);

    const reply = await callWith(result);
    expect(reply).toMatchObject({
      isError: true,
      text: expect.stringContaining('result exceeds'),
    });
    expect(() => JSON.parse(reply.text)).toThrow();
  });

  describe('token-dense 100-phase results (P6 re-review N-1)', () => {
    let spoolRoot: string;

    beforeAll(() => {
      spoolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'route-budget-'));
    });

    afterAll(() => {
      fs.rmSync(spoolRoot, { recursive: true, force: true });
    });

    it('returns a varied-reason result whole on success and through the tool budget', async () => {
      const result = withReasons((phase) => scoredReason(phase, 295));
      const text = JSON.stringify(result);
      expect(text.length).toBe(61_675);
      expect(text.length).toBeLessThanOrEqual(MAX_CHARS);
      // Over a 4 chars/token budget (16,000 tokens), within the route budget.
      expect(countTokens(text)).toBeGreaterThan(MAX_CHARS / 4);
      expect(countTokens(text)).toBeLessThanOrEqual(MAX_TOKENS);

      const reply = await callWith(result);
      expect(reply).toEqual({ isError: false, text });

      expect(getToolResultBudget('ptah_route_decide')).toBe(
        ROUTE_DECIDE_RESULT_BUDGET,
      );
      const budgeted = await applyToolResultBudget({
        text: reply.text,
        toolName: 'ptah_route_decide',
        requestId: 'route-n1',
        spoolRoot,
      });
      expect(budgeted.truncated).toBe(false);
      expect(budgeted.reduced).toBe(false);
      expect(budgeted.text).toBe(text);
      expect(JSON.parse(budgeted.text)).toEqual(result);
    });

    it('returns a tool error for a result under the char limit but over the token limit', async () => {
      const result = withReasons((phase) => scoredReason(phase, 315));
      const text = JSON.stringify(result);
      expect(text.length).toBeLessThanOrEqual(MAX_CHARS);
      expect(countTokens(text)).toBeGreaterThan(MAX_TOKENS);

      const reply = await callWith(result);
      expect(reply).toEqual({
        isError: true,
        text: `ptah_route_decide failed: result exceeds the ${MAX_CHARS}-character / ${MAX_TOKENS}-token tool limit`,
      });
    });

    it('returns a non-error result under countTokensPiecewise for ten distinct rules with 32 unknown 200-char exclude selectors each', async () => {
      const phases = Array.from({ length: 10 }, (_, idx) => ({
        id: `phase-${idx}`,
        kind: 'implement' as const,
        role: `custom-role-${idx}`,
      }));
      const rules: RoutingRule[] = Array.from({ length: 10 }, (_, idx) => ({
        id: `rule-${idx}`,
        match: { role: `custom-role-${idx}` },
        set: {
          exclude: Array.from({ length: 32 }, (_, selIdx) =>
            `unknown/rule_${idx}:sel_${selIdx}_${idx * 37 + selIdx}_${'x9/a7='.repeat(30)}`.slice(
              0,
              200,
            ),
          ),
        },
      }));
      const cliRows: CliDetectionResult[] = [
        { cli: 'codex', installed: true, messagingMode: 'none' },
        { cli: 'grok', installed: true, messagingMode: 'none' },
        { cli: 'opencode', installed: true, messagingMode: 'none' },
        { cli: 'cursor', installed: true, messagingMode: 'none' },
        { cli: 'copilot', installed: true, messagingMode: 'none' },
        { cli: 'claude', installed: true, messagingMode: 'none' },
      ];
      const source: RouteCandidateSource = {
        rows: async () => cliRows,
        limits: async () => new Map(),
        roles: async () => [],
      };
      const service = new RouteDecideService({
        config: {
          getSelection: () => ({ kind: 'unset' as const }),
        } as unknown as DecisionModelConfig,
        routingRulesSetting: {
          read: () => ({ rules, diagnostics: [] }),
        },
        rotationSetting: { isEnabled: () => false },
        matrix: {
          load: async () => ({
            outcomeFigures: () => null,
            reasons: [],
            resolve: (family, model, taskKind) => ({
              family,
              model,
              profileModel: '*',
              taskKind,
              layers: {},
              cell: { kind: 'unknown' as const },
              score: 50,
              noProfile: true,
            }),
          }),
        },
        rotation: {
          load: () => ({ state: { version: 1, entries: [] }, reason: null }),
          save: async () => ({ persisted: true }),
        },
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
      });

      const reply = await handleRouteToolCall(
        {
          stage: 'gate-0.1',
          request: 'Implement ten phases with dense rule exclude diagnostics',
          taskType: 'FEATURE',
          depth: 'Full',
          phases,
        },
        route((parsed, context) => service.decide(parsed, source, context)),
        logger(),
      );

      expect(reply.isError).toBe(false);
      expect(reply.text.length).toBeLessThanOrEqual(MAX_CHARS);
      expect(countTokensPiecewise(reply.text, MAX_TOKENS)).toBeLessThanOrEqual(
        MAX_TOKENS,
      );
      const parsed = GateResultSchema.parse(JSON.parse(reply.text));
      expect(parsed.roster).toHaveLength(10);
      expect(parsed.reasons[parsed.reasons.length - 1]).toMatch(
        /^and \d+ more diagnostic entries omitted$/,
      );
      expect(reply.text).not.toContain(rules[0].set.exclude?.[0] ?? '');
    });
  });

  it('returns the F9 sentence when routing is not registered', async () => {
    const log = logger();
    const api = route(() => Promise.reject(new RoutingUnavailableError()));
    const reply = await handleRouteToolCall(
      { stage: 'pre-flight', request: 'ship the parser' },
      api,
      log,
    );
    expect(reply).toEqual({
      isError: true,
      text: ROUTING_UNAVAILABLE_MESSAGE,
    });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(String(log.warn.mock.calls[0]?.[0])).toContain(
      ROUTING_UNAVAILABLE_MESSAGE,
    );
  });

  it('redacts a thrown secret and still returns a tool error', async () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
    const api = route(() =>
      Promise.reject(new Error(`auth failed for ${secret}`)),
    );
    const reply = await handleRouteToolCall(
      { stage: 'pre-flight', request: 'ship the parser' },
      api,
      logger(),
    );
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('[REDACTED]');
    expect(reply.text).not.toContain(secret);
    expect(reply.text.startsWith('ptah_route_decide failed:')).toBe(true);
  });
});

describe('routeFailureText', () => {
  it('keeps the F9 sentence and redacts a bearer token', () => {
    expect(routeFailureText(new Error(ROUTING_UNAVAILABLE_MESSAGE))).toBe(
      ROUTING_UNAVAILABLE_MESSAGE,
    );
    const text = routeFailureText(
      new Error('denied Bearer super-secret-token-value'),
    );
    expect(text).not.toContain('super-secret-token-value');
    expect(text).toContain('[REDACTED]');
  });

  it('keeps a field-named service error', () => {
    const message =
      'route decide result failed schema at roster.0.model: invalid';
    expect(routeFailureText(new Error(message))).toBe(
      `ptah_route_decide failed: ${message}`,
    );
  });
});
