/**
 * PtahCliRegistry.spawnAgent — permission routing identity (TASK_2026_295).
 *
 * `resolvePermissionOptions` received `resumeSessionId ?? parentSessionId ??
 * \`ptah-cli:${id}\`` and then did `sessionId ? SessionId.from(sessionId) :
 * undefined`. Both branches were wrong, in opposite directions:
 *
 *   - `parentSessionId: ''` survives `??` (it is a string), is falsy at the
 *     ternary, and collapses to `undefined`. `isRoutablePermissionRequest` is
 *     then false, so every tool prompt for that agent auto-DENIES on the
 *     unroutable timeout instead of waiting for the user.
 *   - with no resume and no parent, the literal `ptah-cli:${id}` reaches
 *     `SessionId.from`, which is `z.string().uuid()`-strict and THROWS — taking
 *     the whole spawn down. That is the shape `agent:resumePtahCli` sends when
 *     the session file is missing.
 *
 * These tests drive the REAL spawnAgent() at permission level 'ask' (the
 * output-style spec runs at 'yolo', which returns before `createCallback` and
 * therefore could never see either failure).
 *
 * Source-under-test:
 *   libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts
 */

import 'reflect-metadata';

import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type { IAuthSecretsService } from '@ptah-extension/vscode-core';
import type {
  SdkModuleLoader,
  SdkMessageTransformer,
  SdkPermissionHandler,
} from '@ptah-extension/agent-sdk';
import type { ProviderModelsService } from '@ptah-extension/auth-providers';
import type { PtahCliConfig } from '@ptah-extension/shared';
import { PtahCliRegistry } from './ptah-cli-registry';
import { createFakeSdkProcessSpawner } from './testing/fake-sdk-process-spawner';
import * as mailboxModule from './helpers/ptah-cli-prompt-mailbox';
import { laneTurnInputContractViolations } from '../cli-agents/testing/lane-turn-input-contract';

jest.mock('@ptah-extension/agent-sdk', () => {
  const actual = jest.requireActual('@ptah-extension/agent-sdk');
  return {
    ...actual,
    getAnthropicProvider: jest.fn(() => ({
      id: 'z-ai',
      name: 'Z.AI (GLM)',
      baseUrl: 'https://api.z.ai/api/anthropic',
      authEnvVar: 'ANTHROPIC_AUTH_TOKEN',
      keyPrefix: '',
      helpUrl: '',
      description: '',
      keyPlaceholder: '',
      maskedKeyDisplay: '',
      defaultTiers: { sonnet: 'kimi-tier-sonnet' },
    })),
    getProviderAuthEnvVar: jest.fn(() => 'ANTHROPIC_AUTH_TOKEN'),
    buildSafeEnv: jest.fn((env: unknown) => env),
  };
});

async function* emptyStream(): AsyncGenerator<never, void, unknown> {
  // No messages — streamLoop.run resolves with exit code 0.
}

const BASE_CONFIG: PtahCliConfig = {
  id: 'pc-perm-001',
  name: 'Permission Test Agent',
  providerId: 'z-ai',
  enabled: true,
  tierMappings: undefined,
  updatedAt: 0,
};

const PARENT_SESSION = '11111111-2222-4333-8444-555555555555';

function buildHarness(): {
  registry: PtahCliRegistry;
  createCallback: jest.Mock;
  queryFn: jest.Mock;
  logger: ReturnType<typeof createMockLogger>;
} {
  const logger = createMockLogger();
  const createCallback = jest.fn().mockReturnValue(jest.fn());

  const queryFn = jest.fn(() => emptyStream());
  const moduleLoader = {
    getQueryFunction: jest.fn().mockResolvedValue(queryFn),
    getCliJsPath: jest.fn().mockResolvedValue(undefined),
  } as unknown as SdkModuleLoader;

  const registry = new PtahCliRegistry(
    logger as unknown as Logger,
    {
      getProviderKey: jest.fn().mockResolvedValue('sk-test-key'),
    } as unknown as IAuthSecretsService,
    moduleLoader,
    {
      createIsolated: jest.fn().mockReturnValue({
        transform: jest.fn().mockReturnValue([]),
      }),
    } as unknown as SdkMessageTransformer,
    {
      // 'ask' — the mode that actually builds a canUseTool callback.
      getPermissionLevel: jest.fn().mockReturnValue('ask'),
      createCallback,
    } as unknown as SdkPermissionHandler,
    null as never, // subagentHookHandler
    null as never, // compactionHookHandler
    null as never, // compactionConfigProvider
    {
      resolveEffectiveTiers: jest.fn(specTierPreferences),
      getCachedModelIds: jest.fn(() => null),
      getModelTiers: jest
        .fn()
        .mockReturnValue({ sonnet: null, opus: null, haiku: null }),
    } as unknown as ProviderModelsService,
    {
      loadConfigs: jest.fn().mockReturnValue([BASE_CONFIG]),
    } as unknown as never,
    {
      assembleSpawnOptions: jest.fn().mockResolvedValue({
        builtinPolicy: { disallowedTools: [], deniedSkillNames: [] },
        mcpServers: {},
        hooks: undefined,
        autoCompact: {},
        systemPromptMode: 'append',
        systemPromptContent: undefined,
        outputStyleName: undefined,
      }),
    } as unknown as never,
    null as never, // modelResolver
    { get: jest.fn(() => undefined) } as unknown as never, // configManager
    createFakeSdkProcessSpawner(), // processSpawner
  );

  return { registry, createCallback, queryFn, logger };
}

/**
 * Stand-in for `ProviderModelsService.resolveEffectiveTiers` with no live
 * catalogue on hand: the caller's tier, else the provider's preference (read
 * from the provider lookup this spec mocks).
 */
function specTierPreferences(
  providerId: string,
  user: Partial<Record<'sonnet' | 'opus' | 'haiku', string | null | undefined>>,
): Partial<Record<'sonnet' | 'opus' | 'haiku', string>> {
  const { getAnthropicProvider } = jest.requireMock<
    typeof import('@ptah-extension/agent-sdk')
  >('@ptah-extension/agent-sdk');
  const preferred = getAnthropicProvider(providerId)?.defaultTiers;
  const pick = (tier: 'sonnet' | 'opus' | 'haiku'): string | undefined =>
    user[tier] || preferred?.[tier];
  return { sonnet: pick('sonnet'), opus: pick('opus'), haiku: pick('haiku') };
}

describe('PtahCliRegistry.spawnAgent — permission routing identity', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes an assigned lane id before the SDK query starts', async () => {
    const { registry, createCallback } = buildHarness();
    // An ask lane builds canUseTool. The lane level now drives the callback,
    // so the default (manifest yolo) lane would build none.
    await registry.spawnAgent(BASE_CONFIG.id, 'do work', {
      agentId: 'lane-assigned',
      permission: 'ask',
    });
    const resolver = createCallback.mock.calls[0][1] as () => string | undefined;
    expect(resolver()).toBe('lane-assigned');
  });

  it('caps a Ptah CLI child to plan through the static resolver path', async () => {
    const { registry, queryFn } = buildHarness();
    await registry.spawnAgent(BASE_CONFIG.id, 'do work', {
      permission: 'yolo', parentLevel: 'plan',
    });
    expect(queryFn).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ permissionMode: 'plan' }),
    }));
  });

  it('adds the Plan instruction when Plan comes from a saved lane default', async () => {
    const { registry, queryFn } = buildHarness();
    Reflect.set(registry, 'laneWorkspace', {
      getConfiguration: jest.fn(() => ({ 'ptah-cli': { permission: 'plan' } })),
    });
    const mailboxSpy = jest.spyOn(mailboxModule, 'createPromptMailbox');
    await registry.spawnAgent(BASE_CONFIG.id, 'do work');
    expect(queryFn).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ permissionMode: 'plan' }),
    }));
    expect(mailboxSpy).toHaveBeenCalledWith(
      expect.stringContaining('BLOCKED: plan mode'),
    );
    mailboxSpy.mockRestore();
  });

  it('does not add the Plan instruction to a non-plan lane', async () => {
    const { registry } = buildHarness();
    const mailboxSpy = jest.spyOn(mailboxModule, 'createPromptMailbox');
    await registry.spawnAgent(BASE_CONFIG.id, 'do work', { permission: 'auto-edit' });
    expect(mailboxSpy).toHaveBeenCalledWith('do work');
    mailboxSpy.mockRestore();
  });

  it('uses the built-in plan mode when no lane choice is saved (D24)', async () => {
    // D24: a lane with no spawn argument and no saved row runs in plan,
    // the most restrictive mode. It never falls back to manifest yolo.
    const { registry, queryFn } = buildHarness();
    await registry.spawnAgent(BASE_CONFIG.id, 'do work');
    expect(queryFn).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        permissionMode: 'plan',
        allowDangerouslySkipPermissions: false,
      }),
    }));
    expect(queryFn).not.toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ permissionMode: 'bypassPermissions' }),
    }));
  });

  it('does not throw when the spawn has neither a resume nor a parent session', async () => {
    const { registry } = buildHarness();

    // Previously: SessionId.from('ptah-cli:pc-perm-001') -> TypeError, and the
    // whole spawn rejected. This is exactly what agent:resumePtahCli sends
    // when the session file is gone.
    const result = await registry.spawnAgent(BASE_CONFIG.id, 'do work', { permission: 'ask' });

    expect(result).toHaveProperty('handle');
  });

  it('passes no routable session id, but keeps the raw id as a routing hint', async () => {
    const { registry, createCallback } = buildHarness();

    await registry.spawnAgent(BASE_CONFIG.id, 'do work', { permission: 'ask' });

    const [sessionId, , , , routingHint] = createCallback.mock.calls[0];
    expect(sessionId).toBeUndefined();
    expect(routingHint).toBe(`ptah-cli:${BASE_CONFIG.id}`);
  });

  it('says out loud that prompts have no routable surface', async () => {
    const { registry, logger } = buildHarness();

    await registry.spawnAgent(BASE_CONFIG.id, 'do work', { permission: 'ask' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no routable session id'),
      expect.objectContaining({ routingHint: `ptah-cli:${BASE_CONFIG.id}` }),
    );
  });

  it('treats an empty parentSessionId as absent rather than as a silent auto-deny', async () => {
    const { registry, createCallback, logger } = buildHarness();

    await registry.spawnAgent(BASE_CONFIG.id, 'do work', {
      permission: 'ask',
      parentSessionId: '',
    });

    const [sessionId, , , , routingHint] = createCallback.mock.calls[0];
    expect(sessionId).toBeUndefined();
    // The '' never becomes the routing hint either — it falls through to the
    // agent-scoped fallback, and the drop is logged.
    expect(routingHint).toBe(`ptah-cli:${BASE_CONFIG.id}`);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no routable session id'),
      expect.anything(),
    );
  });

  it('routes to the parent session when it is a real UUID', async () => {
    const { registry, createCallback, logger } = buildHarness();

    await registry.spawnAgent(BASE_CONFIG.id, 'do work', {
      permission: 'ask',
      parentSessionId: PARENT_SESSION,
    });

    const [sessionId, , , , routingHint] = createCallback.mock.calls[0];
    expect(sessionId).toBe(PARENT_SESSION);
    expect(routingHint).toBe(PARENT_SESSION);
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('no routable session id'),
      expect.anything(),
    );
  });

  it('prefers the resumed session over the parent', async () => {
    const { registry, createCallback } = buildHarness();
    const resumed = '99999999-8888-4777-8666-555555555555';

    await registry.spawnAgent(BASE_CONFIG.id, 'do work', {
      permission: 'ask',
      resumeSessionId: resumed,
      parentSessionId: PARENT_SESSION,
    });

    expect(createCallback.mock.calls[0][0]).toBe(resumed);
  });
});

describe('PtahCliRegistry.spawnAgent — lane tool gate (TASK_2026_2297 P4)', () => {
  const paused = () => ({
    actor: 'ptah-budget' as const,
    action: 'asked-handoff' as const,
    reason: 'context-budget' as const,
    nextStep: 'write-notes-and-return' as const,
  });
  type QueryArg = {
    options: {
      permissionMode?: string;
      canUseTool?: unknown;
      hooks?: Record<string, { hooks: ((...args: unknown[]) => Promise<unknown>)[] }[]>;
    };
  };
  const preToolUse = async (queryFn: jest.Mock, toolName: string) => {
    const [arg] = queryFn.mock.calls[0] as unknown as [QueryArg];
    const results: unknown[] = [];
    for (const matcher of arg.options.hooks?.['PreToolUse'] ?? []) {
      for (const hook of matcher.hooks) {
        results.push(
          await hook(
            { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: {},
              tool_use_id: 't', session_id: 's', transcript_path: '/t', cwd: '/w' },
            't',
            { signal: new AbortController().signal },
          ),
        );
      }
    }
    return { arg, results };
  };
  const deniedByPtah = expect.objectContaining({
    hookSpecificOutput: expect.objectContaining({
      permissionDecision: 'deny',
      permissionDecisionReason: expect.stringMatching(/^Ptah budget monitor paused new work tools/),
    }),
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports honorsLaneToolGate and gates the SDK options when a gate is supplied', async () => {
    const { registry, queryFn } = buildHarness();
    const result = await registry.spawnAgent(BASE_CONFIG.id, 'do work', {
      permission: 'ask',
      laneToolGate: paused,
    });
    expect('handle' in result && result.handle.honorsLaneToolGate).toBe(true);
    const { results } = await preToolUse(queryFn, 'Bash');
    expect(results).toEqual([deniedByPtah]);
  });

  it('leaves the flag unset and adds no hook for a non-Claude provider without a gate', async () => {
    // BASE_CONFIG routes to the z-ai Anthropic-compatible provider.
    const { registry, queryFn } = buildHarness();
    const result = await registry.spawnAgent(BASE_CONFIG.id, 'do work', { permission: 'ask' });
    expect('handle' in result && result.handle.honorsLaneToolGate).toBeUndefined();
    const { arg } = await preToolUse(queryFn, 'Bash');
    expect(arg.options.hooks?.['PreToolUse']).toBeUndefined();
  });

  it('keeps a yolo lane gated by the PreToolUse hook', async () => {
    const { registry, queryFn } = buildHarness();
    const result = await registry.spawnAgent(BASE_CONFIG.id, 'do work', {
      permission: 'yolo',
      laneToolGate: paused,
    });
    expect('handle' in result && result.handle.honorsLaneToolGate).toBe(true);
    const { arg, results } = await preToolUse(queryFn, 'Write');
    expect(arg.options.permissionMode).toBe('bypassPermissions');
    expect(arg.options.canUseTool).toBeUndefined();
    expect(results).toEqual([deniedByPtah]);
  });
});

describe('PtahCliRegistry.spawnAgent — lane turn input (B5)', () => {
  it('pushes a continued turn into the mailbox as a turn object with path text', async () => {
    const { registry } = buildHarness();
    const original = mailboxModule.createPromptMailbox;
    const pushes: Parameters<mailboxModule.PromptMailbox['push']>[] = [];
    const spy = jest
      .spyOn(mailboxModule, 'createPromptMailbox')
      .mockImplementation((task: string) => {
        const mailbox = original(task);
        const push = mailbox.push.bind(mailbox);
        return { ...mailbox, prompt: mailbox.prompt, push: (...args) => { pushes.push(args); push(...args); } };
      });
    const result = await registry.spawnAgent(BASE_CONFIG.id, 'do work', { permission: 'ask' });
    if (!('handle' in result)) throw new Error('expected a handle');
    await result.handle.continue?.('next', { files: ['src/a.ts'] });
    expect(pushes[0]?.[0]).toEqual({
      content: 'next\n\nAttached files:\n- src/a.ts',
    });
    spy.mockRestore();
    result.handle.abort.abort();
  });

  it('keeps every claimed turn input item backed by a handle operation (Req 4.3)', async () => {
    const { registry } = buildHarness();
    const result = await registry.spawnAgent(BASE_CONFIG.id, 'do work', { permission: 'ask' });
    if (!('handle' in result)) throw new Error('expected a handle');
    expect(laneTurnInputContractViolations(result.handle, registry.capabilities(BASE_CONFIG.providerId))).toEqual([]);
    expect(typeof result.handle.interrupt).toBe('function');
    result.handle.abort.abort();
  });

  it.each([
    ['ask', 'supported'],
    ['auto-edit', 'supported'],
    ['yolo', 'unsupported'],
  ] as const)('declares approval prompts for a %s spawn as %s', async (permission, state) => {
    const { registry } = buildHarness();
    const result = await registry.spawnAgent(BASE_CONFIG.id, 'do work', { permission });
    if (!('potentialCapabilities' in result)) throw new Error('expected capabilities');
    expect(result.potentialCapabilities.prompts?.approvals.state).toBe(state);
    expect(result.potentialCapabilities.prompts?.questions.state).toBe('supported');
    if ('handle' in result) result.handle.abort.abort();
  });
});
