import type {
  MachineConnectionState,
  MachineStateReason,
  MachineVersions,
} from '@ptah-extension/shared';
import { WORKER_REMOTE_COMMAND } from '@ptah-extension/worker-protocol';

/** The command a user runs on the machine to open its pairing window. */
export const PAIRING_COMMAND = `${WORKER_REMOTE_COMMAND} pair`;

/** The command that prints the machine's readiness list. */
export const READINESS_COMMAND = `${WORKER_REMOTE_COMMAND} status`;

/** Visible label of each machine state (design 4.5). */
export const MACHINE_STATE_LABELS: Readonly<
  Record<MachineConnectionState, string>
> = {
  connected: 'Connected',
  offline: 'Offline',
  reconnecting: 'Reconnecting',
  'version-mismatch': 'Version mismatch',
  unpaired: 'Not paired',
};

/**
 * Fixed copy per state reason. The reason is a closed set from Electron main
 * and never carries worker text, so the renderer owns every word.
 */
export const MACHINE_REASON_COPY: Readonly<Record<MachineStateReason, string>> =
  {
    'worker-identity-changed':
      'A different worker answers on this alias — re-pair this machine.',
    're-pair-required': 'Pairing expired — re-pair this machine.',
    'session-reattach-failed': 'A session could not re-attach — retry.',
  };

/** Reasons whose recovery is pairing the machine again. */
export function reasonNeedsRepair(
  reason: MachineStateReason | undefined,
): boolean {
  return reason === 'worker-identity-changed' || reason === 're-pair-required';
}

/**
 * The Batch 20 "no worker mode" copy (`ssh-worker-commands.ts`), restated
 * because the renderer may not import the backend lib. Shown when the machine
 * answered SSH but has no worker entry point, so no remote version exists.
 * `machineName` must already be display-safe.
 */
export function noWorkerModeCopy(machineName: string): string {
  return `This Ptah build on ${machineName} has no worker mode. Update the Ptah desktop app there.`;
}

/**
 * Version-mismatch copy naming both sides, or `null` when the remote side
 * never answered (use {@link noWorkerModeCopy}). Inputs are display-safe.
 */
export function versionMismatchCopy(
  machineName: string,
  versions: MachineVersions | undefined,
  safe: (value: string) => string,
): string | null {
  const remote = versions?.remote;
  if (versions === undefined || remote === undefined) return null;
  const local = versions.local;
  const update =
    remote.protocol.min > local.protocol.max ? 'this app' : machineName;
  return (
    `This app speaks protocol ${protocolText(local.protocol)} (Ptah ${safe(local.ptahVersion)}). ` +
    `${machineName} runs Ptah ${safe(remote.ptahVersion)}, protocol ${protocolText(remote.protocol)}. ` +
    `Not connected. Update ${update}, then reconnect.`
  );
}

function protocolText(range: { min: number; max: number }): string {
  const min = Number.isFinite(range.min) ? Math.trunc(range.min) : 0;
  const max = Number.isFinite(range.max) ? Math.trunc(range.max) : 0;
  return min === max ? `${max}` : `${min}–${max}`;
}

/** "12 s", "4 min", "3 h", "2 d" between two epoch-ms instants. */
export function durationText(fromMs: number, toMs: number): string {
  const seconds = Math.max(0, Math.round((toMs - fromMs) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}
