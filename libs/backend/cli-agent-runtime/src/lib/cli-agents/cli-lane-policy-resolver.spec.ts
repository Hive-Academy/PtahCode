import { PTAH_CLI_PERMISSION_CAPABILITIES } from '@ptah-extension/shared';
import type { CliAdapterManifest } from '@ptah-extension/shared';
import { createMockWorkspaceProvider } from '@ptah-extension/platform-core/testing';
import { builtInLanePolicy, resolveCliLanePolicy, codexLegacyPolicy, codexLaneSandboxMode } from './cli-lane-policy-resolver';
import { LaneSpawnPolicyError } from './lane-spawn-policy';

const supported = { state: 'supported' as const };
const unsupported = { state: 'unsupported' as const, reason: 'unverified' };
const manifest: CliAdapterManifest = {
  messaging: { steer: supported, interrupt: supported, continuation: supported, resume: supported },
  roleChannel: 'task-prompt',
  permissionModes: {
    plan: { ...supported, networkModes: ['deny'] },
    'auto-edit': { ...supported, networkModes: ['allow', 'deny'] },
    yolo: { ...supported, networkModes: ['allow'] },
  },
  networkModes: { allow: supported, deny: supported },
  limitReader: { state: 'no-reliable-source' },
  mcp: unsupported,
};

function refusalFrom(run: () => unknown): LaneSpawnPolicyError {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof LaneSpawnPolicyError) return error;
    throw error;
  }
  throw new Error('Expected a lane policy refusal');
}

describe('CLI lane policy resolver', () => {
  it('selects the strongest supported manifest pair', () => {
    expect(builtInLanePolicy(manifest)).toMatchObject({ permission: 'yolo', network: 'allow' });
    expect(resolveCliLanePolicy({ cli: 'codex', manifest, saved: {}, request: {} })).toMatchObject({
      permission: 'yolo', network: 'allow', permissionSource: 'built-in', networkSource: 'built-in',
    });
  });

  it('resolves each field independently', () => {
    expect(resolveCliLanePolicy({ cli: 'codex', manifest, saved: {
      codex: { permission: 'auto-edit', network: 'allow' },
    }, request: { network: 'deny' } })).toMatchObject({
      permission: 'auto-edit', network: 'deny', permissionSource: 'saved', networkSource: 'spawn',
    });
  });

  it('caps a plan parent and denies Codex network', () => {
    expect(resolveCliLanePolicy({ cli: 'codex', manifest, saved: {},
      request: { permission: 'yolo' }, parentLevel: 'plan' })).toMatchObject({
      permission: 'plan', network: 'deny', permissionSource: 'parent-plan', networkSource: 'parent-plan',
    });
  });

  it('refuses an unsupported final pair', () => {
    const error = refusalFrom(() => resolveCliLanePolicy({ cli: 'codex', manifest, saved: {
      codex: { permission: 'yolo', network: 'deny' },
    }, request: {} }));
    expect(error.refusal).toMatchObject({ code: 'UNSUPPORTED_LANE_POLICY', field: 'combination', cli: 'codex' });
    expect(error.message).toContain('Saved default permission and Saved default network');
  });

  it('attributes an unsupported explicit network to the spawn request', () => {
    const ptahManifest: CliAdapterManifest = { ...manifest, ...PTAH_CLI_PERMISSION_CAPABILITIES };
    const error = refusalFrom(() => resolveCliLanePolicy({ cli: 'ptah-cli', manifest: ptahManifest,
      saved: {}, request: { permission: 'plan', network: 'deny' } }));
    expect(error.refusal).toMatchObject({ code: 'UNSUPPORTED_LANE_POLICY', field: 'network', cli: 'ptah-cli' });
    expect(error.message).toContain('Spawn request');
    expect(error.message).not.toContain('Saved default');
  });

  it('attributes a contributing stale permission to the saved default', () => {
    const error = refusalFrom(() => resolveCliLanePolicy({ cli: 'codex', manifest,
      saved: { codex: { permission: 'ask' } }, request: { network: 'allow' } }));
    expect(error.refusal).toMatchObject({ code: 'UNSUPPORTED_LANE_POLICY', field: 'permission', cli: 'codex' });
    expect(error.message).toContain('Saved default');
  });

  it('attributes an unsupported parent plan cap to the parent', () => {
    const unverified: CliAdapterManifest = { ...manifest,
      permissionModes: { ...manifest.permissionModes, plan: { ...unsupported, networkModes: [] } } };
    const error = refusalFrom(() => resolveCliLanePolicy({ cli: 'codex', manifest: unverified,
      saved: {}, request: {}, parentLevel: 'plan' }));
    expect(error.refusal).toMatchObject({ field: 'permission', cli: 'codex' });
    expect(error.message).toContain('Parent plan cap');
  });

  it('lets a fully specified supported request override stale saved fields', () => {
    expect(resolveCliLanePolicy({ cli: 'codex', manifest,
      saved: { codex: { permission: 'plan', network: 'allow' } },
      request: { permission: 'auto-edit', network: 'deny' },
    })).toMatchObject({ permission: 'auto-edit', network: 'deny',
      permissionSource: 'spawn', networkSource: 'spawn' });
    expect(() => resolveCliLanePolicy({ cli: 'codex', manifest,
      saved: { codex: { permission: 'plan', network: 'allow' } },
      request: { network: 'allow' },
    })).toThrow();
  });

  it('does not invent a policy for unverified adapters', () => {
    const unverified: CliAdapterManifest = {
      ...manifest,
      permissionModes: { plan: { ...unsupported, networkModes: [] } },
      networkModes: { allow: supported, deny: unsupported },
    };
    expect(builtInLanePolicy(unverified)).toEqual({});
    expect(() => resolveCliLanePolicy({ cli: 'cursor', manifest: unverified, saved: {},
      request: { permission: 'yolo' } })).toThrow();
    expect(() => resolveCliLanePolicy({ cli: 'cursor', manifest: unverified, saved: {},
      request: {}, parentLevel: 'plan' })).toThrow();
  });

  it('preserves a resume snapshot when saved defaults change', () => {
    const snapshot = { permission: 'auto-edit' as const, network: 'deny' as const,
      permissionSource: 'saved' as const, networkSource: 'spawn' as const };
    expect(resolveCliLanePolicy({ cli: 'codex', manifest,
      saved: { codex: { permission: 'yolo', network: 'allow' } },
      request: {}, resumePolicy: snapshot })).toMatchObject(snapshot);
  });

  it('caps a system CLI resume snapshot to the current Codex plan parent', () => {
    expect(resolveCliLanePolicy({ cli: 'codex', manifest, saved: {}, request: {},
      parentLevel: 'plan', resumePolicy: {
        permission: 'yolo', network: 'allow', permissionSource: 'saved', networkSource: 'saved',
      } })).toMatchObject({ permission: 'plan', network: 'deny',
        permissionSource: 'parent-plan', networkSource: 'parent-plan' });
  });

  it('caps a Ptah CLI resume snapshot to the current plan parent', () => {
    const ptahManifest: CliAdapterManifest = { ...manifest, ...PTAH_CLI_PERMISSION_CAPABILITIES };
    expect(resolveCliLanePolicy({ cli: 'ptah-cli', manifest: ptahManifest, saved: {}, request: {},
      parentLevel: 'plan', resumePolicy: {
        permission: 'yolo', network: 'allow', permissionSource: 'saved', networkSource: 'saved',
      } })).toMatchObject({ permission: 'plan', network: 'allow',
        permissionSource: 'parent-plan', networkSource: 'saved' });
  });

  it.each([
    ['read-only', 'plan', 'deny'],
    ['workspace-write-no-network', 'auto-edit', 'deny'],
    ['workspace-write-network', 'auto-edit', 'allow'],
    ['danger-full-access', 'yolo', 'allow'],
  ])('maps legacy %s', (mode, permission, network) => {
    expect(codexLegacyPolicy(mode)).toEqual({ permission, network });
  });

  it('uses the canonical Codex choice for host lane composition', () => {
    const workspace = createMockWorkspaceProvider({ config: {
      'ptah.agentOrchestration.cliLaneDefaults': { codex: { permission: 'plan', network: 'deny' } },
      'ptah.agentOrchestration.codexSandboxMode': 'danger-full-access',
    } });
    expect(codexLaneSandboxMode(workspace)).toBe('read-only');
  });
});
