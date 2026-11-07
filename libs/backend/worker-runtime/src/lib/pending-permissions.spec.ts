import {
  PendingPermissionIndex,
  PermissionAnswerError,
  REMOTE_PERMISSION_TIMEOUT_MS,
  remotePermissionDeadline,
  withRemotePermissionDeadline,
  assertManualApproval,
  assertManualApprovalSettings,
} from './pending-permissions';
import type {
  ISdkPermissionHandler,
  PermissionRequest,
} from '@ptah-extension/shared';
import { SessionLogWriter } from './session-log-writer';

it('refuses worker auto-approve flags and environment', () => {
  expect(() => assertManualApproval(['--auto-approve'], undefined)).toThrow();
  expect(() => assertManualApproval([], 'true')).toThrow();
  expect(() => assertManualApproval([], undefined)).not.toThrow();
});

it('refuses a persisted autopilot level that skips manual approval', () => {
  for (const permissionLevel of ['yolo', 'auto-edit'])
    expect(() =>
      assertManualApprovalSettings({ enabled: true, permissionLevel }),
    ).toThrow(`autopilot is enabled at level "${permissionLevel}"`);
  for (const permissionLevel of ['ask', 'plan'])
    expect(() =>
      assertManualApprovalSettings({ enabled: true, permissionLevel }),
    ).not.toThrow();
  // A disabled autopilot runs every session at `ask`, whatever level is saved.
  expect(() =>
    assertManualApprovalSettings({ enabled: false, permissionLevel: 'yolo' }),
  ).not.toThrow();
});

it('first answer wins synchronously; auto-approve is refused', async () => {
  const handleResponse = jest.fn();
  const handler = { handleResponse } as unknown as ISdkPermissionHandler;
  const index = new PendingPermissionIndex(handler);
  const writer = {
    enqueue: jest.fn().mockResolvedValue({}),
  } as unknown as SessionLogWriter;
  index.add({ id: 'r1', sessionId: 's1' } as PermissionRequest);
  const response = { id: 'r1', decision: 'allow' as const };
  const first = index.answer('s1', response, 'Client', writer);
  await expect(
    index.answer('s1', response, 'Client', writer),
  ).rejects.toBeInstanceOf(PermissionAnswerError);
  await first;
  expect(handleResponse).toHaveBeenCalledTimes(1);
  expect(writer.enqueue).toHaveBeenCalledWith('worker:permission.answered', {
    requestId: 'r1',
    decision: 'allow',
    by: 'Client',
  });
  index.add({ id: 'r2', sessionId: 's1' } as PermissionRequest);
  await expect(
    index.answer(
      's1',
      { id: 'r2', decision: 'always_allow' },
      'Client',
      writer,
    ),
  ).rejects.toBeInstanceOf(PermissionAnswerError);
  expect(handleResponse).toHaveBeenCalledTimes(1);
});

describe('remote permission expiry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
  });
  afterEach(() => jest.useRealTimers());

  const raise = (id: string, sessionId = 's1', timestamp = Date.now()) =>
    ({ id, sessionId, timestamp, timeoutAt: 0 }) as PermissionRequest;
  function fixture() {
    const handleResponse = jest.fn();
    const writer = {
      enqueue: jest.fn().mockResolvedValue({}),
    } as unknown as SessionLogWriter;
    const onExpired = jest.fn();
    const index = new PendingPermissionIndex(
      { handleResponse } as unknown as ISdkPermissionHandler,
      { findWriter: () => writer, onExpired },
    );
    return { handleResponse, writer, onExpired, index };
  }

  it('denies after 60 s, writes the answered record and refuses a late answer', async () => {
    const f = fixture();
    f.index.add(raise('r1'));
    jest.advanceTimersByTime(REMOTE_PERMISSION_TIMEOUT_MS - 1);
    expect(f.handleResponse).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(f.handleResponse).toHaveBeenCalledWith('r1', {
      id: 'r1',
      decision: 'deny',
      reason: 'No answer from the controller within 60 s',
    });
    expect(f.writer.enqueue).toHaveBeenCalledWith(
      'worker:permission.answered',
      { requestId: 'r1', decision: 'deny', by: 'Worker timeout' },
    );
    expect(f.onExpired).toHaveBeenCalledWith('r1', 's1');
    await expect(
      f.index.answer('s1', { id: 'r1', decision: 'allow' }, 'C', f.writer),
    ).rejects.toBeInstanceOf(PermissionAnswerError);
    expect(f.handleResponse).toHaveBeenCalledTimes(1);
  });

  it('counts from the request timestamp, not from when it was indexed', () => {
    const f = fixture();
    f.index.add(raise('r1', 's1', Date.now() - 50_000));
    jest.advanceTimersByTime(10_000);
    expect(f.handleResponse).toHaveBeenCalledTimes(1);
  });

  it('stops the timer on answer, auto-resolve, session end and dispose', async () => {
    const f = fixture();
    for (const id of ['a', 'b', 'c', 'd']) f.index.add(raise(id));
    f.index.add(raise('other', 's2'));
    await f.index.answer('s1', { id: 'a', decision: 'allow' }, 'C', f.writer);
    f.index.remove('b');
    f.index.clearSession('s1');
    f.index.dispose();
    jest.advanceTimersByTime(REMOTE_PERMISSION_TIMEOUT_MS);
    expect(f.handleResponse).toHaveBeenCalledTimes(1);
    expect(f.handleResponse).toHaveBeenCalledWith('a', {
      id: 'a',
      decision: 'allow',
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('re-adding a request replaces its timer', () => {
    const f = fixture();
    f.index.add(raise('r1'));
    f.index.add(raise('r1'));
    expect(jest.getTimerCount()).toBe(1);
  });

  it('computes the forwarded deadline', () => {
    expect(remotePermissionDeadline({ timestamp: 5, timeoutAt: 0 })).toBe(
      5 + REMOTE_PERMISSION_TIMEOUT_MS,
    );
    // An earlier engine deadline wins.
    expect(remotePermissionDeadline({ timestamp: 5, timeoutAt: 100 })).toBe(
      100,
    );
    expect(remotePermissionDeadline({ timestamp: 0, timeoutAt: 0 }, 7)).toBe(
      7 + REMOTE_PERMISSION_TIMEOUT_MS,
    );
    expect(
      withRemotePermissionDeadline({ id: 'r', timestamp: 5, timeoutAt: 0 }),
    ).toEqual({
      id: 'r',
      timestamp: 5,
      timeoutAt: 5 + REMOTE_PERMISSION_TIMEOUT_MS,
    });
    expect(withRemotePermissionDeadline({ id: 'r' })).toEqual({ id: 'r' });
    expect(withRemotePermissionDeadline(null)).toBeNull();
  });
});
