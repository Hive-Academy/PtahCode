/**
 * TASK_2026_853 A-3 — Claude built-ins on a Claude lane.
 *
 * The assembly carries the built-in policy; `buildClaudeSdkLaneOptions` turns
 * it into `disallowedTools` on every route, and the skill denials ride the
 * flag tier on the verified path only. The assemblies here are built with the
 * real agent-sdk rules, not hand-written lists.
 */

import 'reflect-metadata';
import { resolveClaudeLanePermissionOptions } from './claude-sdk-lane-options';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  ClaudeAccountNamedRoute,
  ClaudeCertifiedLaunchContext,
} from '@ptah-extension/auth-providers-tokens';
import type { AuthEnv, CliAdapterManifest, EffectiveCapabilitySet } from '@ptah-extension/shared';
import { PTAH_CLI_PERMISSION_CAPABILITIES } from '@ptah-extension/shared';
import {
  assertCertifiedLaunch,
  capabilityFlagsFor,
  capabilityIsolationOptions,
  certifiedEnvDigest,
  resolveClaudeBuiltinPolicy,
  unverifiedCapabilityPolicy,
  withClaudeBuiltinSkillDenials,
  type SdkPermissionHandler,
} from '@ptah-extension/agent-sdk';
import type { PtahSpawnAssembly } from '../ptah-cli/helpers/ptah-cli-spawn-options.service';
import { resolveCliLanePolicy } from '../cli-agents/cli-lane-policy-resolver';
import { translateLaneSpawnPolicy } from '../cli-agents/lane-spawn-policy';
import {
  buildClaudeSdkLaneOptions,
  claudeActualLaunch,
  type ClaudeSdkLaneOptionsInput,
} from './claude-sdk-lane-options';

const CWD = 'D:/workspace';
const DEFAULT_TOOLS = [
  'DesignSync',
  'EnterWorktree',
  'ExitWorktree',
  'PushNotification',
  'ReportFindings',
  'Workflow',
];

function verifiedPolicy(): EffectiveCapabilitySet {
  return {
    physicalRoot: CWD,
    policyKey: CWD,
    status: 'verified',
    reasons: [],
    ptahEnabled: true,
    deniedMcpServers: [],
    approvedProjectMcpServers: [],
    deniedSkillNames: ['orchestration'],
    disabledPluginIds: [],
    harnessFingerprint: 'fp',
  };
}

/** The assembly `PtahCliSpawnOptions` produces for `policy` and the opt-ins. */
function assemblyFor(
  policy: EffectiveCapabilitySet,
  enabledTools: string[] = [],
  enabledSkills: string[] = [],
  syncedSkillIds: string[] = [],
): PtahSpawnAssembly {
  const builtinPolicy = resolveClaudeBuiltinPolicy({
    enabledTools,
    enabledSkills,
    syncedSkillIds,
  });
  return {
    systemPromptMode: 'preset-append',
    systemPromptContent: 'Role: reviewer',
    mcpServers: {},
    hooks: {},
    autoCompact: {},
    outputStyleName: undefined,
    capabilityFlags: withClaudeBuiltinSkillDenials(
      capabilityFlagsFor(policy, []),
      policy,
      builtinPolicy,
    ),
    capabilityIsolation: capabilityIsolationOptions(policy),
    builtinPolicy,
  };
}

function laneInput(
  assembly: PtahSpawnAssembly,
  authEnv: AuthEnv = {},
): ClaudeSdkLaneOptionsInput {
  const callback: ReturnType<SdkPermissionHandler['createCallback']> =
    async () => ({ behavior: 'deny', message: 'fixture' });
  return {
    assembly,
    authEnv,
    abortController: new AbortController(),
    model: 'sonnet',
    cwd: CWD,
    agentName: 'Reviewer',
    agentId: 'abcdef-run',
    routingId: 'ptah-cli:fixture',
    permissionHandler: {
      getPermissionLevel: jest.fn(() => 'ask' as const),
      createCallback: jest.fn(() => callback),
    },
    logger: createMockLogger() as unknown as Logger,
    processSpawner: { spawn: jest.fn() },
    executable: 'D:/cli/cli.js',
  };
}

function skillOverrides(settings: unknown): Record<string, string> | undefined {
  const parsed = JSON.parse(String(settings)) as {
    skillOverrides?: Record<string, string>;
  };
  return parsed.skillOverrides;
}

function certifiedLaunch(): ClaudeCertifiedLaunchContext {
  const dir = 'D:/accounts/selected';
  const env = {
    PATH: 'D:/bin',
    CLAUDE_CONFIG_DIR: dir,
    CLAUDE_SECURESTORAGE_CONFIG_DIR: dir,
  };
  return {
    executable: {
      command: 'D:/cli/claude.exe',
      prefixArgs: [],
      sdkExecutablePath: 'D:/cli/cli.js',
      version: '2.1.310',
      fingerprint: { size: 1, mtimeMs: 1 },
    },
    env,
    envDigest: certifiedEnvDigest(env),
    cwd: CWD,
    settingSources: ['user', 'project', 'local'],
    policy: {
      coverage: 'win32@2.1.310',
      managedFile: 'absent',
      managedDropIn: 'absent',
      registry: 'absent',
      remoteSignals: 'absent',
    },
    accountClass: 'personal',
    identityReference: 'b'.repeat(64),
  };
}

describe('buildClaudeSdkLaneOptions — Claude built-in policy (TASK_2026_853)', () => {
  it('ambient lane: denies the default tools and hides the terminal skills', () => {
    const options = buildClaudeSdkLaneOptions(
      laneInput(assemblyFor(verifiedPolicy())),
    );
    expect(options.disallowedTools).toEqual(DEFAULT_TOOLS);
    const overrides = skillOverrides(options.settings);
    expect(overrides?.['code-review']).toBe('off');
    expect(overrides?.['keybindings-help']).toBe('off');
    expect(overrides?.['orchestration']).toBe('off');
    expect(options.tools).toEqual({ type: 'preset', preset: 'claude_code' });
  });

  it('carries the user opt-ins: an enabled tool and skill pair loads', () => {
    const options = buildClaudeSdkLaneOptions(
      laneInput(
        assemblyFor(verifiedPolicy(), ['ReportFindings'], ['code-review']),
      ),
    );
    expect(options.disallowedTools).not.toContain('ReportFindings');
    expect(skillOverrides(options.settings)?.['code-review']).toBeUndefined();
  });

  it('proxied lane: the same tool and skill denials', () => {
    const options = buildClaudeSdkLaneOptions(
      laneInput(assemblyFor(verifiedPolicy()), {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8080',
        ANTHROPIC_AUTH_TOKEN: 'proxy-token',
      }),
    );
    expect(options.disallowedTools).toEqual(DEFAULT_TOOLS);
    expect(skillOverrides(options.settings)?.['init']).toBe('off');
  });

  it('unverified policy: tools denied, skills isolated, no skill override added', () => {
    const options = buildClaudeSdkLaneOptions(
      laneInput(assemblyFor(unverifiedCapabilityPolicy(CWD, 'fixture'))),
    );
    expect(options.disallowedTools).toEqual(DEFAULT_TOOLS);
    expect(options.skills).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
    expect(skillOverrides(options.settings)).toBeUndefined();
  });

  it('named lane: certified launch passes with the policy and no credential reaches the settings', () => {
    const launch = certifiedLaunch();
    const input = laneInput(assemblyFor(verifiedPolicy()));
    input.accountRoute = {
      kind: 'named',
      provider: 'claude',
      profileId: 'profile',
      canonicalConfigDir: 'D:/accounts/selected',
      routeFingerprint: 'fingerprint',
      routeRevision: 0,
      authEpoch: 0,
      runId: 'run',
    } as ClaudeAccountNamedRoute;
    input.launch = launch;
    const options = buildClaudeSdkLaneOptions(input);
    expect(options.disallowedTools).toEqual(DEFAULT_TOOLS);
    expect(options.env).toEqual(launch.env);
    expect(String(options.settings)).not.toContain('accounts/selected');
    expect(() =>
      assertCertifiedLaunch(launch, claudeActualLaunch(options), 'final'),
    ).not.toThrow();
  });
});

describe('buildClaudeSdkLaneOptions — account-synced skills (TASK_2026_853 Phase B)', () => {
  const SYNCED = ['anthropic-skills:docs', 'anthropic-skills:pdf'];
  const NAMED_ROUTE = {
    kind: 'named',
    provider: 'claude',
    profileId: 'profile',
    canonicalConfigDir: 'D:/accounts/selected',
    routeFingerprint: 'fingerprint',
    routeRevision: 0,
    authEpoch: 0,
    runId: 'run',
  } as ClaudeAccountNamedRoute;

  it('ambient lane: qualified synced keys ride the flag tier next to the Phase A denials', () => {
    const options = buildClaudeSdkLaneOptions(
      laneInput(assemblyFor(verifiedPolicy(), [], [], SYNCED)),
    );
    const overrides = skillOverrides(options.settings);
    for (const id of SYNCED) expect(overrides?.[id]).toBe('off');
    expect(overrides?.['docs']).toBeUndefined();
    expect(overrides?.['pdf']).toBeUndefined();
    expect(overrides?.['code-review']).toBe('off');
    expect(options.disallowedTools).toEqual(DEFAULT_TOOLS);
  });

  it('an opted-in synced skill gets no override', () => {
    const options = buildClaudeSdkLaneOptions(
      laneInput(
        assemblyFor(verifiedPolicy(), [], ['anthropic-skills:pdf'], SYNCED),
      ),
    );
    const overrides = skillOverrides(options.settings);
    expect(overrides?.['anthropic-skills:pdf']).toBeUndefined();
    expect(overrides?.['anthropic-skills:docs']).toBe('off');
  });

  it('proxied lane: the qualified keys are carried (an unloaded key is ignored)', () => {
    const options = buildClaudeSdkLaneOptions(
      laneInput(assemblyFor(verifiedPolicy(), [], [], SYNCED), {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8080',
        ANTHROPIC_AUTH_TOKEN: 'proxy-token',
      }),
    );
    const overrides = skillOverrides(options.settings);
    for (const id of SYNCED) expect(overrides?.[id]).toBe('off');
    expect(options.disallowedTools).toEqual(DEFAULT_TOOLS);
  });

  it('unverified policy: no synced key, skills isolated', () => {
    const options = buildClaudeSdkLaneOptions(
      laneInput(
        assemblyFor(
          unverifiedCapabilityPolicy(CWD, 'fixture'),
          [],
          [],
          SYNCED,
        ),
      ),
    );
    expect(options.skills).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
    expect(skillOverrides(options.settings)).toBeUndefined();
  });

  it('named lane: certified launch still passes with synced denials', () => {
    const launch = certifiedLaunch();
    const input = laneInput(assemblyFor(verifiedPolicy(), [], [], SYNCED));
    input.accountRoute = NAMED_ROUTE;
    input.launch = launch;
    const options = buildClaudeSdkLaneOptions(input);
    for (const id of SYNCED) {
      expect(skillOverrides(options.settings)?.[id]).toBe('off');
    }
    expect(options.env).toEqual(launch.env);
    expect(String(options.settings)).not.toContain('accounts/selected');
    expect(() =>
      assertCertifiedLaunch(launch, claudeActualLaunch(options), 'final'),
    ).not.toThrow();
  });
});

describe('Claude lane permission level binding', () => {
  it.each(['ask', 'yolo', 'plan'] as const)(
    'uses effective auto-edit under global %s', (globalLevel) => {
      const createCallback = jest.fn((..._args: Parameters<SdkPermissionHandler['createCallback']>) =>
        async () => ({ behavior: 'allow' as const }));
      const options = resolveClaudeLanePermissionOptions(
        { getPermissionLevel: () => globalLevel, createCallback },
        laneInput(assemblyFor(verifiedPolicy())).logger,
        'ptah-cli:fixture',
        undefined,
        'auto-edit',
      );
      expect(options.permissionMode).toBe('acceptEdits');
      expect(options.allowDangerouslySkipPermissions).toBeUndefined();
      expect(options.canUseTool).toBeDefined();
      expect(createCallback.mock.calls[0]?.[3]?.()).toBe('auto-edit');
    },
  );

  it('keeps global behavior when no lane policy is supplied', () => {
    const createCallback = jest.fn((..._args: Parameters<SdkPermissionHandler['createCallback']>) =>
      async () => ({ behavior: 'allow' as const }));
    const options = resolveClaudeLanePermissionOptions(
      { getPermissionLevel: () => 'yolo', createCallback },
      laneInput(assemblyFor(verifiedPolicy())).logger,
      'ptah-cli:fixture',
    );
    expect(options.permissionMode).toBe('bypassPermissions');
    expect(options.allowDangerouslySkipPermissions).toBe(true);
    expect(createCallback).not.toHaveBeenCalled();
  });
});

const supported = { state: 'supported' as const };
const laneManifest: CliAdapterManifest = {
  messaging: { steer: supported, interrupt: supported, continuation: supported, resume: supported },
  roleChannel: 'task-prompt',
  ...PTAH_CLI_PERMISSION_CAPABILITIES,
  limitReader: { state: 'no-reliable-source' },
  mcp: { state: 'unsupported', reason: 'fixture' },
};

describe('Claude lane approval routing and policy translation', () => {
  it.each([
    ['resume-session', 'parent-session', 'resume-session'],
    [undefined, 'parent-session', 'parent-session'],
    [undefined, undefined, 'ptah-cli:fixture'],
  ])('binds callback routing id to resume %s and parent %s', (resumeSessionId, parentSessionId, expected) => {
    const input = laneInput(assemblyFor(verifiedPolicy()));
    input.resumeSessionId = resumeSessionId;
    input.parentSessionId = parentSessionId;
    const options = buildClaudeSdkLaneOptions(input);
    expect(input.permissionHandler.createCallback).toHaveBeenCalledWith(
      undefined, undefined, undefined, undefined, expected,
    );
    expect(options.permissionMode).toBe('default');
  });

  it('applies the parent plan cap through translation to SDK mode and callback level', () => {
    const resolved = resolveCliLanePolicy({ cli: 'ptah-cli', manifest: laneManifest,
      request: { permission: 'auto-edit' }, saved: {}, parentLevel: 'plan' });
    const translated = translateLaneSpawnPolicy('ptah-cli', laneManifest, resolved);
    const input = laneInput(assemblyFor(verifiedPolicy()));
    input.permissionHandler.getPermissionLevel = jest.fn(() => 'yolo');
    input.lanePermissionLevel = translated.requested.permission;
    const options = buildClaudeSdkLaneOptions(input);
    expect(resolved.permission).toBe('plan');
    expect(options.permissionMode).toBe('plan');
    expect(options.allowDangerouslySkipPermissions).not.toBe(true);
    expect(input.permissionHandler.createCallback).toHaveBeenCalledWith(
      undefined, undefined, undefined, expect.any(Function), 'ptah-cli:fixture',
    );
    const resolver = jest.mocked(input.permissionHandler.createCallback).mock.calls[0]?.[3];
    expect(resolver?.()).toBe('plan');
  });

  it('uses the global handler level when no lane level is provided', () => {
    const input = laneInput(assemblyFor(verifiedPolicy()));
    input.permissionHandler.getPermissionLevel = jest.fn(() => 'auto-edit');
    const options = buildClaudeSdkLaneOptions(input);
    expect(options.permissionMode).toBe('acceptEdits');
    expect(input.permissionHandler.createCallback).toHaveBeenCalledWith(
      undefined, undefined, undefined, undefined, 'ptah-cli:fixture',
    );
  });

  it.each(['plan', 'ask', 'auto-edit'] as const)(
    'keeps translated %s lane below global yolo', (permission) => {
      const resolved = resolveCliLanePolicy({ cli: 'ptah-cli', manifest: laneManifest,
        request: { permission }, saved: {} });
      const translated = translateLaneSpawnPolicy('ptah-cli', laneManifest, resolved);
      const input = laneInput(assemblyFor(verifiedPolicy()));
      input.permissionHandler.getPermissionLevel = jest.fn(() => 'yolo');
      input.lanePermissionLevel = translated.requested.permission;
      const options = buildClaudeSdkLaneOptions(input);
      expect(options.permissionMode).toBe(translated.permissionMode);
      expect(options.permissionMode).not.toBe('bypassPermissions');
      expect(options.allowDangerouslySkipPermissions).not.toBe(true);
    },
  );
});
