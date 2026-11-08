import { CLI_LANE_DEFAULTS_SCHEMA, codexSandboxModeSchema, DEFAULT_CODEX_SANDBOX_MODE, resolveCliLaneDefaultPair } from '@ptah-extension/shared';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import type {
  CliAdapterManifest, CliLaneDefaults, CliType, EffectiveLanePolicy,
} from '@ptah-extension/shared';
import { LaneSpawnPolicyError, validateLaneSpawnPolicy } from './lane-spawn-policy';

export function codexLegacyPolicy(mode: string): CliLaneDefaults['codex'] {
  switch (mode) {
    case 'read-only': return { permission: 'plan', network: 'deny' };
    case 'workspace-write-no-network': return { permission: 'auto-edit', network: 'deny' };
    case 'workspace-write-network': return { permission: 'auto-edit', network: 'allow' };
    case 'danger-full-access': return { permission: 'yolo', network: 'allow' };
    default: throw new Error('Invalid agentOrchestration.codexSandboxMode setting');
  }
}

/** Compatibility projection for Codex lane composition in every host. */
export function codexLaneSandboxMode(workspace: IWorkspaceProvider) {
  const saved = CLI_LANE_DEFAULTS_SCHEMA.parse(workspace.getConfiguration<unknown>(
    'ptah', 'agentOrchestration.cliLaneDefaults', {},
  ));
  const policy = saved.codex;
  if (!policy) return codexSandboxModeSchema.parse(workspace.getConfiguration(
    'ptah', 'agentOrchestration.codexSandboxMode', DEFAULT_CODEX_SANDBOX_MODE,
  ));
  return codexSandboxModeSchema.parse(policy.permission === 'plan' ? 'read-only'
    : policy.permission === 'yolo' ? 'danger-full-access'
    : policy.network === 'deny' ? 'workspace-write-no-network' : 'workspace-write-network');
}

/** Every choice comes from the live manifest; an unverified mode has no default. */
export function builtInLanePolicy(manifest: CliAdapterManifest): EffectiveLanePolicy {
  const pair = resolveCliLaneDefaultPair(manifest);
  return 'unsupported' in pair ? {} : pair;
}

function policySourceLabel(source: EffectiveLanePolicy['permissionSource']): string {
  switch (source) {
    case 'spawn': return 'Spawn request';
    case 'saved': return 'Saved default';
    case 'parent-plan': return 'Parent plan cap';
    default: return 'Built-in default';
  }
}

function validateResolvedPolicy(
  cli: CliType, manifest: CliAdapterManifest, requested: EffectiveLanePolicy,
): EffectiveLanePolicy {
  try {
    return validateLaneSpawnPolicy(cli, manifest, requested);
  } catch (error: unknown) {
    if (!(error instanceof LaneSpawnPolicyError)) throw error;
    const { field } = error.refusal;
    const label = field === 'permission' ? policySourceLabel(requested.permissionSource)
      : field === 'network' ? policySourceLabel(requested.networkSource)
      : `${policySourceLabel(requested.permissionSource)} permission and ${policySourceLabel(requested.networkSource)} network`;
    throw new LaneSpawnPolicyError({ ...error.refusal, reason: `${label}: ${error.refusal.reason}` });
  }
}

export function resolveCliLanePolicy(input: {
  cli: CliType;
  manifest: CliAdapterManifest;
  request: Pick<EffectiveLanePolicy, 'permission' | 'network'>;
  saved: unknown;
  legacyCodexMode?: string;
  parentLevel?: string;
  resumePolicy?: EffectiveLanePolicy;
}): EffectiveLanePolicy {
  if (input.resumePolicy) {
    const snapshot = input.resumePolicy;
    return validateResolvedPolicy(input.cli, input.manifest, input.parentLevel === 'plan'
      ? { ...snapshot, permission: 'plan', permissionSource: 'parent-plan',
          ...(input.cli === 'codex' ? { network: 'deny' as const, networkSource: 'parent-plan' as const } : {}) }
      : snapshot);
  }
  const saved = CLI_LANE_DEFAULTS_SCHEMA.parse(input.saved ?? {});
  const configured = saved[input.cli] ?? (input.cli === 'codex' && input.legacyCodexMode
    ? codexLegacyPolicy(input.legacyCodexMode) : undefined);
  const parentPlan = input.parentLevel === 'plan';
  const selectedPermission = parentPlan ? 'plan' : input.request.permission ?? configured?.permission;
  const selectedNetwork = parentPlan && input.cli === 'codex'
    ? 'deny' : input.request.network ?? configured?.network;
  const pair = resolveCliLaneDefaultPair(input.manifest, {
    permission: selectedPermission, network: selectedNetwork,
  });
  const permission = 'unsupported' in pair ? selectedPermission : pair.permission;
  const network = 'unsupported' in pair ? selectedNetwork : pair.network;
  const permissionSource = input.request.permission !== undefined ? 'spawn'
    : configured?.permission !== undefined ? 'saved' : 'unsupported' in pair ? undefined : pair.permissionSource;
  const networkSource = input.request.network !== undefined ? 'spawn'
    : configured?.network !== undefined ? 'saved' : 'unsupported' in pair ? undefined : pair.networkSource;
  const requested: EffectiveLanePolicy = input.parentLevel === 'plan'
    ? { permission: 'plan', network: input.cli === 'codex' ? 'deny' : network,
        permissionSource: 'parent-plan', networkSource: input.cli === 'codex' ? 'parent-plan' : networkSource }
    : { permission, network, permissionSource, networkSource };
  return validateResolvedPolicy(input.cli, input.manifest, requested);
}
