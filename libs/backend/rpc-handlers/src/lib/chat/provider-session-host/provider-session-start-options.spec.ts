import 'reflect-metadata';
import type {
  AgentSessionStartConfig,
  EffectiveCapabilitySet,
  ICapabilityResolver,
} from '@ptah-extension/shared';
import {
  createProviderSessionStartOptions,
  PROVIDER_SESSION_PTAH_IDENTITY,
  type ProviderSessionStartOptionsDeps,
} from './provider-session-start-options';

jest.mock('@ptah-extension/agent-sdk', () => ({
  ProviderSessionChatAdapterError: jest.requireActual<
    typeof import('../../../../../agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error')
  >('../../../../../agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error')
    .ProviderSessionChatAdapterError,
  PTAH_UI_HINT_CODEX: 'PTAH-UI-HINT',
  // The contract of the real helper: no resolver fails closed (unverified, ptah kept).
  resolveSessionCapabilityPolicy: async (
    resolver: ICapabilityResolver | undefined,
    cwd: string,
  ) => (resolver ? resolver.resolve(cwd) : mockPolicy({ status: 'unverified' })),
}));

const workspace = '/workspace';

function mockPolicy(overrides: Partial<EffectiveCapabilitySet> = {}): EffectiveCapabilitySet {
  return {
    physicalRoot: '/real/workspace',
    policyKey: '/real/workspace',
    status: 'verified',
    reasons: [],
    ptahEnabled: true,
    deniedMcpServers: [],
    approvedProjectMcpServers: [],
    deniedSkillNames: [],
    disabledPluginIds: [],
    harnessFingerprint: 'fp-1',
    ...overrides,
  };
}

function harness(extra: Partial<ProviderSessionStartOptionsDeps> = {}) {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const memory = {
    buildSessionStartBlock: jest.fn(async () => '## Session start roster'),
    buildBlock: jest.fn(async () => '## Recalled Memory Context'),
  };
  const resolve = jest.fn(async () => mockPolicy());
  const capabilityResolver = { resolve } as unknown as ICapabilityResolver;
  const apply = jest.fn(async () => ({ acknowledged: true }));
  const deps: ProviderSessionStartOptionsDeps = {
    logger,
    memory,
    capabilityResolver,
    harnessPolicySync: { apply },
    ...extra,
  };
  return { options: createProviderSessionStartOptions(deps), logger, memory, resolve, apply };
}

const start = (overrides: Partial<AgentSessionStartConfig> = {}): AgentSessionStartConfig => ({
  tabId: 'tab-1',
  projectPath: workspace,
  ...overrides,
});

describe('provider-session start options', () => {
  describe('instructions (item 1) and memory (item 2)', () => {
    it('assembles memory, identity, Ptah MCP and UI hints, user prompt, style and enhanced prompt in order', async () => {
      const h = harness();
      const open = await h.options.resolve(
        start({
          prompt: 'fix the login bug',
          mcpServerRunning: true,
          ptahUiFence: true,
          systemPrompt: 'User system prompt.',
          outputStyleBody: 'Style body.',
          enhancedPromptsContent: 'Enhanced guidance.',
        }),
        { workspacePath: workspace },
      );
      expect(open.instructions).toBe(
        [
          '## Session start roster',
          '## Recalled Memory Context',
          PROVIDER_SESSION_PTAH_IDENTITY,
          'PTAH-UI-HINT',
          'User system prompt.',
          'Style body.',
          'Enhanced guidance.',
        ].join('\n\n'),
      );
      expect(h.memory.buildSessionStartBlock).toHaveBeenCalledWith(workspace);
      expect(h.memory.buildBlock).toHaveBeenCalledWith('fix the login bug', workspace);
    });

    it('keeps Claude-only core prompt content out of the provider-neutral identity', () => {
      for (const claudeOnly of ['AskUserQuestion', 'Task subagent', 'ToolSearch', 'VS Code'])
        expect(PROVIDER_SESSION_PTAH_IDENTITY).not.toContain(claudeOnly);
    });

    it('omits the UI hint for the apps profile and never adds the MCP hint itself', async () => {
      const h = harness();
      const open = await h.options.resolve(
        start({ ptahUiFence: true, mcpToolProfile: 'apps' }),
        { workspacePath: workspace },
      );
      expect(open.instructions).not.toContain('PTAH-UI-HINT');
      // The hint is added per open, only when the attachment is there.
      expect(open.instructions).not.toContain("Ptah's MCP server");
      expect(open.mcpToolProfile).toBe('apps');
    });

    it('skips the recall block without a first prompt; an empty session-start block (toggle off) adds nothing', async () => {
      const h = harness();
      h.memory.buildSessionStartBlock.mockResolvedValueOnce('');
      const open = await h.options.resolve(start(), { workspacePath: workspace });
      expect(h.memory.buildBlock).not.toHaveBeenCalled();
      expect(open.instructions).toBe(PROVIDER_SESSION_PTAH_IDENTITY);
    });

    it('builds the instructions for a restored session too (the runtime decides delivery)', async () => {
      const h = harness();
      const open = await h.options.resolve(
        start({ prompt: 'continue', systemPrompt: 'x' }),
        { workspacePath: workspace },
      );
      expect(open.instructions).toContain(PROVIDER_SESSION_PTAH_IDENTITY);
      expect(open.instructions).toContain('x');
      expect(h.memory.buildSessionStartBlock).toHaveBeenCalledWith(workspace);
    });

    it('works without a memory injector', async () => {
      const h = harness({ memory: undefined });
      const open = await h.options.resolve(start({ prompt: 'hello there' }), {
        workspacePath: workspace,
      });
      expect(open.instructions).toBe(PROVIDER_SESSION_PTAH_IDENTITY);
    });
  });

  describe('MCP (item 3)', () => {
    const overrides = {
      docs: {
        type: 'http' as const,
        url: 'https://docs.example/mcp?key=1',
        headers: { 'X-Key': 'secret', Empty: '' },
      },
      off: { type: 'http' as const, url: 'https://off.example/mcp' },
      ptah: { type: 'http' as const, url: 'https://evil.example/mcp' },
    };

    it('attaches Ptah MCP only when the session says the server runs', async () => {
      const h = harness();
      const ctx = { workspacePath: workspace };
      expect((await h.options.resolve(start({ mcpServerRunning: true }), ctx)).ptahMcp).toBe(true);
      expect((await h.options.resolve(start({ mcpServerRunning: false }), ctx)).ptahMcp).toBe(false);
      expect((await h.options.resolve(start(), ctx)).ptahMcp).toBe(false);
    });

    it('maps user servers, drops policy-denied ones and never takes ptah from the user', async () => {
      const h = harness();
      h.resolve.mockResolvedValueOnce(mockPolicy({ deniedMcpServers: ['off'] }));
      const open = await h.options.resolve(
        start({ mcpServerRunning: true, mcpServersOverride: overrides }),
        { workspacePath: workspace },
      );
      expect(open.userMcp).toEqual([
        {
          type: 'http',
          name: 'docs',
          url: 'https://docs.example/mcp?key=1',
          headers: [{ name: 'X-Key', value: 'secret' }],
        },
      ]);
      // Names only: neither a header value nor a URL reaches a log line.
      const logged = JSON.stringify(h.logger.info.mock.calls);
      expect(logged).not.toContain('secret');
      expect(logged).not.toContain('key=1');
    });

    it('turns Ptah MCP off when the policy does', async () => {
      const h = harness();
      h.resolve.mockResolvedValueOnce(mockPolicy({ ptahEnabled: false }));
      const open = await h.options.resolve(start({ mcpServerRunning: true }), {
        workspacePath: workspace,
      });
      expect(open.ptahMcp).toBe(false);
    });

    it('fails closed without a capability resolver: Ptah MCP only, no user servers', async () => {
      const h = harness({ capabilityResolver: undefined });
      const open = await h.options.resolve(
        start({ mcpServerRunning: true, mcpServersOverride: overrides }),
        { workspacePath: workspace },
      );
      expect(open.ptahMcp).toBe(true);
      expect(open.userMcp).toEqual([]);
    });

    it('skips a user server whose URL is not http(s) with a warning; the start goes on', async () => {
      const h = harness();
      const open = await h.options.resolve(
        start({
          mcpServersOverride: {
            bad: { type: 'http', url: 'file:///etc/passwd' },
            docs: { type: 'http', url: 'https://docs.example/mcp' },
          },
        }),
        { workspacePath: workspace },
      );
      expect(open.userMcp.map((server) => server.name)).toEqual(['docs']);
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('skipped'),
        { code: 'provider-session-user-mcp-unsupported', serverNames: ['bad'] },
      );
      // Names only: the URL never reaches a log line.
      expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain('passwd');
    });
  });

  describe('capability policy preflight (item 4)', () => {
    it('syncs the harness to a verified policy before the open', async () => {
      const h = harness();
      await h.options.resolve(start(), { workspacePath: workspace });
      expect(h.resolve).toHaveBeenCalledWith(workspace);
      expect(h.apply).toHaveBeenCalledWith('/real/workspace', 'fp-1');
    });

    it('logs an unacknowledged or failed sync and continues', async () => {
      const h = harness();
      h.apply.mockResolvedValueOnce({ acknowledged: false });
      await expect(
        h.options.resolve(start(), { workspacePath: workspace }),
      ).resolves.toBeDefined();
      h.apply.mockRejectedValueOnce(new Error('preflight down'));
      await expect(
        h.options.resolve(start(), { workspacePath: workspace }),
      ).resolves.toBeDefined();
      expect(h.logger.warn).toHaveBeenCalledTimes(2);
    });

    it('skips the sync for an unverified policy, as Claude chat does', async () => {
      const h = harness();
      h.resolve.mockResolvedValueOnce(mockPolicy({ status: 'unverified' }));
      await h.options.resolve(start(), { workspacePath: workspace });
      expect(h.apply).not.toHaveBeenCalled();
    });

    it('opens without a harness sync dependency', async () => {
      const h = harness({ harnessPolicySync: undefined });
      await expect(
        h.options.resolve(start(), { workspacePath: workspace }),
      ).resolves.toBeDefined();
    });
  });

  describe('option classifier (item 5)', () => {
    it('refuses an unreviewed option by name', () => {
      const h = harness();
      expect(() => h.options.check({ ...start(), corpusName: 'docs' })).toThrow(
        expect.objectContaining({ code: 'unsupported-option', option: 'corpusName' }),
      );
    });

    it('strips ambient Claude-only options with one log line of key names', () => {
      const h = harness();
      h.options.check(
        start({
          thinking: { type: 'adaptive' },
          includePartialMessages: true,
          workflowsDisabled: false,
          outputStyleName: 'concise',
        }),
      );
      expect(h.logger.info).toHaveBeenCalledWith(
        'Provider-session chat does not apply these options.',
        {
          code: 'provider-session-options-not-applied',
          keys: ['thinking', 'includePartialMessages', 'workflowsDisabled', 'outputStyleName'],
        },
      );
    });

    it('accepts the options the chat host sends a provider session', () => {
      const h = harness();
      expect(() =>
        h.options.check(
          start({
            workspaceId: workspace,
            model: 'gemini',
            name: 'n',
            prompt: 'p',
            files: ['a.ts'],
            images: [],
            mcpServerRunning: true,
            enhancedPromptsContent: 'e',
            effort: 'high',
            mcpServersOverride: {},
            permissionLevel: 'auto-edit',
            outputStyleBody: 'b',
            mcpToolProfile: 'apps',
            ptahUiFence: true,
            runtime: 'provider-session',
            pluginConfigAncestorRoots: undefined,
          }),
        ),
      ).not.toThrow();
      expect(h.logger.info).not.toHaveBeenCalled();
    });
  });
});
