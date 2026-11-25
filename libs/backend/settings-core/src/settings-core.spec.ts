/**
 * settings-core comprehensive test suite.
 *
 * TC-1  through TC-14: settings-core lib internals.
 * TC-18: isolation guarantee (zero call sites outside the lib).
 *
 * TC-15 / TC-16 for PtahFileSettingsManager.watch() live in
 *   libs/backend/platform-core/src/file-settings-manager.spec.ts.
 * TC-17 for adapter sentinels lives in
 *   libs/backend/platform-electron/src/settings/file-settings-store.spec.ts.
 */

import 'reflect-metadata';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as nodeOs from 'os';
import * as path from 'path';
import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Sandbox homedir for migration tests that touch the filesystem.
// ---------------------------------------------------------------------------

const mockTestHome = fs.mkdtempSync(
  path.join(nodeOs.tmpdir(), 'ptah-settings-core-spec-'),
);

afterAll(() => {
  try {
    fs.rmSync(mockTestHome, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { defineSetting } from './schema/definition';
import { SecretsFileStore } from './encryption/secrets-file-store';
import type { IMasterKeyProvider } from '@ptah-extension/platform-core';
import { GatewaySettings } from './repositories/gateway-settings';
import { SETTINGS_SCHEMA } from './schema/index';
import { AUTH_METHOD_DEF } from './schema/auth-schema';
import { ReactiveSettingsStore } from './reactive/reactive-settings-store';
import { BaseSettingsRepository } from './repositories/base-repository';
import { ComputedSettingHandle } from './repositories/computed-setting-handle';
import { MigrationRunner } from './migrations/runner';
import { runV2Migration } from './migrations/v2-migration';
import {
  resolveAuthProviderKey,
  FILE_BASED_SETTINGS_KEYS,
  FILE_BASED_SETTINGS_DEFAULTS,
  PtahFileSettingsManager,
} from '@ptah-extension/platform-core';
import {
  isGlobalBatchSettingsStore,
  type IGlobalBatchSettingsStore,
  type ISettingsStore,
} from './ports/settings-store.interface';
import type { IDisposable } from '@ptah-extension/platform-core';
import { providerSelectedModelDef } from './schema/provider-schema';
import { ModelSettings } from './repositories/model-settings';
import {
  WorkspaceScopeResolver,
  appScopePrefixFor,
} from './scope/workspace-scope-resolver';

// ---------------------------------------------------------------------------
// Shared mock store — avoids TS generic overload issues by using a hand-built
// object that conforms to ISettingsStore without jest.Mocked<> complications.
// ---------------------------------------------------------------------------

interface MockStore extends ISettingsStore {
  _fire(key: string, value: unknown): void;
  _writeGlobalCalls: Array<{ key: string; value: unknown }>;
}

function makeMockStore(globalData: Record<string, unknown> = {}): MockStore {
  const data = { ...globalData };
  const watchers = new Map<string, Set<(v: unknown) => void>>();
  const writeGlobalCalls: Array<{ key: string; value: unknown }> = [];

  const store: MockStore = {
    _writeGlobalCalls: writeGlobalCalls,

    readGlobal<T>(key: string): T | undefined {
      return data[key] as T | undefined;
    },

    async writeGlobal<T>(key: string, value: T): Promise<void> {
      data[key] = value;
      writeGlobalCalls.push({ key, value: value as unknown });
      watchers.get(key)?.forEach((cb) => cb(value as unknown));
    },

    readSecret(_key: string): Promise<string | undefined> {
      throw new Error('Phase 4');
    },

    writeSecret(_key: string, _ciphertext: string): Promise<void> {
      throw new Error('Phase 4');
    },

    deleteSecret(_key: string): Promise<void> {
      throw new Error('Phase 4');
    },

    watchGlobal(key: string, cb: (value: unknown) => void): IDisposable {
      if (!watchers.has(key)) watchers.set(key, new Set());
      watchers.get(key)!.add(cb);
      return {
        dispose: () => {
          watchers.get(key)?.delete(cb);
        },
      };
    },

    watchSecret(_key: string, _cb: () => void): IDisposable {
      return { dispose: () => {} };
    },

    flushSync(): void {
      // no-op for tests
    },

    _fire(key: string, value: unknown): void {
      data[key] = value;
      watchers.get(key)?.forEach((cb) => cb(value));
    },
  };

  return store;
}

// ---------------------------------------------------------------------------
// TC-1: Schema sanity — every definition has required fields, no duplicate keys
// ---------------------------------------------------------------------------

describe('TC-1: SETTINGS_SCHEMA sanity', () => {
  const requiredFields = [
    'key',
    'scope',
    'sensitivity',
    'schema',
    'default',
    'sinceVersion',
  ];

  it('every definition has all required fields', () => {
    expect(SETTINGS_SCHEMA.length).toBeGreaterThan(0);
    for (const def of SETTINGS_SCHEMA) {
      for (const field of requiredFields) {
        expect(def).toHaveProperty(field);
      }
    }
  });

  it('no duplicate keys in SETTINGS_SCHEMA', () => {
    const keys = (SETTINGS_SCHEMA as Array<{ key: string }>).map((d) => d.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('all scope values are valid', () => {
    const validScopes = new Set(['global', 'secret', 'session']);
    for (const def of SETTINGS_SCHEMA as Array<{ scope: string }>) {
      expect(validScopes.has(def.scope)).toBe(true);
    }
  });

  it('all sensitivity values are valid', () => {
    const validSensitivities = new Set(['plain', 'encrypted', 'secret']);
    for (const def of SETTINGS_SCHEMA as Array<{ sensitivity: string }>) {
      expect(validSensitivities.has(def.sensitivity)).toBe(true);
    }
  });

  it('sinceVersion is a positive integer for all definitions', () => {
    for (const def of SETTINGS_SCHEMA as Array<{ sinceVersion: unknown }>) {
      expect(typeof def.sinceVersion).toBe('number');
      expect(def.sinceVersion as number).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-2: defineSetting produces frozen definitions
// ---------------------------------------------------------------------------

describe('TC-2: defineSetting returns frozen objects', () => {
  it('Object.isFrozen returns true for AUTH_METHOD_DEF', () => {
    expect(Object.isFrozen(AUTH_METHOD_DEF)).toBe(true);
  });

  it('a custom definition produced by defineSetting is also frozen', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { z } = require('zod') as typeof import('zod');
    const def = defineSetting({
      key: 'test.frozen',
      scope: 'global',
      sensitivity: 'plain',
      schema: z.string(),
      default: 'default-value',
      sinceVersion: 1,
    });
    expect(Object.isFrozen(def)).toBe(true);
  });

  it('frozen definition throws when mutation is attempted in strict mode', () => {
    expect(() => {
      (AUTH_METHOD_DEF as unknown as Record<string, unknown>)['key'] =
        'mutated';
    }).toThrow();
    expect(AUTH_METHOD_DEF.key).toBe('authMethod');
  });
});

// ---------------------------------------------------------------------------
// TC-3: ReactiveSettingsStore fires listeners on write
// ---------------------------------------------------------------------------

describe('TC-3: ReactiveSettingsStore fires listeners on writeGlobal', () => {
  it('watcher callback is called with the written value', async () => {
    const backend = makeMockStore();
    const store = new ReactiveSettingsStore(backend);

    const received: unknown[] = [];
    store.watchGlobal('foo', (v) => received.push(v));

    await store.writeGlobal('foo', 'bar');

    expect(received).toEqual(['bar']);
  });
});

// ---------------------------------------------------------------------------
// TC-4: ReactiveSettingsStore — watchers only fire for the watched key
// ---------------------------------------------------------------------------

describe('TC-4: ReactiveSettingsStore listener isolation', () => {
  it('only the watcher for the written key fires', async () => {
    const backend = makeMockStore();
    const store = new ReactiveSettingsStore(backend);

    const receivedFoo: unknown[] = [];
    const receivedBaz: unknown[] = [];
    store.watchGlobal('foo', (v) => receivedFoo.push(v));
    store.watchGlobal('baz', (v) => receivedBaz.push(v));

    await store.writeGlobal('foo', 'updated');

    expect(receivedFoo).toEqual(['updated']);
    expect(receivedBaz).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-5: SettingHandle.get() returns schema default when store is empty
// ---------------------------------------------------------------------------

describe('TC-5: SettingHandle.get() returns definition default for empty store', () => {
  it('returns the AUTH_METHOD_DEF default ("claudeCli") when nothing is stored', () => {
    class TestRepo extends BaseSettingsRepository {
      public readonly handle = this.handleFor(AUTH_METHOD_DEF);
    }
    const testRepo = new TestRepo(makeMockStore({}));
    expect(testRepo.handle.get()).toBe('claudeCli');
  });
});

// ---------------------------------------------------------------------------
// TC-6: SettingHandle.set() validates via Zod — throws ZodError for invalid value
// ---------------------------------------------------------------------------

describe('TC-6: SettingHandle.set() throws ZodError for invalid enum value', () => {
  it('rejects an invalid auth method value before reaching the store', async () => {
    const backend = makeMockStore();
    class TestRepo extends BaseSettingsRepository {
      public readonly handle = this.handleFor(AUTH_METHOD_DEF);
    }
    const repo = new TestRepo(backend);

    await expect(
      repo.handle.set('invalid-enum-value' as 'apiKey'),
    ).rejects.toThrow(ZodError);

    // writeGlobal must NOT have been called.
    expect(backend._writeGlobalCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-7: ComputedSettingHandle.get() resolves via authMethod + providerId
// ---------------------------------------------------------------------------

describe('TC-7: ComputedSettingHandle.get() resolves through auth context', () => {
  it('returns the provider-scoped value when store has the computed key', () => {
    const backend = makeMockStore({
      authMethod: 'thirdParty',
      anthropicProviderId: 'openrouter',
      'provider.thirdParty.openrouter.selectedModel': 'mistral-7b',
    });

    const resolveKey = () => {
      const authMethod = backend.readGlobal<string>('authMethod') ?? 'apiKey';
      const providerId =
        backend.readGlobal<string>('anthropicProviderId') ?? '';
      const authKey = resolveAuthProviderKey(authMethod, providerId);
      return `provider.${authKey}.selectedModel`;
    };

    const handle = new ComputedSettingHandle(
      backend,
      providerSelectedModelDef('apiKey'),
      resolveKey,
      'authMethod',
      'anthropicProviderId',
    );

    expect(handle.get()).toBe('mistral-7b');
  });
});

// ---------------------------------------------------------------------------
// TC-8: ComputedSettingHandle.set() writes to the correct provider-scoped key
// ---------------------------------------------------------------------------

describe('TC-8: ComputedSettingHandle.set() writes to provider-scoped key', () => {
  it('calls writeGlobal with the resolved provider key', async () => {
    const backend = makeMockStore({
      authMethod: 'thirdParty',
      anthropicProviderId: 'openrouter',
    });

    const resolveKey = () => {
      const authMethod = backend.readGlobal<string>('authMethod') ?? 'apiKey';
      const providerId =
        backend.readGlobal<string>('anthropicProviderId') ?? '';
      const authKey = resolveAuthProviderKey(authMethod, providerId);
      return `provider.${authKey}.selectedModel`;
    };

    const handle = new ComputedSettingHandle(
      backend,
      providerSelectedModelDef('apiKey'),
      resolveKey,
      'authMethod',
      'anthropicProviderId',
    );

    await handle.set('claude-3');

    expect(backend._writeGlobalCalls).toContainEqual({
      key: 'provider.thirdParty.openrouter.selectedModel',
      value: 'claude-3',
    });
  });
});

// ---------------------------------------------------------------------------
// TC-9: ComputedSettingHandle.get() falls back when no value stored
// ---------------------------------------------------------------------------

describe('TC-9: ComputedSettingHandle.get() falls back to definition default', () => {
  it('returns the definition default when the resolved key has no stored value', () => {
    const backend = makeMockStore({
      authMethod: 'thirdParty',
      anthropicProviderId: 'openrouter',
      // No provider.thirdParty.openrouter.selectedModel stored
    });

    const def = providerSelectedModelDef('apiKey'); // default = ''

    const resolveKey = () => {
      const authMethod = backend.readGlobal<string>('authMethod') ?? 'apiKey';
      const providerId =
        backend.readGlobal<string>('anthropicProviderId') ?? '';
      const authKey = resolveAuthProviderKey(authMethod, providerId);
      return `provider.${authKey}.selectedModel`;
    };

    const handle = new ComputedSettingHandle(
      backend,
      def,
      resolveKey,
      'authMethod',
      'anthropicProviderId',
    );

    expect(handle.get()).toBe(''); // definition default for selectedModel
  });
});

// ---------------------------------------------------------------------------
// TC-10: ComputedSettingHandle.watch() fires on auth change (key re-subscription)
// ---------------------------------------------------------------------------

describe('TC-10: ComputedSettingHandle.watch() re-subscribes on auth change', () => {
  it('fires the callback and re-subscribes when authMethod changes', () => {
    // Build a live-reference store so that mutations to `liveData` are immediately
    // visible to readGlobal() — makeMockStore copies the initial data, so we build
    // a minimal store directly here instead.
    const liveData: Record<string, unknown> = {
      authMethod: 'apiKey',
      anthropicProviderId: '',
      'provider.apiKey.selectedModel': 'claude-initial',
    };
    const watchers = new Map<string, Set<(v: unknown) => void>>();

    const backend: ISettingsStore = {
      readGlobal<T>(key: string): T | undefined {
        return liveData[key] as T | undefined;
      },
      async writeGlobal<T>(key: string, value: T): Promise<void> {
        liveData[key] = value as unknown;
      },
      readSecret: () => Promise.reject(new Error('Phase 4')),
      writeSecret: () => Promise.reject(new Error('Phase 4')),
      deleteSecret: () => Promise.reject(new Error('Phase 4')),
      watchGlobal(key: string, cb: (v: unknown) => void): IDisposable {
        if (!watchers.has(key)) watchers.set(key, new Set());
        watchers.get(key)!.add(cb);
        return {
          dispose: () => {
            watchers.get(key)?.delete(cb);
          },
        };
      },
      watchSecret(_key: string, _cb: () => void): IDisposable {
        return { dispose: () => {} };
      },
      flushSync(): void {},
    };

    const fireWatcher = (key: string, value: unknown) => {
      liveData[key] = value;
      watchers.get(key)?.forEach((cb) => cb(value));
    };

    const resolveKey = () => {
      const authMethod = backend.readGlobal<string>('authMethod') ?? 'apiKey';
      const providerId =
        backend.readGlobal<string>('anthropicProviderId') ?? '';
      const authKey = resolveAuthProviderKey(authMethod, providerId);
      return `provider.${authKey}.selectedModel`;
    };

    const handle = new ComputedSettingHandle(
      backend,
      providerSelectedModelDef('apiKey'),
      resolveKey,
      'authMethod',
      'anthropicProviderId',
    );

    const received: unknown[] = [];
    const sub = handle.watch((v) => received.push(v));

    // Immediate fire with current value.
    expect(received).toEqual(['claude-initial']);

    // Simulate auth method change → thirdParty.openrouter.
    // Update liveData BEFORE firing so resolveKey() sees the new context.
    liveData['authMethod'] = 'thirdParty';
    liveData['anthropicProviderId'] = 'openrouter';
    liveData['provider.thirdParty.openrouter.selectedModel'] = 'mistral-7b';
    fireWatcher('authMethod', 'thirdParty');

    // Should have re-fired (auth change triggers cb(this.get()) in resubscribe).
    expect(received.length).toBeGreaterThanOrEqual(2);

    // Now fire the new key watcher — handle must be re-subscribed to it.
    fireWatcher('provider.thirdParty.openrouter.selectedModel', 'gpt-4o');
    expect(received[received.length - 1]).toBe('gpt-4o');

    // The OLD key watcher should no longer fire after re-subscription.
    const countBefore = received.length;
    fireWatcher('provider.apiKey.selectedModel', 'old-key-update');
    expect(received.length).toBe(countBefore);

    sub.dispose();
  });

  it('dispose unregisters all three watchers (inner + auth + providerId)', () => {
    const storeData: Record<string, unknown> = {
      authMethod: 'apiKey',
      anthropicProviderId: '',
    };
    const backend = makeMockStore(storeData);

    const resolveKey = () => `provider.apiKey.selectedModel`;

    const handle = new ComputedSettingHandle(
      backend,
      providerSelectedModelDef('apiKey'),
      resolveKey,
      'authMethod',
      'anthropicProviderId',
    );

    const received: unknown[] = [];
    const sub = handle.watch((v) => received.push(v));
    // Clear the immediate-fire value.
    received.length = 0;

    sub.dispose();

    // After dispose, no new calls when the store fires any watched key.
    backend._fire('authMethod', 'claudeCli');
    backend._fire('provider.apiKey.selectedModel', 'x');
    expect(received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-11: resolveAuthProviderKey table
// ---------------------------------------------------------------------------

describe('TC-11: resolveAuthProviderKey concrete cases', () => {
  it("('apiKey', undefined) => 'apiKey'", () => {
    expect(resolveAuthProviderKey('apiKey', undefined)).toBe('apiKey');
  });

  it("('claudeCli', undefined) => 'claudeCli'", () => {
    expect(resolveAuthProviderKey('claudeCli', undefined)).toBe('claudeCli');
  });

  it("('thirdParty', 'openrouter') => 'thirdParty.openrouter'", () => {
    expect(resolveAuthProviderKey('thirdParty', 'openrouter')).toBe(
      'thirdParty.openrouter',
    );
  });

  it("('thirdParty', '') => 'thirdParty.unknown'", () => {
    expect(resolveAuthProviderKey('thirdParty', '')).toBe('thirdParty.unknown');
  });

  it("('thirdParty', undefined) => 'thirdParty.unknown'", () => {
    expect(resolveAuthProviderKey('thirdParty', undefined)).toBe(
      'thirdParty.unknown',
    );
  });
});

// ---------------------------------------------------------------------------
// TC-12: runV2Migration idempotency
// ---------------------------------------------------------------------------

describe('TC-12: runV2Migration idempotency', () => {
  const tmpDir = path.join(mockTestHome, 'v2-idempotency');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const settingsPath = path.join(tmpDir, 'settings.json');
    if (fs.existsSync(settingsPath)) fs.rmSync(settingsPath);
    const migrationsDir = path.join(tmpDir, 'migrations');
    if (fs.existsSync(migrationsDir))
      fs.rmSync(migrationsDir, { recursive: true });
  });

  it('migrates model.selected to provider-scoped key and removes the legacy key', async () => {
    const initial = {
      $schema: 'https://ptah.live/schemas/settings.json',
      version: 1,
      model: { selected: 'my-model' },
      authMethod: 'apiKey',
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(initial, null, 2),
      'utf8',
    );

    await runV2Migration(tmpDir);

    const raw = fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8');
    const after = JSON.parse(raw) as Record<string, unknown>;

    // Legacy key must be gone.
    const model = after['model'] as Record<string, unknown> | undefined;
    expect(model?.['selected']).toBeUndefined();

    // Provider-scoped key must exist.
    const provider = after['provider'] as
      Record<string, Record<string, Record<string, unknown>>> | undefined;
    expect(provider?.['apiKey']?.['selectedModel']).toBe('my-model');
  });

  it('running migration a second time is idempotent (no error, no double-modification)', async () => {
    const initial = {
      $schema: 'https://ptah.live/schemas/settings.json',
      version: 1,
      model: { selected: 'my-model' },
      authMethod: 'apiKey',
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(initial, null, 2),
      'utf8',
    );

    await runV2Migration(tmpDir);
    await expect(runV2Migration(tmpDir)).resolves.toBeUndefined();

    const raw = fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8');
    const after = JSON.parse(raw) as Record<string, unknown>;
    const provider = after['provider'] as
      Record<string, Record<string, Record<string, unknown>>> | undefined;
    expect(provider?.['apiKey']?.['selectedModel']).toBe('my-model');
  });
});

// ---------------------------------------------------------------------------
// TC-13: runV2Migration with no legacy keys is a no-op
// ---------------------------------------------------------------------------

describe('TC-13: runV2Migration with no legacy keys is a no-op', () => {
  const tmpDir = path.join(mockTestHome, 'v2-noop');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const settingsPath = path.join(tmpDir, 'settings.json');
    if (fs.existsSync(settingsPath)) fs.rmSync(settingsPath);
  });

  it('does not throw when no legacy keys are present in settings.json', async () => {
    const initial = {
      $schema: 'https://ptah.live/schemas/settings.json',
      version: 1,
      authMethod: 'apiKey',
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(initial, null, 2),
      'utf8',
    );

    await expect(runV2Migration(tmpDir)).resolves.toBeUndefined();

    // File should not have been rewritten (early return path).
    const raw = fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8');
    const after = JSON.parse(raw) as Record<string, unknown>;
    expect(after['provider']).toBeUndefined();
  });

  it('does not throw when settings.json contains only {}', async () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{}', 'utf8');
    await expect(runV2Migration(tmpDir)).resolves.toBeUndefined();
  });

  it('does not throw when settings.json does not exist', async () => {
    // tmpDir exists (created in beforeEach) but settings.json is absent.
    // runV2Migration must handle the ENOENT gracefully and resolve.
    const missingSettingsPath = path.join(tmpDir, 'settings.json');
    expect(fs.existsSync(missingSettingsPath)).toBe(false);

    // We call directly without expect().resolves because Jest's assertion
    // wrapper can obscure whether the rejection is from the catch or our code.
    let threw = false;
    try {
      await runV2Migration(tmpDir);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-14: MigrationRunner skips already-applied migrations
// ---------------------------------------------------------------------------

describe('TC-14: MigrationRunner skips already-applied migrations', () => {
  const tmpDir = path.join(mockTestHome, 'migration-runner');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const migrationsDir = path.join(tmpDir, 'migrations');
    if (fs.existsSync(migrationsDir))
      fs.rmSync(migrationsDir, { recursive: true });
  });

  it('skips a migration when its sentinel file already exists', async () => {
    const migrationsDir = path.join(tmpDir, 'migrations');
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.writeFileSync(
      path.join(migrationsDir, 'v1.applied'),
      new Date().toISOString(),
      'utf8',
    );

    let v1Called = false;
    const v1Fn = async (_dir: string) => {
      v1Called = true;
    };
    const runner = new MigrationRunner(tmpDir, [v1Fn]);

    await runner.runMigrations();

    expect(v1Called).toBe(false);
  });

  it('runs an unapplied migration and writes the sentinel', async () => {
    let v1Called = false;
    const v1Fn = async (_dir: string) => {
      v1Called = true;
    };
    const runner = new MigrationRunner(tmpDir, [v1Fn]);

    await runner.runMigrations();

    expect(v1Called).toBe(true);
    const sentinel = path.join(tmpDir, 'migrations', 'v1.applied');
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('skips v2 when only v2 sentinel exists, still runs v1', async () => {
    const migrationsDir = path.join(tmpDir, 'migrations');
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.writeFileSync(
      path.join(migrationsDir, 'v2.applied'),
      new Date().toISOString(),
      'utf8',
    );

    let v1Called = false;
    let v2Called = false;
    const v1Fn = async (_dir: string) => {
      v1Called = true;
    };
    const v2Fn = async (_dir: string) => {
      v2Called = true;
    };
    const runner = new MigrationRunner(tmpDir, [v1Fn, v2Fn]);

    await runner.runMigrations();

    expect(v1Called).toBe(true);
    expect(v2Called).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-18: Isolation guarantee — no call sites outside permitted scope
// ---------------------------------------------------------------------------

describe('TC-18: Isolation guarantee — zero unauthorized consumers', () => {
  it('settings-core is not imported by any app or lib outside permitted adapter scope', () => {
    const { execSync } =
      require('child_process') as typeof import('child_process');
    // Walk up from __dirname (which is .../libs/backend/settings-core/src) to find
    // the monorepo root that contains a .git directory.
    let projectRoot = __dirname;
    for (let i = 0; i < 6; i++) {
      const candidate = path.resolve(projectRoot, '..');
      if (fs.existsSync(path.join(candidate, '.git'))) {
        projectRoot = candidate;
        break;
      }
      projectRoot = candidate;
    }

    let grepOutput = '';
    try {
      grepOutput = execSync('git grep -rl "@ptah-extension/settings-core"', {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      // git grep exits 1 when there are zero matches — that's a pass.
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status: number }).status === 1
      ) {
        grepOutput = '';
      } else {
        throw err;
      }
    }

    const lines = grepOutput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // Permitted: the lib itself, platform adapters, call-site
    // migrations, gateway migration, tsconfig path-alias declarations.
    const permittedPatterns = [
      /libs[\\/]backend[\\/]settings-core[\\/]/,
      /libs[\\/]backend[\\/]platform-electron[\\/]src[\\/]settings[\\/]/,
      /libs[\\/]backend[\\/]platform-cli[\\/]src[\\/]settings[\\/]/,
      // Call sites migrated to modelSettings / reasoningSettings.
      /apps[\\/]ptah-electron[\\/]src[\\/]activation[\\/]/,
      // DI smoke specs register SETTINGS_TOKENS.MODEL_SETTINGS for resolution drift checks.
      /apps[\\/]ptah-electron[\\/]src[\\/]di[\\/]container\.smoke\.spec\.ts$/,
      // Electron composition root for provider-session chat reads the per-provider
      // model and reasoning-effort setting definitions it binds for those sessions.
      /apps[\\/]ptah-electron[\\/]src[\\/]di[\\/]provider-session-composition\.ts$/,
      /libs[\\/]backend[\\/]agent-generation[\\/]/,
      /libs[\\/]backend[\\/]agent-sdk[\\/]/,
      /libs[\\/]backend[\\/]rpc-handlers[\\/]/,
      // messaging-gateway uses GatewaySettings for secret token storage.
      /libs[\\/]backend[\\/]messaging-gateway[\\/]/,
      // gateway-chat-bridge consumes settings (provider/model) for bridged sessions.
      /libs[\\/]backend[\\/]gateway-chat-bridge[\\/]/,
      // cli-agent-runtime consumes ReasoningSettings to map UI effort to CLI flags.
      /libs[\\/]backend[\\/]cli-agent-runtime[\\/]/,
      // cli-engine hosts the migrated CLI bootstrap (runs SETTINGS_TOKENS migrations).
      /libs[\\/]backend[\\/]cli-engine[\\/]/,
      // auth-providers consumes WorkspaceScopeResolver for per-workspace provider resolution.
      /libs[\\/]backend[\\/]auth-providers[\\/]/,
      // output-styles reads `outputStyle.selectedName` (and its workspace scope)
      // to resolve the per-session activation. It owns that read for BOTH the
      // chat path and the CLI-agent spawn path, which cannot see each other.
      /libs[\\/]backend[\\/]output-styles[\\/]/,
      // tsconfig files declare path aliases — not runtime consumers.
      /tsconfig(\.\w+)?\.json$/,
      // Documentation mentions the package name in prose — not a runtime import.
      /^docs[\\/]/,
      // Task specs quote import lines in their plans. Prose, never compiled.
      /^\.ptah[\\/]specs[\\/]/,
      // CI shard weights key projects by name. Data, never compiled.
      /^\.github[\\/]ci[\\/]test-weights\.json$/,
    ];

    const unauthorized = lines.filter(
      (line) => !permittedPatterns.some((pattern) => pattern.test(line)),
    );

    if (unauthorized.length > 0) {
      throw new Error(
        `settings-core is imported outside permitted scope (Batch 2+3 allowed consumers):\n` +
          unauthorized.join('\n'),
      );
    }
    expect(unauthorized).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-19: Drift guard — KNOWN_PROVIDER_AUTH_KEYS ↔ FILE_BASED_SETTINGS_KEYS
//
// Every entry in KNOWN_PROVIDER_AUTH_KEYS MUST produce exactly two entries in
// FILE_BASED_SETTINGS_KEYS (`provider.<key>.selectedModel` and
// `provider.<key>.reasoningEffort`).  If either list drifts the VS Code
// workspace provider silently routes the orphaned key to
// vscode.workspace.getConfiguration — a key that has no schema there — and
// the value is never read back, producing a silent model/effort reset.
// ---------------------------------------------------------------------------

describe('TC-19 (WP-3T): KNOWN_PROVIDER_AUTH_KEYS ↔ FILE_BASED_SETTINGS_KEYS drift guard', () => {
  it('every KNOWN_PROVIDER_AUTH_KEY produces .selectedModel and .reasoningEffort in FILE_BASED_SETTINGS_KEYS', () => {
    // Dynamically resolve from actual source — never hard-coded here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KNOWN_PROVIDER_AUTH_KEYS } =
      require('./schema/provider-schema') as {
        KNOWN_PROVIDER_AUTH_KEYS: readonly string[];
      };
    const missing: string[] = [];
    for (const authKey of KNOWN_PROVIDER_AUTH_KEYS) {
      const modelKey = `provider.${authKey}.selectedModel`;
      const effortKey = `provider.${authKey}.reasoningEffort`;
      if (!FILE_BASED_SETTINGS_KEYS.has(modelKey)) missing.push(modelKey);
      if (!FILE_BASED_SETTINGS_KEYS.has(effortKey)) missing.push(effortKey);
    }

    if (missing.length > 0) {
      throw new Error(
        `FILE_BASED_SETTINGS_KEYS is missing provider-scoped keys — VS Code will silently\n` +
          `route these to vscode.workspace.getConfiguration (no schema → silent fail):\n` +
          missing.join('\n'),
      );
    }
    expect(missing).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-29: sensitivity:'secret' routing — values go to secrets.enc.json, NOT
// to settings.json.
//
// This is the behavioral regression guard for BaseSettingsRepository.secretHandleFor.
// If a secret-sensitivity key falls through to writeGlobal (plaintext storage),
// a value written via GatewaySettings.telegramTokenCipher.set() would appear
// in settings.json in plaintext and NOT be recoverable via readSecret.
// ---------------------------------------------------------------------------

describe('TC-29: sensitivity:secret routing — secret values land in secrets.enc.json, not settings.json', () => {
  const tmpDir = path.join(mockTestHome, 'tc29-secret-routing');
  let masterKey: Buffer;

  /**
   * Build a minimal ISettingsStore that routes secret I/O through
   * SecretsFileStore and global I/O through an in-memory map.
   * This is the same pattern used by the production FileSettingsStore.
   */
  function buildStore(
    ptahDir: string,
    mkProvider: IMasterKeyProvider,
  ): ISettingsStore {
    const secretsFileStore = new SecretsFileStore(ptahDir);
    const globalData: Record<string, unknown> = {};

    return {
      readGlobal<T>(key: string): T | undefined {
        return globalData[key] as T | undefined;
      },
      async writeGlobal<T>(key: string, value: T): Promise<void> {
        globalData[key] = value;
      },
      async readSecret(key: string): Promise<string | undefined> {
        const mk = await mkProvider.getMasterKey();
        return secretsFileStore.read(key, mk);
      },
      async writeSecret(key: string, ciphertext: string): Promise<void> {
        const mk = await mkProvider.getMasterKey();
        await secretsFileStore.write(key, ciphertext, mk);
      },
      async deleteSecret(key: string): Promise<void> {
        await secretsFileStore.delete(key);
      },
      watchGlobal(_key: string, _cb: (value: unknown) => void): IDisposable {
        return { dispose: jest.fn() };
      },
      watchSecret(_key: string, _cb: () => void): IDisposable {
        return { dispose: jest.fn() };
      },
      flushSync: jest.fn(),
    };
  }

  beforeEach(() => {
    masterKey = crypto.randomBytes(32);
    fs.mkdirSync(tmpDir, { recursive: true });
    // Remove any leftover files from a previous test.
    const secretsPath = path.join(tmpDir, 'secrets.enc.json');
    const settingsPath = path.join(tmpDir, 'settings.json');
    if (fs.existsSync(secretsPath)) fs.rmSync(secretsPath);
    if (fs.existsSync(settingsPath)) fs.rmSync(settingsPath);
  });

  it('writing via secretHandle stores an encrypted envelope in secrets.enc.json', async () => {
    const mkProvider: IMasterKeyProvider = {
      getMasterKey: async () => masterKey,
    };
    const store = buildStore(tmpDir, mkProvider);
    const settings = new GatewaySettings(store);
    const vaultCipher = 'gcm:iv-base64:tag-base64:ct-base64'; // opaque string

    await settings.telegramTokenCipher.set(vaultCipher);

    // 1. secrets.enc.json must exist.
    const secretsPath = path.join(tmpDir, 'secrets.enc.json');
    expect(fs.existsSync(secretsPath)).toBe(true);

    // 2. The entry must NOT be the raw plaintext — it must be an encrypted envelope.
    const raw = fs.readFileSync(secretsPath, 'utf8');
    const parsed = JSON.parse(raw) as { entries: Record<string, unknown> };
    const entry = parsed.entries['gateway.telegram.tokenCipher'];
    expect(entry).toBeDefined();
    // An encrypted SecretEnvelope has iv/tag/ciphertext fields — NOT the raw value.
    const envelope = entry as Record<string, unknown>;
    expect(typeof envelope['iv']).toBe('string');
    expect(typeof envelope['ciphertext']).toBe('string');
    // The plaintext vault cipher must NOT appear verbatim in the encrypted output.
    expect(raw).not.toContain(vaultCipher);
  });

  it('the same key must NOT appear in settings.json (plaintext file)', async () => {
    const mkProvider: IMasterKeyProvider = {
      getMasterKey: async () => masterKey,
    };
    const store = buildStore(tmpDir, mkProvider);
    const settings = new GatewaySettings(store);

    await settings.telegramTokenCipher.set('secret-vault-cipher-xyz');

    // No settings.json was ever written (only in-memory globalData map).
    const settingsPath = path.join(tmpDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const rawSettings = fs.readFileSync(settingsPath, 'utf8');
      expect(rawSettings).not.toContain('gateway.telegram.tokenCipher');
      expect(rawSettings).not.toContain('secret-vault-cipher-xyz');
    } else {
      // settings.json was never created — this is the correct behavior.
      expect(fs.existsSync(settingsPath)).toBe(false);
    }
  });

  it('reading back via secretHandle decrypts and returns the original value', async () => {
    const mkProvider: IMasterKeyProvider = {
      getMasterKey: async () => masterKey,
    };
    const store = buildStore(tmpDir, mkProvider);
    const settings = new GatewaySettings(store);
    const original = 'gcm:original-vault-cipher-abc123';

    await settings.telegramTokenCipher.set(original);

    // Fresh store instance (new in-memory) but same on-disk file.
    const store2 = buildStore(tmpDir, mkProvider);
    const settings2 = new GatewaySettings(store2);
    const recovered = await settings2.telegramTokenCipher.get();

    expect(recovered).toBe(original);
  });

  it('a regression where secretHandleFor routes to writeGlobal would put the value in the globalData map and NOT in secrets.enc.json', async () => {
    // This test documents the regression scenario: if secretHandleFor were changed
    // to call writeGlobal instead of writeSecret, secrets.enc.json would not be created.
    // The production code must call writeSecret, not writeGlobal.
    const mkProvider: IMasterKeyProvider = {
      getMasterKey: async () => masterKey,
    };
    const store = buildStore(tmpDir, mkProvider);
    const settings = new GatewaySettings(store);

    await settings.discordTokenCipher.set('discord-vault-cipher-999');

    const secretsPath = path.join(tmpDir, 'secrets.enc.json');
    expect(fs.existsSync(secretsPath)).toBe(true);

    // If the regression were present, secrets.enc.json would NOT exist (the value
    // would be in the in-memory globalData map instead). The test above verifies
    // the correct behavior.
    const raw = fs.readFileSync(secretsPath, 'utf8');
    const parsed = JSON.parse(raw) as { entries: Record<string, unknown> };
    expect(parsed.entries['gateway.discord.tokenCipher']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Workspace provider scope: a saved model must be the model read back, under
// the same provider key the Settings UI writes.
// ---------------------------------------------------------------------------

describe('ModelSettings.selectedModel — scope and provider key', () => {
  const PATH = path.join(mockTestHome, 'ws-model');
  const APP_SCOPE = appScopePrefixFor('electron');
  const MODEL_KEY = 'provider.thirdParty.openrouter.selectedModel';

  function makeResolver(data: Record<string, unknown>): {
    store: MockStore;
    resolver: WorkspaceScopeResolver;
  } {
    const store = makeMockStore(data);
    const resolver = new WorkspaceScopeResolver(
      store,
      { getActivePath: () => PATH, onDidChange: () => ({ dispose: () => {} }) },
      APP_SCOPE,
    );
    return { store, resolver };
  }

  it('a save at a broader scope clears the narrower overrides, so the new model is read back', async () => {
    const { store, resolver } = makeResolver({
      authMethod: 'thirdParty',
      anthropicProviderId: 'openrouter',
      [MODEL_KEY]: 'old-global',
      [`${APP_SCOPE}.${MODEL_KEY}`]: 'old-app',
    });
    await resolver.write(MODEL_KEY, 'old-workspace', 'workspace', true);
    const settings = new ModelSettings(store, resolver);
    expect(settings.selectedModel.get()).toBe('old-workspace');

    await settings.selectedModel.set('new-global', 'global');

    expect(settings.selectedModel.get()).toBe('new-global');
    expect(store.readGlobal(`${APP_SCOPE}.${MODEL_KEY}`)).toBeUndefined();
    expect(resolver.hasOverride(MODEL_KEY, true)).toBe(false);
  });

  it('watch re-targets when the provider changes at workspace scope (hashed key)', async () => {
    const { store, resolver } = makeResolver({
      authMethod: 'thirdParty',
      anthropicProviderId: 'openrouter',
      [MODEL_KEY]: 'or-model',
      'provider.thirdParty.kimi-code.selectedModel': 'k3',
    });
    const settings = new ModelSettings(store, resolver);
    const seen: string[] = [];
    const sub = settings.selectedModel.watch((value) => seen.push(value));
    expect(seen.at(-1)).toBe('or-model');

    await resolver.write('anthropicProviderId', 'kimi-code', 'workspace', true);
    expect(seen.at(-1)).toBe('k3');

    // A model written at workspace scope for the new provider is seen too.
    await settings.selectedModel.set('k3.1-pro', 'workspace');
    expect(seen.at(-1)).toBe('k3.1-pro');

    // The previous provider's key is no longer watched.
    const count = seen.length;
    await store.writeGlobal(MODEL_KEY, 'or-other');
    expect(seen.length).toBe(count);
    sub.dispose();
  });

  it('a workspace save leaves the broader values alone', async () => {
    const { store, resolver } = makeResolver({
      authMethod: 'thirdParty',
      anthropicProviderId: 'openrouter',
      [MODEL_KEY]: 'global-model',
    });
    const settings = new ModelSettings(store, resolver);

    await settings.selectedModel.set('ws-model', 'workspace');

    expect(settings.selectedModel.get()).toBe('ws-model');
    expect(store.readGlobal(MODEL_KEY)).toBe('global-model');
  });

  it('a workspace save with no open workspace is rejected and leaves the store untouched', async () => {
    const store = makeMockStore({
      authMethod: 'thirdParty',
      anthropicProviderId: 'openrouter',
      [MODEL_KEY]: 'global-model',
      [`${APP_SCOPE}.${MODEL_KEY}`]: 'app-model',
    });
    const resolver = new WorkspaceScopeResolver(
      store,
      {
        getActivePath: () => undefined,
        onDidChange: () => ({ dispose: () => {} }),
      },
      APP_SCOPE,
    );
    const clearSpy = jest.spyOn(resolver, 'clearMoreSpecific');
    const settings = new ModelSettings(store, resolver);

    await expect(
      settings.selectedModel.set('stale-ws-model', 'workspace'),
    ).rejects.toThrow(/no workspace is open/);

    expect(store._writeGlobalCalls).toEqual([]);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(store.readGlobal(MODEL_KEY)).toBe('global-model');
    expect(store.readGlobal(`${APP_SCOPE}.${MODEL_KEY}`)).toBe('app-model');
  });

  it.each([
    ['openrouter', 'openrouter', MODEL_KEY],
    [
      'oauth',
      'github-copilot',
      'provider.thirdParty.github-copilot.selectedModel',
    ],
    ['claude-cli', undefined, 'provider.claudeCli.selectedModel'],
    ['thirdParty', undefined, MODEL_KEY],
  ])(
    'legacy authMethod %p with provider %p reads the key the UI writes (%s)',
    (authMethod, providerId, key) => {
      const store = makeMockStore({
        authMethod,
        ...(providerId ? { anthropicProviderId: providerId } : {}),
        [key]: 'expected-model',
      });
      expect(new ModelSettings(store).selectedModel.get()).toBe(
        'expected-model',
      );
    },
  );
});

// ---------------------------------------------------------------------------
// IGlobalBatchSettingsStore + ReactiveSettingsStore.writeGlobalBatch (3.2)
// ---------------------------------------------------------------------------

describe('IGlobalBatchSettingsStore and ReactiveSettingsStore batch operations', () => {
  interface BatchMockStore extends IGlobalBatchSettingsStore {
    _batchCalls: Array<Readonly<Record<string, unknown>>>;
    _readManyCalls: Array<readonly string[]>;
  }

  function makeBatchMockStore(
    initial: Record<string, unknown> = {},
    writeImpl?: (
      entries: Readonly<Record<string, unknown>>,
    ) => Promise<Readonly<Record<string, unknown>>>,
  ): BatchMockStore {
    const base = makeMockStore(initial);
    const data: Record<string, unknown> = { ...initial };
    const batchCalls: Array<Readonly<Record<string, unknown>>> = [];
    const readManyCalls: Array<readonly string[]> = [];

    return {
      ...base,
      _batchCalls: batchCalls,
      _readManyCalls: readManyCalls,
      readGlobal<T>(key: string): T | undefined {
        return data[key] as T | undefined;
      },
      async writeGlobal<T>(key: string, value: T): Promise<void> {
        data[key] = value;
        await base.writeGlobal(key, value);
      },
      readGlobalMany(keys: readonly string[]): Record<string, unknown> {
        readManyCalls.push(keys);
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          result[key] = data[key];
        }
        return result;
      },
      async writeGlobalBatch(
        entries: Readonly<Record<string, unknown>>,
      ): Promise<Readonly<Record<string, unknown>>> {
        batchCalls.push(entries);
        if (writeImpl) {
          const committed = await writeImpl(entries);
          for (const [key, value] of Object.entries(committed)) {
            data[key] = value;
          }
          return committed;
        }
        const slice: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(entries)) {
          data[key] = value;
          slice[key] = value;
        }
        return Object.freeze(slice);
      },
    };
  }

  it('isGlobalBatchSettingsStore distinguishes batch-capable stores from plain ISettingsStore mocks', () => {
    const plain = makeMockStore();
    const batch = makeBatchMockStore();
    const reactive = new ReactiveSettingsStore(batch);

    expect(isGlobalBatchSettingsStore(plain)).toBe(false);
    expect(isGlobalBatchSettingsStore(null)).toBe(false);
    expect(isGlobalBatchSettingsStore(undefined)).toBe(false);
    expect(isGlobalBatchSettingsStore(batch)).toBe(true);
    expect(isGlobalBatchSettingsStore(reactive)).toBe(true);
  });

  it('ReactiveSettingsStore.writeGlobalBatch returns committedSlice and publishes all keys before emitting', async () => {
    const backend = makeBatchMockStore({
      'setup.provider': 'claudeCli',
      'setup.model': 'claude-sonnet-4-5',
    });
    const store = new ReactiveSettingsStore(backend);

    // Pre-warm cache with old pair.
    expect(store.readGlobalMany(['setup.provider', 'setup.model'])).toEqual({
      'setup.provider': 'claudeCli',
      'setup.model': 'claude-sonnet-4-5',
    });

    const observedDuringEmit: Array<{
      eventKey: string;
      eventValue: unknown;
      cachedProvider: unknown;
      cachedModel: unknown;
      cachedPair: Record<string, unknown>;
    }> = [];

    store.watchGlobal('setup.provider', (value) => {
      observedDuringEmit.push({
        eventKey: 'setup.provider',
        eventValue: value,
        cachedProvider: store.readGlobal('setup.provider'),
        cachedModel: store.readGlobal('setup.model'),
        cachedPair: store.readGlobalMany(['setup.provider', 'setup.model']),
      });
    });
    store.watchGlobal('setup.model', (value) => {
      observedDuringEmit.push({
        eventKey: 'setup.model',
        eventValue: value,
        cachedProvider: store.readGlobal('setup.provider'),
        cachedModel: store.readGlobal('setup.model'),
        cachedPair: store.readGlobalMany(['setup.provider', 'setup.model']),
      });
    });

    const committed = await store.writeGlobalBatch({
      'setup.provider': 'openrouter',
      'setup.model': 'anthropic/claude-opus-4-1',
    });

    expect(Object.isFrozen(committed)).toBe(true);
    expect(committed).toEqual({
      'setup.provider': 'openrouter',
      'setup.model': 'anthropic/claude-opus-4-1',
    });

    // When the VERY FIRST watcher fired (setup.provider), setup.model was already updated in cache.
    expect(observedDuringEmit).toEqual([
      {
        eventKey: 'setup.provider',
        eventValue: 'openrouter',
        cachedProvider: 'openrouter',
        cachedModel: 'anthropic/claude-opus-4-1',
        cachedPair: {
          'setup.provider': 'openrouter',
          'setup.model': 'anthropic/claude-opus-4-1',
        },
      },
      {
        eventKey: 'setup.model',
        eventValue: 'anthropic/claude-opus-4-1',
        cachedProvider: 'openrouter',
        cachedModel: 'anthropic/claude-opus-4-1',
        cachedPair: {
          'setup.provider': 'openrouter',
          'setup.model': 'anthropic/claude-opus-4-1',
        },
      },
    ]);
  });

  it('publishes overlapping writeGlobalBatch calls in FIFO order even if backend resolves out of order', async () => {
    const resolvers: Array<(slice: Readonly<Record<string, unknown>>) => void> =
      [];
    const backend = makeBatchMockStore({}, () => {
      return new Promise<Readonly<Record<string, unknown>>>((resolve) => {
        resolvers.push(resolve);
      });
    });
    const store = new ReactiveSettingsStore(backend);

    const emittedPairs: Array<Record<string, unknown>> = [];
    store.watchGlobal('setup.provider', () => {
      emittedPairs.push(store.readGlobalMany(['setup.provider', 'setup.model']));
    });

    const p1 = store.writeGlobalBatch({
      'setup.provider': 'openrouter',
      'setup.model': 'first-model',
    });
    const p2 = store.writeGlobalBatch({
      'setup.provider': 'apiKey',
      'setup.model': 'second-model',
    });

    expect(resolvers).toHaveLength(2);
    // Resolve second backend write BEFORE the first.
    resolvers[1](
      Object.freeze({ 'setup.provider': 'apiKey', 'setup.model': 'second-model' }),
    );
    await Promise.resolve();
    // Neither should have published out of order yet.
    expect(emittedPairs).toEqual([]);

    resolvers[0](
      Object.freeze({
        'setup.provider': 'openrouter',
        'setup.model': 'first-model',
      }),
    );

    const [slice1, slice2] = await Promise.all([p1, p2]);
    expect(slice1).toEqual({
      'setup.provider': 'openrouter',
      'setup.model': 'first-model',
    });
    expect(slice2).toEqual({
      'setup.provider': 'apiKey',
      'setup.model': 'second-model',
    });
    expect(emittedPairs).toEqual([
      { 'setup.provider': 'openrouter', 'setup.model': 'first-model' },
      { 'setup.provider': 'apiKey', 'setup.model': 'second-model' },
    ]);
    expect(store.readGlobalMany(['setup.provider', 'setup.model'])).toEqual({
      'setup.provider': 'apiKey',
      'setup.model': 'second-model',
    });
  });

  it('leaves globalCache untouched and emits nothing when backend writeGlobalBatch rejects', async () => {
    let shouldFail = true;
    const backend = makeBatchMockStore(
      { 'setup.provider': 'claudeCli', 'setup.model': 'claude-sonnet-4-5' },
      async (entries) => {
        if (shouldFail) {
          throw new Error('persist failed');
        }
        return Object.freeze({ ...entries });
      },
    );
    const store = new ReactiveSettingsStore(backend);
    expect(store.readGlobalMany(['setup.provider', 'setup.model'])).toEqual({
      'setup.provider': 'claudeCli',
      'setup.model': 'claude-sonnet-4-5',
    });

    const watcher = jest.fn();
    store.watchGlobal('setup.provider', watcher);
    store.watchGlobal('setup.model', watcher);

    await expect(
      store.writeGlobalBatch({
        'setup.provider': 'openrouter',
        'setup.model': 'bad-model',
      }),
    ).rejects.toThrow('persist failed');

    expect(store.readGlobalMany(['setup.provider', 'setup.model'])).toEqual({
      'setup.provider': 'claudeCli',
      'setup.model': 'claude-sonnet-4-5',
    });
    expect(watcher).not.toHaveBeenCalled();

    // Queue keeps working after a rejected batch.
    shouldFail = false;
    const recovered = await store.writeGlobalBatch({
      'setup.provider': 'apiKey',
      'setup.model': 'claude-opus-4-1',
    });
    expect(recovered).toEqual({
      'setup.provider': 'apiKey',
      'setup.model': 'claude-opus-4-1',
    });
    expect(watcher).toHaveBeenCalledTimes(2);
  });

  it('rejects explicitly when writeGlobalBatch is called on a non-batch backend', async () => {
    const plain = makeMockStore();
    const store = new ReactiveSettingsStore(plain);

    await expect(
      store.writeGlobalBatch({ 'setup.provider': 'apiKey', 'setup.model': 'm1' }),
    ).rejects.toThrow(/does not support atomic batch writes/);
  });

  it('readGlobalMany falls back to single-key reads on non-batch backends', () => {
    const plain = makeMockStore({
      'setup.provider': 'apiKey',
      'setup.model': 'claude-sonnet-4-5',
    });
    const store = new ReactiveSettingsStore(plain);
    expect(store.readGlobalMany(['setup.provider', 'setup.model'])).toEqual({
      'setup.provider': 'apiKey',
      'setup.model': 'claude-sonnet-4-5',
    });
  });

  it('refreshes the full cached slice after one key is invalidated', async () => {
    const original = {
      'setup.provider': 'apiKey',
      'setup.model': 'claude-sonnet-4-5',
    };
    const updated = {
      'setup.provider': 'openrouter',
      'setup.model': 'openai/gpt-5',
    };
    const keys = Object.keys(original);
    const backend = makeBatchMockStore(original);
    const store = new ReactiveSettingsStore(backend);
    expect(store.readGlobalMany(keys)).toEqual(original);

    await backend.writeGlobalBatch(updated);
    store.invalidateCache('setup.model');

    expect(store.readGlobalMany(keys)).toEqual(updated);
    expect(store.readGlobal('setup.provider')).toBe(updated['setup.provider']);
    expect(store.readGlobalMany(keys)).toEqual(updated);
    expect(backend._readManyCalls).toEqual([keys, keys]);
  });

  it('refreshes the full cached slice after partial invalidation on a non-batch backend', async () => {
    const original = {
      'setup.provider': 'apiKey',
      'setup.model': 'claude-sonnet-4-5',
    };
    const backend = makeMockStore(original);
    const store = new ReactiveSettingsStore(backend);
    const keys = Object.keys(original);
    expect(store.readGlobalMany(keys)).toEqual(original);

    await backend.writeGlobal('setup.provider', 'openrouter');
    await backend.writeGlobal('setup.model', 'openai/gpt-5');
    store.invalidateCache('setup.model');

    expect(store.readGlobalMany(keys)).toEqual({
      'setup.provider': 'openrouter',
      'setup.model': 'openai/gpt-5',
    });
    expect(store.readGlobal('setup.provider')).toBe('openrouter');
  });

  it('round-trips setup pair atomically with a file-backed PtahFileSettingsManager adapter across Undo and restart', async () => {
    const dir = path.join(mockTestHome, 'reactive-batch-file-backed');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    const makeFileStore = (
      mgr: PtahFileSettingsManager,
    ): IGlobalBatchSettingsStore => ({
      readGlobal: <T>(key: string) => mgr.get<T>(key),
      readGlobalMany: (keys) => mgr.getMany(keys),
      hasGlobal: (key) => mgr.has(key),
      writeGlobal: (key, value) => mgr.set(key, value),
      writeGlobalBatch: (entries) => mgr.setMany(entries),
      readSecret: async () => undefined,
      writeSecret: async () => undefined,
      deleteSecret: async () => undefined,
      watchGlobal: (key, cb) => mgr.watch(key, cb),
      watchSecret: () => ({ dispose: () => undefined }),
      flushSync: () => mgr.flushSync(),
    });

    const mgr1 = new PtahFileSettingsManager(FILE_BASED_SETTINGS_DEFAULTS, dir);
    const store1 = new ReactiveSettingsStore(makeFileStore(mgr1));

    const committed = await store1.writeGlobalBatch({
      'setup.provider': 'openrouter',
      'setup.model': 'anthropic/claude-sonnet-4-5',
    });
    expect(committed).toEqual({
      'setup.provider': 'openrouter',
      'setup.model': 'anthropic/claude-sonnet-4-5',
    });

    // Fresh instance simulates restart read-back.
    const mgr2 = new PtahFileSettingsManager(FILE_BASED_SETTINGS_DEFAULTS, dir);
    const store2 = new ReactiveSettingsStore(makeFileStore(mgr2));
    expect(store2.readGlobalMany(['setup.provider', 'setup.model'])).toEqual({
      'setup.provider': 'openrouter',
      'setup.model': 'anthropic/claude-sonnet-4-5',
    });

    // Undo back to unset ('', '').
    const cleared = await store2.writeGlobalBatch({
      'setup.provider': '',
      'setup.model': '',
    });
    expect(cleared).toEqual({ 'setup.provider': '', 'setup.model': '' });

    const mgr3 = new PtahFileSettingsManager(FILE_BASED_SETTINGS_DEFAULTS, dir);
    expect(mgr3.getMany(['setup.provider', 'setup.model'])).toEqual({
      'setup.provider': '',
      'setup.model': '',
    });
  });
});
