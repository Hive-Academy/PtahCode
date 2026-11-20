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
import { BotsGetResultSchema } from '@ptah-extension/shared';
import { BotDomainError, upgradeBotDefinition } from './bot-schema-upgrades';

describe('bot schema upgrades and immutable snapshots', () => {
  let store: ReturnType<typeof open>;
  beforeEach(() => {
    store = open();
  });
  afterEach(() => {
    store.raw.close();
  });

  function legacy(): BotDefinition {
    const { origin, ...base } = definition();
    void origin;
    return BotDefinitionSchema.parse({
      ...base,
      schemaVersion: 1,
      runtime: {
        providerId: 'legacy-provider',
        modelId: 'legacy-model',
        effort: 'high',
      },
    });
  }

  it('upgrades a stored V1 current record before a V2-only bots:get reply and preserves explicit runtime', async () => {
    const bot = legacy();
    store.repo.save(bot, null);
    const before = snapshots(store.repo, bot.id);
    const result = await application(store.repo).get({ id: bot.id }, root);
    expect(BotsGetResultSchema.safeParse(result).success).toBe(true);
    expect(result.record).toMatchObject({
      schemaVersion: 2,
      origin: { kind: 'manual' },
      runtime: {
        kind: 'main',
        providerId: 'legacy-provider',
        model: 'legacy-model',
        effort: 'high',
      },
    });
    expect(snapshots(store.repo, bot.id)).toEqual(before);
  });

  it('upgrades an immutable V1 historical snapshot for the V2 wire contract without rewriting history', async () => {
    const bot = legacy();
    store.repo.save(bot, null);
    const upgraded = upgradeBotDefinition(bot);
    store.repo.save(
      {
        ...upgraded,
        revision: 2,
        updatedAt: 2000,
        instructions: 'New instructions',
      },
      1,
    );
    const before = snapshots(store.repo, bot.id);
    const result = await application(store.repo).get(
      { id: bot.id, revision: 1 },
      root,
    );
    expect(BotsGetResultSchema.safeParse(result).success).toBe(true);
    expect(result.record).toMatchObject({
      revision: 1,
      schemaVersion: 2,
      instructions: bot.instructions,
    });
    expect(snapshots(store.repo, bot.id)).toEqual(before);
    expect(
      BotDefinitionSchema.parse(JSON.parse(before[0] ?? '')).schemaVersion,
    ).toBe(1);
  });

  it.each([0, 99])(
    'refuses unsupported schema version %s preserving exact current bytes and all three snapshots',
    async (schemaVersion) => {
      const bot = threeRevisions(store.repo);
      const bytes = JSON.stringify({ ...bot, schemaVersion }, null, 2);
      store.raw
        .prepare(
          'UPDATE bots SET definition_json = ?, schema_version = ? WHERE id = ?',
        )
        .run(bytes, Math.max(1, schemaVersion), bot.id);
      const before = store.raw
        .prepare('SELECT * FROM bots WHERE id = ?')
        .get(bot.id);
      const history = snapshots(store.repo, bot.id);
      await expect(
        application(store.repo).get({ id: bot.id }, root),
      ).rejects.toMatchObject({ code: 'BOT_SCHEMA_UNSUPPORTED' });
      expect(
        store.raw.prepare('SELECT * FROM bots WHERE id = ?').get(bot.id),
      ).toEqual(before);
      expect(snapshots(store.repo, bot.id)).toEqual(history);
    },
  );

  it('preserves malformed historical bytes and current snapshot on failed historical upgrade', async () => {
    const bot = threeRevisions(store.repo);
    store.raw
      .prepare(
        'UPDATE bot_revisions SET definition_json = ? WHERE bot_id = ? AND revision = 1',
      )
      .run('{bad JSON', bot.id);
    const history = snapshots(store.repo, bot.id);
    const current = store.raw
      .prepare('SELECT * FROM bots WHERE id = ?')
      .get(bot.id);
    await expect(
      application(store.repo).get({ id: bot.id, revision: 1 }, root),
    ).rejects.toMatchObject({ code: 'BOT_SCHEMA_UNSUPPORTED' });
    expect(snapshots(store.repo, bot.id)).toEqual(history);
    expect(
      store.raw.prepare('SELECT * FROM bots WHERE id = ?').get(bot.id),
    ).toEqual(current);
  });

  it('rolls back current bytes and snapshots when a V1-to-V2 snapshot insert fails', () => {
    const bot = legacy();
    store.repo.save(bot, null);
    const before = store.raw
      .prepare('SELECT * FROM bots WHERE id = ?')
      .get(bot.id);
    const history = snapshots(store.repo, bot.id);
    store.raw.exec(
      "CREATE TRIGGER fail_upgrade BEFORE INSERT ON bot_revisions WHEN NEW.schema_version = 2 BEGIN SELECT RAISE(ABORT, 'injected snapshot failure'); END;",
    );
    expect(() =>
      store.repo.save(
        { ...upgradeBotDefinition(bot), revision: 2, updatedAt: 2000 },
        1,
      ),
    ).toThrow();
    expect(
      store.raw.prepare('SELECT * FROM bots WHERE id = ?').get(bot.id),
    ).toEqual(before);
    expect(snapshots(store.repo, bot.id)).toEqual(history);
  });

  it('pure upgrade preserves the V1 input and rejects invalid legacy runtime', () => {
    const bot = legacy();
    const bytes = JSON.stringify(bot);
    expect(upgradeBotDefinition(bot).schemaVersion).toBe(2);
    expect(JSON.stringify(bot)).toBe(bytes);
    expect(() =>
      upgradeBotDefinition({ ...bot, runtime: { providerId: '' } }),
    ).toThrow(BotDomainError);
  });
});
