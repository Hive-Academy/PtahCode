import type { RemoteMachine } from '../services/machines-store';
import { displayText } from './display-text';
import {
  MACHINE_REASON_COPY,
  durationText,
  noWorkerModeCopy,
  reasonNeedsRepair,
  versionMismatchCopy,
} from './machine-copy';

/** One state banner of the selected machine (design 4.3, 4.5). */
export interface MachineBanner {
  readonly role: 'alert' | 'status';
  readonly tone: 'err' | 'need';
  readonly label: string;
  readonly text: string;
  readonly action: 'repair' | 'retry' | null;
}

/** The 4.3/4.5 banners for one machine, most actionable first. */
export function machineBanners(
  machine: RemoteMachine,
  now: number,
): readonly MachineBanner[] {
  const name = displayText(machine.displayName) || displayText(machine.alias);
  const banners: MachineBanner[] = [];

  if (machine.reason !== undefined) {
    const repair = reasonNeedsRepair(machine.reason);
    banners.push({
      role: repair ? 'alert' : 'status',
      tone: repair ? 'err' : 'need',
      label: repair ? 'Re-pair needed' : 'Session not re-attached',
      text: MACHINE_REASON_COPY[machine.reason],
      action: repair ? 'repair' : 'retry',
    });
  }

  switch (machine.state) {
    case 'unpaired':
      if (!reasonNeedsRepair(machine.reason)) {
        banners.push({
          role: 'status',
          tone: 'need',
          label: 'Not paired',
          text: `${name} has no pairing token on this machine. Pair it to connect.`,
          action: 'repair',
        });
      }
      break;
    case 'offline':
    case 'reconnecting': {
      const lost =
        machine.lastSeenAt !== undefined
          ? `Lost contact ${durationText(machine.lastSeenAt, now)} ago.`
          : `No contact with ${name}.`;
      const next =
        machine.nextRetryAt !== undefined && machine.nextRetryAt > now
          ? ` Next attempt in ${durationText(now, machine.nextRetryAt)}.`
          : '';
      banners.push({
        role: 'status',
        tone: 'need',
        label: machine.state === 'offline' ? 'Offline' : 'Reconnecting',
        text: `${lost} Sessions on ${name} keep running; they are shown as unknown, not failed.${next}`,
        action: 'retry',
      });
      break;
    }
    case 'version-mismatch':
      banners.push({
        role: 'alert',
        tone: 'err',
        label: 'Version mismatch',
        text:
          versionMismatchCopy(name, machine.versions, (v) =>
            displayText(v, 24),
          ) ?? noWorkerModeCopy(name),
        action: 'retry',
      });
      break;
    case 'connected':
      break;
  }
  return banners;
}
