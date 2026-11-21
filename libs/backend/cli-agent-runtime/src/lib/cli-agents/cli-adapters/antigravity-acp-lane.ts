/**
 * The ACP transport of the Antigravity lane (TASK_2026_2291, P3): when the
 * installed `agy` runs it, its seams, and the manifest it declares. The lane
 * itself is `createProviderSessionLaneHandle` with `antigravityAcpProfile`;
 * `AntigravityCliAdapter` chooses between it and the stream-json lane.
 */
import type { AcpTransportFactory } from '@ptah-extension/acp-runtime';
import type { AgentRoleChannel } from '@ptah-extension/shared';
import type { CliAdapterManifest } from './cli-adapter.interface';

/** The first `agy` release with a usable `agy acp` (research §2, preflight PF-3). */
export const AGY_ACP_MIN_VERSION = '1.5.1';

/** The `acp` row of the `agy --help` subcommand list. */
const AGY_ACP_SUBCOMMAND = /^\s*acp\s+\S/m;

/** Whether a probed version string (`1.5.13`, `agy 1.5.13`) is at or above the ACP floor. */
export function meetsAgyAcpFloor(version: string | undefined): boolean {
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(version ?? '');
  if (!found) return false;
  const floor = AGY_ACP_MIN_VERSION.split('.').map(Number);
  const actual = found.slice(1, 4).map(Number);
  for (let index = 0; index < 3; index++) {
    if (actual[index] !== floor[index]) return actual[index] > floor[index];
  }
  return true;
}

/** Whether `agy --help` lists the `acp` subcommand. */
export function agyHelpListsAcp(help: string | undefined): boolean {
  return !!help && AGY_ACP_SUBCOMMAND.test(help);
}

/**
 * The ACP seams. Production passes none: the probe reads `agy --version` and
 * `agy --help` (never `agy acp`, which unpacks the agent runtime), and the
 * runtime spawns through the host spawner. Specs and the gated live spec
 * replace them.
 */
export interface AntigravityAcpSeam {
  /** Whether this binary runs the ACP lane. */
  readonly probe?: (binary: string) => Promise<boolean>;
  /** Replaces the ACP process transport (in-memory agent, tee recorder). */
  readonly transportFactory?: AcpTransportFactory;
}

/**
 * The manifest of the ACP lane: a session that takes further prompts and a
 * cancel that keeps the process. `ask` stays unsupported: a lane decides
 * tool approvals headlessly, with nobody to ask.
 */
export function antigravityAcpManifest(
  roleChannel: AgentRoleChannel,
): CliAdapterManifest {
  return {
    messaging: {
      steer: {
        state: 'unsupported',
        reason: 'ACP messages begin the next turn.',
      },
      interrupt: { state: 'supported' },
      continuation: { state: 'supported' },
      resume: { state: 'supported' },
    },
    roleChannel,
    permissionModes: {
      plan: {
        state: 'supported',
        nativeMode: 'ACP mode plan',
        networkModes: ['allow'],
      },
      ask: {
        state: 'unsupported',
        reason:
          'A lane has no approval route; tool approvals are decided headlessly.',
        networkModes: [],
      },
      'auto-edit': {
        state: 'supported',
        nativeMode: 'ACP mode accept-edits',
        networkModes: ['allow'],
      },
      yolo: {
        state: 'supported',
        nativeMode: '--dangerously-skip-permissions, ACP mode auto',
        networkModes: ['allow'],
      },
    },
    networkModes: {
      allow: { state: 'supported' },
      deny: {
        state: 'unsupported',
        reason: 'No verified general network sandbox exists.',
      },
    },
    limitReader: { state: 'available', source: 'antigravity' },
    mcp: { state: 'supported' },
  };
}
