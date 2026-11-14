import { z } from 'zod';
import { SYSTEM_CLI_TYPES } from './agent-process.types';
import type { CliAdapterManifest, LaneNetworkMode, LanePermissionMode } from './agent-process.types';

export const CLI_LANE_DEFAULT_SCHEMA = z.object({
  permission: z.enum(['plan', 'ask', 'auto-edit', 'yolo']).optional(),
  network: z.enum(['allow', 'deny']).optional(),
}).strict();

/** Validated policy snapshot stored with a CLI session reference. */
export const EFFECTIVE_LANE_POLICY_SCHEMA = CLI_LANE_DEFAULT_SCHEMA.extend({
  nativeDescription: z.string().max(500).optional(),
  permissionSource: z.enum(['spawn', 'saved', 'built-in', 'parent-plan']).optional(),
  networkSource: z.enum(['spawn', 'saved', 'built-in', 'parent-plan']).optional(),
}).strict();

export const REQUESTED_LANE_POLICY_SCHEMA = EFFECTIVE_LANE_POLICY_SCHEMA.pick({
  permission: true,
  network: true,
});

export const CLI_LANE_DEFAULTS_SCHEMA = z.partialRecord(
  z.enum([...SYSTEM_CLI_TYPES, 'ptah-cli']),
  CLI_LANE_DEFAULT_SCHEMA,
);

export type CliLaneDefaults = z.infer<typeof CLI_LANE_DEFAULTS_SCHEMA>;

/** Write-only patch: null removes a row or an individual saved field. */
export const CLI_LANE_DEFAULTS_PATCH_SCHEMA = z.partialRecord(
  z.enum([...SYSTEM_CLI_TYPES, 'ptah-cli']),
  z.object({
    permission: CLI_LANE_DEFAULT_SCHEMA.shape.permission.unwrap().nullable().optional(),
    network: CLI_LANE_DEFAULT_SCHEMA.shape.network.unwrap().nullable().optional(),
  }).strict().nullable(),
);

export type CliLaneDefaultsPatch = z.infer<typeof CLI_LANE_DEFAULTS_PATCH_SCHEMA>;

const PERMISSIONS: readonly LanePermissionMode[] = ['yolo', 'auto-edit', 'ask', 'plan'];
const NETWORKS: readonly LaneNetworkMode[] = ['allow', 'deny'];

export function resolveCliLaneDefaultPair(
  capabilities: Pick<CliAdapterManifest, 'permissionModes' | 'networkModes'>,
  saved: { permission?: LanePermissionMode; network?: LaneNetworkMode } = {},
): { permission?: LanePermissionMode; network?: LaneNetworkMode;
  permissionSource?: 'saved' | 'built-in'; networkSource?: 'saved' | 'built-in' }
  | { unsupported: string } {
  const permissions = saved.permission ? [saved.permission] : PERMISSIONS;
  const networks = saved.network ? [saved.network] : NETWORKS;
  for (const permission of permissions) {
    const support = capabilities.permissionModes[permission];
    if (support?.state !== 'supported') continue;
    for (const network of networks) {
      if (capabilities.networkModes[network].state !== 'supported' || !support.networkModes.includes(network)) continue;
      return { permission, network,
        permissionSource: saved.permission ? 'saved' : 'built-in',
        networkSource: saved.network ? 'saved' : 'built-in' };
    }
  }
  if (saved.permission || saved.network) return { unsupported: 'Saved CLI lane default has no supported permission/network pair.' };
  return {};
}

/** Shared permission contract used by the Ptah CLI registry and settings RPC. */
export const PTAH_CLI_PERMISSION_CAPABILITIES: Pick<CliAdapterManifest, 'permissionModes' | 'networkModes'> = {
  permissionModes: {
    plan: { state: 'supported', nativeMode: 'plan', networkModes: ['allow'] },
    ask: { state: 'supported', nativeMode: 'default', networkModes: ['allow'] },
    'auto-edit': { state: 'supported', nativeMode: 'acceptEdits', networkModes: ['allow'] },
    yolo: { state: 'supported', nativeMode: 'bypassPermissions', networkModes: ['allow'] },
  },
  networkModes: { allow: { state: 'supported' }, deny: { state: 'unsupported', reason: 'The Claude SDK has no verified general network sandbox.' } },
};
