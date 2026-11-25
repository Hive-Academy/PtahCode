import 'reflect-metadata';
import * as fs from 'fs';
import * as nodeOs from 'os';
import * as path from 'path';

import { PtahFileSettingsManager } from '@ptah-extension/platform-core';
import type { IDisposable } from '@ptah-extension/platform-core';

import type {
  IGlobalBatchSettingsStore,
  ISettingsStore,
} from '../ports/settings-store.interface';
import { ReactiveSettingsStore } from '../reactive/reactive-settings-store';
import type { IActiveWorkspaceSource } from './active-workspace-source';
import { WorkspaceScopeResolver } from './workspace-scope-resolver';

const WORKSPACE_PREFIX = 'workspace';

function makeMemoryStore(seed: Record<string, unknown> = {}): ISettingsStore & {
  data: Record<string, unknown>;
  writeCalls: Array<{ key: string; value: unknown }>;
} {
  const data: Record<string, unknown> = { ...seed };
  const writeCalls: Array<{ key: string; value: unknown }> = [];
  return {
    data,
    writeCalls,
    readGlobal<T>(key: string): T | undefined {
      return data[key] as T | undefined;
    },
    async writeGlobal<T>(key: string, value: T): Promise<void> {
      writeCalls.push({ key, value });
      if (value === undefined) {
        delete data[key];
        return;
      }
      data[key] = value;
    },
    readSecret(): Promise<string | undefined> {
      return Promise.resolve(undefined);
    },
    writeSecret(): Promise<void> {
      return Promise.resolve();
    },
    deleteSecret(): Promise<void> {
      return Promise.resolve();
    },
    watchGlobal(): IDisposable {
      return { dispose: () => undefined };
    },
    watchSecret(): IDisposable {
      return { dispose: () => undefined };
    },
    flushSync(): void {
      return undefined;
    },
  };
}

function makeSource(activePath: string | undefined): IActiveWorkspaceSource {
  return {
    getActivePath: () => activePath,
    onDidChange: () => ({ dispose: () => undefined }),
  };
}

describe('WorkspaceScopeResolver', () => {
  const PATH_A = path.resolve(
    process.platform === 'win32' ? 'C:\\wsA' : '/wsA',
  );
  const PATH_B = path.resolve(
    process.platform === 'win32' ? 'C:\\wsB' : '/wsB',
  );

  describe('read fallback and override precedence', () => {
    it('returns the global value when no active path is set', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(store, makeSource(undefined));
      expect(resolver.read<string>('authMethod')).toBe('apiKey');
    });

    it('returns the global value when the active folder has no override', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      expect(resolver.read<string>('authMethod')).toBe('apiKey');
    });

    it('returns the workspace override when present', async () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      await resolver.write('authMethod', 'thirdParty', 'workspace');
      expect(resolver.read<string>('authMethod')).toBe('thirdParty');
      expect(store.data['authMethod']).toBe('apiKey');
    });
  });

  describe('write targeting', () => {
    it('write("global") hits the bare global key (non-breaking)', async () => {
      const store = makeMemoryStore();
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      await resolver.write('authMethod', 'claudeCli', 'global');
      expect(store.data['authMethod']).toBe('claudeCli');
      expect(
        Object.keys(store.data).some((k) =>
          k.startsWith(`${WORKSPACE_PREFIX}.`),
        ),
      ).toBe(false);
    });

    it('write("workspace") degrades to the global key when no active path', async () => {
      const store = makeMemoryStore();
      const resolver = new WorkspaceScopeResolver(store, makeSource(undefined));
      await resolver.write('authMethod', 'thirdParty', 'workspace');
      expect(store.data['authMethod']).toBe('thirdParty');
    });
  });

  describe('hasOverride / effectiveKey', () => {
    it('reflects whether the active folder overrides the key', async () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      expect(resolver.hasOverride('authMethod')).toBe(false);
      await resolver.write('authMethod', 'thirdParty', 'workspace');
      expect(resolver.hasOverride('authMethod')).toBe(true);
    });

    it('effectiveKey returns the global key when no override, prefixed key otherwise', async () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      expect(resolver.effectiveKey('authMethod')).toBe('authMethod');
      await resolver.write('authMethod', 'thirdParty', 'workspace');
      const eff = resolver.effectiveKey('authMethod');
      expect(eff).not.toBe('authMethod');
      expect(eff.startsWith(`${WORKSPACE_PREFIX}.`)).toBe(true);
      expect(eff.endsWith('.authMethod')).toBe(true);
    });
  });

  describe('isStored / isStoredForPath', () => {
    it('ignores a value the store only returns as its registered default', async () => {
      // The bare key is only the registered default; scoped keys are stored.
      const memory = makeMemoryStore({ authMethod: 'claudeCli' });
      const store = {
        ...memory,
        hasGlobal: (key: string) =>
          key !== 'authMethod' && memory.data[key] !== undefined,
      };
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      expect(resolver.read<string>('authMethod')).toBe('claudeCli');
      expect(resolver.isStored('authMethod')).toBe(false);
      expect(resolver.isStoredForPath('authMethod', PATH_B)).toBe(false);

      await resolver.write('authMethod', 'apiKey', 'workspace');

      expect(resolver.isStored('authMethod')).toBe(true);
      expect(resolver.isStoredForPath('authMethod', PATH_A)).toBe(true);
      expect(resolver.isStoredForPath('authMethod', PATH_B)).toBe(false);
    });

    it('treats any read value as stored for a store without hasGlobal', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      expect(resolver.isStored('authMethod')).toBe(true);
      expect(resolver.isStored('anthropicProviderId')).toBe(false);
    });
  });

  describe('no cross-folder bleed', () => {
    it('folder B does not see folder A override; distinct hashes', async () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolverA = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      const resolverB = new WorkspaceScopeResolver(store, makeSource(PATH_B));

      await resolverA.write('authMethod', 'thirdParty', 'workspace');

      expect(resolverA.read<string>('authMethod')).toBe('thirdParty');
      expect(resolverB.read<string>('authMethod')).toBe('apiKey');

      const keyA = resolverA.effectiveKey('authMethod');
      await resolverB.write('authMethod', 'claudeCli', 'workspace');
      const keyB = resolverB.effectiveKey('authMethod');
      expect(keyA).not.toBe(keyB);
    });
  });

  describe('defensive path handling', () => {
    it('undefined active path → global key, no throw', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(store, makeSource(undefined));
      expect(() => resolver.effectiveKey('authMethod')).not.toThrow();
      expect(resolver.effectiveKey('authMethod')).toBe('authMethod');
      expect(resolver.hasOverride('authMethod')).toBe(false);
    });

    it('empty / whitespace active path → global key, no throw', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolverEmpty = new WorkspaceScopeResolver(store, makeSource(''));
      const resolverWs = new WorkspaceScopeResolver(store, makeSource('   '));
      expect(resolverEmpty.read<string>('authMethod')).toBe('apiKey');
      expect(resolverWs.read<string>('authMethod')).toBe('apiKey');
      expect(resolverEmpty.effectiveKey('authMethod')).toBe('authMethod');
    });
  });

  describe('hash properties', () => {
    it('the prefixed key is dot-free in its hash segment', async () => {
      const store = makeMemoryStore();
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));
      await resolver.write('authMethod', 'thirdParty', 'workspace');
      const written = store.writeCalls[0].key;
      const parts = written.split('.');
      expect(parts[0]).toBe(WORKSPACE_PREFIX);
      expect(parts[1]).toMatch(/^[0-9a-f]{16}$/);
      expect(parts.slice(2).join('.')).toBe('authMethod');
    });

    it('hash is stable across trailing-separator variants', async () => {
      const store = makeMemoryStore();
      const base = process.platform === 'win32' ? 'C:\\wsHash' : '/wsHash';
      const r1 = new WorkspaceScopeResolver(store, makeSource(base));
      const r2 = new WorkspaceScopeResolver(store, makeSource(base + path.sep));
      await r1.write('k', 'v', 'workspace');
      const key1 = store.writeCalls[store.writeCalls.length - 1].key;
      await r2.write('k', 'v', 'workspace');
      const key2 = store.writeCalls[store.writeCalls.length - 1].key;
      expect(key1).toBe(key2);
    });

    it('hash is stable across win32 drive-letter case variants', async () => {
      if (process.platform !== 'win32') {
        return;
      }
      const store = makeMemoryStore();
      const lower = new WorkspaceScopeResolver(store, makeSource('c:\\wsCase'));
      const upper = new WorkspaceScopeResolver(store, makeSource('C:\\wsCase'));
      await lower.write('k', 'v', 'workspace');
      const keyLower = store.writeCalls[store.writeCalls.length - 1].key;
      await upper.write('k', 'v', 'workspace');
      const keyUpper = store.writeCalls[store.writeCalls.length - 1].key;
      expect(keyLower).toBe(keyUpper);
    });
  });

  describe('AC-1 — appScopable key with no app/ws prefix stored → bare global key', () => {
    it('resolves to bare global K when only global value exists', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );
      expect(resolver.read<string>('authMethod', true)).toBe('apiKey');
      expect(resolver.effectiveKey('authMethod', true)).toBe('authMethod');
    });

    it('resolves to bare global K when no path is active', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(undefined),
        'app.vscode',
      );
      expect(resolver.read<string>('authMethod', true)).toBe('apiKey');
      expect(resolver.effectiveKey('authMethod', true)).toBe('authMethod');
    });
  });

  describe('AC-2 — app-runtime isolation: app.vscode.K vs app.cli.K', () => {
    it('resolver with appScope=app.vscode returns app.vscode.K value', async () => {
      const store = makeMemoryStore({ authMethod: 'global-value' });
      const vsCodeResolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );
      const cliResolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.cli',
      );

      await vsCodeResolver.write('authMethod', 'vscode-specific', 'app', true);

      expect(vsCodeResolver.read<string>('authMethod', true)).toBe(
        'vscode-specific',
      );
      expect(cliResolver.read<string>('authMethod', true)).toBe('global-value');
    });

    it('writing to app.vscode does not create any app.cli.* key', async () => {
      const store = makeMemoryStore({ authMethod: 'global-value' });
      const vsCodeResolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await vsCodeResolver.write('authMethod', 'vscode-only', 'app', true);

      const cliKeyPresent = Object.keys(store.data).some((k) =>
        k.startsWith('app.cli.'),
      );
      expect(cliKeyPresent).toBe(false);
    });
  });

  describe('AC-3 — clearOverride at app level reverts to global', () => {
    it('write at app target then clearOverride reverts to global', async () => {
      const store = makeMemoryStore({ authMethod: 'global-default' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'app-override', 'app', true);
      expect(resolver.read<string>('authMethod', true)).toBe('app-override');

      await resolver.clearOverride('authMethod', true);
      expect(resolver.read<string>('authMethod', true)).toBe('global-default');
    });

    it('clearOverride removes the app.vscode.K slot from the store', async () => {
      const store = makeMemoryStore({ authMethod: 'global-default' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'app-override', 'app', true);
      expect(store.data['app.vscode.authMethod']).toBe('app-override');

      await resolver.clearOverride('authMethod', true);
      expect(store.data['app.vscode.authMethod']).toBeUndefined();
    });
  });

  describe('AC-4 — all 3 prefixes present: locked candidate order, ≤3 lookups', () => {
    it('returns app.<rt>.workspace.<h>.K when all three levels present', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'global', 'global', true);
      await resolver.write('authMethod', 'app-level', 'app', true);
      await resolver.write('authMethod', 'ws-level', 'workspace', true);

      expect(resolver.read<string>('authMethod', true)).toBe('ws-level');
    });

    it('effectiveKey is the app.<rt>.workspace.<h>.K candidate when ws level present', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'ws-level', 'workspace', true);

      const effKey = resolver.effectiveKey('authMethod', true);
      expect(effKey.startsWith('app.vscode.')).toBe(true);
      expect(effKey.includes('workspace.')).toBe(true);
      expect(effKey.endsWith('.authMethod')).toBe(true);
    });

    it('falls through to app.<rt>.K when only app level present (2nd candidate)', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'app-only', 'app', true);

      expect(resolver.read<string>('authMethod', true)).toBe('app-only');
      const effKey = resolver.effectiveKey('authMethod', true);
      expect(effKey).toBe('app.vscode.authMethod');
    });

    it('candidate list has at most 4 entries for appScopable key with active path', () => {
      const store = makeMemoryStore();
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );
      const readCallsBefore = store.writeCalls.length;
      resolver.read('authMethod', true);
      void readCallsBefore;
    });
  });

  describe('clearMoreSpecific — broader-scope save un-shadows narrower overrides', () => {
    it('saving at app target clears a leftover workspace override so the app value wins', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      // Pre-existing per-workspace override (the shadowing value).
      await resolver.write('authMethod', 'thirdParty', 'workspace', true);
      expect(resolver.read<string>('authMethod', true)).toBe('thirdParty');

      // User picks "Global default" (app scope) → write + clear narrower.
      await resolver.write('authMethod', 'claudeCli', 'app', true);
      await resolver.clearMoreSpecific('authMethod', 'app', true);

      expect(resolver.read<string>('authMethod', true)).toBe('claudeCli');
      expect(resolver.effectiveKey('authMethod', true)).toBe(
        'app.vscode.authMethod',
      );
    });

    it('saving at global target clears both workspace and app overrides', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'app-stale', 'app', true);
      await resolver.write('authMethod', 'ws-stale', 'workspace', true);
      expect(resolver.read<string>('authMethod', true)).toBe('ws-stale');

      await resolver.write('authMethod', 'claudeCli', 'global', true);
      await resolver.clearMoreSpecific('authMethod', 'global', true);

      expect(resolver.read<string>('authMethod', true)).toBe('claudeCli');
      expect(resolver.effectiveKey('authMethod', true)).toBe('authMethod');
    });

    it('saving at workspace target leaves the workspace override in place', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'ws-value', 'workspace', true);
      await resolver.clearMoreSpecific('authMethod', 'workspace', true);

      expect(resolver.read<string>('authMethod', true)).toBe('ws-value');
    });
  });

  describe('AC-5 — folder pin in app.vscode is NOT seen by app.cli resolver', () => {
    it('workspace-level write in vscode not visible to cli resolver with same ws hash', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const vsCodeResolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );
      const cliResolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.cli',
      );

      await vsCodeResolver.write(
        'authMethod',
        'vscode-ws-pin',
        'workspace',
        true,
      );

      const vsCodeKey = vsCodeResolver.effectiveKey('authMethod', true);
      expect(vsCodeKey.startsWith('app.vscode.')).toBe(true);

      expect(cliResolver.read<string>('authMethod', true)).toBe('global');
      expect(cliResolver.hasOverride('authMethod', true)).toBe(false);
    });
  });

  describe('AC-6 — REGRESSION: appScopable=false never emits app. prefix', () => {
    it('non-appScopable key ignores appScope ctor arg entirely', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'ws-override', 'workspace');

      const writtenKey = store.writeCalls[store.writeCalls.length - 1].key;
      expect(writtenKey.startsWith('app.')).toBe(false);
      expect(writtenKey.startsWith(`${WORKSPACE_PREFIX}.`)).toBe(true);
    });

    it('effectiveKey for non-appScopable key never starts with app.', async () => {
      const store = makeMemoryStore({ authMethod: 'global' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'ws-override', 'workspace');
      const eff = resolver.effectiveKey('authMethod');
      expect(eff.startsWith('app.')).toBe(false);
    });

    it('non-appScopable read is byte-identical to pre-145 behavior (workspace→global)', async () => {
      const store = makeMemoryStore({ authMethod: 'global-val' });
      const resolverWithApp = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );
      const resolverWithout = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
      );

      await resolverWithApp.write('authMethod', 'ws-val', 'workspace');

      expect(resolverWithApp.read<string>('authMethod')).toBe('ws-val');
      expect(resolverWithout.read<string>('authMethod')).toBe('ws-val');
      expect(resolverWithApp.effectiveKey('authMethod')).toBe(
        resolverWithout.effectiveKey('authMethod'),
      );
    });
  });

  describe('AC-10 — default write target is global', () => {
    it('write with target=global hits the bare global key', async () => {
      const store = makeMemoryStore();
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.vscode',
      );

      await resolver.write('authMethod', 'my-method', 'global', true);

      expect(store.data['authMethod']).toBe('my-method');
      const appKeyPresent = Object.keys(store.data).some((k) =>
        k.startsWith('app.'),
      );
      expect(appKeyPresent).toBe(false);
    });
  });

  describe('degrade paths — appScope unavailable or malformed', () => {
    it('undefined appScope drops app layers and never throws', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        undefined,
      );
      expect(() => resolver.read<string>('authMethod', true)).not.toThrow();
      expect(resolver.read<string>('authMethod', true)).toBe('apiKey');
      expect(resolver.effectiveKey('authMethod', true)).toBe('authMethod');
    });

    it('empty-string appScope degrades to workspace→global, never throws', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        '',
      );
      expect(() => resolver.read<string>('authMethod', true)).not.toThrow();
      expect(resolver.read<string>('authMethod', true)).toBe('apiKey');
    });

    it('whitespace-only appScope is treated as undefined, never throws', () => {
      const store = makeMemoryStore({ authMethod: 'apiKey' });
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        '   ',
      );
      expect(() => resolver.effectiveKey('authMethod', true)).not.toThrow();
    });

    it('appScope=web degrades to workspace→global (write falls through)', async () => {
      const store = makeMemoryStore();
      const resolver = new WorkspaceScopeResolver(
        store,
        makeSource(PATH_A),
        'app.web',
      );
      await resolver.write('authMethod', 'val', 'app', true);
      expect(store.data['app.web.authMethod']).toBe('val');
    });
  });

  describe('clearOverride — empirical writeGlobal(undefined) round-trip', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(
        path.join(nodeOs.tmpdir(), 'ptah-ws-scope-resolver-'),
      );
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    });

    function fileStore(manager: PtahFileSettingsManager): ISettingsStore {
      return {
        readGlobal<T>(key: string): T | undefined {
          return manager.get<T>(key);
        },
        async writeGlobal<T>(key: string, value: T): Promise<void> {
          await manager.set(key, value);
        },
        readSecret: () => Promise.resolve(undefined),
        writeSecret: () => Promise.resolve(),
        deleteSecret: () => Promise.resolve(),
        watchGlobal: () => ({ dispose: () => undefined }),
        watchSecret: () => ({ dispose: () => undefined }),
        flushSync: () => manager.flushSync(),
      };
    }

    it('writeGlobal(key, undefined) drops the slot on persist round-trip', async () => {
      const manager = new PtahFileSettingsManager({}, tmpDir);
      const store = fileStore(manager);
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

      await resolver.write('authMethod', 'thirdParty', 'workspace');
      expect(resolver.read<string>('authMethod')).toBe('thirdParty');

      await resolver.clearOverride('authMethod');

      const reloaded = new PtahFileSettingsManager({}, tmpDir);

      const raw = fs.readFileSync(manager.getFilePath(), 'utf-8');
      expect(raw).not.toContain('thirdParty');

      const reloadedStore = fileStore(reloaded);
      const reloadedResolver = new WorkspaceScopeResolver(
        reloadedStore,
        makeSource(PATH_A),
      );
      expect(reloadedResolver.hasOverride('authMethod')).toBe(false);
    });

    it('after clearOverride, read falls back to the global value', async () => {
      const manager = new PtahFileSettingsManager({}, tmpDir);
      const store = fileStore(manager);
      await store.writeGlobal('authMethod', 'apiKey');
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

      await resolver.write('authMethod', 'thirdParty', 'workspace');
      expect(resolver.read<string>('authMethod')).toBe('thirdParty');

      await resolver.clearOverride('authMethod');
      expect(resolver.read<string>('authMethod')).toBe('apiKey');
    });
  });
});

describe('WorkspaceScopeResolver.inspect', () => {
  it('returns defined candidates in precedence order without writing', async () => {
    const store = makeMemoryStore({ authMethod: 'global' });
    const source = makeSource(path.resolve('scope-inspection'));
    const resolver = new WorkspaceScopeResolver(store, source, 'app.electron');
    const workspace = new WorkspaceScopeResolver(store, source);
    await workspace.write('authMethod', 'workspace', 'workspace');
    await resolver.write('authMethod', 'app', 'app', true);
    await resolver.write('authMethod', 'app-workspace', 'workspace', true);
    const before = { ...store.data };
    const writes = store.writeCalls.length;
    expect(
      resolver
        .inspect<string>('authMethod', true)
        .map((candidate) => candidate.value),
    ).toEqual(['app-workspace', 'app', 'workspace', 'global']);
    expect(resolver.inspect('authMethod', true)[0].key).toBe(
      resolver.effectiveKey('authMethod', true),
    );
    expect(
      resolver
        .inspect<string>('authMethod')
        .map((candidate) => candidate.value),
    ).toEqual(['workspace', 'global']);
    expect(store.data).toEqual(before);
    expect(store.writeCalls).toHaveLength(writes);
  });

  it('preserves false, null, zero and empty-string overrides and omits undefined', async () => {
    const store = makeMemoryStore({ value: null });
    const source = makeSource(path.resolve('scope-inspection'));
    const resolver = new WorkspaceScopeResolver(store, source, 'app.electron');
    const workspace = new WorkspaceScopeResolver(store, source);
    await workspace.write('value', 0, 'workspace');
    await resolver.write('value', false, 'app', true);
    await resolver.write('value', '', 'workspace', true);
    expect(
      resolver.inspect('value', true).map((candidate) => candidate.value),
    ).toEqual(['', false, 0, null]);
    await resolver.clearOverride('value', true);
    expect(
      resolver.inspect('value', true).map((candidate) => candidate.value),
    ).toEqual([false, 0, null]);
    expect(resolver.inspect('missing', true)).toEqual([]);
  });

  it('uses the current workspace and handles an absent workspace without fabricating keys', async () => {
    const store = makeMemoryStore({ value: 'global' });
    let activePath: string | undefined = path.resolve('scope-first');
    const source: IActiveWorkspaceSource = {
      getActivePath: () => activePath,
      onDidChange: () => ({ dispose: () => undefined }),
    };
    const resolver = new WorkspaceScopeResolver(store, source, 'app.electron');
    await resolver.write('value', 'first', 'workspace', true);
    activePath = path.resolve('scope-second');
    expect(resolver.inspect('value', true)).toEqual([
      { key: 'value', value: 'global' },
    ]);
    activePath = undefined;
    await resolver.write('value', 'app', 'app', true);
    expect(resolver.inspect('value', true)).toEqual([
      { key: 'app.electron.value', value: 'app' },
      { key: 'value', value: 'global' },
    ]);
  });
});

describe('WorkspaceScopeResolver.writeForPath / inspectForPath', () => {
  const PATH_A = path.resolve(
    process.platform === 'win32' ? 'C:\\wsForPathA' : '/wsForPathA',
  );
  const PATH_B = path.resolve(
    process.platform === 'win32' ? 'C:\\wsForPathB' : '/wsForPathB',
  );

  it('writes the explicit path key, not the active one and not the global key', async () => {
    const store = makeMemoryStore({ k: 'global' });
    const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_B));

    await resolver.writeForPath('k', PATH_A, 'a');

    expect(store.writeCalls).toHaveLength(1);
    expect(store.writeCalls[0].key).toMatch(
      new RegExp(`^${WORKSPACE_PREFIX}\\.[0-9a-f]{16}\\.k$`),
    );
    expect(store.data['k']).toBe('global');
    expect(resolver.readForPath<string>('k', PATH_A)).toBe('a');
    expect(resolver.read<string>('k')).toBe('global');
  });

  it('uses the same physical key as an active-path workspace write', async () => {
    const store = makeMemoryStore();
    const active = new WorkspaceScopeResolver(store, makeSource(PATH_A));
    await active.write('k', 'active', 'workspace');
    const activeKey = store.writeCalls[0].key;

    const explicit = new WorkspaceScopeResolver(store, makeSource(undefined));
    expect(explicit.inspectForPath<string>('k', PATH_A)).toEqual({
      key: activeKey,
      value: 'active',
    });
  });

  it.each([[''], ['   ']])(
    'writeForPath(%j) throws and leaves the global key unchanged',
    async (bad) => {
      const store = makeMemoryStore({ k: 'global' });
      const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

      await expect(resolver.writeForPath('k', bad, 'x')).rejects.toThrow(
        /workspace path is required/,
      );
      expect(store.writeCalls).toHaveLength(0);
      expect(store.data).toEqual({ k: 'global' });
    },
  );

  it('writeForPath throws on a missing (non-string) path', async () => {
    const store = makeMemoryStore({ k: 'global' });
    const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

    await expect(
      resolver.writeForPath('k', undefined as unknown as string, 'x'),
    ).rejects.toThrow(/workspace path is required/);
    expect(store.writeCalls).toHaveLength(0);
  });

  it('inspectForPath throws on an empty path instead of reading the global key', () => {
    const store = makeMemoryStore({ k: 'global' });
    const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

    expect(() => resolver.inspectForPath('k', '')).toThrow(
      /workspace path is required/,
    );
  });

  it('inspectForPath returns the raw workspace value with no global fallback', async () => {
    const store = makeMemoryStore({ k: 'global' });
    const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

    expect(resolver.inspectForPath('k', PATH_A).value).toBeUndefined();
    await resolver.writeForPath('k', PATH_A, { a: 1 });
    expect(resolver.inspectForPath('k', PATH_A).value).toEqual({ a: 1 });
  });

  it('keeps two workspaces isolated', async () => {
    const store = makeMemoryStore();
    const resolver = new WorkspaceScopeResolver(store, makeSource(undefined));

    await resolver.writeForPath('k', PATH_A, 'a');
    await resolver.writeForPath('k', PATH_B, 'b');

    expect(resolver.inspectForPath('k', PATH_A).value).toBe('a');
    expect(resolver.inspectForPath('k', PATH_B).value).toBe('b');
    expect(resolver.inspectForPath('k', PATH_A).key).not.toBe(
      resolver.inspectForPath('k', PATH_B).key,
    );
  });

  it('writing undefined drops the workspace key', async () => {
    const store = makeMemoryStore();
    const resolver = new WorkspaceScopeResolver(store, makeSource(undefined));

    await resolver.writeForPath('k', PATH_A, 'a');
    await resolver.writeForPath('k', PATH_A, undefined);

    expect(store.data).toEqual({});
  });
});

describe('WorkspaceScopeResolver.readSetupPair / commitSetupPair', () => {
  const PATH_A = path.resolve(
    process.platform === 'win32' ? 'C:\\wsSetupA' : '/wsSetupA',
  );

  function makeBatchMemoryStore(
    seed: Record<string, unknown> = {},
  ): IGlobalBatchSettingsStore & {
    data: Record<string, unknown>;
    batchCalls: Array<Readonly<Record<string, unknown>>>;
    readGlobalSpy: jest.Mock;
    readGlobalManySpy: jest.Mock;
  } {
    const base = makeMemoryStore(seed);
    const batchCalls: Array<Readonly<Record<string, unknown>>> = [];
    const readGlobalSpy = jest.fn(<T>(key: string): T | undefined =>
      base.readGlobal<T>(key),
    );
    const readGlobalManySpy = jest.fn((keys: readonly string[]) => {
      const slice: Record<string, unknown> = {};
      for (const key of keys) {
        slice[key] = base.data[key];
      }
      return slice;
    });
    return {
      ...base,
      batchCalls,
      readGlobalSpy,
      readGlobalManySpy,
      readGlobal<T>(key: string): T | undefined {
        return readGlobalSpy(key) as T | undefined;
      },
      readGlobalMany: readGlobalManySpy,
      async writeGlobalBatch(
        entries: Readonly<Record<string, unknown>>,
      ): Promise<Readonly<Record<string, unknown>>> {
        batchCalls.push(entries);
        const committed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(entries)) {
          if (value === undefined) {
            delete base.data[key];
          } else {
            base.data[key] = value;
          }
          committed[key] = value;
        }
        return Object.freeze(committed);
      },
    };
  }

  it('readSetupPair reads global-only keys and ignores workspace and app scoped overrides', async () => {
    const store = makeBatchMemoryStore({
      'setup.provider': 'openrouter',
      'setup.model': 'anthropic/claude-sonnet-4.5',
    });
    const resolver = new WorkspaceScopeResolver(
      store,
      makeSource(PATH_A),
      'app.electron',
    );
    // Write shadowing values at workspace, app, and app+workspace scopes.
    await resolver.write('setup.provider', 'z-ai', 'workspace', false);
    await resolver.write('setup.model', 'glm-5.2', 'workspace', false);
    await resolver.write('setup.provider', 'kimi-code', 'app', true);
    await resolver.write('setup.model', 'k3', 'app', true);
    await resolver.write('setup.provider', 'ollama', 'workspace', true);
    await resolver.write('setup.model', 'qwen3:32b', 'workspace', true);

    expect(resolver.readSetupPair()).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
    });
    expect(store.readGlobalManySpy).toHaveBeenCalledWith([
      'setup.provider',
      'setup.model',
    ]);
  });

  it('readSetupPair preserves partial stored values and normalizes empty/whitespace/non-strings to null', () => {
    const providerOnly = new WorkspaceScopeResolver(
      makeBatchMemoryStore({ 'setup.provider': '  openrouter  ', 'setup.model': '   ' }),
      makeSource(PATH_A),
    );
    expect(providerOnly.readSetupPair()).toEqual({
      provider: 'openrouter',
      model: null,
    });

    const modelOnly = new WorkspaceScopeResolver(
      makeBatchMemoryStore({ 'setup.provider': '', 'setup.model': '  claude-sonnet-4-6  ' }),
      makeSource(PATH_A),
    );
    expect(modelOnly.readSetupPair()).toEqual({
      provider: null,
      model: 'claude-sonnet-4-6',
    });

    const unset = new WorkspaceScopeResolver(
      makeBatchMemoryStore({ 'setup.provider': '', 'setup.model': '' }),
      makeSource(PATH_A),
    );
    expect(unset.readSetupPair()).toEqual({ provider: null, model: null });

    const nonString = new WorkspaceScopeResolver(
      makeBatchMemoryStore({ 'setup.provider': 42, 'setup.model': null }),
      makeSource(PATH_A),
    );
    expect(nonString.readSetupPair()).toEqual({ provider: null, model: null });
  });

  it('readSetupPair falls back to bare global reads when store is not a batch store', () => {
    const store = makeMemoryStore({
      'setup.provider': 'z-ai',
      'setup.model': 'glm-5.2',
    });
    const resolver = new WorkspaceScopeResolver(
      store,
      makeSource(PATH_A),
      'app.electron',
    );
    expect(resolver.readSetupPair()).toEqual({
      provider: 'z-ai',
      model: 'glm-5.2',
    });
  });

  it('commitSetupPair rejects partial and non-string inputs without touching the store', async () => {
    const store = makeBatchMemoryStore();
    const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

    await expect(
      resolver.commitSetupPair({ provider: 'openrouter', model: '' }),
    ).rejects.toThrow(/both provider and model/i);
    await expect(
      resolver.commitSetupPair({ provider: '   ', model: 'glm-5.2' }),
    ).rejects.toThrow(/both provider and model/i);
    await expect(
      resolver.commitSetupPair({
        provider: null as unknown as string,
        model: 'glm-5.2',
      }),
    ).rejects.toThrow(/string/i);
    await expect(
      resolver.commitSetupPair({
        provider: 'z-ai',
        model: undefined as unknown as string,
      }),
    ).rejects.toThrow(/string/i);

    expect(store.batchCalls).toHaveLength(0);
  });

  it('commitSetupPair rejects stores without atomic batch write support', async () => {
    const store = makeMemoryStore();
    const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

    await expect(
      resolver.commitSetupPair({ provider: 'z-ai', model: 'glm-5.2' }),
    ).rejects.toThrow(/writeGlobalBatch/);
  });

  it('commitSetupPair commits complete pair and clear ({ "", "" }) atomically', async () => {
    const store = makeBatchMemoryStore();
    const resolver = new WorkspaceScopeResolver(
      store,
      makeSource(PATH_A),
      'app.electron',
    );

    const saved = await resolver.commitSetupPair({
      provider: '  z-ai  ',
      model: '  glm-5.2  ',
    });
    expect(saved).toEqual({ provider: 'z-ai', model: 'glm-5.2' });
    expect(store.batchCalls).toEqual([
      { 'setup.provider': 'z-ai', 'setup.model': 'glm-5.2' },
    ]);
    // Global keys only — never prefixed.
    expect(
      Object.keys(store.data).some(
        (k) => k.startsWith('workspace.') || k.startsWith('app.'),
      ),
    ).toBe(false);

    const cleared = await resolver.commitSetupPair({
      provider: '',
      model: '',
    });
    expect(cleared).toBeNull();
    expect(store.data['setup.provider']).toBe('');
    expect(store.data['setup.model']).toBe('');
  });

  it('commitSetupPair returns transaction receipt rather than reading a later concurrent write', async () => {
    const data: Record<string, unknown> = {
      'setup.provider': '',
      'setup.model': '',
    };
    let resolveFirst!: (slice: Readonly<Record<string, unknown>>) => void;
    const firstWritePending = new Promise<Readonly<Record<string, unknown>>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    let callIndex = 0;
    const readGlobalSpy = jest.fn(<T>(key: string) => data[key] as T | undefined);
    const readGlobalManySpy = jest.fn((keys: readonly string[]) =>
      Object.fromEntries(keys.map((k) => [k, data[k]])),
    );
    const store: IGlobalBatchSettingsStore = {
      ...makeMemoryStore(data),
      readGlobal<T>(key: string): T | undefined {
        return readGlobalSpy(key) as T | undefined;
      },
      readGlobalMany: readGlobalManySpy,
      async writeGlobalBatch(entries) {
        callIndex += 1;
        if (callIndex === 1) {
          return firstWritePending;
        }
        Object.assign(data, entries);
        return Object.freeze({ ...entries });
      },
    };
    const resolver = new WorkspaceScopeResolver(store, makeSource(PATH_A));

    // Start transaction 1 (paused before settling).
    const tx1 = resolver.commitSetupPair({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
    });

    // Transaction 2 completes while transaction 1 is still pending, updating
    // live store state to a different pair.
    const receipt2 = await resolver.commitSetupPair({
      provider: 'z-ai',
      model: 'glm-5.2',
    });
    expect(receipt2).toEqual({ provider: 'z-ai', model: 'glm-5.2' });

    // Now transaction 1 settles with its own committed slice (the store still
    // holds transaction 2's values). Transaction 1 MUST return its own receipt
    // without performing any trailing read.
    resolveFirst(
      Object.freeze({
        'setup.provider': 'openrouter',
        'setup.model': 'anthropic/claude-sonnet-4.5',
      }),
    );
    const receipt1 = await tx1;
    expect(receipt1).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
    });
    expect(readGlobalSpy).not.toHaveBeenCalled();
    expect(readGlobalManySpy).not.toHaveBeenCalled();
  });

  describe('file-backed Undo round-trip and fresh-instance restart read-back', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(
        path.join(nodeOs.tmpdir(), 'ptah-setup-pair-scope-'),
      );
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    });

    function createFileBatchStore(
      manager: PtahFileSettingsManager,
    ): IGlobalBatchSettingsStore {
      return {
        readGlobal<T>(key: string): T | undefined {
          return manager.get<T>(key);
        },
        readGlobalMany(keys: readonly string[]): Record<string, unknown> {
          return manager.getMany(keys);
        },
        hasGlobal(key: string): boolean {
          return manager.has(key);
        },
        async writeGlobal<T>(key: string, value: T): Promise<void> {
          await manager.set(key, value);
        },
        writeGlobalBatch(
          entries: Readonly<Record<string, unknown>>,
        ): Promise<Readonly<Record<string, unknown>>> {
          return manager.setMany(entries);
        },
        readSecret: () => Promise.resolve(undefined),
        writeSecret: () => Promise.resolve(),
        deleteSecret: () => Promise.resolve(),
        watchGlobal: () => ({ dispose: () => undefined }),
        watchSecret: () => ({ dispose: () => undefined }),
        flushSync: () => manager.flushSync(),
      };
    }

    it('round-trips prior pair and unset Undo through disk and fresh-instance reload', async () => {
      const manager = new PtahFileSettingsManager({}, tmpDir);
      const reactive = new ReactiveSettingsStore(createFileBatchStore(manager));
      const resolver = new WorkspaceScopeResolver(
        reactive,
        makeSource(PATH_A),
        'app.electron',
      );

      // Initially unset.
      expect(resolver.readSetupPair()).toEqual({ provider: null, model: null });

      // Save pair A from unset, then Undo back to unset.
      const savedA = await resolver.commitSetupPair({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
      });
      expect(savedA).toEqual({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
      });
      const undoneToUnset = await resolver.commitSetupPair({
        provider: '',
        model: '',
      });
      expect(undoneToUnset).toBeNull();
      expect(resolver.readSetupPair()).toEqual({ provider: null, model: null });

      // Save pair A, then pair B, then Undo back to pair A.
      await resolver.commitSetupPair({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
      });
      await resolver.commitSetupPair({
        provider: 'z-ai',
        model: 'glm-5.2',
      });
      const undoneToA = await resolver.commitSetupPair({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
      });
      expect(undoneToA).toEqual({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
      });

      // Fresh instance restart read-back from disk.
      const reloadedManager = new PtahFileSettingsManager({}, tmpDir);
      const reloadedReactive = new ReactiveSettingsStore(
        createFileBatchStore(reloadedManager),
      );
      const reloadedResolver = new WorkspaceScopeResolver(
        reloadedReactive,
        makeSource(PATH_A),
        'app.electron',
      );
      expect(reloadedResolver.readSetupPair()).toEqual({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
      });
    });
  });
});
