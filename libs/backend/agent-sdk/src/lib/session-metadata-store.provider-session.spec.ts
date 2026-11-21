import 'reflect-metadata';
import { resolve } from 'node:path';
import { normalizeCodexWorkspaceKey } from '@ptah-extension/codex-runtime';
import { createMockStateStorage } from '@ptah-extension/platform-core/testing';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { SessionId, type SessionRuntimeIdentity } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  CodexSessionMetadataError,
  ProviderSessionMetadataError,
  SessionMetadataStore,
  nativeExecutionOf,
  type SessionMetadata,
} from './session-metadata-store';
import { initializeSessionRuntimeIdentityLookup } from './wiring/session-runtime-identity-cache';

type ProviderSessionExecution = Extract<
  SessionRuntimeIdentity,
  { runtime: 'provider-session' }
>;

const WORKSPACE = resolve('/workspace/provider-session');
const SESSION = SessionId.from('aaaaaaaa-1111-4222-8333-444444444444');

/** The identity key the store writes (the shared native-runtime key). */
function key(path: string): string {
  return normalizeCodexWorkspaceKey(path, process.platform);
}

function store(): SessionMetadataStore {
  return new SessionMetadataStore(
    createMockStateStorage(),
    createMockLogger() as unknown as Logger,
  );
}

function execution(
  overrides: Partial<ProviderSessionExecution> = {},
): ProviderSessionExecution {
  return {
    version: 1,
    sessionId: SESSION,
    providerId: 'antigravity-cli',
    workspaceId: WORKSPACE,
    runtime: 'provider-session',
    providerSession: { profile: 'antigravity' },
    ...overrides,
  };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('SessionMetadataStore.updateProviderSessionExecution', () => {
  it('round-trips the binding with a normalized workspace key and thread', async () => {
    const unit = store();
    await unit.updateProviderSessionExecution(
      SESSION,
      () => execution(),
      () => ({ nativeSessionId: 'agy-session-1', processGeneration: 1 }),
      'My agy chat',
    );

    const row = await unit.get(SESSION);
    expect(row?.providerSessionExecution).toEqual({
      ...execution(),
      workspaceId: key(WORKSPACE),
    });
    expect(row?.providerSessionThread).toEqual({
      nativeSessionId: 'agy-session-1',
      processGeneration: 1,
    });
    expect(row?.workspaceId).toBe(WORKSPACE);
    expect(row?.providerId).toBe('antigravity-cli');
    expect(row?.name).toBe('My agy chat');
    expect(row?.codexExecution).toBeUndefined();
    expect(nativeExecutionOf(row)).toEqual(row?.providerSessionExecution);
  });

  it('skips the write when the thread updater returns the current record', async () => {
    const unit = store();
    await unit.updateProviderSessionExecution(SESSION, () => execution(), () => ({
      nativeSessionId: 'agy-session-1',
      processGeneration: 1,
    }));
    const before = await unit.get(SESSION);
    const updater = jest.fn(() => execution());
    await unit.updateProviderSessionExecution(SESSION, updater, (current) => current);
    expect(updater).not.toHaveBeenCalled();
    expect(await unit.get(SESSION)).toEqual(before);
  });

  it.each([
    ['profile', { providerSession: { profile: 'grok' as const } }],
    ['provider', { providerId: 'grok-cli' }],
    ['workspace', { workspaceId: resolve('/workspace/other') }],
    [
      'home',
      {
        providerSession: {
          profile: 'antigravity' as const,
          normalizedHome: resolve('/home').toLowerCase().replace(/\//g, '\\'),
        },
      },
    ],
  ])('refuses to change the %s of a stored binding', async (_label, change) => {
    const unit = store();
    await unit.updateProviderSessionExecution(SESSION, () => execution());
    const error = await rejection(
      unit.updateProviderSessionExecution(SESSION, () => execution(change)),
    );
    expect(error).toBeInstanceOf(ProviderSessionMetadataError);
    expect((error as ProviderSessionMetadataError).code).toMatch(
      /binding-change|invalid-identity/,
    );
    expect((await unit.get(SESSION))?.providerSessionExecution?.providerId).toBe(
      'antigravity-cli',
    );
  });

  it('refuses another runtime, a session id mismatch and a relative workspace', async () => {
    const unit = store();
    for (const proposed of [
      { ...execution(), runtime: 'claude-sdk' },
      execution({
        sessionId: SessionId.from('bbbbbbbb-1111-4222-8333-444444444444'),
      }),
      execution({ workspaceId: 'relative/ws' }),
    ]) {
      const error = await rejection(
        unit.updateProviderSessionExecution(
          SESSION,
          () => proposed as ProviderSessionExecution,
        ),
      );
      expect(error).toMatchObject({ code: 'invalid-identity' });
    }
    expect(await unit.get(SESSION)).toBeNull();
  });

  it('refuses an invalid thread mapping', async () => {
    const unit = store();
    const error = await rejection(
      unit.updateProviderSessionExecution(SESSION, () => execution(), () => ({
        nativeSessionId: '',
        processGeneration: 0,
      })),
    );
    expect(error).toMatchObject({ code: 'invalid-identity' });
  });

  it('refuses to convert an existing Claude session', async () => {
    const unit = store();
    await unit.create(SESSION, WORKSPACE, 'Claude chat');
    const error = await rejection(
      unit.updateProviderSessionExecution(SESSION, () => execution()),
    );
    expect(error).toMatchObject({ code: 'legacy-conversion' });
  });

  it('refuses direct writes and keeps the binding through ordinary saves', async () => {
    const unit = store();
    await unit.updateProviderSessionExecution(SESSION, () => execution(), () => ({
      nativeSessionId: 'agy-session-1',
      processGeneration: 1,
    }));
    const row = (await unit.get(SESSION)) as SessionMetadata;

    await expect(
      unit.save({
        ...row,
        providerSessionExecution: execution({
          providerSession: { profile: 'grok' },
        }),
      }),
    ).rejects.toMatchObject({ code: 'direct-runtime-write' });
    await expect(
      unit.save({
        ...row,
        providerSessionThread: { nativeSessionId: 'other', processGeneration: 2 },
      }),
    ).rejects.toMatchObject({ code: 'direct-runtime-write' });

    const { providerSessionExecution: _e, providerSessionThread: _t, ...plain } =
      row;
    await unit.save({ ...plain, name: 'Renamed' });
    const saved = await unit.get(SESSION);
    expect(saved?.name).toBe('Renamed');
    expect(saved?.providerSessionExecution).toEqual(row.providerSessionExecution);
    expect(saved?.providerSessionThread).toEqual(row.providerSessionThread);
  });
});

describe('nativeExecutionOf', () => {
  it('returns undefined for Claude and legacy metadata', () => {
    expect(nativeExecutionOf(undefined)).toBeUndefined();
    expect(nativeExecutionOf(null)).toBeUndefined();
    expect(nativeExecutionOf({})).toBeUndefined();
  });
});

describe('provider-session workspace key', () => {
  it.each([
    ['D:\\Proj', 'd:\\proj'],
    ['D:\\Proj\\', 'd:/proj'],
    ['C:\\', 'c:\\'],
    ['\\\\Server\\Share\\Dir', '\\\\server\\share\\dir'],
  ])('folds win32 case: %p and %p share one key', (a, b) => {
    expect(normalizeCodexWorkspaceKey(a, 'win32')).toBe(
      normalizeCodexWorkspaceKey(b, 'win32'),
    );
  });

  it.each(['D:\\Proj', 'C:\\', '\\\\server\\share\\dir'])(
    'is idempotent on win32 for %p',
    (path) => {
      const once = normalizeCodexWorkspaceKey(path, 'win32');
      expect(normalizeCodexWorkspaceKey(once, 'win32')).toBe(once);
    },
  );

  it.each(['/', '/home/User/proj'])('keeps posix %p and is idempotent', (path) => {
    const once = normalizeCodexWorkspaceKey(path, 'linux');
    expect(once).toBe(path);
    expect(normalizeCodexWorkspaceKey(once, 'linux')).toBe(once);
  });

  it.each(['\\foo', '/foo', 'relative\\ws', '', 'C:'])(
    'refuses drive-less or relative win32 path %p (never the cwd drive)',
    (path) => {
      expect(() => normalizeCodexWorkspaceKey(path, 'win32')).toThrow();
    },
  );

  it('writes the same binding for two spellings of one folder', async () => {
    const unit = store();
    const upper = resolve('/Workspace/Provider-Session');
    await unit.updateProviderSessionExecution(SESSION, () =>
      execution({ workspaceId: upper }),
    );
    const lower =
      process.platform === 'win32' ? upper.toLowerCase() : `${upper}/`;
    await unit.updateProviderSessionExecution(SESSION, () =>
      execution({ workspaceId: lower }),
    );
    const row = await unit.get(SESSION);
    expect(row?.providerSessionExecution?.workspaceId).toBe(key(upper));
    expect(row?.workspaceId).toBe(upper);
  });

  it('accepts a filesystem root workspace and re-reads it unchanged', async () => {
    const unit = store();
    const root = resolve('/');
    await unit.updateProviderSessionExecution(SESSION, () =>
      execution({ workspaceId: root }),
    );
    const stored = (await unit.get(SESSION))?.providerSessionExecution;
    expect(stored?.workspaceId).toBe(key(root));
    expect(key(stored?.workspaceId ?? '')).toBe(stored?.workspaceId);
    // A rewrite with the stored key itself is the same binding.
    await unit.updateProviderSessionExecution(SESSION, (current) => current ?? execution());
  });
});

describe('cross-runtime isolation', () => {
  const codex: Extract<SessionRuntimeIdentity, { runtime: 'codex-app-server' }> = {
    version: 1,
    sessionId: SESSION,
    providerId: 'openai-codex',
    workspaceId: WORKSPACE,
    runtime: 'codex-app-server',
    codex: { normalizedHome: '/home/codex' },
  };

  it('refuses a provider-session write over a Codex row', async () => {
    const unit = store();
    await unit.updateCodexExecution(SESSION, () => codex);
    const error = await rejection(
      unit.updateProviderSessionExecution(SESSION, () => execution()),
    );
    expect(error).toBeInstanceOf(ProviderSessionMetadataError);
    expect(error).toMatchObject({ code: 'legacy-conversion' });
    const row = await unit.get(SESSION);
    expect(row?.codexExecution?.runtime).toBe('codex-app-server');
    expect(row?.providerSessionExecution).toBeUndefined();
  });

  it('refuses a Codex write over a provider-session row', async () => {
    const unit = store();
    await unit.updateProviderSessionExecution(SESSION, () => execution());
    const error = await rejection(unit.updateCodexExecution(SESSION, () => codex));
    expect(error).toBeInstanceOf(CodexSessionMetadataError);
    expect(error).toMatchObject({ code: 'legacy-conversion' });
    const row = await unit.get(SESSION);
    expect(row?.providerSessionExecution?.runtime).toBe('provider-session');
    expect(row?.codexExecution).toBeUndefined();
  });

  it('keeps a Codex row intact when a save carries provider-session fields', async () => {
    const unit = store();
    await unit.updateCodexExecution(SESSION, () => codex);
    const row = (await unit.get(SESSION)) as SessionMetadata;
    await expect(
      unit.save({ ...row, providerSessionExecution: execution() }),
    ).rejects.toMatchObject({ code: 'direct-runtime-write' });
    expect(await unit.get(SESSION)).toEqual(row);
  });
});

describe('session runtime identity cache with provider sessions', () => {
  it('reads the provider-session binding and keeps it on release', async () => {
    const unit = store();
    await unit.updateProviderSessionExecution(SESSION, () => execution());
    const lookup = await initializeSessionRuntimeIdentityLookup(
      unit,
      createMockLogger() as unknown as Logger,
    );
    try {
      expect(lookup.lookup(SESSION)?.persisted).toEqual({
        ...execution(),
        workspaceId: key(WORKSPACE),
      });
      lookup.releaseSession(SESSION);
      expect(lookup.lookup(SESSION)?.persisted?.runtime).toBe('provider-session');
    } finally {
      lookup.dispose();
    }
  });
});
