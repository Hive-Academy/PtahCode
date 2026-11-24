import 'reflect-metadata';
import * as crypto from 'node:crypto';
import {
  INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS,
  type IStateStorage,
} from '@ptah-extension/platform-core';
import { MCP_CREDENTIAL_INVALID_MESSAGE } from '../mcp-core/mcp-caller-auth.types';
import {
  McpCallerTokenRegistry,
  type McpCredentialLogger,
} from './mcp-caller-token-registry';
import { isToolPermitted } from '../mcp-core/mcp-caller-policy';
import { HttpConnectionOwners } from './http-connection-owners';
import { externalOwnerKeySchema } from '@ptah-extension/cli-agent-runtime';

const STORE_KEY = 'ptah.mcp.callerCredentialHashes';

class MemoryState implements IStateStorage {
  private readonly entries = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.entries.has(key)) return defaultValue;
    const value: unknown = this.entries.get(key);
    if (value === undefined) return defaultValue;
    return value as T;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.entries.delete(key);
      return;
    }
    this.entries.set(key, value);
  }

  keys(): readonly string[] {
    return [...this.entries.keys()];
  }

  read(key: string): unknown {
    return this.entries.get(key);
  }
}

class FailingWriteState extends MemoryState {
  failNextUpdate = false;

  override async update(key: string, value: unknown): Promise<void> {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error('state write failed');
    }
    await super.update(key, value);
  }
}

function logger(): McpCredentialLogger & { readonly warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    debug(): void {
      return undefined;
    },
    info(): void {
      return undefined;
    },
    warn(message: string): void {
      warnings.push(message);
    },
    error(): void {
      return undefined;
    },
  };
}

function hashOf(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('base64');
}

interface StoredSlot {
  readonly configPath: string;
  readonly kind: 'workspace' | 'home';
  readonly workspaceRoot?: string;
}

/**
 * Persistent slot records as an older host left them in state. The registry
 * mints none since TASK_2026_979 (Ptah writes no provider MCP config), but it
 * still loads, authorizes, re-scopes and retires the records already there.
 * The stored capability is ignored on load, so it is written read-only.
 */
async function seedPersistent(
  state: IStateStorage,
  slots: readonly StoredSlot[],
): Promise<string[]> {
  const tokens = slots.map(() => crypto.randomBytes(32).toString('base64url'));
  await state.update(STORE_KEY, {
    records: slots.map((slot, index) => ({
      configPath: slot.configPath,
      tokenHashB64: hashOf(tokens[index]),
      kind: slot.kind,
      capability: 'read-only',
      ...(slot.workspaceRoot === undefined
        ? {}
        : { workspaceRoot: slot.workspaceRoot }),
    })),
  });
  return tokens;
}

const WS_SLOT: StoredSlot = {
  configPath: '/ws/.mcp.json',
  kind: 'workspace',
  workspaceRoot: '/ws',
};
const HOME_SLOT: StoredSlot = { configPath: '/home/codex.toml', kind: 'home' };

describe('McpCallerTokenRegistry', () => {
  it('recognizes only live internal-query exclusive owners', () => {
    let now = 100;
    const registry = new McpCallerTokenRegistry({ logger: logger(), now: () => now });
    const internal = registry.issue({ kind: 'internal-query', workspaceRoot: '/ws', capability: 'privileged' }, 'query', 50);
    const authorized = registry.authorize({ token: internal, workspaceRoot: '/ws' });
    if (!authorized.ok || !authorized.externalOwner) throw new Error('Expected internal-query owner');
    const owner = authorized.externalOwner;
    expect(registry.isExclusiveOwnerActive(owner)).toBe(true);
    expect(registry.isExclusiveOwnerActive({ ...owner, principal: 'f'.repeat(32) })).toBe(false);
    expect(registry.isExclusiveOwnerActive({ ...owner, exclusive: false })).toBe(false);
    const workspace = registry.issue({ kind: 'workspace', workspaceRoot: '/ws', capability: 'privileged' }, 'workspace', 50);
    const workspaceAuth = registry.authorize({ token: workspace, workspaceRoot: '/ws' });
    if (!workspaceAuth.ok || !workspaceAuth.externalOwner) throw new Error('Expected workspace owner');
    expect(registry.isExclusiveOwnerActive({ ...workspaceAuth.externalOwner, exclusive: true })).toBe(false);
    registry.revokeSubject('query');
    expect(registry.isExclusiveOwnerActive(owner)).toBe(false);
    const expiring = registry.issue({ kind: 'internal-query', workspaceRoot: '/ws', capability: 'privileged' }, 'expiring', 50);
    const expiringAuth = registry.authorize({ token: expiring, workspaceRoot: '/ws' });
    if (!expiringAuth.ok || !expiringAuth.externalOwner) throw new Error('Expected expiring owner');
    now = 150;
    expect(registry.isExclusiveOwnerActive(expiringAuth.externalOwner)).toBe(false);
  });
  it('reports each revoked internal-query owner and no other binding kind', () => {
    const revoked: unknown[] = [];
    const registry = new McpCallerTokenRegistry({ logger: logger(), onExclusiveOwnerRevoked: owner => revoked.push(owner) });
    const owners = ['a', 'b'].map(subject => {
      const token = registry.issue({ kind: 'internal-query', workspaceRoot: '/ws', capability: 'privileged' }, subject, 50_000);
      const auth = registry.authorize({ token, workspaceRoot: '/ws' });
      if (!auth.ok || !auth.externalOwner) throw new Error('Expected internal-query owner');
      return auth.externalOwner;
    });
    registry.issue({ kind: 'workspace', workspaceRoot: '/ws', capability: 'privileged' }, 'workspace', 50_000);
    registry.revokeSubject('a');
    expect(revoked).toEqual([owners[0]]);
    registry.revokeEphemeral();
    expect(revoked).toEqual(owners);
  });
  it('uses a recorder-compatible principal for an authorized persistent token and connection', async () => {
    const state = new MemoryState();
    const [token] = await seedPersistent(state, [WS_SLOT]);
    const registry = new McpCallerTokenRegistry({ state, logger: logger() });
    const authorized = registry.authorize({ token, workspaceRoot: '/ws' });
    if (!authorized.ok || !authorized.externalOwner) throw new Error('Expected authorized workspace owner');
    expect(externalOwnerKeySchema.safeParse(authorized.externalOwner).success).toBe(true);
    const connections = new HttpConnectionOwners();
    const id = connections.issue(authorized.externalOwner);
    const resolved = connections.resolve(authorized.externalOwner, id);
    expect(externalOwnerKeySchema.safeParse(resolved).success).toBe(true);
    expect(resolved?.exclusive).toBe(true);
  });
  it('authorizes a stored slot by digest and keeps only its hash in state', async () => {
    const state = new MemoryState();
    const [token] = await seedPersistent(state, [WS_SLOT]);
    const registry = new McpCallerTokenRegistry({ state, logger: logger() });

    const ok = registry.authorize({
      token,
      workspaceRoot: '/ws',
    });
    expect(ok).toMatchObject({ ok: true, legacy: false });

    // A rewrite of the store keeps the hash and never the raw token.
    await registry.applyExternalCallerAccess('read-only');
    const dumped = JSON.stringify(state.read(STORE_KEY));
    expect(dumped).not.toContain(token);
    expect(dumped).toContain(hashOf(token));

    const unknown = registry.authorize({
      token: 'c'.repeat(43),
      workspaceRoot: '/ws',
    });
    expect(unknown).toMatchObject({
      ok: false,
      failure: { httpStatus: 401, message: MCP_CREDENTIAL_INVALID_MESSAGE },
    });
  });

  it('rejects an expired lane token and a revoked subject', () => {
    const registry = new McpCallerTokenRegistry({
      logger: logger(),
      now: () => 5_000,
    });
    const expired = registry.issue(
      { kind: 'agent', agentId: 'lane-a', capability: 'privileged' },
      'lane-a',
      -1,
    );
    expect(
      registry.authorize({ token: expired, agentId: 'lane-a' }),
    ).toMatchObject({ ok: false, failure: { httpStatus: 401 } });

    const live = registry.issue(
      { kind: 'agent', agentId: 'lane-b', capability: 'privileged' },
      'lane-b',
      1_000,
    );
    expect(registry.authorize({ token: live, agentId: 'lane-b' }).ok).toBe(
      true,
    );
    registry.revokeSubject('lane-b');
    expect(
      registry.authorize({ token: live, agentId: 'lane-b' }),
    ).toMatchObject({ ok: false, failure: { httpStatus: 401 } });
  });

  it('keeps an interactive credential after four hours, then expires or revokes it', () => {
    const clock = { now: 5_000 };
    const registry = new McpCallerTokenRegistry({
      logger: logger(),
      now: () => clock.now,
    });
    const binding = {
      kind: 'session' as const,
      sessionId: 'tab-1',
      workspaceRoot: '/ws',
      capability: 'privileged' as const,
    };
    const token = registry.issue(
      binding,
      'claude-interactive:tab-1',
      INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS,
    );
    const input = { token, sessionId: 'tab-1', workspaceRoot: '/ws' };
    clock.now += 4 * 60 * 60 * 1000 + 60_000;
    expect(registry.authorize(input).ok).toBe(true);
    clock.now = 5_000 + INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS;
    expect(registry.authorize(input)).toMatchObject({
      ok: false,
      failure: { httpStatus: 401, message: MCP_CREDENTIAL_INVALID_MESSAGE },
    });
    const replacement = registry.issue(
      binding,
      'claude-interactive:tab-1',
      INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS,
    );
    registry.revokeSubject('claude-interactive:tab-1');
    expect(registry.authorize({ ...input, token: replacement })).toMatchObject({
      ok: false,
      failure: { httpStatus: 401, message: MCP_CREDENTIAL_INVALID_MESSAGE },
    });
  });

  it('returns 403 when a valid token is presented on another identity', () => {
    const registry = new McpCallerTokenRegistry({ logger: logger() });
    const token = registry.issue(
      {
        kind: 'workspace',
        workspaceRoot: '/ws-a',
        capability: 'read-only',
      },
      'query-1',
      1_000,
    );
    expect(registry.authorize({ token, workspaceRoot: '/ws-b' })).toMatchObject(
      {
        ok: false,
        failure: {
          httpStatus: 403,
          message: 'Caller is not allowed to use this resource',
        },
      },
    );
    expect(registry.authorize({ token, workspaceRoot: '/ws-a' }).ok).toBe(true);
  });

  it('never stores a privileged persistent binding while the setting is read-only, nor for a home slot', async () => {
    const state = new MemoryState();
    const [, home] = await seedPersistent(state, [WS_SLOT, HOME_SLOT]);
    const registry = new McpCallerTokenRegistry({ state, logger: logger() });

    await registry.applyExternalCallerAccess('read-only');
    expect(JSON.stringify(state.read(STORE_KEY))).not.toContain(
      '"capability":"privileged"',
    );

    await registry.applyExternalCallerAccess('full');
    const records = (
      state.read(STORE_KEY) as {
        records: Array<{ kind: string; capability: string }>;
      }
    ).records;
    expect(records.map((record) => [record.kind, record.capability])).toEqual([
      ['workspace', 'privileged'],
      ['home', 'read-only'],
    ]);
    expect(registry.authorize({ token: home })).toMatchObject({
      ok: true,
      binding: { kind: 'home', capability: 'read-only' },
    });
  });

  it('updates the same live token on downgrade and upgrade without restart', async () => {
    const state = new MemoryState();
    const [token] = await seedPersistent(state, [WS_SLOT]);
    const registry = new McpCallerTokenRegistry({
      state,
      logger: logger(),
      externalCallerAccess: 'full',
    });
    const before = registry.authorize({ token, workspaceRoot: '/ws' });
    expect(before).toMatchObject({
      ok: true,
      binding: { capability: 'privileged' },
    });
    if (before.ok) {
      expect(isToolPermitted('execute_code', before.binding.capability)).toBe(
        true,
      );
    }

    await registry.applyExternalCallerAccess('read-only');

    const downgraded = registry.authorize({ token, workspaceRoot: '/ws' });
    expect(downgraded).toMatchObject({
      ok: true,
      binding: { capability: 'read-only' },
    });
    if (downgraded.ok) {
      expect(
        isToolPermitted('execute_code', downgraded.binding.capability),
      ).toBe(false);
    }

    await registry.applyExternalCallerAccess('full');

    expect(registry.authorize({ token, workspaceRoot: '/ws' })).toMatchObject({
      ok: true,
      binding: { capability: 'privileged' },
    });
    expect(JSON.stringify(state.read(STORE_KEY))).toContain(hashOf(token));
    expect(JSON.stringify(state.read(STORE_KEY))).not.toContain(token);
  });

  it('clamps every live persistent token when a downgrade state write fails', async () => {
    const state = new FailingWriteState();
    const [first, second, home] = await seedPersistent(state, [
      { configPath: '/ws-a/.mcp.json', kind: 'workspace', workspaceRoot: '/ws-a' },
      { configPath: '/ws-b/.mcp.json', kind: 'workspace', workspaceRoot: '/ws-b' },
      HOME_SLOT,
    ]);
    const registry = new McpCallerTokenRegistry({
      state,
      logger: logger(),
      externalCallerAccess: 'full',
    });

    state.failNextUpdate = true;
    await expect(
      registry.applyExternalCallerAccess('read-only'),
    ).rejects.toThrow('state write failed');

    for (const [token, workspaceRoot] of [
      [first, '/ws-a'],
      [second, '/ws-b'],
    ] as const) {
      const authorized = registry.authorize({ token, workspaceRoot });
      expect(authorized).toMatchObject({
        ok: true,
        binding: { capability: 'read-only' },
      });
      if (authorized.ok) {
        expect(
          isToolPermitted('execute_code', authorized.binding.capability),
        ).toBe(false);
      }
    }
    expect(registry.authorize({ token: home })).toMatchObject({
      ok: true,
      binding: { capability: 'read-only' },
    });
  });

  it('keeps live tokens read-only when an upgrade state write fails', async () => {
    const state = new FailingWriteState();
    const [token] = await seedPersistent(state, [WS_SLOT]);
    const registry = new McpCallerTokenRegistry({ state, logger: logger() });

    state.failNextUpdate = true;
    await expect(registry.applyExternalCallerAccess('full')).rejects.toThrow(
      'state write failed',
    );

    expect(registry.authorize({ token, workspaceRoot: '/ws' })).toMatchObject({
      ok: true,
      binding: { capability: 'read-only' },
    });
  });

  it('does not write a lane token into state', () => {
    const state = new MemoryState();
    const registry = new McpCallerTokenRegistry({ state, logger: logger() });
    const token = registry.issue(
      { kind: 'session', sessionId: 'tab-1', capability: 'privileged' },
      'tab-1',
      1_000,
    );
    expect(state.read(STORE_KEY)).toBeUndefined();
    expect(token).not.toHaveLength(0);
    registry.revokeEphemeral();
    expect(registry.authorize({ token, sessionId: 'tab-1' }).ok).toBe(false);
  });

  it('warns once for an unmapped legacy caller and notices once', () => {
    const warnings = logger();
    const notices: string[] = [];
    const registry = new McpCallerTokenRegistry({
      logger: warnings,
      notice: {
        showInformationMessage(message: string): Promise<string | undefined> {
          notices.push(message);
          return Promise.resolve(undefined);
        },
      },
    });
    registry.authorize({ workspaceRoot: '/ws' });
    registry.authorize({ workspaceRoot: '/ws' });
    registry.authorize({});
    expect(warnings.warnings).toHaveLength(1);
    expect(warnings.warnings[0]).toContain('unmapped');
    expect(warnings.warnings.join('\n')).not.toContain('http://');
    expect(notices).toHaveLength(1);
    expect(notices[0]).not.toMatch(/[/\\]/);
    const legacy = registry.authorize({ agentId: 'lane-a' });
    expect(legacy).toMatchObject({
      ok: true,
      legacy: true,
      binding: { capability: 'read-only', kind: 'agent', agentId: 'lane-a' },
    });
  });

  it('warns once for each stored slot that matches the legacy workspace', async () => {
    const state = new MemoryState();
    const warnings = logger();
    await seedPersistent(state, [
      WS_SLOT,
      {
        configPath: '/ws/.cursor/mcp.json',
        kind: 'workspace',
        workspaceRoot: '/ws',
      },
    ]);
    const registry = new McpCallerTokenRegistry({ state, logger: warnings });
    registry.authorize({ workspaceRoot: '/ws' });
    registry.authorize({ workspaceRoot: '/ws' });
    expect(warnings.warnings).toHaveLength(2);
    expect(warnings.warnings.join('\n')).toContain('/ws/.mcp.json');
    expect(warnings.warnings.join('\n')).toContain('/ws/.cursor/mcp.json');
  });

  it('fails closed on a downgrade write failure and after a restart', async () => {
    const state = new FailingWriteState();
    const warnings = logger();
    const [token] = await seedPersistent(state, [WS_SLOT]);
    const registry = new McpCallerTokenRegistry({
      state,
      logger: warnings,
      externalCallerAccess: 'full',
    });
    // Persist the privileged record so a restart has a stale value to clamp.
    await registry.applyExternalCallerAccess('full');
    expect(registry.authorize({ token, workspaceRoot: '/ws' })).toMatchObject({
      ok: true,
      binding: { capability: 'privileged' },
    });

    state.failNextUpdate = true;
    await expect(
      registry.applyExternalCallerAccess('read-only'),
    ).rejects.toThrow('state write failed');
    expect(registry.authorize({ token, workspaceRoot: '/ws' })).toMatchObject({
      ok: true,
      binding: { capability: 'read-only' },
    });

    // The state still contains the old privileged record. A restart must clamp
    // it to the current read-only setting rather than trust that stale value.
    expect(JSON.stringify(state.read(STORE_KEY))).toContain(
      '"capability":"privileged"',
    );
    const restarted = new McpCallerTokenRegistry({ state, logger: warnings });
    expect(restarted.authorize({ token, workspaceRoot: '/ws' })).toMatchObject({
      ok: true,
      binding: { capability: 'read-only' },
    });
    expect(warnings.warnings.join('\n')).toContain('state write failed');
  });

  it('lets a downgrade win over an in-flight upgrade', async () => {
    const state = new MemoryState();
    const [token] = await seedPersistent(state, [WS_SLOT]);
    const registry = new McpCallerTokenRegistry({
      state,
      logger: logger(),
      externalCallerAccess: 'read-only',
    });
    let release: (() => void) | undefined;
    const original = state.update.bind(state);
    state.update = async (key, value) => {
      if (release === undefined)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      await original(key, value);
    };
    const upgrade = registry.applyExternalCallerAccess('full');
    await Promise.resolve();
    registry.clampExternalCallerAccess('read-only');
    const downgrade = registry.applyExternalCallerAccess('read-only');
    release?.();
    await Promise.all([upgrade, downgrade]);
    expect(registry.authorize({ token, workspaceRoot: '/ws' })).toMatchObject({
      ok: true,
      binding: { capability: 'read-only' },
    });
    const restarted = new McpCallerTokenRegistry({
      state,
      logger: logger(),
      externalCallerAccess: 'read-only',
    });
    expect(restarted.authorize({ token, workspaceRoot: '/ws' })).toMatchObject({
      ok: true,
      binding: { capability: 'read-only' },
    });
  });

});

describe('McpCallerTokenRegistry.revokePersistent (TASK_2026_2297)', () => {
  it('drops the credential of a retired config file, in memory and in state', async () => {
    const state = new MemoryState();
    const [retired, kept] = await seedPersistent(state, [
      { configPath: '/home/.gemini/config/mcp_config.json', kind: 'home' },
      WS_SLOT,
    ]);
    const registry = new McpCallerTokenRegistry({ state, logger: logger() });

    await expect(
      registry.revokePersistent('/home/.gemini/config/mcp_config.json'),
    ).resolves.toBe(true);

    expect(registry.authorize({ token: retired }).ok).toBe(false);
    expect(registry.authorize({ token: kept, workspaceRoot: '/ws' }).ok).toBe(true);
    const stored = JSON.stringify(state.read(STORE_KEY));
    expect(stored).not.toContain(hashOf(retired));
    expect(stored).toContain(hashOf(kept));
    const reloaded = new McpCallerTokenRegistry({ state, logger: logger() });
    expect(reloaded.authorize({ token: retired }).ok).toBe(false);
  });

  it('reports false and writes nothing for a path with no record', async () => {
    const state = new MemoryState();
    const registry = new McpCallerTokenRegistry({ state, logger: logger() });

    await expect(registry.revokePersistent('/ws/.agents/mcp_config.json')).resolves.toBe(false);

    expect(state.read(STORE_KEY)).toBeUndefined();
  });

  it('stops authorizing at once even when the state write fails', async () => {
    const state = new FailingWriteState();
    const [token] = await seedPersistent(state, [
      { configPath: '/home/.gemini/config/mcp_config.json', kind: 'home' },
    ]);
    const registry = new McpCallerTokenRegistry({ state, logger: logger() });
    state.failNextUpdate = true;

    await expect(
      registry.revokePersistent('/home/.gemini/config/mcp_config.json'),
    ).rejects.toThrow('state write failed');

    expect(registry.authorize({ token }).ok).toBe(false);
  });
});
