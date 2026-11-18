import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  MIGRATIONS,
  SqliteBotRepository,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import {
  BotDefinitionSchema,
  type BotDefinition,
  type BotDefinitionV2,
  type BotScope,
} from '@ptah-extension/shared';

import {
  BotApplicationService,
  type BotRetentionParticipant,
} from './bot-application.service';

const scope: BotScope = { kind: 'workspace', workspaceRoot: 'C:\\Project' };
const root = 'C:\\Project';
function parameter(input: unknown): SQLInputValue {
  if (
    input === null ||
    typeof input === 'string' ||
    typeof input === 'number' ||
    typeof input === 'bigint' ||
    input instanceof Uint8Array
  )
    return input;
  throw new Error('Unexpected SQLite parameter');
}
function open() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const migration = MIGRATIONS.find((entry) => entry.version === 76);
  if (!migration?.sql) throw new Error('Bots migration missing');
  raw.exec(migration.sql);
  const db: SqliteDatabase = {
    exec: (text) => raw.exec(text),
    prepare: (text) => {
      const stmt = raw.prepare(text);
      return {
        run: (...params: unknown[]) => {
          const result = stmt.run(...params.map(parameter));
          return {
            changes: Number(result.changes),
            lastInsertRowid: result.lastInsertRowid,
          };
        },
        get: (...params: unknown[]) => stmt.get(...params.map(parameter)),
        all: (...params: unknown[]) => stmt.all(...params.map(parameter)),
        iterate: function* (...params: unknown[]) {
          yield* stmt.iterate(...params.map(parameter));
        },
      };
    },
    pragma: (text) => raw.exec(`PRAGMA ${text}`),
    close: () => raw.close(),
    get open() {
      return raw.isOpen;
    },
    get inTransaction() {
      return raw.isTransaction;
    },
    transaction: (fn) => fn,
  };
  const repo = new SqliteBotRepository({ db }, { debug: jest.fn() });
  repo.configure({ now: () => 4000 });
  return { raw, repo };
}
function definition(): BotDefinitionV2 {
  return {
    schemaVersion: 2,
    id: randomUUID(),
    revision: 1,
    name: 'Reviewer',
    description: '',
    instructions: 'Review carefully',
    scope,
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
  };
}
function application(
  repo: SqliteBotRepository,
  participants: readonly BotRetentionParticipant[] = [],
) {
  return new BotApplicationService({
    repository: repo,
    retentionParticipants: participants,
    now: () => 4000,
    workspaceAuthorization: { authorize: async () => root },
    sourceReader: { read: async () => ({ items: [], diagnostics: [] }) },
    catalog: {
      read: async () => ({
        status: 'available',
        mainProviders: [],
        lanes: [],
        skills: [],
        toolIds: [],
        diagnostics: [],
      }),
    },
  });
}
function threeRevisions(
  repo: SqliteBotRepository,
  first: BotDefinition = definition(),
) {
  repo.save(first, null);
  const second = {
    ...first,
    revision: 2,
    updatedAt: 2000,
    instructions: 'Second full snapshot',
  };
  repo.save(second, 1);
  const third = {
    ...second,
    revision: 3,
    updatedAt: 3000,
    instructions: 'Third full snapshot',
  };
  repo.save(third, 2);
  return third;
}
function snapshots(repo: SqliteBotRepository, id: string) {
  return repo.revisions(id, scope).map((row) => {
    if (!('definitionJson' in row)) throw new Error('Invalid fixture revision');
    return row.definitionJson;
  });
}
describe('bot retention with real SQLite snapshots', () => {
  let store: ReturnType<typeof open>;
  beforeEach(() => {
    store = open();
  });
  afterEach(() => {
    store.raw.close();
  });

  it.each([
    { memory: 'keep', history: 'keep' },
    { memory: 'keep', history: 'purge' },
    { memory: 'purge', history: 'keep' },
    { memory: 'purge', history: 'purge' },
  ] as const)(
    'deletes with %j while retaining every selected revision and hiding tombstones',
    async (retention) => {
      const bot = threeRevisions(store.repo);
      const before = snapshots(store.repo, bot.id);
      expect(before).toHaveLength(3);
      before.forEach((json, index) =>
        expect(BotDefinitionSchema.parse(JSON.parse(json)).revision).toBe(
          index + 1,
        ),
      );
      const unrelated = definition();
      store.repo.save(unrelated, null);
      const unrelatedBefore = store.raw
        .prepare('SELECT * FROM bots WHERE id = ?')
        .get(unrelated.id);
      const inspect = jest.fn(() => ({
        memory: 0,
        history: 0,
        activeWork: false,
        supported: true,
      }));
      const service = application(store.repo, [{ inspect }]);
      const result = await service.delete(
        { id: bot.id, expectedRevision: 3, retention },
        root,
      );
      expect(result).toMatchObject({
        tombstoned: true,
        retention,
        removed: { memory: 0, history: retention.history === 'keep' ? 0 : 3 },
      });
      expect(inspect).toHaveBeenCalledWith(bot);
      const retained = store.raw
        .prepare(
          'SELECT definition_json FROM bot_revisions WHERE bot_id = ? ORDER BY revision',
        )
        .all(bot.id);
      expect(retained).toEqual(
        retention.history === 'keep'
          ? before.map((definition_json) => ({ definition_json }))
          : [],
      );
      const tombstone = store.raw
        .prepare(
          'SELECT name, definition_json, retain_memory, retain_history FROM bots WHERE id = ?',
        )
        .get(bot.id);
      expect(tombstone).toEqual({
        name: retention.history === 'keep' ? bot.name : null,
        definition_json: null,
        retain_memory: retention.memory === 'keep' ? 1 : 0,
        retain_history: retention.history === 'keep' ? 1 : 0,
      });
      expect(store.repo.get(bot.id, scope)).toBeNull();
      expect(store.repo.revisions(bot.id, scope)).toEqual([]);
      expect(store.repo.list(scope).map((row) => row.definition?.id)).toEqual([
        unrelated.id,
      ]);
      await expect(service.get({ id: bot.id }, root)).rejects.toMatchObject({
        code: 'BOT_NOT_FOUND',
      });
      await expect(
        service.get({ id: bot.id, revision: 1 }, root),
      ).rejects.toMatchObject({ code: 'BOT_NOT_FOUND' });
      expect(
        store.raw.prepare('SELECT * FROM bots WHERE id = ?').get(unrelated.id),
      ).toEqual(unrelatedBefore);
      expect(snapshots(store.repo, unrelated.id)).toHaveLength(1);
    },
  );

  it.each(['keep', 'purge'] as const)(
    'refuses active work with history=%s before any deletion',
    async (history) => {
      const bot = threeRevisions(store.repo);
      const before = store.raw.prepare('SELECT * FROM bots').all();
      const revisions = snapshots(store.repo, bot.id);
      const remove = jest.spyOn(store.repo, 'delete');
      const service = application(store.repo, [
        {
          inspect: () => ({
            memory: 0,
            history: 0,
            activeWork: true,
            supported: true,
          }),
        },
      ]);
      await expect(
        service.delete(
          {
            id: bot.id,
            expectedRevision: 3,
            retention: { memory: 'purge', history },
          },
          root,
        ),
      ).rejects.toMatchObject({ code: 'BOT_ACTIVE_WORK' });
      expect(remove).not.toHaveBeenCalled();
      expect(store.raw.prepare('SELECT * FROM bots').all()).toEqual(before);
      expect(snapshots(store.repo, bot.id)).toEqual(revisions);
    },
  );

  it.each([
    { memory: 1, history: 0, supported: true },
    { memory: 0, history: 1, supported: true },
    { memory: 0, history: 0, supported: false },
  ])(
    'refuses unsupported external ownership %j without changing snapshots',
    async (ownership) => {
      const bot = threeRevisions(store.repo);
      const before = snapshots(store.repo, bot.id);
      const remove = jest.spyOn(store.repo, 'delete');
      const service = application(store.repo, [
        { inspect: () => ({ ...ownership, activeWork: false }) },
      ]);
      await expect(
        service.delete(
          {
            id: bot.id,
            expectedRevision: 3,
            retention: { memory: 'keep', history: 'keep' },
          },
          root,
        ),
      ).rejects.toMatchObject({ code: 'BOT_RETENTION_UNAVAILABLE' });
      expect(remove).not.toHaveBeenCalled();
      expect(snapshots(store.repo, bot.id)).toEqual(before);
      expect(store.repo.get(bot.id, scope)?.definition).toEqual(bot);
    },
  );

  it('compares Windows repository roots exactly and authorizes changed-case application input', async () => {
    const bot = threeRevisions(store.repo);
    const changedCase: BotScope = {
      kind: 'workspace',
      workspaceRoot: 'c:\\project',
    };
    expect(store.repo.get(bot.id, changedCase)).toBeNull();
    expect(store.repo.list(changedCase)).toEqual([]);
    expect(store.repo.revisions(bot.id, changedCase)).toEqual([]);
    expect(
      (await application(store.repo).get({ id: bot.id }, 'c:\\project')).record,
    ).toEqual(bot);
  });
});
