import 'reflect-metadata';
import {
  MIGRATIONS,
  SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import { Logger } from '@ptah-extension/vscode-core';
import { createMockStateStorage } from '@ptah-extension/platform-core/testing';
import { OperatorSettingsSchema } from '@ptah-extension/review-contracts';
import {
  ReviewSettingsStore,
  type LiveGateRecord,
} from './review-settings.store';
import { ReviewLaneSettingsStore } from './review-lane-settings.store';

describe('ReviewSettingsStore', () => {
  it('round trips validated operator and repository settings in migration 0065', async () => {
    const Database = require('better-sqlite3') as new (
      path: string,
    ) => SqliteDatabase;
    const db = new Database(':memory:');
    try {
      const migration = MIGRATIONS.find((entry) => entry.version === 65);
      if (!migration?.sql) throw new Error('Review migration missing');
      db.exec(migration.sql);
      const logger = Object.create(Logger.prototype) as Logger;
      const connection = new SqliteConnectionService(':memory:', logger);
      Object.defineProperty(connection, 'db', { value: db });
      const store = new ReviewSettingsStore(connection);
      const settings = {
        repositories: [
          {
            owner: 'Hive-Academy',
            name: 'PtahCode',
            enabled: true,
            dryRun: true,
            publicationPaused: false,
          },
        ],
        maintainerLogins: ['maintainer'],
        pollMinutes: 30,
        globalPublicationPaused: false,
        laneCapPerPr: 6,
        confidenceFloor: 0.8,
        maxNewInline: 10,
        fallbackFamilies: [],
      } as const;
      await store.updateSettings({
        ...settings,
        repositories: [...settings.repositories],
        maintainerLogins: [...settings.maintainerLogins],
        fallbackFamilies: [],
      });
      expect(await store.getSettings()).toEqual(settings);
      const gate: LiveGateRecord = {
        repo: { owner: 'Hive-Academy', name: 'PtahCode' },
        login: 'ptah-bot',
        connectedAt: '2026-11-04T00:00:00.000Z',
        verifiedAt: '2026-11-04T00:00:00.000Z',
        attestation: {
          who: 'maintainer',
          when: '2026-11-04T00:01:00.000Z',
          permissions: [
            'Pull requests: Read and write',
            'Contents: Read',
            'Metadata: Read',
          ],
        },
      };
      await store.setLiveGate(gate);
      expect(await store.getLiveGate()).toEqual(gate);
      await store.updateSettings({
        ...settings,
        repositories: [...settings.repositories],
        maintainerLogins: [...settings.maintainerLogins],
        fallbackFamilies: [],
      });
      expect(await store.getLiveGate()).toEqual(gate);
      await store.setLiveGate(null);
      expect(await store.getLiveGate()).toBeNull();
      expect(await store.listRepositories()).toEqual(settings.repositories);
      await store.setPublicationPause(true, {
        owner: 'Hive-Academy',
        name: 'PtahCode',
      });
      expect(
        (await store.getSettings())?.repositories[0].publicationPaused,
      ).toBe(true);
      expect(await store.listRepositories()).toMatchObject([
        { publicationPaused: true },
      ]);
      await store.updateSettings({
        ...settings,
        repositories: [
          ...settings.repositories,
          {
            owner: 'Acme',
            name: 'Widget',
            enabled: false,
            dryRun: true,
            publicationPaused: false,
          },
        ],
        maintainerLogins: [],
        fallbackFamilies: [],
      });
      expect(await store.listRepositories()).toHaveLength(2);
      await store.updateSettings({
        ...settings,
        repositories: [
          {
            owner: 'Acme',
            name: 'Widget',
            enabled: true,
            dryRun: true,
            publicationPaused: false,
          },
        ],
        maintainerLogins: [],
        fallbackFamilies: [],
      });
      expect(
        db
          .prepare('SELECT repo_id, enabled, paused FROM review_repositories ORDER BY repo_id')
          .all(),
      ).toEqual([
        { repo_id: 'acme/widget', enabled: 1, paused: 0 },
        { repo_id: 'hive-academy/ptahcode', enabled: 0, paused: 1 },
      ]);
      await store.updateSettings({
        ...settings,
        repositories: [],
        maintainerLogins: [],
        fallbackFamilies: [],
      });
      expect(await store.listRepositories()).toEqual([]);
      expect(await store.getSettings()).toMatchObject({ repositories: [] });
    } finally {
      db.close();
    }
  });

  it('keeps lane settings out of settings_json so an older build still parses it (Req 1.6)', async () => {
    const Database = require('better-sqlite3') as new (
      path: string,
    ) => SqliteDatabase;
    const db = new Database(':memory:');
    try {
      const migration = MIGRATIONS.find((entry) => entry.version === 65);
      if (!migration?.sql) throw new Error('Review migration missing');
      db.exec(migration.sql);
      const logger = Object.create(Logger.prototype) as Logger;
      const connection = new SqliteConnectionService(':memory:', logger);
      Object.defineProperty(connection, 'db', { value: db });
      const store = new ReviewSettingsStore(connection);
      const lanes = new ReviewLaneSettingsStore(createMockStateStorage(), { warn: jest.fn() });
      const settings = {
        repositories: [],
        maintainerLogins: ['maintainer'],
        pollMinutes: 30,
        globalPublicationPaused: false,
        laneCapPerPr: 6,
        confidenceFloor: 0.8,
        maxNewInline: 10,
        fallbackFamilies: [],
      };
      await store.updateSettings(settings);
      await lanes.update({
        pool: [{ lane: 'codex', model: 'gpt-5.3-codex' }, { lane: 'claude', model: null }],
        pins: { verifier: { lane: 'gemini', model: null } },
      });
      await store.updateSettings(settings);
      const row = db
        .prepare('SELECT settings_json FROM review_operator_settings WHERE id = 1')
        .get() as { settings_json: string };
      const raw = JSON.parse(row.settings_json) as Record<string, unknown>;
      expect(Object.keys(raw).sort()).toEqual(
        [...Object.keys(OperatorSettingsSchema.shape), 'liveGate'].sort(),
      );
      // The parse path of a build from before this change: strip liveGate, strict parse.
      const { liveGate: _liveGate, ...legacy } = raw;
      expect(() => OperatorSettingsSchema.parse(legacy)).not.toThrow();
    } finally {
      db.close();
    }
  });
});
