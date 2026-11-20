import 'reflect-metadata';
// This suite crosses the backend barrel; use the workspace's host API test double.
jest.mock('vscode', () => jest.requireActual('../../../../__mocks__/vscode'), {
  virtual: true,
});
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import type { WriteStream } from 'node:fs';
import { container as rootContainer } from 'tsyringe';
import {
  PERSISTENCE_TOKENS,
  SqliteBotRepository,
  registerPersistenceSqliteServices,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import { BotApplicationService } from '@ptah-extension/bots';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { BotEditableSchema } from '@ptah-extension/shared';
import {
  PLATFORM_TOKENS,
  type IFileSystemProvider,
  type IWorkspaceProvider,
  type IOutputChannel,
} from '@ptah-extension/platform-core';
import { registerPlatformCliServices } from './registration';
import { CliCommandRegistry } from './implementations/cli-command-registry';

function parameter(input: unknown): SQLInputValue {
  if (input === null) return null;
  if (
    typeof input === 'string' ||
    typeof input === 'number' ||
    typeof input === 'bigint' ||
    input instanceof Uint8Array
  )
    return input;
  throw new Error('Unexpected SQLite parameter');
}

/** Same database port used by Electron, backed by Node SQLite to avoid native ABI coupling. */
function open(file: string): SqliteDatabase {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const statement = raw.prepare(sql);
      return {
        run: (...params: unknown[]) => {
          const result = statement.run(...params.map(parameter));
          return {
            changes: Number(result.changes),
            lastInsertRowid: result.lastInsertRowid,
          };
        },
        get: (...params: unknown[]) => statement.get(...params.map(parameter)),
        all: (...params: unknown[]) => statement.all(...params.map(parameter)),
        iterate: function* (...params: unknown[]) {
          yield* statement.iterate(...params.map(parameter));
        },
      };
    },
    pragma: (sql) => raw.exec(`PRAGMA ${sql}`),
    close: () => raw.close(),
    get open() {
      return raw.isOpen;
    },
    get inTransaction() {
      return raw.isTransaction;
    },
    transaction: (fn) => fn,
  };
}

describe('bots shared host compatibility', () => {
  it('edits through the CLI application and reads committed revisions through a fresh Electron-equivalent repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ptah-bots-hosts-'));
    const child = rootContainer.createChildContainer();
    const file = join(root, 'ptah.db');
    const cliDb = open(file);
    let electronDb: SqliteDatabase | undefined;
    const streams: WriteStream[] = [];
    const fsModule = jest.requireActual<typeof import('node:fs')>('node:fs');
    const createStream = fsModule.createWriteStream;
    const streamSpy = jest
      .spyOn(fsModule, 'createWriteStream')
      .mockImplementation((...args: Parameters<typeof createStream>) => {
        const stream = createStream(...args);
        streams.push(stream);
        return stream;
      });
    try {
      // Apply the production migration, without importing another project's private module.
      const migration = readFileSync(
        join(
          __dirname,
          '../../persistence-sqlite/src/lib/migrations/0076_bots.ts',
        ),
        'utf8',
      );
      const sql = /export const sql = `([\s\S]*?)`/.exec(migration)?.[1];
      if (!sql) throw new Error('Bots migration SQL missing');
      cliDb.exec(sql);
      child.registerInstance(TOKENS.LOGGER, createMockLogger());
      const logger = child.resolve<Logger>(TOKENS.LOGGER);
      registerPlatformCliServices(child, {
        appPath: root,
        userDataPath: root,
        workspacePath: root,
      });
      const workspace = child.resolve<IWorkspaceProvider>(
        PLATFORM_TOKENS.WORKSPACE_PROVIDER,
      );
      expect(workspace.getWorkspaceFolders()).toEqual([root]);
      const fs = child.resolve<IFileSystemProvider>(
        PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER,
      );
      expect(typeof fs.readFileBoundedNoFollow).toBe('function');
      const commands = child.resolve<CliCommandRegistry>(
        PLATFORM_TOKENS.COMMAND_REGISTRY,
      );
      const before = commands.getRegisteredCommands();
      child.registerInstance(PERSISTENCE_TOKENS.SQLITE_DB_PATH, file);
      registerPersistenceSqliteServices(child, logger);
      child.registerInstance(PERSISTENCE_TOKENS.SQLITE_CONNECTION, {
        db: cliDb,
      });
      const repository = child.resolve<SqliteBotRepository>(
        PERSISTENCE_TOKENS.BOT_REPOSITORY,
      );
      const application = new BotApplicationService({
        repository,
        retentionParticipants: [],
        sourceReader: { read: async () => ({ items: [], diagnostics: [] }) },
        workspaceAuthorization: { authorize: async (path) => path },
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
        logger,
      });
      const start = Date.now();
      const created = await application.create({
        definition: {
          name: 'CLI bot',
          instructions: 'Help',
          scope: { kind: 'user' },
        },
      });
      const editable = BotEditableSchema.parse({
        name: 'Edited in CLI',
        description: '',
        instructions: 'Help',
        scope: { kind: 'user' },
        runtime: { kind: 'default' },
        memoryScope: { kind: 'private' },
        skills: [],
        toolRequirements: { allow: [], deny: [] },
        triggers: [],
        approvalRules: { mode: 'ask' },
      });
      const updated = await application.update({
        schemaVersion: 2,
        id: created.record.id,
        expectedRevision: 1,
        definition: editable,
      });
      expect(updated.record.updatedAt).toBeGreaterThanOrEqual(start);
      electronDb = open(file);
      const electronRepository = new SqliteBotRepository(
        { db: electronDb },
        logger,
      );
      expect(
        electronRepository.get(created.record.id, { kind: 'user' })?.definition,
      ).toEqual(updated.record);
      expect(
        electronRepository.revisions(created.record.id, { kind: 'user' }),
      ).toHaveLength(2);
      expect(commands.getRegisteredCommands()).toEqual(before);
      // Default Date.now is also used for repository-owned staged avatar expiry.
      const staged = repository.stageAvatar(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        { kind: 'user' },
        'image/png',
        new Uint8Array([1]),
      );
      const day = 24 * 60 * 60 * 1000;
      expect(staged.expiresAt).toBeGreaterThanOrEqual(start + day);
      expect(staged.expiresAt).toBeLessThanOrEqual(Date.now() + day);
    } finally {
      electronDb?.close();
      cliDb.close();
      if (child.isRegistered(PLATFORM_TOKENS.OUTPUT_CHANNEL)) {
        child.resolve<IOutputChannel>(PLATFORM_TOKENS.OUTPUT_CHANNEL).dispose();
      }
      await Promise.all(streams.map((stream) => finished(stream)));
      streamSpy.mockRestore();
      await child.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
