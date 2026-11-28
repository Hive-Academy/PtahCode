import 'reflect-metadata';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { InternalQueryQueueTimeoutError } from '@ptah-extension/agent-sdk';
import type {
  InternalQueryConfig,
  InternalQueryHandle,
  InternalQueryService,
  IWorkspaceLlmResolver,
  ResolvedSetupSnapshot,
} from '@ptah-extension/agent-sdk';
import type { SkillRankingCallerService } from '@ptah-extension/lane-routing';
import type { SkillShEntry } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { HarnessLlmRunner } from '../../harness/ai/harness-llm-runner.service';
import type { HarnessStreamBroadcaster } from '../../harness/streaming/harness-stream-broadcaster.service';
import { SKILL_JUDGE_TRANSPORT_SCHEMA } from './skill-judge.schema';
import { SkillJudgeService } from './skill-judge.service';
import type {
  SkillJudgeInputItem,
  SkillJudgeRequest,
} from './skill-judge.types';

const SETUP: ResolvedSetupSnapshot = {
  providerId: 'setup-provider',
  model: 'setup-model',
  auth: { env: { ANTHROPIC_AUTH_TOKEN: 'setup-auth-fixture' } },
};
const SETUP_PAIR = { provider: SETUP.providerId, model: SETUP.model };
const DECISION_PAIR = {
  provider: 'decision-provider',
  model: 'decision-model',
};
const EVIDENCE = 'React is declared in package.json.';
const REASON = 'Matches the React dependency in package.json.';

function candidate(
  skillId: string,
  description = 'Registry description',
): SkillShEntry {
  return {
    source: 'Org/Repo',
    skillId,
    name: skillId,
    description,
    installs: 1,
    isInstalled: false,
  };
}

function stackItem(
  name: string,
  candidates: SkillShEntry[] = [],
): SkillJudgeInputItem {
  return {
    itemId: `framework:${name.toLowerCase()}`,
    item: { name, kind: 'framework', evidence: EVIDENCE, sourcePhase: 'stack' },
    registry: candidates.length ? 'matched' : 'no-match',
    candidates,
  };
}

function request(
  items: SkillJudgeInputItem[],
  resolved = SETUP,
): SkillJudgeRequest {
  return { workspaceRoot: '/project', resolved, rpcEntry: Date.now(), items };
}

function noSkill(item: SkillJudgeInputItem) {
  return {
    itemId: item.itemId,
    outcomes: [{ verdict: 'no-skill', reason: 'No project skill needed.' }],
  };
}

function install(candidateId: string, reason = REASON) {
  return { verdict: 'install' as const, candidateId, reason };
}

function build(name: string, description: string, proposalRef?: string) {
  return {
    verdict: 'build',
    reason: 'Capture project conventions.',
    proposal: { name, description, proposalRef },
  };
}

function success(structured_output: unknown, result = ''): SDKMessage {
  return {
    type: 'result',
    subtype: 'success',
    structured_output,
    result,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as SDKMessage;
}

function stream(...messages: SDKMessage[]): InternalQueryHandle {
  return {
    stream: (async function* () {
      yield* messages;
    })(),
    close: jest.fn(),
    abort: jest.fn(),
  };
}

type Rank = SkillRankingCallerService['rankSkillCandidates'];

function fixture() {
  const logger = { warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const execute = jest.fn<
    Promise<InternalQueryHandle>,
    [InternalQueryConfig]
  >();
  const rankSkillCandidates = jest
    .fn<ReturnType<Rank>, Parameters<Rank>>()
    .mockResolvedValue({
      status: 'skipped',
      category: 'not-configured',
      items: {},
      itemRejections: {},
    });
  const workspaceLlm: IWorkspaceLlmResolver = {
    resolveForPath: jest
      .fn()
      .mockRejectedValue(new Error('Unexpected workspace lookup')),
    resolveSetup: jest
      .fn()
      .mockRejectedValue(new Error('Unexpected Setup lookup')),
  };
  const broadcaster = {
    createStreamEmitter: () => ({
      emitter: { emit: jest.fn() },
      operationId: 'judge',
    }),
    teeStreamWithFlatEvents: (output: AsyncIterable<SDKMessage>) => output,
    broadcastComplete: jest.fn(),
    broadcastFlatComplete: jest.fn(),
  };
  const runner = new HarnessLlmRunner(
    logger as unknown as Logger,
    { execute } as unknown as InternalQueryService,
    broadcaster as unknown as HarnessStreamBroadcaster,
    workspaceLlm,
  );
  const service = new SkillJudgeService(
    logger as unknown as Logger,
    { rankSkillCandidates },
    runner,
  );
  return {
    service,
    execute,
    rankSkillCandidates,
    workspaceLlm,
    runner,
    logger,
  };
}

function respond(
  execute: ReturnType<typeof fixture>['execute'],
  ...messages: SDKMessage[]
): void {
  execute.mockImplementation(async (config) => {
    config.onProviderSubmit?.({
      provider: 'submitted-provider',
      model: config.model,
    });
    return stream(...messages);
  });
}

function decisionInstall(
  candidateId: string,
  reason = REASON,
  rejections: Record<string, string> = {},
) {
  return {
    ...install(candidateId, reason),
    stage: 'decision' as const,
    order: [candidateId],
    rejections,
  };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('SkillJudgeService', () => {
  it('uses the launch Setup snapshot rather than workspace, picker or tab routing', async () => {
    const { service, execute, workspaceLlm } = fixture();
    const item = stackItem('React', [candidate('React')]);
    respond(
      execute,
      success({
        items: [{ itemId: item.itemId, outcomes: [install('ORG/REPO/REACT')] }],
      }),
    );

    const result = await service.judge(request([item]));

    expect(workspaceLlm.resolveForPath).not.toHaveBeenCalled();
    expect(workspaceLlm.resolveSetup).not.toHaveBeenCalled();
    expect(execute.mock.calls[0][0]).toMatchObject({
      model: SETUP.model,
      auth: SETUP.auth,
      mcpServerRunning: false,
      maxTurns: 3,
      toolAccess: 'none',
      outputFormat: {
        type: 'json_schema',
        schema: SKILL_JUDGE_TRANSPORT_SCHEMA,
      },
    });
    expect(result.candidates[0]).toMatchObject({
      candidateId: 'org/repo/react',
      selectionKey: 'Org/Repo/React',
    });
    expect(result.stages[1]).toMatchObject({
      status: 'used',
      pairConfigured: SETUP_PAIR,
      pairAttempted: { provider: 'submitted-provider', model: SETUP.model },
      pairUsed: { provider: 'submitted-provider', model: SETUP.model },
    });
    expect(result.items[0].outcomes).toEqual([
      { ...install('org/repo/react'), stage: 'normal' },
    ]);
    expect(JSON.stringify(result)).not.toContain('setup-auth-fixture');
  });

  it('dispatches the concrete workspace snapshot for unset Setup and uses the next snapshot only on re-run', async () => {
    const { service, execute, workspaceLlm } = fixture();
    const item = stackItem('React');
    const workspace = {
      providerId: 'workspace-provider',
      model: 'workspace-model',
      auth: { env: {} },
    };
    const picker = { currentModel: 'picker-model' };
    const tab = { overrideModel: 'tab-model' };
    const next = {
      providerId: 'next-provider',
      model: 'next-model',
      auth: { env: {} },
    };
    let settingsSnapshot = workspace;

    execute.mockImplementation(async (config) => {
      settingsSnapshot = next;
      config.onProviderSubmit?.({
        provider:
          config.model === workspace.model
            ? workspace.providerId
            : next.providerId,
        model: config.model,
      });
      return stream(success({ items: [noSkill(item)] }));
    });
    const firstRequest = {
      ...request([item], settingsSnapshot),
      ...picker,
      ...tab,
    };

    const first = await service.judge(firstRequest);
    const second = await service.judge(request([item], settingsSnapshot));

    expect(
      execute.mock.calls.map(([config]) => [config.model, config.auth]),
    ).toEqual([
      // The runner attaches the snapshot provider id to the auth override so
      // the SDK reports the canonical submitted provider (review A1).
      [
        workspace.model,
        { ...workspace.auth, providerId: workspace.providerId },
      ],
      [next.model, { ...next.auth, providerId: next.providerId }],
    ]);
    expect(workspaceLlm.resolveForPath).not.toHaveBeenCalled();
    expect(first.stages[1].pairUsed).toEqual({
      provider: workspace.providerId,
      model: workspace.model,
    });
    expect(second.stages[1].pairUsed).toEqual({
      provider: next.providerId,
      model: next.model,
    });
  });

  it('retains blocked Decision identity while using the Setup snapshot for Normal', async () => {
    const { service, execute, rankSkillCandidates } = fixture();
    const item = stackItem('React', [candidate('react')]);
    rankSkillCandidates.mockResolvedValue({
      status: 'failed',
      category: 'auth',
      pairConfigured: DECISION_PAIR,
      items: {},
      itemRejections: {},
    });
    respond(execute, success({ items: [noSkill(item)] }));

    const result = await service.judge(request([item]));

    expect(result.stages[0]).toEqual({
      stage: 'decision',
      status: 'failed',
      category: 'auth',
      itemsJudged: 0,
      invalidItemIds: [],
      pairConfigured: DECISION_PAIR,
    });
    expect(result.stages[1]).toMatchObject({
      status: 'used',
      pairConfigured: SETUP_PAIR,
    });
  });

  it('retains the configured Decision pair when System One skips inference', async () => {
    const { service, execute, rankSkillCandidates } = fixture();
    const item = stackItem('React', [candidate('react')]);
    rankSkillCandidates.mockResolvedValue({
      status: 'skipped',
      category: 'no-work',
      pairConfigured: DECISION_PAIR,
      items: {},
      itemRejections: {},
    } as Awaited<ReturnType<Rank>>);
    respond(execute, success({ items: [noSkill(item)] }));

    const result = await service.judge(request([item]));

    expect(result.stages[0]).toEqual({
      stage: 'decision',
      status: 'skipped',
      category: 'no-work',
      pairConfigured: DECISION_PAIR,
      itemsJudged: 0,
      invalidItemIds: [],
    });
  });

  it('Decision discards ambiguous, conflicting, deprecated or reason-less answer and routes only that item to Normal while retaining valid siblings and per-candidate rejections', async () => {
    const { service, execute, rankSkillCandidates } = fixture();
    const keep = stackItem('React', [
      candidate('good'),
      candidate('other'),
      candidate('unselected'),
    ]);
    const conflict = stackItem('Conflict', [candidate('conflict')]);
    const deprecated = stackItem('Legacy', [
      candidate('old', 'Marked DEPRECATED.'),
      candidate('current'),
    ]);
    const reasonless = stackItem('Empty', [candidate('blank')]);
    const ambiguous = stackItem('Ambiguous', [
      candidate('DUP'),
      candidate('dup'),
      candidate('unique'),
    ]);
    const omitted = stackItem('Omitted', [candidate('missing')]);
    const items = [keep, conflict, deprecated, reasonless, ambiguous, omitted];
    const input = request(items);
    rankSkillCandidates.mockResolvedValue({
      status: 'used',
      pairAttempted: DECISION_PAIR,
      pairConfigured: DECISION_PAIR,
      pairUsed: DECISION_PAIR,
      itemRejections: { [conflict.itemId]: 'Conflicting answers' },
      items: {
        [keep.itemId]: decisionInstall('org/repo/good', REASON, {
          'org/repo/other': 'Unrelated subproject.',
        }),
        [conflict.itemId]: decisionInstall('org/repo/conflict'),
        [deprecated.itemId]: decisionInstall('org/repo/old'),
        [reasonless.itemId]: decisionInstall('org/repo/blank', ' '),
        [ambiguous.itemId]: decisionInstall('org/repo/dup'),
      },
    });
    respond(execute, success({ items: items.slice(1).map(noSkill) }));

    const result = await service.judge(input);

    expect(rankSkillCandidates).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: deprecated.itemId,
          evidence: EVIDENCE,
          registry: 'matched',
          candidates: expect.arrayContaining([
            expect.objectContaining({
              label: 'org/repo/old',
              deprecated: true,
            }),
          ]),
        }),
      ]),
      input.rpcEntry,
    );
    const { items: normalItems } = JSON.parse(execute.mock.calls[0][0].prompt);
    expect(normalItems.map(({ itemId }: { itemId: string }) => itemId)).toEqual(
      items.slice(1).map(({ itemId }) => itemId),
    );
    expect(JSON.stringify(normalItems)).not.toContain('org/repo/old');
    expect(result).toMatchObject({
      method: 'mixed',
      counts: { decision: 1, normal: 5, notJudged: 0 },
    });
    expect(result.stages[0]).toMatchObject({
      status: 'used',
      itemsJudged: 1,
      invalidItemIds: items.slice(1, -1).map(({ itemId }) => itemId),
    });
    expect(result.items[0].candidateAssessments.slice(1)).toEqual([
      {
        candidateId: 'org/repo/other',
        eligible: true,
        rejection: { stage: 'decision', reason: 'Unrelated subproject.' },
      },
      {
        candidateId: 'org/repo/unselected',
        eligible: true,
        rejection: {
          stage: 'decision',
          reason: 'Not selected by decision model',
        },
      },
    ]);
    expect(
      result.items[2].candidateAssessments.find(
        ({ candidateId }) => candidateId === 'org/repo/old',
      ),
    ).toMatchObject({
      eligible: false,
      rejection: { reason: 'Marked deprecated by its description' },
    });
  });

  it.each([
    ['Migrate from deprecated React APIs to modern APIs', true],
    ['Migrate React APIs marked deprecated in React 19', true],
    ['Deprecated API migration guide for React', true],
    ['Marked deprecated APIs in React 19 and how to migrate them', true],
    ['Deprecated Playwright helper', false],
    ['Deprecated: Playwright helper', false],
    ['[DEPRECATED] Playwright helper', false],
    ['This skill has been deprecated. Use the replacement.', false],
    ['This skill is deprecated - use the replacement.', false],
    ['This skill is now deprecated. Use the replacement.', false],
    ['This skill was officially deprecated in 2025.', false],
    ['This skill has been marked deprecated.', false],
    ['This skill is not deprecated and supports React 19.', true],
  ])(
    'classifies a deprecation description in the judge path: %s',
    async (description, eligible) => {
      const { service, execute } = fixture();
      const item = stackItem('React', [candidate('modern', description)]);
      respond(execute, success({ items: [noSkill(item)] }));

      const result = await service.judge(request([item]));

      expect(result.items[0].candidateAssessments[0]).toMatchObject({
        candidateId: 'org/repo/modern',
        eligible,
        ...(!eligible && {
          rejection: { reason: 'Marked deprecated by its description' },
        }),
      });
    },
  );

  function malformedSiblingCase(textOnly: boolean) {
    return async () => {
      const { service, execute } = fixture();
      const good = stackItem('React', [candidate('a'), candidate('b')]);
      const bad = stackItem('Missing outcomes');
      const repeated = stackItem('Duplicate response');
      const none = stackItem('No candidates');
      const draft = stackItem('Build', [candidate('old', 'Deprecated')]);
      const output = {
        items: [
          { itemId: 12, outcomes: [] },
          { itemId: bad.itemId },
          noSkill(repeated),
          noSkill(repeated),
          { itemId: 'unknown', outcomes: [] },
          {
            itemId: good.itemId,
            outcomes: [install('org/repo/a')],
            rejections: [
              null,
              { candidateId: 'org/repo/b', reason: '' },
              { candidateId: 'org/repo/b', reason: ' For another workspace. ' },
              { candidateId: 'unknown', reason: 'Unknown candidate.' },
            ],
          },
          { ...noSkill(none), rejections: 'invalid' },
          {
            itemId: draft.itemId,
            outcomes: [build('Local Guide', 'Workspace patterns.')],
          },
        ],
      };
      const resultText = textOnly
        ? 'Here is the result.\n```json\n' + JSON.stringify(output) + '\n```'
        : '';
      respond(execute, success(textOnly ? undefined : output, resultText));

      const result = await service.judge(
        request([good, bad, repeated, none, draft]),
      );

      expect(execute.mock.calls[0][0].outputFormat?.schema).toEqual({
        type: 'object',
        required: ['items'],
        properties: { items: { type: 'array', items: { type: 'object' } } },
      });
      expect(result.stages[1]).toMatchObject({
        status: 'used',
        itemsJudged: 3,
        invalidItemIds: [bad.itemId, repeated.itemId],
      });
      expect(result.items.map(({ judgedBy }) => judgedBy)).toEqual([
        'normal',
        'none',
        'none',
        'normal',
        'normal',
      ]);
      expect(result.items[0].candidateAssessments[1].rejection).toEqual({
        reason: 'For another workspace.',
        stage: 'normal',
      });
      expect(result.proposals[0].itemIds).toEqual([draft.itemId]);
    };
  }

  it(
    'envelope-only transport schema lets malformed sibling (wrong itemId type, missing outcomes, bad rejection entry) pass structured boundary while valid siblings survive local validation',
    malformedSiblingCase(false),
  );
  it(
    'validates malformed siblings independently on the SDK text-only path',
    malformedSiblingCase(true),
  );

  it.each([
    [install('org/repo/other')],
    [install('org/repo/a'), install('ORG/REPO/A')],
    [install('org/repo/a'), { verdict: 'no-skill', reason: 'Contradiction' }],
    [
      { verdict: 'no-skill', reason: 'No project skill needed.' },
      { verdict: 'no-skill', reason: 'Duplicate no-skill outcome.' },
    ],
    [install('org/repo/a', '  ')],
    [build('???', 'Empty slug')],
  ])('invalidates an item with invalid outcomes %#', async (...outcomes) => {
    const { service, execute } = fixture();
    const item = stackItem('React', [candidate('a')]);
    respond(execute, success({ items: [{ itemId: item.itemId, outcomes }] }));

    const result = await service.judge(request([item]));

    expect(result.stages[1]).toMatchObject({
      status: 'failed',
      category: 'invalid-output',
      invalidItemIds: [item.itemId],
    });
    expect(result.stages[1]).not.toHaveProperty('pairUsed');
    expect(result.items[0].outcomes).toEqual([]);
  });

  it('proposalRef merges only when canonical slug and normalized description both match; differing descriptions under one proposalRef split into build:<ref>#1 and build:<ref>#2', async () => {
    const { service, execute } = fixture();
    const items = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((name) =>
      stackItem(name),
    );
    const outcomes = [
      [build('Shared Guide', 'Project conventions.', ' Shared ')],
      [build('shared-guide', 'PROJECT   CONVENTIONS.', 'SHARED')],
      [build('Shared Guide', 'Different description.', 'shared')],
      [build('Shared Guide', 'Project conventions.')],
      [build('Shared Guide', 'Project conventions.')],
    ];
    respond(
      execute,
      success({
        items: items.map(({ itemId }, index) => ({
          itemId,
          outcomes: outcomes[index],
        })),
      }),
    );

    const result = await service.judge(request(items));

    expect(
      result.proposals.map(({ proposalId, itemIds }) => [proposalId, itemIds]),
    ).toEqual([
      ['build:shared#1', [items[0].itemId, items[1].itemId]],
      ['build:shared#2', [items[2].itemId]],
      ['build:framework:delta#0', [items[3].itemId]],
      ['build:framework:epsilon#0', [items[4].itemId]],
    ]);
    expect(result.items.map(({ outcomes: [outcome] }) => outcome)).toEqual(
      [0, 0, 1, 2, 3].map((index) =>
        expect.objectContaining({
          proposalId: result.proposals[index].proposalId,
        }),
      ),
    );
  });

  it('preserves Decision verdicts and registry failures after an SDK error terminal', async () => {
    const { service, execute, rankSkillCandidates, logger } = fixture();
    const keep = stackItem('React', [candidate('react')]);
    const pending: SkillJudgeInputItem = {
      ...stackItem('Vue'),
      registry: 'search-failed',
      registryFailure: {
        kind: 'timed-out',
        reason: 'Registry search timed out.',
      },
    };
    rankSkillCandidates.mockResolvedValue({
      status: 'used',
      pairConfigured: DECISION_PAIR,
      pairAttempted: DECISION_PAIR,
      pairUsed: DECISION_PAIR,
      items: { [keep.itemId]: decisionInstall('org/repo/react') },
      itemRejections: {},
    });
    respond(execute, {
      type: 'result',
      subtype: 'error_during_execution',
      errors: ['raw provider error fixture'],
    } as SDKMessage);

    const result = await service.judge(request([keep, pending]));

    expect(result).toMatchObject({
      method: 'decision',
      counts: { decision: 1, normal: 0, notJudged: 1 },
    });
    expect(result.items[1]).toMatchObject({
      registry: pending.registry,
      registryFailure: pending.registryFailure,
      judgedBy: 'none',
    });
    expect(result.stages[1]).toMatchObject({
      status: 'failed',
      category: 'provider-error',
      pairConfigured: SETUP_PAIR,
    });
    expect(result.stages[1].pairAttempted).toBeDefined();
    expect(result.stages[1]).not.toHaveProperty('pairUsed');
    expect(
      JSON.stringify([result, logger.error.mock.calls, logger.warn.mock.calls]),
    ).not.toContain('raw provider error fixture');
  });

  it('does not attribute success to a stream with no terminal', async () => {
    const { service, execute } = fixture();
    respond(execute);
    const result = await service.judge(request([stackItem('React')]));

    expect(result.stages[1]).toMatchObject({
      status: 'failed',
      category: 'provider-error',
    });
    expect(result.stages[1]).not.toHaveProperty('pairUsed');
  });

  it('uses the typed queue timeout without claiming provider submission', async () => {
    const { service, execute } = fixture();
    execute.mockRejectedValue(new InternalQueryQueueTimeoutError(100));

    const result = await service.judge(request([stackItem('React')]));

    expect(result.stages[1]).toEqual({
      stage: 'normal',
      status: 'failed',
      category: 'queue-timed-out',
      pairConfigured: SETUP_PAIR,
      itemsJudged: 0,
      invalidItemIds: [],
    });
  });

  async function timeoutCase(submit: boolean) {
    jest.useFakeTimers();
    const { service, execute } = fixture();
    const item = stackItem('React');
    let begin!: (config: InternalQueryConfig) => void;
    const started = new Promise<InternalQueryConfig>((resolve) => {
      begin = resolve;
    });
    let finish!: (handle: InternalQueryHandle) => void;
    const wait = new Promise<InternalQueryHandle>((resolve) => {
      finish = resolve;
    });
    execute.mockImplementation(async (config) => {
      if (submit) config.onProviderSubmit?.(SETUP_PAIR);
      begin(config);
      return wait;
    });

    const pending = service.judge(request([item]));
    const config = await started;
    await jest.advanceTimersByTimeAsync(45_000);
    const result = await pending;
    expect(config.abortController?.signal.aborted).toBe(true);
    expect(result.stages[1]).toEqual({
      stage: 'normal',
      status: 'failed',
      category: 'timed-out',
      pairConfigured: SETUP_PAIR,
      itemsJudged: 0,
      invalidItemIds: [],
      ...(submit && { pairAttempted: SETUP_PAIR }),
    });
    const late = stream(success({ items: [noSkill(item)] }));
    finish(late);
    await jest.advanceTimersByTimeAsync(0);
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(result.items[0]).toMatchObject({ outcomes: [], judgedBy: 'none' });
    expect(result.stages[1]).not.toHaveProperty('pairUsed');
  }

  it('pre-dispatch-error vs post-dispatch timed-out attribution on stage record and visible failure banner/badge', async () => {
    const { service, execute } = fixture();
    execute.mockRejectedValue(new Error('SDK preparation failed'));
    const result = await service.judge(request([stackItem('React')]));
    expect(result.stages[1]).toEqual({
      stage: 'normal',
      status: 'failed',
      category: 'pre-dispatch-error',
      pairConfigured: SETUP_PAIR,
      itemsJudged: 0,
      invalidItemIds: [],
    });
    await timeoutCase(true);
  });

  it('uses timed-out when the outer deadline wins before provider submission', () =>
    timeoutCase(false));

  it('runs Normal with slack after the Decision cap and skips when under five seconds remain', async () => {
    const { service, execute } = fixture();
    const item = stackItem('React');
    respond(execute, success({ items: [noSkill(item)] }));
    const input = request([item]);
    const first = await service.judge({
      ...input,
      rpcEntry: Date.now() - 31_000,
    });
    const second = await service.judge({
      ...input,
      rpcEntry: Date.now() - 61_000,
    });

    expect(first.stages[1].status).toBe('used');
    expect(second.stages[1]).toMatchObject({
      status: 'skipped',
      category: 'timed-out',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('reports no work and an unavailable Normal runner while keeping detected items', async () => {
    const service = new SkillJudgeService({} as Logger);
    const empty = await service.judge(request([]));
    expect(empty.stages.map(({ category }) => category)).toEqual([
      'no-work',
      'no-work',
    ]);

    const result = await service.judge(request([stackItem('React')]));
    expect(result).toMatchObject({
      method: 'none',
      counts: { decision: 0, normal: 0, notJudged: 1 },
    });
    expect(result.stages[1]).toMatchObject({
      status: 'skipped',
      category: 'unavailable',
      pairConfigured: SETUP_PAIR,
    });
  });

  it('orders per-item candidateIds, candidateAssessments, and global judge.candidates by installs descending', async () => {
    const { service, execute } = fixture();
    const low: SkillShEntry = { ...candidate('low'), installs: 5 };
    const high: SkillShEntry = { ...candidate('high'), installs: 5000 };
    const midB: SkillShEntry = {
      ...candidate('mid-b'),
      source: 'Org/B',
      installs: 200,
    };
    const midA: SkillShEntry = {
      ...candidate('mid-a'),
      source: 'Org/A',
      installs: 200,
    };
    const secondTop: SkillShEntry = {
      ...candidate('vue-top'),
      installs: 1200,
    };
    const reactItem = stackItem('React', [low, midB, high, midA]);
    const vueItem = stackItem('Vue', [low, secondTop]);
    respond(
      execute,
      success({ items: [noSkill(reactItem), noSkill(vueItem)] }),
    );

    const result = await service.judge(request([reactItem, vueItem]));

    expect(result.items[0].candidateIds).toEqual([
      'org/repo/high',
      'org/a/mid-a',
      'org/b/mid-b',
      'org/repo/low',
    ]);
    expect(
      result.items[0].candidateAssessments.map(
        ({ candidateId }) => candidateId,
      ),
    ).toEqual(['org/repo/high', 'org/a/mid-a', 'org/b/mid-b', 'org/repo/low']);
    expect(result.items[1].candidateIds).toEqual([
      'org/repo/vue-top',
      'org/repo/low',
    ]);
    expect(result.candidates.map(({ candidateId }) => candidateId)).toEqual([
      'org/repo/high',
      'org/repo/vue-top',
      'org/a/mid-a',
      'org/b/mid-b',
      'org/repo/low',
    ]);
  });

  it('accepts a System One status: used Decision response and attributes outcomes to stage: decision', async () => {
    const { service, execute, rankSkillCandidates } = fixture();
    const reactCandidate: SkillShEntry = {
      ...candidate('react-best-practices'),
      installs: 15000,
    };
    const item = stackItem('React', [reactCandidate]);
    const systemOnePair = {
      provider: 'ollama',
      model: 'qwen3:1.7b',
    };
    rankSkillCandidates.mockResolvedValue({
      status: 'used',
      pairConfigured: systemOnePair,
      pairAttempted: systemOnePair,
      pairUsed: systemOnePair,
      items: {
        [item.itemId]: decisionInstall(
          'org/repo/react-best-practices',
          'Evidence confirms React in package.json; top-installed matching skill.',
        ),
      },
      itemRejections: {},
    });

    const result = await service.judge(request([item]));

    expect(execute).not.toHaveBeenCalled();
    expect(result.method).toBe('decision');
    expect(result.counts).toEqual({ decision: 1, normal: 0, notJudged: 0 });
    expect(result.items[0].judgedBy).toBe('decision');
    expect(result.items[0].outcomes).toEqual([
      {
        verdict: 'install',
        candidateId: 'org/repo/react-best-practices',
        reason:
          'Evidence confirms React in package.json; top-installed matching skill.',
        stage: 'decision',
      },
    ]);
    expect(result.stages[0]).toEqual({
      stage: 'decision',
      status: 'used',
      pairConfigured: systemOnePair,
      pairAttempted: systemOnePair,
      pairUsed: systemOnePair,
      itemsJudged: 1,
      invalidItemIds: [],
    });
    expect(result.stages[1]).toMatchObject({
      stage: 'normal',
      status: 'skipped',
      category: 'no-work',
    });
  });
});
