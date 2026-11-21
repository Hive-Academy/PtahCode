import 'reflect-metadata';
import { SessionId } from '@ptah-extension/shared';
import { normalizeCodexWorkspaceKey } from '@ptah-extension/codex-runtime';
import type { SessionMetadata } from '../session-metadata-store';
import {
  SessionHistoryRouteError,
  SessionHistoryRouter,
  type ProviderSessionHistory,
  type ProviderSessionHistoryPort,
} from './session-history-router';

const sessionId = SessionId.from('22222222-2222-4222-8222-222222222222');
const workspacePath = process.platform === 'win32' ? 'D:\\repo' : '/repo';
const otherWorkspace = process.platform === 'win32' ? 'D:\\other' : '/other';
const execution: NonNullable<SessionMetadata['providerSessionExecution']> = {
  version: 1,
  runtime: 'provider-session',
  sessionId,
  providerId: 'antigravity-cli',
  workspaceId: normalizeCodexWorkspaceKey(workspacePath, process.platform),
  providerSession: { profile: 'antigravity' },
};
const session: SessionMetadata = {
  sessionId,
  name: 'Antigravity chat',
  workspaceId: workspacePath,
  createdAt: 100,
  lastActiveAt: 200,
  totalCost: 0,
  totalTokens: { input: 0, output: 0 },
  providerSessionExecution: execution,
};
const history = {
  events: [{ eventType: 'message_start', id: 'event-1' }],
  stats: null,
} as unknown as ProviderSessionHistory;

function harness(
  metadata: SessionMetadata | null,
  port: ProviderSessionHistoryPort | null | undefined,
) {
  const legacy = {
    readSessionHistory: jest.fn(async () => ({ events: [], stats: null })),
    readSessionEvents: jest.fn(async () => []),
    readCarryOverTranscript: jest.fn(),
  };
  const native = { readHistory: jest.fn(), readHistoryTail: jest.fn() };
  const router = new SessionHistoryRouter(
    () => ({ get: jest.fn(async () => metadata) }),
    () => legacy as never,
    () => native,
    () => port,
  );
  return { router, legacy, native };
}

describe('SessionHistoryRouter provider-session arm', () => {
  it('reads an already projected provider-session history through its port', async () => {
    const read = jest.fn(async () => history);
    const h = harness(session, { read });
    await expect(
      h.router.readSessionHistory(sessionId, workspacePath),
    ).resolves.toEqual({ events: history.events, stats: history.stats });
    await expect(
      h.router.readSessionEvents(sessionId, workspacePath),
    ).resolves.toBe(history.events);
    expect(read).toHaveBeenCalledWith(sessionId, undefined);
    expect(h.legacy.readSessionHistory).not.toHaveBeenCalled();
    expect(h.native.readHistory).not.toHaveBeenCalled();
  });

  it.each([null, undefined])(
    'refuses with nativePortUnavailable when the port is %s',
    async (port) => {
      const h = harness(session, port);
      await expect(
        h.router.readSessionHistory(sessionId, workspacePath),
      ).rejects.toMatchObject({ code: 'nativePortUnavailable' });
      expect(h.legacy.readSessionHistory).not.toHaveBeenCalled();
    },
  );

  it('defaults to no provider-session port for hosts that pass none', async () => {
    const router = new SessionHistoryRouter(
      () => ({ get: jest.fn(async () => session) }),
      () => ({}) as never,
      () => null,
    );
    await expect(
      router.readSessionEvents(sessionId, workspacePath),
    ).rejects.toMatchObject({ code: 'nativePortUnavailable' });
  });

  it('collapses a port failure into nativeReadFailed without its message', async () => {
    const h = harness(session, {
      read: jest.fn(async () => {
        throw new Error('/secret/home/path failed');
      }),
    });
    const attempt = h.router.readSessionHistory(sessionId, workspacePath);
    await expect(attempt).rejects.toBeInstanceOf(SessionHistoryRouteError);
    await expect(attempt).rejects.toMatchObject({ code: 'nativeReadFailed' });
    await expect(attempt).rejects.not.toThrow('/secret');
  });

  it('rejects a stored execution for another session id', async () => {
    const other = SessionId.from('33333333-3333-4333-8333-333333333333');
    const h = harness(
      {
        ...session,
        providerSessionExecution: {
          ...execution,
          sessionId: other,
        },
      },
      { read: jest.fn() },
    );
    await expect(
      h.router.readSessionHistory(sessionId, workspacePath),
    ).rejects.toMatchObject({ code: 'invalidNativeIdentity' });
  });

  it('refuses a carry-over read of a provider session before any read', async () => {
    const read = jest.fn();
    const h = harness(session, { read });
    await expect(
      h.router.readCarryOverTranscript(sessionId, workspacePath, {
        nativeBound: { maxTurns: 2, maxPages: 1 },
      } as never),
    ).rejects.toMatchObject({ code: 'nativePortUnavailable' });
    expect(read).not.toHaveBeenCalled();
    expect(h.legacy.readCarryOverTranscript).not.toHaveBeenCalled();
  });

  it('passes the caller abort signal to the port', async () => {
    const read = jest.fn(async () => history);
    const h = harness(session, { read });
    const controller = new AbortController();
    await h.router.readSessionHistory(sessionId, workspacePath, {
      signal: controller.signal,
    });
    await h.router.readSessionEvents(sessionId, workspacePath, {
      signal: controller.signal,
    });
    expect(read.mock.calls).toEqual([
      [sessionId, controller.signal],
      [sessionId, controller.signal],
    ]);
  });

  it.each([
    ['another workspace', otherWorkspace],
    ['a relative workspace', 'relative/repo'],
  ])('rejects a read from %s before any read', async (_case, caller) => {
    const read = jest.fn();
    const h = harness(session, { read });
    await expect(
      h.router.readSessionHistory(sessionId, caller),
    ).rejects.toMatchObject({ code: 'invalidNativeIdentity' });
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps legacy options unchanged and strips only the signal', async () => {
    const h = harness({ ...session, providerSessionExecution: undefined }, {
      read: jest.fn(),
    });
    const options = { includeBlockOwners: true };
    await h.router.readSessionHistory(sessionId, workspacePath, options);
    await h.router.readSessionHistory(sessionId, workspacePath, {
      ...options,
      signal: new AbortController().signal,
    });
    expect(h.legacy.readSessionHistory.mock.calls).toEqual([
      [sessionId, workspacePath, options],
      [sessionId, workspacePath, options],
    ]);
  });

  it('keeps a Claude session on the legacy reader', async () => {
    const h = harness({ ...session, providerSessionExecution: undefined }, {
      read: jest.fn(),
    });
    await h.router.readSessionHistory(sessionId, workspacePath);
    expect(h.legacy.readSessionHistory).toHaveBeenCalledTimes(1);
  });
});
