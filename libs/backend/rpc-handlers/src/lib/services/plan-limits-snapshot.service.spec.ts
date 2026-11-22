/**
 * PlanLimitsSnapshotService (TASK_2026_596, Component 12).
 *
 * The handler spec drives the RPC surface through this service; these cases
 * pin what only the service owns: the push repeats the last request's scope
 * without a refresh, the provider lookup picks the selected-provider owner,
 * and a failed read still lists its owner without quoting the error.
 */

// The cli-agent-runtime barrel (plan-limit discovery tokens) reaches the
// workspace-intelligence tree-sitter loader, whose `wasm-bundle-dir` reads
// `import.meta.url` (unparseable under CommonJS ts-jest). Nothing here parses.
jest.mock('../../../../workspace-intelligence/src/ast/wasm-bundle-dir', () => ({
  BUNDLE_DIR: '',
  resolveWasmPath: (filename: string) => filename,
}));
import 'reflect-metadata';

import type { Logger } from '@ptah-extension/vscode-core';
import type { PlanOwnerTarget } from '@ptah-extension/auth-providers';
import type {
  DiscoveredPlanOwner,
  SelectedProviderDiscovery,
} from '@ptah-extension/cli-agent-runtime';
import type {
  PlanLimitOwnerSnapshot,
  QuotaOwnerRef,
  SessionRuntimeIdentity,
} from '@ptah-extension/shared';
import { SessionId } from '@ptah-extension/shared';
import {
  createMockLogger,
  type MockLogger,
} from '@ptah-extension/shared/testing';

import { PlanLimitsSnapshotService } from './plan-limits-snapshot.service';

const CODEX: QuotaOwnerRef = {
  key: 'openai-codex#cli-store:a1',
  providerId: 'openai-codex',
  identityKind: 'cli-store',
  label: 'Codex account',
};
const OLLAMA: QuotaOwnerRef = {
  key: 'ollama-cloud#credential:b2',
  providerId: 'ollama-cloud',
  identityKind: 'credential',
  label: 'Ollama Cloud key',
};
const OPENCODE: QuotaOwnerRef = {
  key: 'opencode#cli-store:c3',
  providerId: 'opencode',
  identityKind: 'cli-store',
  label: 'OpenCode account',
};

function available(owner: QuotaOwnerRef): PlanLimitOwnerSnapshot {
  return {
    owner,
    status: 'available',
    windowSetEstablished: true,
    windows: [],
    ownerEvidence: [],
  };
}

function build(
  metadata?: {
    get(sessionId: string): Promise<{
      codexExecution?: SessionRuntimeIdentity;
      providerSessionExecution?: SessionRuntimeIdentity;
    } | null>;
  },
  ownerResolver?: { ownerForCodexHome(home?: string): QuotaOwnerRef },
) {
  const logger: MockLogger = createMockLogger();
  const discoverTargets = jest.fn<Promise<DiscoveredPlanOwner[]>, [unknown, number?]>(
    async () => [],
  );
  const discoverSelectedProvider = jest.fn(
    async (providerId: string): Promise<SelectedProviderDiscovery> => ({
      kind: 'owner',
      entry: (await discoverTargets({ selectedProviderId: providerId })).find(
        (entry) => entry.origin === 'selected-provider',
      ),
    }),
  );
  const getOwnerSnapshot = jest.fn<
    Promise<PlanLimitOwnerSnapshot>,
    [PlanOwnerTarget, unknown]
  >(async (target) => available(target.ownerRef));
  const service = new PlanLimitsSnapshotService(
    logger as unknown as Logger,
    { discoverTargets, discoverSelectedProvider },
    { getOwnerSnapshot },
    {
      snapshotFor: jest.fn(() => undefined),
      sessionOwners: jest.fn(() => ({})),
    },
    metadata,
    ownerResolver,
  );
  return {
    service,
    discoverTargets,
    discoverSelectedProvider,
    getOwnerSnapshot,
    logger,
  };
}

describe('PlanLimitsSnapshotService', () => {
  it('serves a same-scope pull from the TTL cache and logs its path', async () => {
    const s = build();
    const first = await s.service.snapshot({ providerId: 'openai-codex' });
    const second = await s.service.snapshot({ providerId: 'openai-codex' });
    expect(second).toBe(first);
    expect(s.discoverTargets).toHaveBeenCalledTimes(1);
    expect(s.logger.debug).toHaveBeenLastCalledWith(
      '[PlanLimitsSnapshot] snapshot served',
      expect.objectContaining({ source: 'pull', path: 'ttl-cache', durationMs: expect.any(Number) }),
    );
  });

  it('assembles again when the 30 second TTL expires', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const s = build();
      await s.service.snapshot({});
      jest.setSystemTime(new Date('2026-01-01T00:00:30Z'));
      await s.service.snapshot({});
      expect(s.discoverTargets).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps cached snapshots separate by scope', async () => {
    const s = build();
    await s.service.snapshot({ providerId: 'openai-codex' });
    await s.service.snapshot({ providerId: 'ollama-cloud' });
    expect(s.discoverTargets).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache on refresh and replaces the complete entry', async () => {
    const s = build();
    const first = await s.service.snapshot({});
    const refreshed = await s.service.snapshot({ refresh: true });
    const cached = await s.service.snapshot({});
    expect(refreshed).not.toBe(first);
    expect(cached).toBe(refreshed);
    expect(s.discoverTargets).toHaveBeenCalledTimes(2);
  });

  it('keeps a newer refresh cached when an older pull settles later', async () => {
    const s = build();
    let release!: (rows: DiscoveredPlanOwner[]) => void;
    s.discoverTargets.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const older = s.service.snapshot({});
    const refreshed = await s.service.snapshot({ refresh: true });
    release([]);
    expect(await older).not.toBe(refreshed);
    expect(await s.service.snapshot({})).toBe(refreshed);
    expect(s.discoverTargets).toHaveBeenCalledTimes(2);
  });

  it('does not cache a snapshot when an owner read times out', async () => {
    jest.useFakeTimers();
    try {
      const s = build();
      s.discoverTargets.mockResolvedValue([
        { kind: 'read', origin: 'lane', target: { providerId: 'ollama-cloud', ownerRef: OLLAMA } },
      ]);
      s.getOwnerSnapshot.mockImplementationOnce(() => new Promise(() => undefined));
      const first = s.service.snapshot({});
      await jest.advanceTimersByTimeAsync(3_000);
      await expect(first).resolves.toMatchObject({ owners: [{ status: 'service-unavailable' }] });
      await expect(s.service.snapshot({})).resolves.toMatchObject({ owners: [{ status: 'available' }] });
      expect(s.discoverTargets).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not cache a snapshot when an owner read throws', async () => {
    const s = build();
    s.discoverTargets.mockResolvedValue([
      { kind: 'read', origin: 'lane', target: { providerId: 'ollama-cloud', ownerRef: OLLAMA } },
    ]);
    s.getOwnerSnapshot.mockRejectedValueOnce(new Error('read failed'));
    await expect(s.service.snapshot({})).resolves.toMatchObject({ owners: [{ status: 'service-unavailable' }] });
    await expect(s.service.snapshot({})).resolves.toMatchObject({ owners: [{ status: 'available' }] });
    expect(s.discoverTargets).toHaveBeenCalledTimes(2);
  });

  it('does not cache incomplete discovery or serve an earlier complete entry after it', async () => {
    const s = build();
    const incomplete = Object.assign([] as DiscoveredPlanOwner[], { discoveryIncomplete: true });
    await s.service.snapshot({});
    s.discoverTargets.mockResolvedValueOnce(incomplete);
    await expect(s.service.snapshot({ refresh: true })).resolves.toMatchObject({ discoveryIncomplete: true });
    await s.service.snapshot({});
    expect(s.discoverTargets).toHaveBeenCalledTimes(3);
  });

  it('does not cache a rejected assembly', async () => {
    const s = build();
    s.discoverTargets.mockRejectedValueOnce(new Error('discovery down'));
    await expect(s.service.snapshot({})).rejects.toThrow('discovery down');
    await s.service.snapshot({});
    expect(s.discoverTargets).toHaveBeenCalledTimes(2);
  });

  it('shares one cache entry between two orders of the same scope', async () => {
    const s = build();
    await s.service.snapshot({ sessionIds: ['b', 'a'], ownerKeys: ['y', 'x'] });
    await s.service.snapshot({ sessionIds: ['a', 'b'], ownerKeys: ['x', 'y'] });
    expect(s.discoverTargets).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recent scope after 32 cached scopes', async () => {
    const s = build();
    await s.service.snapshot({ sessionIds: ['s0'] });
    await s.service.snapshot({ sessionIds: ['s1'] });
    for (let i = 2; i < 32; i += 1) await s.service.snapshot({ sessionIds: [`s${i}`] });
    await s.service.snapshot({ sessionIds: ['s0'] }); // hit: s0 becomes the most recent
    await s.service.snapshot({ sessionIds: ['s32'] }); // evicts s1
    expect(s.discoverTargets).toHaveBeenCalledTimes(33);
    await s.service.snapshot({ sessionIds: ['s0'] });
    expect(s.discoverTargets).toHaveBeenCalledTimes(33);
    await s.service.snapshot({ sessionIds: ['s1'] });
    expect(s.discoverTargets).toHaveBeenCalledTimes(34);
  });

  it('shares normalized scopes in flight and forces a separate refresh', async () => {
    const s = build();
    let release!: (rows: DiscoveredPlanOwner[]) => void;
    s.discoverTargets.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = s.service.snapshot({ sessionIds: ['b', 'a'], ownerKeys: ['x'] });
    const second = s.service.snapshot({ sessionIds: ['a', 'b'], ownerKeys: ['x'] });
    expect(s.discoverTargets).toHaveBeenCalledTimes(1);
    release([]);
    const firstResult = await first;
    expect(firstResult).toBe(await second);
    expect(firstResult).toEqual({ generatedAt: expect.any(Number), owners: [], discoveryIncomplete: false, sessionOwners: {
      a: { ownerKey: null, modelScope: null }, b: { ownerKey: null, modelScope: null },
    } });
    const served = s.logger.debug.mock.calls.filter(([message]) => message === '[PlanLimitsSnapshot] snapshot served');
    expect(served).toHaveLength(2);
    expect(served.map(([, payload]) => payload)).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'pull', path: 'assembled', scopeId: expect.stringMatching(/^[a-f0-9]{8}$/), sessionCount: 2, ownerKeyCount: 1, discoveryMs: expect.any(Number), readsMs: expect.any(Number) }),
      expect.objectContaining({ source: 'pull', path: 'joined', durationMs: expect.any(Number) }),
    ]));
    expect(JSON.stringify(served)).not.toMatch(/"[abx]"/);
    await s.service.snapshot({ sessionIds: ['b', 'a'], ownerKeys: ['x'], refresh: true });
    expect(s.discoverTargets).toHaveBeenCalledTimes(2);
  });
  it('rejects every joined caller with the shared assemble error and logs no served line', async () => {
    const s = build();
    s.discoverTargets.mockRejectedValueOnce(new Error('discovery down'));
    const first = s.service.snapshot({ sessionIds: ['a'] });
    const second = s.service.snapshot({ sessionIds: ['a'] });
    await expect(first).rejects.toThrow('discovery down');
    await expect(second).rejects.toThrow('discovery down');
    expect(s.discoverTargets).toHaveBeenCalledTimes(1);
    const served = s.logger.debug.mock.calls.filter(([message]) => message === '[PlanLimitsSnapshot] snapshot served');
    expect(served).toHaveLength(0);
  });
  it('logs a push with the last scope and no raw owner key', async () => {
    const s = build();
    await s.service.snapshot({ providerId: 'openai-codex', sessionIds: ['private-session'], ownerKeys: ['private-owner'] });
    const result = await s.service.currentSnapshot();
    expect(result).toEqual({ generatedAt: expect.any(Number), owners: [], discoveryIncomplete: false, sessionOwners: {
      'private-session': { ownerKey: null, modelScope: null },
    } });
    const served = s.logger.debug.mock.calls.filter(([message]) => message === '[PlanLimitsSnapshot] snapshot served');
    expect(served).toHaveLength(2);
    expect(served[1][1]).toEqual(expect.objectContaining({ source: 'push', path: 'assembled', refresh: false, hasProvider: true, sessionCount: 1, ownerKeyCount: 1, pushes: 1 }));
    expect(s.discoverTargets).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(served)).not.toMatch(/private-session|private-owner/);
  });
  it('links an ambient-only native home to its unknown owner and isolates other homes', async () => {
    const nativeId = SessionId.from('12345678-1234-4234-8234-123456789abc');
    const otherId = SessionId.from('22345678-1234-4234-8234-123456789abc');
    const ambientOwner: QuotaOwnerRef = {
      key: 'openai-codex#unknown:1111111111111111', providerId: 'openai-codex',
      identityKind: 'unknown', label: 'Codex (owner unknown)',
    };
    const otherOwner: QuotaOwnerRef = { ...ambientOwner,
      key: 'openai-codex#unknown:2222222222222222' };
    const metadata = { get: jest.fn(async (sessionId: string) => ({
      codexExecution: {
        version: 1 as const, sessionId: SessionId.from(sessionId),
        runtime: 'codex-app-server' as const,
        providerId: 'openai-codex', workspaceId: '/work',
        codex: { normalizedHome: sessionId === nativeId
          ? '/home/codex/.' : '/home/other' },
      },
    })) };
    const ownerResolver = { ownerForCodexHome: jest.fn((home?: string) =>
      home === '/home/codex/.' ? ambientOwner : otherOwner,
    ) };
    const s = build(metadata, ownerResolver);
    // No provider_account rows or ledger links: discovery still has the native
    // home owner returned by the same account usage reader.
    s.discoverTargets.mockResolvedValue([
      { kind: 'known', origin: 'selected-provider', snapshot: available(ambientOwner) },
    ]);
    await expect(s.service.snapshot({ sessionIds: [nativeId, otherId] }))
      .resolves.toMatchObject({ sessionOwners: {
        [nativeId]: { ownerKey: ambientOwner.key },
        [otherId]: { ownerKey: null },
      } });
  });

  it('binds a provider-session (Antigravity) session to its listed CLI account (issue #1459)', async () => {
    const agyId = SessionId.from('32345678-1234-4234-8234-123456789abc');
    const antigravity: QuotaOwnerRef = {
      key: 'antigravity#cli-store:d4', providerId: 'antigravity',
      identityKind: 'cli-store', label: 'Antigravity CLI login',
    };
    const metadata = { get: jest.fn(async (sessionId: string) => ({
      providerSessionExecution: {
        version: 1 as const, sessionId: SessionId.from(sessionId),
        runtime: 'provider-session' as const,
        providerId: 'antigravity-cli', workspaceId: '/work',
        providerSession: { profile: 'antigravity' as const },
      },
    })) };
    const s = build(metadata, { ownerForCodexHome: jest.fn(() => CODEX) });
    s.discoverTargets.mockResolvedValue([
      { kind: 'known', origin: 'selected-provider', snapshot: available(CODEX) },
      { kind: 'known', origin: 'cli-store', snapshot: available(antigravity) },
    ]);
    await expect(s.service.snapshot({ sessionIds: [agyId] }))
      .resolves.toMatchObject({ sessionOwners: {
        [agyId]: { ownerKey: antigravity.key, modelScope: null },
      } });
  });

  it('leaves a provider-session session unresolved when its provider has no listed owner', async () => {
    const agyId = SessionId.from('42345678-1234-4234-8234-123456789abc');
    const metadata = { get: jest.fn(async (sessionId: string) => ({
      providerSessionExecution: {
        version: 1 as const, sessionId: SessionId.from(sessionId),
        runtime: 'provider-session' as const,
        providerId: 'antigravity-cli', workspaceId: '/work',
        providerSession: { profile: 'antigravity' as const },
      },
    })) };
    const s = build(metadata, { ownerForCodexHome: jest.fn(() => CODEX) });
    s.discoverTargets.mockResolvedValue([
      { kind: 'known', origin: 'selected-provider', snapshot: available(CODEX) },
    ]);
    await expect(s.service.snapshot({ sessionIds: [agyId] }))
      .resolves.toMatchObject({ sessionOwners: { [agyId]: { ownerKey: null } } });
  });

  it('warns when native metadata lookup fails and leaves the session unresolved', async () => {
    const s = build({ get: jest.fn(async () => {
      throw new Error('metadata unavailable');
    }) }, { ownerForCodexHome: jest.fn(() => CODEX) });
    await expect(s.service.snapshot({ sessionIds: ['native-session'] }))
      .resolves.toMatchObject({ sessionOwners: {
        'native-session': { ownerKey: null },
      } });
    expect(s.logger.warn).toHaveBeenCalledWith(
      '[PlanLimitsSnapshot] native session owner lookup failed',
      { errorName: 'Error' },
    );
  });

  it('links only a persisted native Codex session on the discovered home to its plan owner', async () => {
    const nativeId = SessionId.from('12345678-1234-4234-8234-123456789abc');
    const claudeId = 'claude-session';
    const metadata = { get: jest.fn(async (id: string) => id === nativeId
      ? { codexExecution: {
          version: 1 as const, sessionId: nativeId, runtime: 'codex-app-server' as const,
          providerId: 'openai-codex', workspaceId: '/work',
          codex: { normalizedHome: '/home/codex' },
        } }
      : null) };
    const ownerResolver = { ownerForCodexHome: jest.fn((home?: string) =>
      home === '/home/codex' ? CODEX : OLLAMA,
    ) };
    const s = build(metadata, ownerResolver);
    s.discoverTargets.mockResolvedValue([
      { kind: 'known', origin: 'selected-provider', snapshot: available(CODEX) },
    ]);
    await expect(s.service.snapshot({ sessionIds: [nativeId, claudeId] }))
      .resolves.toMatchObject({ sessionOwners: {
        [nativeId]: { ownerKey: CODEX.key, modelScope: null },
        [claudeId]: { ownerKey: null, modelScope: null },
      } });
    expect(ownerResolver.ownerForCodexHome).toHaveBeenCalledWith('/home/codex');
  });

  it('passes an incomplete discovery marker to the client snapshot', async () => {
    const s = build();
    s.discoverTargets.mockResolvedValue(
      Object.assign([] as DiscoveredPlanOwner[], { discoveryIncomplete: true }),
    );
    await expect(s.service.snapshot({})).resolves.toMatchObject({
      discoveryIncomplete: true,
    });
  });

  it('pushes with the scope of the last request and never refreshes', async () => {
    const s = build();
    s.discoverTargets.mockResolvedValue([
      {
        kind: 'read',
        origin: 'selected-provider',
        target: { providerId: 'openai-codex', ownerRef: CODEX },
      },
    ]);

    await s.service.snapshot({
      providerId: 'openai-codex',
      sessionIds: ['s-1'],
      ownerKeys: [OLLAMA.key],
      refresh: true,
    });
    await s.service.currentSnapshot();

    expect(s.discoverTargets).toHaveBeenNthCalledWith(2, {
      selectedProviderId: 'openai-codex',
      sessionIds: ['s-1'],
      ownerKeys: [OLLAMA.key],
    }, expect.any(Number));
    expect(s.getOwnerSnapshot.mock.calls.map(([, options]) => options)).toEqual(
      [
        expect.objectContaining({ refresh: true }),
        expect.objectContaining({ refresh: false }),
      ],
    );
  });

  it('pushes with an empty scope before any request', async () => {
    const s = build();
    await s.service.currentSnapshot();
    expect(s.discoverTargets).toHaveBeenCalledWith({}, expect.any(Number));
  });

  it('returns a partial snapshot within 24 seconds after slow discovery and a hung Codex read', async () => {
    jest.useFakeTimers();
    try {
      const s = build();
      s.discoverTargets.mockImplementation(() => new Promise((resolve) =>
        setTimeout(() => resolve([
          { kind: 'known', origin: 'selected-provider', snapshot: available(OLLAMA) },
          { kind: 'read', origin: 'lane', target: { providerId: 'openai-codex', ownerRef: CODEX } },
        ]), 11_000),
      ));
      s.getOwnerSnapshot.mockImplementation(() => new Promise(() => undefined));
      const pending = s.service.snapshot({});
      await jest.advanceTimersByTimeAsync(24_000);
      await expect(pending).resolves.toMatchObject({ owners: [
        { owner: OLLAMA, status: 'available' },
        { owner: CODEX, status: 'service-unavailable' },
      ] });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reserves time for a live owner read after discovery uses its 12 second deadline', async () => {
    jest.useFakeTimers();
    try {
      const s = build();
      const startedAt = Date.now();
      s.discoverTargets.mockImplementation(() => new Promise((resolve) =>
        setTimeout(() => resolve([
          { kind: 'read', origin: 'cli-store', target: { providerId: 'opencode', ownerRef: OPENCODE } },
        ]), 12_000),
      ));
      s.getOwnerSnapshot.mockResolvedValue({ ...available(OPENCODE), status: 'unsupported-config' });

      const pending = s.service.snapshot({});
      expect(s.discoverTargets).toHaveBeenCalledWith({}, startedAt + 12_000);
      await jest.advanceTimersByTimeAsync(12_000);
      await expect(pending).resolves.toMatchObject({ owners: [
        { owner: OPENCODE, status: 'unsupported-config' },
      ] });
      expect(s.getOwnerSnapshot).toHaveBeenCalledWith(
        { providerId: 'opencode', ownerRef: OPENCODE },
        expect.objectContaining({ refresh: false, signal: expect.any(AbortSignal) }),
      );
      expect(Date.now() - startedAt).toBeLessThan(24_000);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a provider lookup reads only the selected-provider owner and keeps the push scope', async () => {
    const s = build();
    await s.service.snapshot({ providerId: 'claude-cli' });
    s.discoverTargets.mockResolvedValue([
      {
        kind: 'read',
        origin: 'lane',
        target: { providerId: 'openai-codex', ownerRef: CODEX },
      },
      {
        kind: 'read',
        origin: 'selected-provider',
        target: { providerId: 'ollama-cloud', ownerRef: OLLAMA },
      },
    ]);

    const result = await s.service.ownerSnapshotForProvider(
      'ollama-cloud',
      false,
    );

    expect(result).toMatchObject({
      kind: 'snapshot',
      snapshot: { owner: OLLAMA },
    });
    expect(s.getOwnerSnapshot).toHaveBeenCalledTimes(1);
    await s.service.currentSnapshot();
    expect(s.discoverTargets).toHaveBeenLastCalledWith({
      selectedProviderId: 'claude-cli',
    }, expect.any(Number));
  });

  describe('read deadline', () => {
    /** A read that answers after 5 s unless its signal aborts first. */
    function slowRead(s: ReturnType<typeof build>): void {
      s.getOwnerSnapshot.mockImplementation(
        (target, options) =>
          new Promise((resolve, reject) => {
            const signal = (options as { signal?: AbortSignal } | undefined)
              ?.signal;
            const timer = setTimeout(
              () => resolve(available(target.ownerRef)),
              5_000,
            );
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      );
      s.discoverTargets.mockResolvedValue([
        {
          kind: 'read',
          origin: 'selected-provider',
          target: { providerId: 'openai-codex', ownerRef: CODEX },
        },
      ]);
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('a provider lookup is not cut at 3 s: the reader keeps its own limit', async () => {
      const s = build();
      slowRead(s);

      const pending = s.service.ownerSnapshotForProvider('openai-codex', true);
      await jest.advanceTimersByTimeAsync(5_000);

      await expect(pending).resolves.toEqual({
        kind: 'snapshot',
        snapshot: available(CODEX),
      });
      expect(s.getOwnerSnapshot).toHaveBeenCalledWith(
        { providerId: 'openai-codex', ownerRef: CODEX },
        { refresh: true },
      );
    });

    it('a plan-limits snapshot gives Codex a 12-second deadline', async () => {
      const s = build();
      slowRead(s);

      let settled: unknown;
      const pending = s.service
        .snapshot({ providerId: 'openai-codex' })
        .then((value) => (settled = value));
      await jest.advanceTimersByTimeAsync(3_000);
      expect(settled).toBeUndefined();
      await jest.advanceTimersByTimeAsync(2_000);
      const result = await pending;

      expect(result.owners).toEqual([available(CODEX)]);
    });

    it('the push also gives Codex the longer deadline', async () => {
      const s = build();
      slowRead(s);

      const pending = s.service.currentSnapshot();
      await jest.advanceTimersByTimeAsync(5_000);

      await expect(pending).resolves.toMatchObject({
        owners: [{ owner: CODEX, status: 'available' }],
      });
    });

    it('still cuts a non-Codex owner read at 3 seconds', async () => {
      const s = build();
      slowRead(s);
      s.discoverTargets.mockResolvedValue([
        {
          kind: 'read',
          origin: 'selected-provider',
          target: { providerId: 'ollama-cloud', ownerRef: OLLAMA },
        },
      ]);
      const pending = s.service.snapshot({ providerId: 'ollama-cloud' });
      await jest.advanceTimersByTimeAsync(3_000);
      await expect(pending).resolves.toMatchObject({
        owners: [{ owner: OLLAMA, status: 'service-unavailable' }],
      });
    });
  });

  it('a provider lookup with no selected-provider owner reports no-owner', async () => {
    const s = build();
    await expect(
      s.service.ownerSnapshotForProvider('z-ai', false),
    ).resolves.toEqual({ kind: 'no-owner' });
  });

  it('preserves an unavailable selected-provider discovery', async () => {
    const s = build();
    s.discoverSelectedProvider.mockResolvedValue({ kind: 'unavailable' });

    await expect(
      s.service.ownerSnapshotForProvider('openai-codex', false),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('a failed read still lists the owner and logs only the error name', async () => {
    const s = build();
    s.discoverTargets.mockResolvedValue([
      {
        kind: 'read',
        origin: 'lane',
        target: { providerId: 'ollama-cloud', ownerRef: OLLAMA },
      },
    ]);
    s.getOwnerSnapshot.mockRejectedValue(new RangeError('body: secret-ish'));

    const result = await s.service.snapshot({});

    expect(result.owners).toEqual([
      {
        owner: OLLAMA,
        status: 'service-unavailable',
        windowSetEstablished: false,
        windows: [],
        ownerEvidence: [],
      },
    ]);
    expect(s.logger.debug).toHaveBeenCalledWith(
      '[PlanLimitsSnapshot] owner read ended without a snapshot',
      { providerId: 'ollama-cloud', reason: 'RangeError' },
    );
    expect(JSON.stringify(s.logger.debug.mock.calls)).not.toContain(
      'secret-ish',
    );
  });
});
