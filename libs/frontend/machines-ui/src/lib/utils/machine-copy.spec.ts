import { WORKER_REMOTE_COMMAND } from '@ptah-extension/worker-protocol';
import type { MachineVersions } from '@ptah-extension/shared';
import { displayText } from './display-text';
import {
  MACHINE_REASON_COPY,
  PAIRING_COMMAND,
  READINESS_COMMAND,
  durationText,
  noWorkerModeCopy,
  reasonNeedsRepair,
  versionMismatchCopy,
} from './machine-copy';

const VERSIONS: MachineVersions = {
  local: { ptahVersion: '0.1.70', protocol: { min: 3, max: 3 } },
  remote: { ptahVersion: '0.1.60', protocol: { min: 2, max: 2 } },
};

describe('machine copy', () => {
  it('builds the commands from WORKER_REMOTE_COMMAND', () => {
    expect(PAIRING_COMMAND).toBe(`${WORKER_REMOTE_COMMAND} pair`);
    expect(READINESS_COMMAND).toBe(`${WORKER_REMOTE_COMMAND} status`);
  });

  it('has fixed copy for every reason and repairs only identity and token causes', () => {
    expect(MACHINE_REASON_COPY['worker-identity-changed']).toBe(
      'A different worker answers on this alias — re-pair this machine.',
    );
    expect(MACHINE_REASON_COPY['re-pair-required']).toBe(
      'Pairing expired — re-pair this machine.',
    );
    expect(MACHINE_REASON_COPY['session-reattach-failed']).toBe(
      'A session could not re-attach — retry.',
    );
    expect(reasonNeedsRepair('worker-identity-changed')).toBe(true);
    expect(reasonNeedsRepair('re-pair-required')).toBe(true);
    expect(reasonNeedsRepair('session-reattach-failed')).toBe(false);
    expect(reasonNeedsRepair(undefined)).toBe(false);
  });

  it('matches the Batch 20 no-worker-mode wording', () => {
    expect(noWorkerModeCopy('Office Mac')).toBe(
      'This Ptah build on Office Mac has no worker mode. Update the Ptah desktop app there.',
    );
  });

  it('names both versions and the side to update', () => {
    const copy = versionMismatchCopy('Chappie', VERSIONS, displayText);
    expect(copy).toContain('protocol 3 (Ptah 0.1.70)');
    expect(copy).toContain('Chappie runs Ptah 0.1.60, protocol 2');
    expect(copy).toContain('Update Chappie, then reconnect.');

    const newer = versionMismatchCopy(
      'Chappie',
      {
        ...VERSIONS,
        remote: { ptahVersion: '0.2.0', protocol: { min: 4, max: 5 } },
      },
      displayText,
    );
    expect(newer).toContain('protocol 4–5');
    expect(newer).toContain('Update this app, then reconnect.');
  });

  it('sanitises worker version strings', () => {
    const copy = versionMismatchCopy(
      'Chappie',
      {
        ...VERSIONS,
        remote: { ptahVersion: '0.1\u202E.60', protocol: { min: 2, max: 2 } },
      },
      displayText,
    );
    expect(copy).not.toContain('\u202E');
  });

  it('returns null when the machine never reported a version', () => {
    expect(
      versionMismatchCopy('Chappie', { local: VERSIONS.local }, displayText),
    ).toBeNull();
    expect(versionMismatchCopy('Chappie', undefined, displayText)).toBeNull();
  });

  it('formats durations', () => {
    expect(durationText(0, 12_000)).toBe('12 s');
    expect(durationText(0, 4 * 60_000)).toBe('4 min');
    expect(durationText(0, 3 * 3_600_000)).toBe('3 h');
    expect(durationText(0, 72 * 3_600_000)).toBe('3 d');
    expect(durationText(10_000, 0)).toBe('0 s');
  });
});
