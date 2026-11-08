import { WORKER_REMOTE_COMMAND } from '@ptah-extension/worker-protocol';
import {
  GRANTS_COMMAND,
  PERMISSION_TIMED_OUT_COPY,
  REMOTE_PERMISSION_TIMEOUT_BY,
  REMOTE_PERMISSION_TIMEOUT_SEC,
  driverHolderKind,
  drivenElsewhereBanner,
  lockFreedBanner,
  lockUnavailableBanner,
  locksReleaseCommand,
  permissionCountdownCopy,
  permissionNotPermittedCopy,
  remoteSessionStateLabel,
} from './remote-session-copy';

describe('remote session copy', () => {
  it('restates the worker timeout facts (pending-permissions.ts, decision 27)', () => {
    // REMOTE_PERMISSION_TIMEOUT_MS = 60_000 and REMOTE_PERMISSION_TIMEOUT_BY
    // in libs/backend/worker-runtime/src/lib/pending-permissions.ts.
    expect(REMOTE_PERMISSION_TIMEOUT_SEC * 1000).toBe(60_000);
    expect(REMOTE_PERMISSION_TIMEOUT_BY).toBe('Worker timeout');
    expect(PERMISSION_TIMED_OUT_COPY).toBe(
      'No answer within 60 s — the worker denied this request.',
    );
  });

  it('counts down in whole seconds, never below zero', () => {
    expect(permissionCountdownCopy(42)).toBe('Denied automatically in 42 s');
    expect(permissionCountdownCopy(41.2)).toBe('Denied automatically in 42 s');
    expect(permissionCountdownCopy(-3)).toBe('Denied automatically in 0 s');
  });

  it('names the worker commands from WORKER_REMOTE_COMMAND', () => {
    expect(GRANTS_COMMAND).toBe(`${WORKER_REMOTE_COMMAND} grants`);
    expect(locksReleaseCommand('s-42')).toBe(
      `${WORKER_REMOTE_COMMAND} locks release s-42`,
    );
  });

  it('7c copy is neutral: it never says whether the session exists', () => {
    const copy = permissionNotPermittedCopy('Horus');
    expect(copy).toContain('could not be answered from this app');
    expect(copy).toContain('was not found, or');
    expect(copy).toContain(GRANTS_COMMAND);
    expect(copy).not.toMatch(/excluded|does not exist|forbidden/i);
  });

  it('labels session states, and Unknown while the machine is unreachable', () => {
    expect(remoteSessionStateLabel('running', true)).toBe('Running');
    expect(remoteSessionStateLabel('interrupted', true)).toBe('Interrupted');
    expect(remoteSessionStateLabel('running', false)).toBe('Unknown');
  });

  it('tells the holder kinds apart by the lock label suffixes', () => {
    expect(driverHolderKind('Horus keyboard')).toBe('responding');
    expect(driverHolderKind('another Ptah process (not responding)')).toBe(
      'not-responding',
    );
    expect(driverHolderKind('Horus keyboard (release pending)')).toBe(
      'stranded',
    );
  });

  it('9: names the holder and offers Refresh, no command', () => {
    const banner = drivenElsewhereBanner('Horus keyboard', 'Horus', 's1', '14:02:11');
    expect(banner).toMatchObject({ role: 'status', tone: 'run', command: null });
    expect(banner.lines[0]).toMatch(/^Horus keyboard is driving this session\./);
    expect(banner.lines[1]).toBe(
      'Last saved 14:02:11. Press Refresh to check again.',
    );
  });

  it('9b and stranded: the fix line names the release command for the session', () => {
    const stuck = drivenElsewhereBanner(
      'another Ptah process (not responding)',
      'Horus',
      's1',
      null,
    );
    expect(stuck.tone).toBe('need');
    expect(stuck.lines[1]).toBe('Close or stop that process on Horus.');
    expect(stuck.command).toBe(`${WORKER_REMOTE_COMMAND} locks release s1`);

    const stranded = drivenElsewhereBanner(
      'Horus keyboard (release pending)',
      'Horus',
      's1',
      null,
    );
    expect(stranded.lines[0]).toContain('It is finishing up; try again in a moment.');
    expect(stranded.command).toBe(`${WORKER_REMOTE_COMMAND} locks release s1`);
  });

  it('9c names no owner and no local code', () => {
    const banner = lockUnavailableBanner('Horus');
    expect(banner.role).toBe('alert');
    expect(banner.code).toBe('DRIVER_LOCK_UNAVAILABLE');
    const text = banner.lines.join(' ');
    expect(text).not.toMatch(/driving|driven|SESSION_DRIVER_LOCK_UNAVAILABLE/);
    expect(text).toContain('check the Ptah log on Horus');
  });

  it('9d says the holder finished', () => {
    expect(lockFreedBanner('Horus keyboard').lines).toEqual([
      'Horus keyboard finished. You can send messages again.',
    ]);
  });
});
