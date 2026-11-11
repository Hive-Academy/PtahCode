import { TestBed } from '@angular/core/testing';
import {
  ClaudeRpcService,
  LoggingService,
  MESSAGE_HANDLERS,
  RpcResult,
  type MessageHandler,
} from '@ptah-extension/core';
import { HarnessHealthStore } from '@ptah-extension/marketplace/services';
import {
  MESSAGE_TYPES,
  type HarnessApplyResponse,
  type HarnessConfig,
  type HarnessGetProposalResult,
  type HarnessProposal,
} from '@ptah-extension/shared';
import {
  HarnessChatProposalStore,
  IDLE_HARNESS_APPLY_STATE,
  buildFullHarnessConfig,
  provideHarnessChatProposalStore,
  summarizeHarnessProposal,
} from './harness-chat-proposal.store';

function rpcOk<T>(data: T): RpcResult<T> {
  return new RpcResult<T>(true, data);
}

function rpcFail<T>(error: string): RpcResult<T> {
  return new RpcResult<T>(false, undefined, error);
}

describe('HarnessChatProposalStore', () => {
  let store: HarnessChatProposalStore;
  let rpcCallMock: jest.Mock;
  let healthRefreshMock: jest.Mock;
  let loggerWarnMock: jest.Mock;
  let loggerErrorMock: jest.Mock;

  beforeEach(() => {
    rpcCallMock = jest.fn();
    healthRefreshMock = jest.fn().mockResolvedValue(undefined);
    loggerWarnMock = jest.fn();
    loggerErrorMock = jest.fn();

    TestBed.configureTestingModule({
      providers: [
        provideHarnessChatProposalStore(),
        { provide: ClaudeRpcService, useValue: { call: rpcCallMock } },
        {
          provide: HarnessHealthStore,
          useValue: { refresh: healthRefreshMock },
        },
        {
          provide: LoggingService,
          useValue: { warn: loggerWarnMock, error: loggerErrorMock },
        },
      ],
    });

    store = TestBed.inject(HarnessChatProposalStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts with no proposal and idle apply state for any session', () => {
    expect(store.proposalFor(null)).toBeNull();
    expect(store.proposalFor(undefined)).toBeNull();
    expect(store.proposalFor('   ')).toBeNull();
    expect(store.proposalFor('session-1')).toBeNull();
    expect(store.applyStateFor('session-1')).toEqual(IDLE_HARNESS_APPLY_STATE);
  });

  it('registers itself in MESSAGE_HANDLERS for harness:config-proposed', () => {
    const handlers = TestBed.inject<readonly MessageHandler[]>(MESSAGE_HANDLERS);
    expect(handlers).toContain(store);
    expect(store.handledMessageTypes).toEqual([
      MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
    ]);
  });

  it('stores harness:config-proposed pushes scoped by sessionId and folds incremental updates', async () => {
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-a',
        configUpdates: {
          name: 'Backend Platform Team',
          agents: {
            enabledAgents: {
              'claude-code': { enabled: true, modelTier: 'opus' },
              codex: { enabled: false },
            },
          },
        },
        isConfigComplete: false,
      },
    });

    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-a',
        configUpdates: {
          skills: {
            selectedSkills: ['nx-workspace-architect', 'tdd'],
          },
          claudeMd: {
            generateProjectClaudeMd: true,
          },
        },
        isConfigComplete: true,
      },
    });

    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-b',
        configUpdates: {
          name: 'Frontend UI Team',
        },
        isConfigComplete: true,
      },
    });

    const recordA = store.proposalFor('session-a');
    expect(recordA).not.toBeNull();
    expect(recordA?.isConfigComplete).toBe(true);
    expect(recordA?.configUpdates.name).toBe('Backend Platform Team');
    expect(
      recordA?.configUpdates.agents?.enabledAgents['claude-code']?.enabled,
    ).toBe(true);
    expect(recordA?.configUpdates.skills?.selectedSkills).toEqual([
      'nx-workspace-architect',
      'tdd',
    ]);
    expect(recordA?.configUpdates.claudeMd?.generateProjectClaudeMd).toBe(true);

    const recordB = store.proposalFor('session-b');
    expect(recordB?.configUpdates.name).toBe('Frontend UI Team');
    expect(recordB?.configUpdates.skills).toBeUndefined();
  });

  it('rejects malformed harness:config-proposed payloads via Zod without corrupting state', async () => {
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-bad',
        configUpdates: {
          prompt: {
            unknownField: 'should-fail-strict-schema',
          },
        },
      },
    });

    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: 'not-an-object',
    });

    expect(store.proposalFor('session-bad')).toBeNull();
    expect(loggerWarnMock).toHaveBeenCalledTimes(2);
  });

  it('hydrates a persisted proposal via harness:get-proposal and ignores empty results', async () => {
    const persisted: HarnessProposal = {
      version: 1,
      workspaceRoot: '/workspaces/acme',
      sessionId: 'session-hydrated',
      configUpdates: {
        name: 'Acme Harness',
        skills: {
          selectedSkills: ['angular-frontend-patterns'],
          createdSkills: [],
        },
      },
      isConfigComplete: true,
      updatedAt: '2026-11-10T10:00:00.000Z',
    };

    rpcCallMock
      .mockResolvedValueOnce(
        rpcOk<HarnessGetProposalResult>({ proposal: persisted }),
      )
      .mockResolvedValueOnce(
        rpcOk<HarnessGetProposalResult>({ proposal: null }),
      );

    await store.hydrateForSession('session-hydrated', '/workspaces/acme');
    await store.hydrateForSession('session-empty', '/workspaces/acme');

    expect(rpcCallMock).toHaveBeenNthCalledWith(
      1,
      'harness:get-proposal',
      { sessionId: 'session-hydrated', workspaceRoot: '/workspaces/acme' },
      expect.objectContaining({ timeout: 15_000 }),
    );
    expect(store.proposalFor('session-hydrated')?.configUpdates.name).toBe(
      'Acme Harness',
    );
    expect(store.proposalFor('session-hydrated')?.workspaceRoot).toBe(
      '/workspaces/acme',
    );
    expect(store.proposalFor('session-empty')).toBeNull();
  });

  it('preserves live pushes that arrive while harness:get-proposal is in flight', async () => {
    let resolveHydration:
      | ((value: RpcResult<HarnessGetProposalResult>) => void)
      | undefined;
    rpcCallMock.mockImplementationOnce(
      () =>
        new Promise<RpcResult<HarnessGetProposalResult>>((resolve) => {
          resolveHydration = resolve;
        }),
    );

    const hydrationPromise = store.hydrateForSession(
      'session-race',
      '/workspaces/race',
    );

    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-race',
        configUpdates: {
          name: 'Newer Live Push',
          skills: { selectedSkills: ['live-skill'] },
        },
        isConfigComplete: true,
      },
    });

    resolveHydration?.(
      rpcOk<HarnessGetProposalResult>({
        proposal: {
          version: 1,
          workspaceRoot: '/workspaces/race',
          sessionId: 'session-race',
          configUpdates: {
            name: 'Older Disk Snapshot',
            claudeMd: {
              generateProjectClaudeMd: true,
              customSections: {},
              previewContent: '# CLAUDE',
            },
          },
          isConfigComplete: false,
          updatedAt: '2026-11-10T09:00:00.000Z',
        },
      }),
    );
    await hydrationPromise;

    const merged = store.proposalFor('session-race');
    expect(merged?.configUpdates.name).toBe('Newer Live Push');
    expect(merged?.configUpdates.skills?.selectedSkills).toEqual([
      'live-skill',
    ]);
    expect(merged?.configUpdates.claudeMd?.generateProjectClaudeMd).toBe(true);
    expect(merged?.isConfigComplete).toBe(true);
  });

  it('keeps completeness from the newer live revision when hydration returns an older proposal', async () => {
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-older',
        configUpdates: { name: 'Live Complete' },
        isConfigComplete: true,
      },
    });
    rpcCallMock.mockResolvedValueOnce(
      rpcOk<HarnessGetProposalResult>({
        proposal: {
          version: 1,
          workspaceRoot: '/workspaces/older',
          sessionId: 'session-older',
          configUpdates: { name: 'Old Draft' },
          isConfigComplete: false,
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      }),
    );

    await store.hydrateForSession('session-older', '/workspaces/older');

    const record = store.proposalFor('session-older');
    expect(record?.configUpdates.name).toBe('Live Complete');
    expect(record?.isConfigComplete).toBe(true);
  });

  it('replaces supplied prompt and CLAUDE.md section maps instead of merging their keys', async () => {
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-sections',
        configUpdates: {
          prompt: { enhancedSections: { keep: 'a', drop: 'b' } },
          claudeMd: { customSections: { keep: 'a', drop: 'b' } },
        },
        isConfigComplete: false,
      },
    });
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-sections',
        configUpdates: {
          prompt: { enhancedSections: { keep: 'a2' } },
          claudeMd: { customSections: { keep: 'a2' } },
        },
        isConfigComplete: false,
      },
    });
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-sections',
        configUpdates: { prompt: { systemPrompt: 'Be brief.' } },
        isConfigComplete: false,
      },
    });

    const updates = store.proposalFor('session-sections')?.configUpdates;
    expect(updates?.prompt?.enhancedSections).toEqual({ keep: 'a2' });
    expect(updates?.prompt?.systemPrompt).toBe('Be brief.');
    expect(updates?.claudeMd?.customSections).toEqual({ keep: 'a2' });
  });

  it('applies a proposal via harness:apply, records appliedCount/warnings, and refreshes HarnessHealthStore', async () => {
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-apply',
        configUpdates: {
          name: 'Production Team',
          skills: { selectedSkills: ['nestjs-backend-patterns'] },
          claudeMd: { generateProjectClaudeMd: true },
        },
        isConfigComplete: true,
      },
    });

    let resolveApply:
      | ((value: RpcResult<HarnessApplyResponse>) => void)
      | undefined;
    rpcCallMock.mockImplementationOnce(
      () =>
        new Promise<RpcResult<HarnessApplyResponse>>((resolve) => {
          resolveApply = resolve;
        }),
    );

    const applyPromise = store.applyProposal(
      'session-apply',
      '/workspaces/prod',
    );
    expect(store.applyStateFor('session-apply')).toEqual({
      status: 'applying',
    });

    resolveApply?.(
      rpcOk<HarnessApplyResponse>({
        appliedPaths: [
          '/workspaces/prod/CLAUDE.md',
          '/workspaces/prod/.claude/presets/production-team.json',
        ],
        warnings: ['Skipped existing .mcp.json entry'],
      }),
    );

    const applied = await applyPromise;
    expect(applied).toBe(true);
    expect(rpcCallMock).toHaveBeenCalledWith(
      'harness:apply',
      expect.objectContaining({
        outputFormat: 'claude-md',
        workspaceRoot: '/workspaces/prod',
        config: expect.objectContaining({
          name: 'Production Team',
        }),
      }),
      { timeout: 60_000 },
    );

    expect(store.applyStateFor('session-apply')).toEqual(
      expect.objectContaining({
        status: 'applied',
        appliedCount: 2,
        warnings: ['Skipped existing .mcp.json entry'],
      }),
    );
    expect(healthRefreshMock).toHaveBeenCalledWith({ refresh: true });

    // A subsequent config revision resets the applied state so the updated proposal can be applied cleanly.
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-apply',
        configUpdates: {
          skills: {
            selectedSkills: ['nestjs-backend-patterns', 'webhook-architecture'],
          },
        },
        isConfigComplete: true,
      },
    });
    expect(store.applyStateFor('session-apply')).toEqual(
      IDLE_HARNESS_APPLY_STATE,
    );
  });

  it('goes idle instead of applied when a newer proposal arrives while harness:apply is in flight', async () => {
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-race',
        configUpdates: {
          name: 'Team',
          skills: { selectedSkills: ['nestjs-backend-patterns'] },
        },
        isConfigComplete: true,
      },
    });

    let resolveApply:
      | ((value: RpcResult<HarnessApplyResponse>) => void)
      | undefined;
    rpcCallMock.mockImplementationOnce(
      () =>
        new Promise<RpcResult<HarnessApplyResponse>>((resolve) => {
          resolveApply = resolve;
        }),
    );
    const applyPromise = store.applyProposal('session-race', '/workspaces/p');

    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-race',
        configUpdates: {
          skills: {
            selectedSkills: ['nestjs-backend-patterns', 'webhook-architecture'],
          },
        },
        isConfigComplete: true,
      },
    });

    resolveApply?.(
      rpcOk<HarnessApplyResponse>({
        appliedPaths: ['/workspaces/p/CLAUDE.md'],
        warnings: [],
      }),
    );
    await applyPromise;

    expect(store.applyStateFor('session-race')).toEqual(
      IDLE_HARNESS_APPLY_STATE,
    );
  });

  it('records a readable error and logs a real Error when harness:apply fails or rejects', async () => {
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-err',
        configUpdates: { name: 'Broken Config' },
        isConfigComplete: true,
      },
    });

    rpcCallMock.mockResolvedValueOnce(
      rpcFail<HarnessApplyResponse>('Workspace directory is read-only.'),
    );

    const okFirst = await store.applyProposal('session-err', '/workspaces/ro');
    expect(okFirst).toBe(false);
    expect(store.applyStateFor('session-err')).toEqual({
      status: 'error',
      errorMessage: 'Workspace directory is read-only.',
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'HarnessChatProposalStore',
      expect.any(String),
      expect.any(Error),
    );

    rpcCallMock.mockRejectedValueOnce(new Error('IPC transport closed'));
    const okSecond = await store.applyProposal('session-err', '/workspaces/ro');
    expect(okSecond).toBe(false);
    expect(store.applyStateFor('session-err')).toEqual({
      status: 'error',
      errorMessage: 'IPC transport closed',
    });
    expect(healthRefreshMock).not.toHaveBeenCalled();
  });

  describe('pure helpers', () => {
    it('summarizes enabled agents, subagents, deduped skills, enabled MCP servers, and CLAUDE.md', () => {
      const partial: Partial<HarnessConfig> = {
        name: 'Full Stack Squad',
        agents: {
          enabledAgents: {
            'claude-code': { enabled: true },
            codex: { enabled: true },
            cursor: { enabled: false },
          },
          harnessSubagents: [
            {
              id: 'reviewer',
              name: 'Reviewer',
              description: 'Reviews diffs',
              role: 'Reviewer',
              tools: ['Read'],
              executionMode: 'on-demand',
              instructions: 'Check strict types',
            },
          ],
        },
        skills: {
          selectedSkills: ['tdd', 'custom-lint'],
          createdSkills: [
            {
              name: 'custom-lint',
              description: 'Lint rules',
              content: '# Lint',
            },
            {
              name: 'release-check',
              description: 'Release check',
              content: '# Release',
            },
          ],
        },
        mcp: {
          servers: [
            { name: 'github', url: 'https://mcp.github.com', enabled: true },
            { name: 'disabled', url: 'https://old.example', enabled: false },
          ],
          enabledTools: {},
        },
        claudeMd: {
          generateProjectClaudeMd: true,
          customSections: {},
          previewContent: '',
        },
      };

      expect(summarizeHarnessProposal(partial)).toEqual({
        name: 'Full Stack Squad',
        enabledAgentCount: 2,
        subagentCount: 1,
        skillCount: 3,
        mcpServerCount: 1,
        hasClaudeMd: true,
        hasSystemPrompt: false,
      });

      const full = buildFullHarnessConfig(partial, 'D:\\projects\\demo-app');
      expect(full.name).toBe('Full Stack Squad');
      expect(full.claudeMd.generateProjectClaudeMd).toBe(true);
    });
  });
});
