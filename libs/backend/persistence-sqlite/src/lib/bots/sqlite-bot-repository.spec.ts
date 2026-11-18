import 'reflect-metadata';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { container } from 'tsyringe';
import type { BotDefinitionV2, BotScope } from '@ptah-extension/shared';
import { TOKENS } from '@ptah-extension/vscode-core';
import { createMockLogger } from '../testing/mock-logger';
import { sql } from '../migrations/0076_bots';
import type { SqliteDatabase } from '../sqlite-connection.service';
import { registerPersistenceSqliteServices } from '../di/register';
import { PERSISTENCE_TOKENS } from '../di/tokens';
import { SqliteBotRepository } from './sqlite-bot-repository';
import { BotRepositoryError } from './bot-repository';

const user: BotScope = { kind: 'user' };
const workspace: BotScope = { kind: 'workspace', workspaceRoot: '/workspace' };
function value(input: unknown): SQLInputValue {
  if (
    input === null ||
    typeof input === 'string' ||
    typeof input === 'number' ||
    typeof input === 'bigint' ||
    input instanceof Uint8Array
  )
    return input;
  throw new Error('Unexpected SQL parameter');
}
// Same real node:sqlite setup as usage-cursor-repository.spec.ts, extended for blobs/transactions.
function open(path = ':memory:') {
  const raw = new DatabaseSync(path);
  raw.exec(
    'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 20;',
  );
  raw.exec(sql);
  const db: SqliteDatabase = {
    exec: (text) => raw.exec(text),
    prepare: (text) => {
      const stmt = raw.prepare(text);
      return {
        run: (...params: unknown[]) => {
          const result = stmt.run(...params.map(value));
          return {
            changes: Number(result.changes),
            lastInsertRowid: result.lastInsertRowid,
          };
        },
        get: (...params: unknown[]) => stmt.get(...params.map(value)),
        all: (...params: unknown[]) => stmt.all(...params.map(value)),
        iterate: function* (...params: unknown[]) {
          yield* stmt.iterate(...params.map(value));
        },
      };
    },
    pragma: (pragma) => raw.exec(`PRAGMA ${pragma}`),
    close: () => raw.close(),
    get open() {
      return raw.isOpen;
    },
    get inTransaction() {
      return raw.isTransaction;
    },
    transaction: (fn) => fn,
  };
  let time = 1000;
  const repo = new SqliteBotRepository({ db }, createMockLogger());
  repo.configure({ now: () => time });
  return {
    raw,
    db,
    repo,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
function definition(overrides: Partial<BotDefinitionV2> = {}): BotDefinitionV2 {
  return {
    schemaVersion: 2,
    id: randomUUID(),
    revision: 1,
    name: 'Bot',
    description: '',
    instructions: 'Help',
    scope: user,
    runtime: { kind: 'default' },
    memoryScope: { kind: 'private' },
    skills: [],
    toolRequirements: { allow: [], deny: [] },
    triggers: [],
    approvalRules: { mode: 'ask' },
    enabled: false,
    createdAt: 1000,
    updatedAt: 1000,
    archivedAt: null,
    origin: { kind: 'manual' },
    ...overrides,
  };
}
function update(
  bot: BotDefinitionV2,
  overrides: Partial<BotDefinitionV2> = {},
): BotDefinitionV2 {
  return {
    ...bot,
    revision: bot.revision + 1,
    updatedAt: bot.updatedAt + 1,
    name: `${bot.name}+`,
    ...overrides,
  };
}

describe('SqliteBotRepository', () => {
  let store: ReturnType<typeof open>;
  beforeEach(() => {
    store = open();
  });
  afterEach(() => {
    store.raw.close();
  });

  it('creates full snapshots and conflicts on the second update using one revision', () => {
    const bot = definition();
    store.repo.save(bot, null);
    const next = update(bot);
    store.repo.save(next, 1);
    expect(() => store.repo.save(update(bot, { name: 'stale' }), 1)).toThrow(
      BotRepositoryError,
    );
    expect(store.repo.get(bot.id, user)?.definition).toEqual(next);
    expect(
      store.repo
        .revisions(bot.id, user)
        .map((row) =>
          'definitionJson' in row ? JSON.parse(row.definitionJson) : row,
        ),
    ).toEqual([bot, next]);
  });

  it('ignores revision/updatedAt only for no-op detection, after checking CAS', () => {
    const bot = definition();
    store.repo.save(bot, null);
    expect(
      store.repo.save({ ...bot, revision: 2, updatedAt: 9999 }, 1),
    ).toEqual({ changed: false, definition: bot });
    expect(store.repo.revisions(bot.id, user)).toHaveLength(1);
    expect(() => store.repo.save(bot, 2)).toThrow('conflict');
  });

  it('preserves V1 and upgrades explicitly to V2 as a revision', () => {
    const v2 = definition();
    const { avatar, origin, ...rest } = v2;
    void avatar;
    void origin;
    const v1 = {
      ...rest,
      schemaVersion: 1 as const,
      runtime: { providerId: 'provider', modelId: 'model' },
    };
    store.repo.save(v1, null);
    expect(store.repo.get(v1.id, user)).toMatchObject({
      definition: v1,
      diagnostics: ['upgrade-required'],
    });
    store.repo.save({ ...v2, revision: 2 }, 1);
    expect(store.repo.revisions(v1.id, user)).toHaveLength(2);
  });

  it('keeps invalid/newer rows visible without hiding valid rows', () => {
    const good = definition();
    const bad = definition();
    const future = definition();
    for (const bot of [good, bad, future]) store.repo.save(bot, null);
    store.raw
      .prepare('UPDATE bots SET definition_json = ? WHERE id = ?')
      .run('{broken', bad.id);
    store.raw
      .prepare('UPDATE bots SET schema_version = 99 WHERE id = ?')
      .run(future.id);
    const list = store.repo.list(user);
    expect(list).toHaveLength(3);
    expect(list.filter((item) => item.diagnostics.length)).toHaveLength(2);
    expect(store.repo.get(bad.id, user)?.raw).toMatchObject({
      definition_json: '{broken',
    });
    expect(store.repo.get(future.id, user)?.diagnostics).toEqual([
      'unsupported-schema-version',
    ]);
  });

  it.each(['keep', 'purge'] as const)(
    'memory=%s independently combines with both history choices',
    (memory) => {
      for (const history of ['keep', 'purge'] as const) {
        const firstImage = randomUUID();
        const secondImage = randomUUID();
        store.repo.stageAvatar(
          firstImage,
          user,
          'image/png',
          Buffer.from('first bytes'),
        );
        store.repo.stageAvatar(
          secondImage,
          user,
          'image/webp',
          Buffer.from('second bytes'),
        );
        const one = definition({
          avatar: { kind: 'image', imageId: firstImage },
        });
        const two = update(one, {
          avatar: { kind: 'image', imageId: secondImage },
        });
        const three = update(two, { avatar: undefined });
        for (const bot of [one, two, three])
          store.repo.save(bot, bot.revision === 1 ? null : bot.revision - 1);
        const otherImage = randomUUID();
        store.repo.stageAvatar(
          otherImage,
          user,
          'image/jpeg',
          Buffer.from('unrelated'),
        );
        const other = definition({
          avatar: { kind: 'image', imageId: otherImage },
        });
        store.repo.save(other, null);
        const retained = store.repo.revisions(one.id, user);
        expect(store.repo.readAvatar(firstImage, user)?.bytes).toEqual(
          Uint8Array.from(Buffer.from('first bytes')),
        );
        expect(store.repo.delete(one.id, user, 3, { memory, history })).toEqual(
          {
            revisionsRemoved: history === 'keep' ? 0 : 3,
            imagesRemoved: history === 'keep' ? 0 : 2,
          },
        );
        expect(store.repo.revisions(one.id, user)).toEqual([]);
        expect(store.repo.get(one.id, user)).toBeNull();
        expect(
          store.repo.list(user).some((item) => item.definition?.id === one.id),
        ).toBe(false);
        const historyRows = store.raw
          .prepare(
            'SELECT * FROM bot_revisions WHERE bot_id = ? ORDER BY revision',
          )
          .all(one.id);
        expect(historyRows.map((row) => row.definition_json)).toEqual(
          history === 'keep'
            ? retained.map((row) =>
                'definitionJson' in row ? row.definitionJson : null,
              )
            : [],
        );
        expect(
          store.raw.prepare('SELECT * FROM bots WHERE id = ?').get(one.id),
        ).toMatchObject({
          definition_json: null,
          name: history === 'keep' ? three.name : null,
          retain_memory: Number(memory === 'keep'),
          retain_history: Number(history === 'keep'),
          enabled: 0,
        });
        expect(store.repo.readAvatar(firstImage, user)?.bytes ?? null).toEqual(
          history === 'keep'
            ? Uint8Array.from(Buffer.from('first bytes'))
            : null,
        );
        expect(store.repo.readAvatar(secondImage, user)?.bytes ?? null).toEqual(
          history === 'keep'
            ? Uint8Array.from(Buffer.from('second bytes'))
            : null,
        );
        expect(store.repo.get(other.id, user)?.definition).toEqual(other);
        expect(store.repo.readAvatar(otherImage, user)?.ownerBotId).toBe(
          other.id,
        );
      }
    },
  );

  it('rolls back snapshot, claim and CAS if revision insertion fails', () => {
    const imageId = randomUUID();
    const bot = definition();
    store.repo.save(bot, null);
    store.repo.stageAvatar(imageId, user, 'image/png', Buffer.from('bytes'));
    store.raw.exec(
      "CREATE TRIGGER reject_revision BEFORE INSERT ON bot_revisions BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    );
    expect(() =>
      store.repo.save(update(bot, { avatar: { kind: 'image', imageId } }), 1),
    ).toThrow(new BotRepositoryError('invalid', 'Bot repository: invalid'));
    expect(store.repo.get(bot.id, user)?.definition).toEqual(bot);
    expect(store.repo.readAvatar(imageId, user)?.ownerBotId).toBeNull();
    expect(store.repo.revisions(bot.id, user)).toHaveLength(1);
    store.raw.exec('DROP TRIGGER reject_revision');
    store.repo.save(update(bot), 1);
    expect(() =>
      store.repo.save(update(bot, { avatar: { kind: 'image', imageId } }), 1),
    ).toThrow('conflict');
    expect(store.repo.readAvatar(imageId, user)?.ownerBotId).toBeNull();
  });

  it('rolls back deletion and asset purges on tombstone failure', () => {
    const imageId = randomUUID();
    store.repo.stageAvatar(imageId, user, 'image/png', Buffer.from('bytes'));
    const bot = definition({ avatar: { kind: 'image', imageId } });
    store.repo.save(bot, null);
    store.raw.exec(
      "CREATE TRIGGER reject_delete BEFORE UPDATE ON bots WHEN NEW.deleted_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'delete failure'); END",
    );
    expect(() =>
      store.repo.delete(bot.id, user, 1, { memory: 'purge', history: 'purge' }),
    ).toThrow(new BotRepositoryError('invalid', 'Bot repository: invalid'));
    expect(store.repo.get(bot.id, user)?.definition).toEqual(bot);
    expect(store.repo.revisions(bot.id, user)).toHaveLength(1);
    expect(store.repo.readAvatar(imageId, user)?.ownerBotId).toBe(bot.id);
  });

  it('enforces scope/root and existing owner denial without changing records', () => {
    const imageId = randomUUID();
    store.repo.stageAvatar(
      imageId,
      workspace,
      'image/png',
      Buffer.from('bytes'),
    );
    expect(store.repo.readAvatar(imageId, user)).toBeNull();
    expect(
      store.repo.readAvatar(imageId, {
        kind: 'workspace',
        workspaceRoot: '/other',
      }),
    ).toBeNull();
    const foreign = definition({ avatar: { kind: 'image', imageId } });
    expect(() => store.repo.save(foreign, null)).toThrow('scope-denied');
    expect(store.repo.get(foreign.id, user)).toBeNull();
    const owner = definition({
      scope: workspace,
      avatar: { kind: 'image', imageId },
    });
    store.repo.save(owner, null);
    expect(() =>
      store.repo.save(
        definition({ scope: workspace, avatar: { kind: 'image', imageId } }),
        null,
      ),
    ).toThrow('scope-denied');
    expect(store.repo.get(owner.id, user)).toBeNull();
    expect(store.repo.revisions(owner.id, user)).toEqual([]);
    expect(() =>
      store.repo.delete(owner.id, user, 1, {
        memory: 'purge',
        history: 'purge',
      }),
    ).toThrow('not-found');
    expect(store.repo.readAvatar(imageId, workspace)?.ownerBotId).toBe(
      owner.id,
    );
  });

  it('bounds bytes/media types and 20 MiB staging per scope, expires at 24h and cleans on upload', () => {
    expect(() =>
      store.repo.stageAvatar(randomUUID(), user, 'image/png', Buffer.alloc(0)),
    ).toThrow('invalid');
    expect(() =>
      store.repo.stageAvatar(
        randomUUID(),
        user,
        'image/png',
        Buffer.alloc(2097153),
      ),
    ).toThrow('invalid');
    expect(() =>
      store.repo.stageAvatar(
        randomUUID(),
        user,
        // @ts-expect-error Exercise runtime validation of untrusted media types.
        'image/svg+xml',
        Buffer.from('svg'),
      ),
    ).toThrow();
    const ids = Array.from({ length: 10 }, () => randomUUID());
    for (const id of ids)
      store.repo.stageAvatar(id, user, 'image/webp', Buffer.alloc(2097152));
    expect(() =>
      store.repo.stageAvatar(randomUUID(), user, 'image/png', Buffer.from('x')),
    ).toThrow('quota');
    store.repo.stageAvatar(
      randomUUID(),
      workspace,
      'image/png',
      Buffer.from('x'),
    );
    store.advance(24 * 60 * 60 * 1000);
    expect(store.repo.readAvatar(ids[0], user)).toBeNull();
    expect(() =>
      store.repo.save(
        definition({ avatar: { kind: 'image', imageId: ids[0] } }),
        null,
      ),
    ).toThrow('not-found');
    store.repo.stageAvatar(randomUUID(), user, 'image/png', Buffer.from('new'));
    expect(
      store.raw
        .prepare('SELECT COUNT(*) AS count FROM bot_avatar_images')
        .get(),
    ).toMatchObject({ count: 1 });
  });

  it('registers the repository singleton through the shared helper', () => {
    const child = container.createChildContainer();
    const logger = createMockLogger();
    child.register(TOKENS.LOGGER, { useValue: logger });
    child.register(PERSISTENCE_TOKENS.SQLITE_DB_PATH, { useValue: ':memory:' });
    registerPersistenceSqliteServices(child, logger);
    child.register(PERSISTENCE_TOKENS.SQLITE_CONNECTION, {
      useValue: { db: store.db },
    });
    expect(child.resolve(PERSISTENCE_TOKENS.BOT_REPOSITORY)).toBeInstanceOf(
      SqliteBotRepository,
    );
    expect(child.resolve(PERSISTENCE_TOKENS.BOT_REPOSITORY)).toBe(
      child.resolve(PERSISTENCE_TOKENS.BOT_REPOSITORY),
    );
  });

  it('blocks a second writer while a writer lock is held, then conflicts on a stale revision', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ptah-bot-'));
    let first: ReturnType<typeof open> | undefined;
    let second: ReturnType<typeof open> | undefined;
    try {
      const path = join(directory, 'bots.db');
      first = open(path);
      const bot = definition();
      first.repo.save(bot, null);
      first.raw.close();
      first = undefined;
      first = open(path);
      second = open(path);
      expect(second.repo.get(bot.id, user)?.definition).toEqual(bot);
      // Test busy_timeout is 20 ms (production uses 5000 ms). Writer reservation blocks CAS reads.
      first.raw.exec('BEGIN IMMEDIATE');
      expect(() => second?.repo.save(update(bot), 1)).toThrow(/locked/);
      first.raw.exec('ROLLBACK');
      first.repo.save(update(bot), 1);
      expect(() =>
        second?.repo.save(update(bot, { name: 'loser' }), 1),
      ).toThrow('conflict');
      expect(second.repo.revisions(bot.id, user)).toHaveLength(2);
    } finally {
      first?.raw.close();
      second?.raw.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('refuses cross-scope updates, stale/second deletes and an insert with an expected revision', () => {
    const bot = definition();
    store.repo.save(bot, null);
    expect(() => store.repo.save(update(bot, { scope: workspace }), 1)).toThrow(
      'scope-denied',
    );
    expect(() => store.repo.save(definition(), 1)).toThrow('conflict');
    expect(() =>
      store.repo.delete(bot.id, user, 2, { memory: 'keep', history: 'keep' }),
    ).toThrow('conflict');
    store.repo.delete(bot.id, user, 1, { memory: 'keep', history: 'keep' });
    expect(() =>
      store.repo.delete(bot.id, user, 2, { memory: 'keep', history: 'keep' }),
    ).toThrow('not-found');
  });

  it('can reclaim an older avatar already owned by the same bot', () => {
    const a = randomUUID();
    const b = randomUUID();
    for (const id of [a, b])
      store.repo.stageAvatar(id, user, 'image/png', Buffer.from(id));
    const one = definition({ avatar: { kind: 'image', imageId: a } });
    const two = update(one, { avatar: { kind: 'image', imageId: b } });
    const three = update(two, { avatar: one.avatar });
    for (const bot of [one, two, three])
      store.repo.save(bot, bot.revision === 1 ? null : bot.revision - 1);
    expect(store.repo.get(one.id, user)?.definition).toEqual(three);
    expect(store.repo.readAvatar(a, user)?.ownerBotId).toBe(one.id);
    expect(store.repo.readAvatar(b, user)?.ownerBotId).toBe(one.id);
  });

  it('maps invalid inputs, corrupt stored rows and duplicate image ids without exposing scope', () => {
    const bot = definition();
    store.repo.save(bot, null);
    const invalid = new BotRepositoryError(
      'invalid',
      'Bot repository: invalid',
    );
    expect(() => store.repo.get('invalid-id', user)).toThrow(invalid);
    const imageId = randomUUID();
    store.repo.stageAvatar(imageId, workspace, 'image/png', Buffer.from('x'));
    expect(() =>
      store.repo.stageAvatar(imageId, user, 'image/png', Buffer.from('x')),
    ).toThrow(invalid);
    expect(() =>
      store.repo.stageAvatar('invalid-id', user, 'image/png', Buffer.from('x')),
    ).toThrow(invalid);
    store.raw
      .prepare('UPDATE bots SET created_at = -1 WHERE id = ?')
      .run(bot.id);
    expect(() => store.repo.save(update(bot), 1)).toThrow(invalid);
    store.raw
      .prepare('UPDATE bot_revisions SET created_at = -1 WHERE bot_id = ?')
      .run(bot.id);
    expect(store.repo.revisions(bot.id, user)).toEqual([
      expect.objectContaining({ diagnostics: ['invalid-revision'] }),
    ]);
    const missing = definition({
      avatar: { kind: 'image', imageId: randomUUID() },
    });
    expect(() => store.repo.save(missing, null)).toThrow('not-found');
  });

  it('preserves the first error if SQLite auto-rolls back or rollback itself fails', () => {
    const auto = definition();
    store.raw.exec(
      "CREATE TRIGGER auto_rollback BEFORE INSERT ON bot_revisions BEGIN SELECT RAISE(ROLLBACK, 'first error'); END",
    );
    expect(() => store.repo.save(auto, null)).toThrow('invalid');
    expect(store.repo.get(auto.id, user)).toBeNull();
    store.raw.exec('DROP TRIGGER auto_rollback');
    const original = new Error('first operation error');
    const exec = store.db.exec;
    const spy = jest.spyOn(store.db, 'exec').mockImplementation((sql) => {
      if (sql === 'COMMIT') throw original;
      if (sql === 'ROLLBACK') throw new Error('rollback error');
      return exec(sql);
    });
    expect(() => store.repo.save(definition(), null)).toThrow(original);
    spy.mockRestore();
    store.raw.exec('ROLLBACK');
  });

  it('conflicts and rolls back selected purges when a tombstone update changes no row', () => {
    const bot = definition();
    store.repo.save(bot, null);
    store.raw.exec(
      'CREATE TRIGGER ignore_delete BEFORE UPDATE ON bots WHEN NEW.deleted_at IS NOT NULL BEGIN SELECT RAISE(IGNORE); END',
    );
    expect(() =>
      store.repo.delete(bot.id, user, 1, { memory: 'purge', history: 'purge' }),
    ).toThrow('conflict');
    expect(store.repo.revisions(bot.id, user)).toHaveLength(1);
    expect(store.repo.get(bot.id, user)?.definition).toEqual(bot);
  });
});
