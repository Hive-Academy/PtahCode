/**
 * TASK_2026_560, C5 — the capability policy on a Claude SDK session.
 *
 * A verified policy is enforced on the FLAG tier (`Options.settings`), which
 * outranks user, project and local settings:
 * - `deniedMcpServers` + `disabledMcpjsonServers` for every OFF server, so a
 *   repository server stays off even under the user's `enableAllProjectMcpServers`;
 * - `enabledMcpjsonServers` for explicitly approved repository servers only;
 * - `skillOverrides: {name: 'off'}` for every denied skill, including a global
 *   OFF and every child of an OFF plugin.
 *
 * An unverified policy (unreadable store, missing or failing resolver) runs
 * strict MCP with ptah only, `skills: []`, and publishes the
 * `capability-policy-unverified` notice (R8).
 *
 * These specs drive the real `build()` with a mocked policy — the resolver
 * itself lives in `cli-agent-runtime` and is never imported here.
 */

import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AISessionConfig,
  AuthEnv,
  EffectiveCapabilitySet,
  McpHttpServerOverride,
} from '@ptah-extension/shared';
import {
  SdkQueryOptionsBuilder,
  buildFlagSettings,
  capabilityFlagsFor,
  resolveSessionCapabilityPolicy,
  unverifiedCapabilityPolicy,
} from './sdk-query-options-builder';
import type {
  SessionMcpStatusCallbackRegistry,
  SessionMcpStatusEvent,
} from './session-mcp-status-callback-registry';
import type { Options } from '../types/sdk-types/claude-sdk.types';
import { PTAH_DISABLE_SDK_AUTO_MEMORY } from '../constants';
import {
  CLAUDE_BUILTIN_SETTING_KEYS,
  CLAUDE_BUILTIN_TERMINAL_SKILL_IDS,
  CLAUDE_BUILTIN_TOOL_IDS,
} from './claude-builtin-catalog';
import type {
  IMcpGateway,
  IWorkspaceProvider,
  McpCallerBinding,
} from '@ptah-extension/platform-core';
import type {
  CanUseTool,
  HookInput,
  HookJSONOutput,
} from '../types/sdk-types/claude-sdk.types';

/**
 * Every Claude built-in opted in (TASK_2026_853), so these specs see only the
 * capability-policy keys. The built-in defaults have their own specs in
 * `sdk-query-options-builder.spec.ts`.
 */
const ALL_BUILTINS_ENABLED: Pick<IWorkspaceProvider, 'getConfiguration'> = {
  getConfiguration: <T>(
    _section: string,
    key: string,
    defaultValue?: T,
  ): T | undefined => {
    if (key === CLAUDE_BUILTIN_SETTING_KEYS.tools) {
      return [...CLAUDE_BUILTIN_TOOL_IDS] as T;
    }
    if (key === CLAUDE_BUILTIN_SETTING_KEYS.skills) {
      return [...CLAUDE_BUILTIN_TERMINAL_SKILL_IDS] as T;
    }
    return defaultValue;
  },
};

const PROJECT = 'D:/tmp/ws';
const PROXY_AUTH: AuthEnv = {
  ANTHROPIC_BASE_URL: 'http://127.0.0.1:8080',
  ANTHROPIC_AUTH_TOKEN: 'proxy-token',
};

function policy(
  overrides: Partial<EffectiveCapabilitySet> = {},
): EffectiveCapabilitySet {
  return {
    physicalRoot: PROJECT,
    policyKey: PROJECT,
    status: 'verified',
    reasons: [],
    ptahEnabled: true,
    deniedMcpServers: [],
    approvedProjectMcpServers: [],
    deniedSkillNames: [],
    disabledPluginIds: [],
    harnessFingerprint: 'fp',
    ...overrides,
  };
}

interface BuildInput {
  capabilityPolicy?: EffectiveCapabilitySet;
  backingOff?: string[];
  authEnv?: AuthEnv;
  mcpServersOverride?: Record<string, McpHttpServerOverride>;
  /** `IMcpGateway` stand-in (TASK_2026_979); absent means no gateway bound. */
  gateway?: Pick<IMcpGateway, 'isGatewayTool' | 'servedFileServerNames'>;
  /** The permission callback `createCallback` returns. */
  ask?: jest.Mock;
}

interface Built {
  options: Options;
  /** Every binding the session minted a credential for. */
  issue: jest.Mock;
  logger: { warn: jest.Mock };
  /** `options.settings`, parsed — it is serialized on the interactive path. */
  settings: Record<string, unknown>;
  events: SessionMcpStatusEvent[];
}

async function build(input: BuildInput = {}): Promise<Built> {
  const noopHooks = { createHooks: jest.fn().mockReturnValue({}) };
  const events: SessionMcpStatusEvent[] = [];
  const mcpStatus = {
    notifyAll: (event: SessionMcpStatusEvent) => {
      events.push(event);
    },
  } as unknown as SessionMcpStatusCallbackRegistry;
  const mcpBackoff = {
    getBackingOffServers: jest.fn().mockReturnValue(input.backingOff ?? []),
    trackStderrSession: jest.fn(),
    checkStderrForFailure: jest.fn(),
  };

  const ctor = SdkQueryOptionsBuilder as unknown as new (
    ...args: unknown[]
  ) => SdkQueryOptionsBuilder;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const issue = jest.fn().mockReturnValue('test-token');
  const builder = new ctor(
    logger,
    {
      createCallback: jest
        .fn()
        .mockReturnValue(input.ask ?? (() => ({ behavior: 'allow' }))),
    },
    noopHooks,
    {
      getConfig: jest
        .fn()
        .mockReturnValue({ enabled: true, contextTokenThreshold: null }),
    },
    noopHooks,
    noopHooks,
    {},
    {
      resolveModelId: jest.fn().mockImplementation((m: string) => m),
      hasCachedModels: jest.fn().mockReturnValue(false),
      getSupportedModels: jest.fn(),
    },
    {
      buildBlock: jest.fn().mockResolvedValue(''),
      buildSessionStartBlock: jest.fn().mockResolvedValue(''),
      buildCorpusBlock: jest.fn().mockResolvedValue(''),
    },
    noopHooks,
    noopHooks,
    noopHooks,
    noopHooks,
    noopHooks,
    noopHooks,
    noopHooks,
    noopHooks,
    noopHooks,
    noopHooks,
    undefined,
    mcpStatus,
    mcpBackoff,
    ALL_BUILTINS_ENABLED,
    undefined,
    {
      issue,
      revokeSubject: jest.fn(),
    },
    input.gateway,
  );

  const cfg = await builder.build({
    userMessageStream: (async function* () {
      // Intentionally empty — build() attaches the stream, it does not iterate.
    })(),
    abortController: new AbortController(),
    sessionConfig: {
      model: 'claude-sonnet-4-5',
      projectPath: PROJECT,
      tabId: 'tab-fixture',
    } as AISessionConfig,
    authEnvOverride: input.authEnv ?? {},
    mcpServersOverride: input.mcpServersOverride,
    capabilityPolicy: input.capabilityPolicy,
  });

  return {
    options: cfg.options,
    issue,
    logger,
    settings: JSON.parse(cfg.options.settings as string) as Record<
      string,
      unknown
    >,
    events,
  };
}

/** Only the capability keys of the flag tier, for parity comparisons. */
function capabilityKeys(built: Built): Record<string, unknown> {
  const {
    deniedMcpServers,
    disabledMcpjsonServers,
    enabledMcpjsonServers,
    skillOverrides,
  } = built.settings;
  return {
    deniedMcpServers,
    disabledMcpjsonServers,
    enabledMcpjsonServers,
    skillOverrides,
    strictMcpConfig: built.options.strictMcpConfig,
    skills: built.options.skills,
    mcpServers: Object.keys(built.options.mcpServers ?? {}),
  };
}

// The synced-skill reader (TASK_2026_853 Phase B) and the same-name skill
// guard read the Claude config dir; point it at an empty temp dir so the
// developer's own `~/.claude` (account-synced skills) never leaks in.
let isolatedConfigRoot: string;
let previousClaudeConfigDir: string | undefined;
beforeEach(() => {
  isolatedConfigRoot = mkdtempSync(join(tmpdir(), 'ptah-no-claude-config-'));
  previousClaudeConfigDir = process.env['CLAUDE_CONFIG_DIR'];
  process.env['CLAUDE_CONFIG_DIR'] = isolatedConfigRoot;
});
afterEach(() => {
  if (previousClaudeConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR'];
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousClaudeConfigDir;
  }
  rmSync(isolatedConfigRoot, { recursive: true, force: true });
});

describe('SdkQueryOptionsBuilder — capability policy (TASK_2026_560, C5)', () => {
  describe('verified policy → flag tier', () => {
    it('denies a repository server that is OFF, whatever the user enableAll says', async () => {
      // The user's `enableAllProjectMcpServers: true` lives in a lower tier
      // (user/local settings); the flag tier outranks it, so the denial here is
      // what keeps `repo-off` from loading. Ptah itself never emits enableAll.
      const built = await build({
        capabilityPolicy: policy({ deniedMcpServers: ['repo-off'] }),
      });

      expect(built.settings['deniedMcpServers']).toEqual([
        { serverName: 'repo-off' },
      ]);
      expect(built.settings['disabledMcpjsonServers']).toEqual(['repo-off']);
      expect(built.settings).not.toHaveProperty('enableAllProjectMcpServers');
      expect(built.options.strictMcpConfig).toBeUndefined();
      expect(built.options.skills).toBeUndefined();
    });

    it('approves an explicitly-ON repository server, and only that one', async () => {
      const built = await build({
        capabilityPolicy: policy({
          approvedProjectMcpServers: ['firecrawl'],
          deniedMcpServers: ['davinci-resolve'],
        }),
      });

      expect(built.settings['enabledMcpjsonServers']).toEqual(['firecrawl']);
    });

    it('emits no capability key and no notice when nothing is off', async () => {
      const built = await build({ capabilityPolicy: policy() });

      // `subagentPromptCacheTtl` is the N1 `auto` default (TASK_2026_597),
      // not a capability key.
      expect(built.settings).toEqual({
        autoMemoryEnabled: false,
        autoDreamEnabled: false,
        crossSessionInbound: 'accept',
        subagentPromptCacheTtl: '1h',
      });
      expect(built.events).toEqual([]);
    });

    it('gives a direct and a proxied (custom base URL) session the same lists', async () => {
      const shared = policy({
        deniedMcpServers: ['davinci-resolve', 'shopify-dev-mcp'],
        approvedProjectMcpServers: ['firecrawl'],
        deniedSkillNames: ['off-skill', 'plug:child'],
      });
      const direct = await build({ capabilityPolicy: shared });
      const proxied = await build({
        capabilityPolicy: shared,
        authEnv: PROXY_AUTH,
      });

      // Really two different routes: the proxy drops the `user` source …
      expect(direct.options.settingSources).toContain('user');
      expect(proxied.options.settingSources).not.toContain('user');
      // … and the flag tier, which it never drops, carries identical lists.
      expect(capabilityKeys(proxied)).toEqual(capabilityKeys(direct));
      expect(capabilityKeys(direct)).toMatchObject({
        disabledMcpjsonServers: ['davinci-resolve', 'shopify-dev-mcp'],
        enabledMcpjsonServers: ['firecrawl'],
      });
    });

    it('keeps ptah by default', async () => {
      const built = await build({ capabilityPolicy: policy() });

      expect(Object.keys(built.options.mcpServers ?? {})).toEqual(['ptah']);
    });

    it('drops ptah — and denies it — only when the policy turned it OFF', async () => {
      const built = await build({
        capabilityPolicy: policy({ ptahEnabled: false }),
      });

      expect(built.options.mcpServers).toEqual({});
      expect(built.settings['deniedMcpServers']).toEqual([
        { serverName: 'ptah' },
      ]);
    });

    it('lets back-off win over an explicit approval (AC-4.7)', async () => {
      const built = await build({
        capabilityPolicy: policy({ approvedProjectMcpServers: ['flaky'] }),
        backingOff: ['flaky'],
      });

      expect(built.settings['disabledMcpjsonServers']).toEqual(['flaky']);
      expect(built.settings).not.toHaveProperty('enabledMcpjsonServers');
    });

    it('still suppresses a backing-off server the policy leaves ON', async () => {
      const built = await build({
        capabilityPolicy: policy(),
        backingOff: ['flaky'],
      });

      expect(built.settings['deniedMcpServers']).toEqual([
        { serverName: 'flaky' },
      ]);
    });

    it('denies every child skill of an OFF plugin, bare and plugin-qualified', async () => {
      const built = await build({
        capabilityPolicy: policy({
          disabledPluginIds: ['plug'],
          deniedSkillNames: [
            'child-a',
            'plug:child-a',
            'child-b',
            'plug:child-b',
          ],
        }),
      });

      expect(built.settings['skillOverrides']).toEqual({
        'child-a': 'off',
        'plug:child-a': 'off',
        'child-b': 'off',
        'plug:child-b': 'off',
      });
    });

    it('denies a global-OFF skill that arrives in deniedSkillNames (P9)', async () => {
      // The resolver folds the GLOBAL layer into `deniedSkillNames`; the
      // builder reads skills from the set only, never from the loader's
      // workspace-only sync methods.
      const built = await build({
        capabilityPolicy: policy({ deniedSkillNames: ['global-off-skill'] }),
      });

      expect(built.settings['skillOverrides']).toEqual({
        'global-off-skill': 'off',
      });
      expect(built.options.skills).toBeUndefined();
    });

    it('removes a denied server a caller override supplied', async () => {
      const built = await build({
        capabilityPolicy: policy({ deniedMcpServers: ['firecrawl'] }),
        mcpServersOverride: {
          firecrawl: { type: 'http', url: 'http://127.0.0.1:9/firecrawl' },
          allowed: { type: 'http', url: 'http://127.0.0.1:9/allowed' },
        } as Record<string, McpHttpServerOverride>,
      });

      expect(Object.keys(built.options.mcpServers ?? {}).sort()).toEqual([
        'allowed',
        'ptah',
      ]);
    });
  });

  describe('unverified policy → strict MCP, no skills, notice', () => {
    const unverified = policy({
      status: 'unverified',
      reasons: [
        {
          path: '/home/u/.ptah/capabilities/global/mcp__l_x.json',
          error: 'invalid JSON',
        },
      ],
      // Whatever an unreadable store half-computed must be ignored.
      deniedMcpServers: ['x'],
      approvedProjectMcpServers: ['y'],
      deniedSkillNames: ['z'],
    });

    it('runs strict MCP with ptah only and skills: []', async () => {
      const built = await build({
        capabilityPolicy: unverified,
        mcpServersOverride: {
          other: { type: 'http', url: 'http://127.0.0.1:9/other' },
        } as Record<string, McpHttpServerOverride>,
      });

      expect(built.options.strictMcpConfig).toBe(true);
      expect(built.options.skills).toEqual([]);
      expect(Object.keys(built.options.mcpServers ?? {})).toEqual(['ptah']);
      expect(built.settings).not.toHaveProperty('enabledMcpjsonServers');
      expect(built.settings).not.toHaveProperty('skillOverrides');
    });

    it('omits ptah only when a readable store says it is OFF', async () => {
      const built = await build({
        capabilityPolicy: { ...unverified, ptahEnabled: false },
      });

      expect(built.options.strictMcpConfig).toBe(true);
      expect(built.options.mcpServers).toEqual({});
    });

    it('also denies ptah on the flag tier when a readable store says it is OFF', async () => {
      // Same defence in depth as the verified-OFF path: a user-scope `ptah`
      // entry cannot come back through any lower settings tier.
      const built = await build({
        capabilityPolicy: { ...unverified, ptahEnabled: false },
        backingOff: ['flaky'],
      });

      expect(built.settings['deniedMcpServers']).toEqual([
        { serverName: 'ptah' },
        { serverName: 'flaky' },
      ]);
      expect(built.settings['disabledMcpjsonServers']).toEqual([
        'ptah',
        'flaky',
      ]);
    });

    it('does not deny ptah on the flag tier while it is ON', async () => {
      const built = await build({ capabilityPolicy: unverified });

      expect(built.settings).not.toHaveProperty('deniedMcpServers');
    });

    it('publishes the capability-policy-unverified notice naming the path', async () => {
      const built = await build({ capabilityPolicy: unverified });

      expect(built.events).toHaveLength(1);
      expect(built.events[0]).toMatchObject({
        kind: 'notice',
        sessionId: 'tab-fixture',
        notice: { code: 'capability-policy-unverified' },
      });
      const event = built.events[0];
      const message = event.kind === 'notice' ? event.notice.message : '';
      expect(message).toContain(
        'Only Ptah tools are loaded and skills are off',
      );
      expect(message).toContain(
        '/home/u/.ptah/capabilities/global/mcp__l_x.json (invalid JSON)',
      );
    });

    it('fails closed for the fallback policy of a missing resolver', async () => {
      const built = await build({
        capabilityPolicy: unverifiedCapabilityPolicy(
          PROJECT,
          'the capability resolver is not available',
        ),
      });

      expect(built.options.strictMcpConfig).toBe(true);
      expect(built.options.skills).toEqual([]);
      expect(Object.keys(built.options.mcpServers ?? {})).toEqual(['ptah']);
      expect(built.events).toHaveLength(1);
    });

    it('fails closed when a caller supplies no policy at all', async () => {
      const built = await build({});

      expect(built.options.strictMcpConfig).toBe(true);
      expect(built.options.skills).toEqual([]);
      expect(Object.keys(built.options.mcpServers ?? {})).toEqual(['ptah']);
    });

    it('keeps suppressing back-off servers', async () => {
      const built = await build({
        capabilityPolicy: unverified,
        backingOff: ['flaky'],
      });

      expect(built.settings['disabledMcpjsonServers']).toEqual(['flaky']);
    });
  });
});

describe('SdkQueryOptionsBuilder: MCP gateway (TASK_2026_979)', () => {
  const CRON_TOOL = 'mcp__ptah__ptah_cron_create';
  const GATEWAY_TOOL = 'mcp__ptah__github__create_issue';

  function gateway(
    served: string[] | Error = [],
  ): jest.Mocked<Pick<IMcpGateway, 'isGatewayTool' | 'servedFileServerNames'>> {
    return {
      // Fail-closed worst case: no host tool name registered yet, so every
      // `ptah` tool, cron writes included, reads as a gateway tool.
      isGatewayTool: jest.fn().mockReturnValue(true),
      servedFileServerNames: jest.fn((_root: string) =>
        served instanceof Error
          ? Promise.reject(served)
          : Promise.resolve(served),
      ),
    };
  }

  /** The CLI order: every matching `PreToolUse` hook, then `canUseTool`. */
  async function callTool(options: Options, toolName: string): Promise<void> {
    const toolUseId = `tu-${toolName}`;
    const hookInput = {
      hook_event_name: 'PreToolUse',
      tool_name: toolName,
      tool_input: {},
      tool_use_id: toolUseId,
      session_id: 's',
      transcript_path: '',
      cwd: PROJECT,
    } as unknown as HookInput;
    const outputs: HookJSONOutput[] = [];
    for (const matcher of options.hooks?.PreToolUse ?? []) {
      // Only the `ptah` approval gates; the other hooks have their own specs.
      if (!matcher.matcher?.startsWith('mcp__ptah__')) continue;
      if (!new RegExp(`^${matcher.matcher}$`).test(toolName)) continue;
      for (const hook of matcher.hooks) {
        outputs.push(
          await hook(hookInput, toolUseId, {
            signal: new AbortController().signal,
          }),
        );
      }
    }
    expect(
      outputs.some(
        (output) =>
          (output as { hookSpecificOutput?: { permissionDecision?: string } })
            .hookSpecificOutput?.permissionDecision === 'deny',
      ),
    ).toBe(false);
    const canUseTool = options.canUseTool as CanUseTool;
    await canUseTool(toolName, {}, {
      signal: new AbortController().signal,
      toolUseID: toolUseId,
      requestId: 'r',
    } as Parameters<CanUseTool>[2]);
  }

  it('keeps ptah with no overrides and marks the session binding gatewayApproval', async () => {
    const built = await build({
      capabilityPolicy: policy(),
      gateway: gateway(),
    });

    expect(Object.keys(built.options.mcpServers ?? {})).toEqual(['ptah']);
    const binding = built.issue.mock.calls[0][0] as McpCallerBinding;
    expect(binding).toMatchObject({
      kind: 'session',
      capability: 'privileged',
      cronWriteApproval: true,
      gatewayApproval: true,
    });
  });

  it('asks once for a cron tool that runs through both gates (N2c)', async () => {
    const ask = jest.fn().mockResolvedValue({ behavior: 'allow' });
    const built = await build({
      capabilityPolicy: policy(),
      gateway: gateway(),
      ask,
    });

    await callTool(built.options, CRON_TOOL);

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toBe(CRON_TOOL);
  });

  it('asks once for a gateway tool through the hook and canUseTool', async () => {
    const ask = jest.fn().mockResolvedValue({ behavior: 'allow' });
    const built = await build({
      capabilityPolicy: policy(),
      gateway: gateway(),
      ask,
    });

    await callTool(built.options, GATEWAY_TOOL);

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toBe(GATEWAY_TOOL);
  });

  it('puts the gateway matcher next to the cron matcher', async () => {
    const built = await build({
      capabilityPolicy: policy(),
      gateway: gateway(),
    });

    const matchers = (built.options.hooks?.PreToolUse ?? []).map(
      (m) => m.matcher,
    );
    const at = matchers.indexOf('mcp__ptah__.*');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(matchers[at + 1]).toBe('mcp__ptah__ptah_cron_.*');
  });

  it('adds no gateway matcher and claims no gatewayApproval on a host with no gateway', async () => {
    const built = await build({ capabilityPolicy: policy() });

    expect(built.issue.mock.calls[0][0]).not.toHaveProperty('gatewayApproval');

    const matchers = (built.options.hooks?.PreToolUse ?? []).map(
      (m) => m.matcher,
    );
    expect(matchers).not.toContain('mcp__ptah__.*');
    expect(matchers).toContain('mcp__ptah__ptah_cron_.*');
  });

  it('suppresses the file servers the gateway serves on the flag tier', async () => {
    const gw = gateway(['github', 'ptah', 'linear']);
    const built = await build({ capabilityPolicy: policy(), gateway: gw });

    expect(gw.servedFileServerNames).toHaveBeenCalledWith(PROJECT);
    expect(built.settings['disabledMcpjsonServers']).toEqual([
      'github',
      'linear',
    ]);
    expect(Object.keys(built.options.mcpServers ?? {})).toEqual(['ptah']);
  });

  it('does not ask the gateway when the policy turned ptah OFF', async () => {
    const gw = gateway(['github']);
    await build({
      capabilityPolicy: policy({ ptahEnabled: false }),
      gateway: gw,
    });

    expect(gw.servedFileServerNames).not.toHaveBeenCalled();
  });

  it('gives an empty list and a warning when the gateway throws', async () => {
    const built = await build({
      capabilityPolicy: policy(),
      gateway: gateway(new Error('disk gone')),
    });

    expect(built.settings).not.toHaveProperty('disabledMcpjsonServers');
    expect(built.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('gateway serves'),
      expect.objectContaining({ error: 'disk gone' }),
    );
  });
});

describe('capability helpers', () => {
  it('buildFlagSettings returns the shared constant when the flags are empty', () => {
    expect(
      buildFlagSettings(undefined, undefined, capabilityFlagsFor(policy(), [])),
    ).toBe(PTAH_DISABLE_SDK_AUTO_MEMORY);
  });

  it('capabilityFlagsFor never lists ptah as denied while it is ON', () => {
    const flags = capabilityFlagsFor(
      policy({ deniedMcpServers: ['ptah', 'a', 'a'] }),
      ['a'],
    );
    expect(flags.deniedMcpServers).toEqual(['a']);
  });

  it('resolveSessionCapabilityPolicy fails closed with no resolver', async () => {
    const warn = jest.fn();
    const set = await resolveSessionCapabilityPolicy(null, PROJECT, { warn });
    expect(set).toMatchObject({ status: 'unverified', ptahEnabled: true });
    expect(warn).toHaveBeenCalled();
  });

  it('forwards only supplied plugin ancestor context to the resolver', async () => {
    const resolve = jest.fn().mockResolvedValue(policy());
    const resolver = { resolve } as never;
    const logger = { warn: jest.fn() };
    const roots = ['/repo/parent', '/repo/grandparent'] as const;

    await resolveSessionCapabilityPolicy(resolver, PROJECT, logger);
    await resolveSessionCapabilityPolicy(resolver, PROJECT, logger, []);
    await resolveSessionCapabilityPolicy(resolver, PROJECT, logger, roots);

    expect(resolve.mock.calls).toEqual([
      [PROJECT],
      [PROJECT, { pluginConfigAncestorRoots: [] }],
      [PROJECT, { pluginConfigAncestorRoots: roots }],
    ]);
    expect(resolve.mock.calls[2][1].pluginConfigAncestorRoots).toBe(roots);
  });

  it('resolveSessionCapabilityPolicy fails closed when the resolver throws', async () => {
    const warn = jest.fn();
    const set = await resolveSessionCapabilityPolicy(
      { resolve: jest.fn().mockRejectedValue(new Error('EACCES')) } as never,
      PROJECT,
      { warn },
    );
    expect(set.status).toBe('unverified');
    // The UI-facing reason is a fixed phrase; the detail stays in the log.
    expect(set.reasons[0].error).toBe('the capability resolver failed');
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ error: 'EACCES' }),
    );
  });
});
