/**
 * The ACP lane of the Antigravity adapter (TASK_2026_2291, P3; ACP-only since
 * TASK_2026_2322): the version floor the installed `agy` must meet, the seams,
 * and the manifest the lane declares. The lane itself is
 * `createProviderSessionLaneHandle` with `antigravityAcpProfile`.
 */
import {
  antigravityAcpProfile,
  spawnAcpProcess,
  type AcpTransportFactory,
} from '@ptah-extension/acp-runtime';
import type { AgentRoleChannel } from '@ptah-extension/shared';
import type { CliAdapterManifest } from './cli-adapter.interface';
import { acpLaneManifestSections } from './provider-session/provider-session-lane-handle';

/** The first `agy` release with a usable `agy acp` (research §2, preflight PF-3). */
export const AGY_ACP_MIN_VERSION = '1.5.1';

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

/**
 * The ACP seams. Production passes none: the probe reads `agy --version`
 * (never `agy acp`, which unpacks the agent runtime), and the runtime spawns
 * through the host spawner. Specs and the gated live spec replace them.
 */
export interface AntigravityAcpSeam {
  /**
   * Whether this binary meets the ACP version floor; `undefined` means the
   * probe could not tell (timeout, spawn error), which is not cached.
   */
  readonly probe?: (binary: string) => Promise<boolean | undefined>;
  /** Clock for the `agy models` id cache; defaults to `Date.now` (specs). */
  readonly now?: () => number;
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
    ...acpLaneManifestSections(
      antigravityAcpProfile,
      'A lane has no approval route; tool approvals are decided headlessly.',
    ),
  };
}

/**
 * Wrap `factory` so each lane child drops the Windows ConPTY noise agy's
 * node-pty helper can print: a `conpty_console_list_agent` line and the next
 * five lines of its stack, or an `AttachConsole failed` line and the next
 * three. Same rule the stream-json adapter applied; only the agy lane uses it,
 * so Grok stderr is untouched. Every other line reaches the lane unchanged.
 */
export function withAgyConptyNoiseFilter(
  factory: AcpTransportFactory = spawnAcpProcess,
): AcpTransportFactory {
  return (spawnOptions) => {
    const forward = spawnOptions.onStderrLine;
    if (!forward) return factory(spawnOptions);
    let suppressed = 0;
    return factory({
      ...spawnOptions,
      onStderrLine: (line) => {
        if (line.includes('conpty_console_list_agent')) {
          suppressed = 5;
          return;
        }
        if (line.includes('AttachConsole failed')) {
          suppressed = 3;
          return;
        }
        if (suppressed > 0) {
          suppressed--;
          return;
        }
        forward(line);
      },
    });
  };
}
