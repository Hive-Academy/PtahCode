import { isDeepStrictEqual } from 'node:util';
import {
  BotRepositoryError,
  type BotRepository,
  type StoredBot,
  type BotRevision,
  type BotAvatarImage,
} from '@ptah-extension/persistence-sqlite';
import {
  BotEditableSchema,
  BotDefinitionSchemaV2,
  BotsListResultSchema,
  type BotDefinition,
  type BotScope,
  type BotRetention,
  type BotAvatarMediaType,
} from '@ptah-extension/shared';
import {
  BotApplicationService,
  type BotApplicationDependencies,
} from './bot-application.service';
import { BotDomainError, upgradeBotDefinition } from './bot-schema-upgrades';
import { type BotCatalogPort, type BotSourceReaderPort } from './bot-ports';
const ROOT = 'C:\\Project';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IMAGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const scope: BotScope = { kind: 'workspace', workspaceRoot: ROOT };
const sameScope = (left: BotScope, right: BotScope): boolean =>
  isDeepStrictEqual(left, right);
class RepositoryFake implements BotRepository {
  rows = new Map<string, StoredBot>();
  history = new Map<string, BotRevision[]>();
  images = new Map<string, { scope: BotScope; image: BotAvatarImage }>();
  calls: BotScope[] = [];
  writes = 0;
  failSave = false;
  list(scope: BotScope): StoredBot[] {
    this.calls.push(scope);
    return [...this.rows.values()].filter(
      (row) => row.definition && sameScope(row.definition.scope, scope),
    );
  }
  get(id: string, scope: BotScope): StoredBot | null {
    this.calls.push(scope);
    const row = this.rows.get(id);
    return row?.definition && sameScope(row.definition.scope, scope)
      ? row
      : null;
  }
  revisions(id: string, scope: BotScope): BotRevision[] {
    return this.get(id, scope) ? (this.history.get(id) ?? []) : [];
  }
  save(
    definition: BotDefinition,
    expectedRevision: number | null,
  ): { changed: boolean; definition: BotDefinition } {
    if (this.failSave) throw new BotRepositoryError('conflict', 'Race');
    const current = this.rows.get(definition.id)?.definition;
    if ((current?.revision ?? null) !== expectedRevision)
      throw new BotRepositoryError('conflict', 'Race');
    if (current) {
      const content = (bot: BotDefinition): object => {
        const { revision, updatedAt, ...rest } = bot;
        return { ...rest, ignored: typeof revision + typeof updatedAt };
      };
      if (isDeepStrictEqual(content(current), content(definition)))
        return { changed: false, definition: current };
    }
    if (definition.schemaVersion === 2 && definition.avatar?.kind === 'image') {
      const asset = this.images.get(definition.avatar.imageId);
      if (
        !asset ||
        !sameScope(asset.scope, definition.scope) ||
        (asset.image.ownerBotId !== null &&
          asset.image.ownerBotId !== definition.id)
      )
        throw new BotRepositoryError('scope-denied', 'Foreign image');
      asset.image.ownerBotId = definition.id;
    }
    this.writes++;
    this.rows.set(definition.id, {
      raw: definition,
      definition,
      diagnostics: [],
    });
    const history = this.history.get(definition.id) ?? [];
    history.push({
      botId: definition.id,
      revision: definition.revision,
      schemaVersion: definition.schemaVersion,
      definitionJson: JSON.stringify(definition),
      createdAt: definition.updatedAt,
    });
    this.history.set(definition.id, history);
    return { changed: true, definition };
  }
  delete(
    id: string,
    scope: BotScope,
    revision: number,
    retention: BotRetention,
  ): { revisionsRemoved: number; imagesRemoved: number } {
    const bot = this.get(id, scope)?.definition;
    if (!bot) throw new BotRepositoryError('not-found', 'Missing');
    if (bot.revision !== revision)
      throw new BotRepositoryError('conflict', 'Race');
    const revisionsRemoved =
      retention.history === 'purge' ? (this.history.get(id)?.length ?? 0) : 0;
    let imagesRemoved = 0;
    if (retention.history === 'purge') {
      this.history.delete(id);
      for (const [key, value] of this.images)
        if (value.image.ownerBotId === id) {
          this.images.delete(key);
          imagesRemoved++;
        }
    }
    this.rows.delete(id);
    this.writes++;
    return { revisionsRemoved, imagesRemoved };
  }
  stageAvatar(
    imageId: string,
    scope: BotScope,
    mediaType: BotAvatarMediaType,
    bytes: Uint8Array,
  ): BotAvatarImage {
    const image: BotAvatarImage = {
      imageId,
      mediaType,
      bytes,
      ownerBotId: null,
      expiresAt: 100,
    };
    this.images.set(imageId, { scope, image });
    this.writes++;
    return image;
  }
  readAvatar(imageId: string, scope: BotScope): BotAvatarImage | null {
    const asset = this.images.get(imageId);
    return asset && sameScope(asset.scope, scope) ? asset.image : null;
  }
}
const catalog: BotCatalogPort = {
  read: async () => ({
    status: 'available',
    mainProviders: [],
    lanes: [],
    skills: [{ id: 'installed' }],
    toolIds: [],
    diagnostics: [],
  }),
};
const sourceReader: BotSourceReaderPort = {
  read: async () => ({ items: [], diagnostics: [] }),
};
function setup(overrides: Partial<BotApplicationDependencies> = {}): {
  service: BotApplicationService;
  repository: RepositoryFake;
} {
  const repository = new RepositoryFake();
  return {
    repository,
    service: new BotApplicationService({
      repository,
      catalog,
      sourceReader,
      workspaceAuthorization: {
        authorize: async (root) => {
          if (root.toLowerCase() !== ROOT.toLowerCase())
            throw new Error('Closed');
          return ROOT;
        },
      },
      retentionParticipants: [],
      now: () => 10,
      newId: () => ID,
      ...overrides,
    }),
  };
}
const createInput = {
  definition: { name: 'Review', instructions: 'Keep exact text.\n', scope },
};
const editable = (record: BotDefinition): object =>
  BotEditableSchema.strip().parse(upgradeBotDefinition(record));
const updateInput = (record: BotDefinition, changes: object = {}) => ({
  id: record.id,
  expectedRevision: record.revision,
  schemaVersion: 2,
  definition: { ...editable(record), ...changes },
});
function legacyDefinition(record: BotDefinition): BotDefinition {
  const { origin, ...fields } = upgradeBotDefinition(record);
  void origin;
  return {
    ...fields,
    schemaVersion: 1,
    runtime: { providerId: 'old', modelId: 'explicit' },
  };
}
describe('BotApplicationService', () => {
  it('creates symbolic defaults without resolving active provider and accepts wizard provenance', async () => {
    const { service } = setup();
    const result = await service.create({
      ...createInput,
      source: { kind: 'wizard-generated', generationId: IMAGE },
    });
    expect(result.record).toMatchObject({
      runtime: { kind: 'default' },
      memoryScope: { kind: 'private' },
      approvalRules: { mode: 'ask' },
      origin: { kind: 'wizard-generated' },
      revision: 1,
      instructions: 'Keep exact text.\n',
      enabled: true,
    });
    expect(result.record.avatar).toBeUndefined();
    await expect(
      service.create({ ...createInput, origin: { kind: 'manual' } }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
  });
  it('returns no-op without a new snapshot and refuses stale updates', async () => {
    const { service, repository } = setup();
    const first = await service.create(createInput);
    const params = {
      id: ID,
      expectedRevision: 1,
      schemaVersion: 2,
      definition: editable(first.record),
    };
    expect((await service.update(params, [ROOT])).record.revision).toBe(1);
    expect(repository.writes).toBe(1);
    expect(
      (
        await service.update(
          { ...params, definition: { ...params.definition, name: 'New' } },
          [ROOT],
        )
      ).record.revision,
    ).toBe(2);
    await expect(service.update(params, [ROOT])).rejects.toMatchObject({
      code: 'BOT_REVISION_CONFLICT',
    });
    expect(repository.writes).toBe(2);
  });
  it('archives read-only and restores disabled', async () => {
    const { service } = setup();
    const created = await service.create(createInput);
    expect(
      (await service.archive({ id: ID, expectedRevision: 1 }, [ROOT])).record,
    ).toMatchObject({ enabled: false, archivedAt: 10, revision: 2 });
    await expect(
      service.update(
        {
          id: ID,
          expectedRevision: 2,
          schemaVersion: 2,
          definition: editable(created.record),
        },
        [ROOT],
      ),
    ).rejects.toMatchObject({ code: 'BOT_ARCHIVED' });
    await expect(
      service.setEnabled({ id: ID, expectedRevision: 2, enabled: true }, [
        ROOT,
      ]),
    ).rejects.toMatchObject({ code: 'BOT_ARCHIVED' });
    expect(
      (await service.restore({ id: ID, expectedRevision: 2 }, [ROOT])).record,
    ).toMatchObject({ enabled: false, archivedAt: null, revision: 3 });
  });
  it.each([
    { memory: 'keep', history: 'keep' },
    { memory: 'keep', history: 'purge' },
    { memory: 'purge', history: 'keep' },
    { memory: 'purge', history: 'purge' },
  ] as const)(
    'deletes transactionally with retention=%j and hides deleted revisions',
    async (retention) => {
      const { history } = retention;
      const { service, repository } = setup();
      await service.create(createInput);
      await service.setEnabled(
        { id: ID, expectedRevision: 1, enabled: false },
        [ROOT],
      );
      await service.setEnabled({ id: ID, expectedRevision: 2, enabled: true }, [
        ROOT,
      ]);
      const result = await service.delete(
        { id: ID, expectedRevision: 3, retention },
        [ROOT],
      );
      expect(result.removed).toEqual({
        memory: 0,
        history: history === 'purge' ? 3 : 0,
        avatars: 0,
      });
      expect(repository.history.has(ID)).toBe(history === 'keep');
      await expect(
        service.get({ id: ID, revision: 1 }, [ROOT]),
      ).rejects.toMatchObject({ code: 'BOT_NOT_FOUND' });
    },
  );
  it.each([
    { memory: 1, history: 0, activeWork: false, supported: true },
    { memory: 0, history: 0, activeWork: true, supported: true },
  ])('refuses unsupported retention before any deletion', async (ownership) => {
    const { service, repository } = setup({
      retentionParticipants: [{ inspect: () => ownership }],
    });
    await service.create(createInput);
    await expect(
      service.delete(
        {
          id: ID,
          expectedRevision: 1,
          retention: { memory: 'purge', history: 'purge' },
        },
        [ROOT],
      ),
    ).rejects.toBeInstanceOf(BotDomainError);
    expect(repository.writes).toBe(1);
  });
  it('preserves unknown runtime/tool references with diagnostics on save and reload', async () => {
    const { service } = setup();
    const result = await service.create({
      definition: {
        ...createInput.definition,
        runtime: { kind: 'main', providerId: 'removed', model: 'gone' },
        toolRequirements: { allow: ['missing'], deny: ['missing'] },
      },
    });
    expect(result.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining(['RUNTIME_UNRESOLVED', 'TOOL_UNRESOLVED']),
    );
    const loaded = await service.get({ id: ID }, [ROOT]);
    expect(loaded.record.runtime).toEqual(result.record.runtime);
    expect(loaded.diagnostics.length).toBeGreaterThan(0);
  });
  it.each([null, 5])(
    'reads V1 as V2 without writes or revision changes (archivedAt=%s)',
    async (archivedAt) => {
      const { service, repository } = setup();
      const created = await service.create(createInput);
      const legacy: BotDefinition = {
        ...legacyDefinition(created.record),
        archivedAt,
      };
      repository.rows.set(ID, {
        raw: legacy,
        definition: legacy,
        diagnostics: [],
      });
      repository.writes = 0;
      const loaded = await service.get({ id: ID }, [ROOT]);
      expect(loaded.record).toMatchObject({
        schemaVersion: 2,
        revision: 1,
        archivedAt,
        runtime: { kind: 'main', providerId: 'old', model: 'explicit' },
      });
      expect(repository.writes).toBe(0);
      expect(repository.rows.get(ID)?.definition?.schemaVersion).toBe(1);
      if (archivedAt === null) {
        const listed = await service.list({
          workspaceRoot: ROOT,
          scopeFilter: 'current',
        });
        expect(listed.summaries[0].revision).toBe(1);
        const updated = await service.update(
          updateInput(loaded.record, { name: 'Changed' }),
          [ROOT],
        );
        expect(updated.record).toMatchObject({
          schemaVersion: 2,
          revision: 2,
          name: 'Changed',
        });
        expect(repository.rows.get(ID)?.definition?.schemaVersion).toBe(2);
      }
    },
  );
  it('uses authorizer spelling on every repository scope call', async () => {
    const { service, repository } = setup();
    await service.create({
      definition: {
        ...createInput.definition,
        scope: { kind: 'workspace', workspaceRoot: ROOT.toLowerCase() },
      },
    });
    await service.get({ id: ID }, ROOT.toUpperCase());
    await service.list({ workspaceRoot: ROOT.toLowerCase() });
    for (const call of repository.calls)
      if (call.kind === 'workspace') expect(call.workspaceRoot).toBe(ROOT);
  });
  it('rejects user workspace-memory escalation and unknown manual skills', async () => {
    const { service, repository } = setup();
    await expect(
      service.create({
        definition: {
          ...createInput.definition,
          scope: { kind: 'user' },
          memoryScope: scope,
        },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED_WORKSPACE' });
    await expect(
      service.create({
        definition: { ...createInput.definition, skills: [{ id: 'missing' }] },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
    expect(repository.writes).toBe(0);
  });
  it('rejects invalid avatars; stages then claims valid raster bytes in save', async () => {
    let next = IMAGE;
    const { service, repository } = setup({ newId: () => next });
    await expect(
      service.uploadAvatar({
        scope,
        mediaType: 'image/png',
        dataBase64: 'AAAA',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
    expect(repository.writes).toBe(0);
    const dataBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=';
    expect(
      await service.uploadAvatar({ scope, mediaType: 'image/png', dataBase64 }),
    ).toEqual({ imageId: IMAGE });
    next = ID;
    await service.create({
      definition: {
        ...createInput.definition,
        avatar: { kind: 'image', imageId: IMAGE },
      },
    });
    expect(repository.images.get(IMAGE)?.image.ownerBotId).toBe(ID);
    expect(
      await service.getAvatar({ botId: ID, imageId: IMAGE }, [ROOT]),
    ).toEqual({ mediaType: 'image/png', dataBase64 });
  });
  it('previews source definitions repeatedly without writes and marks duplicate tuples ambiguous', async () => {
    const item = {
      source: {
        kind: 'preset' as const,
        presetId: 'preset',
        sourceLocationId: 'user',
        itemId: 'review',
      },
      fingerprint: 'hash',
      raw: {
        id: 'review',
        name: 'Review',
        description: '',
        role: 'Role',
        instructions: 'Instructions',
        tools: ['unknown'],
        executionMode: 'scheduled',
        triggers: ['daily'],
      },
    };
    const reader: BotSourceReaderPort = {
      read: async () => ({ items: [item, item], diagnostics: [] }),
    };
    const { service, repository } = setup({ sourceReader: reader });
    const input = {
      source: { kind: 'preset', presetId: 'preset' },
      targetScope: scope,
    };
    const first = await service.previewImport(input);
    expect(first).toEqual(await service.previewImport(input));
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      status: 'ambiguous',
      originalRole: 'Role',
      originalInstructions: 'Instructions',
      definition: { instructions: 'Role\n\nInstructions', triggers: [] },
    });
    expect(repository.writes).toBe(0);
  });
  it('claims an avatar on update and removes the current reference while retaining history bytes', async () => {
    const { service, repository } = setup();
    const created = await service.create(createInput);
    repository.stageAvatar(IMAGE, scope, 'image/png', new Uint8Array([1]));
    const updated = await service.update(
      updateInput(created.record, {
        avatar: { kind: 'image', imageId: IMAGE },
      }),
      [ROOT],
    );
    expect(repository.images.get(IMAGE)?.image.ownerBotId).toBe(ID);
    const { avatar, ...withoutAvatar } = updated.record;
    expect(avatar?.kind).toBe('image');
    const removed = await service.update(updateInput(withoutAvatar), [ROOT]);
    expect(removed.record.avatar).toBeUndefined();
    expect(removed.record.revision).toBe(3);
    expect(repository.images.has(IMAGE)).toBe(true);
  });
  it('keeps good summaries beside newer and malformed rows without exposing raw content', async () => {
    const { service, repository } = setup();
    const created = await service.create(createInput);
    const good: StoredBot = {
      raw: created.record,
      definition: created.record,
      diagnostics: [],
    };
    repository.list = () => [
      good,
      {
        raw: {
          id: IMAGE,
          schema_version: 99,
          definition_json: 'private instructions',
        },
        definition: null,
        diagnostics: ['unsupported-schema-version'],
      },
      {
        raw: {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          schema_version: 2,
          definition_json: '{"id":"bad-json-id"}',
        },
        definition: null,
        diagnostics: [
          'invalid-definition-json',
          'private repository diagnostic text',
        ],
      },
    ];
    const original = repository.list;
    repository.list = () => [
      ...original(scope),
      { raw: { id: 'invalid-sql-id' }, definition: null, diagnostics: [] },
      {
        raw: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
        definition: created.record,
        diagnostics: [],
      },
      {
        raw: { id: ID },
        definition: { ...created.record, scope: { kind: 'user' } },
        diagnostics: [],
      },
    ];
    const result = await service.list({
      workspaceRoot: ROOT,
      scopeFilter: 'current',
    });
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].id).toBe(ID);
    expect(result.unreadable).toHaveLength(4);
    expect(result.unreadable[0]).toMatchObject({
      id: IMAGE,
      schemaVersion: 99,
      diagnostics: [{ code: 'BOT_SCHEMA_UNSUPPORTED', severity: 'error' }],
    });
    expect(result.unreadable[1].diagnostics).toHaveLength(2);
    expect(result.unidentifiedRowCount).toBe(1);
    expect(result.archivedCount).toBe(0);
    expect(JSON.stringify(result.unreadable)).not.toContain('private');
    expect(BotsListResultSchema.parse(result)).toEqual(result);
    expect(repository.writes).toBe(1);
  });
  it('does not save redundant archive or restore requests', async () => {
    const { service, repository } = setup();
    await service.create(createInput);
    const save = jest.spyOn(repository, 'save');
    expect(
      (await service.restore({ id: ID, expectedRevision: 1 }, [ROOT])).record
        .revision,
    ).toBe(1);
    expect(save).not.toHaveBeenCalled();
    await service.archive({ id: ID, expectedRevision: 1 }, [ROOT]);
    save.mockClear();
    expect(
      (await service.archive({ id: ID, expectedRevision: 2 }, [ROOT])).record
        .revision,
    ).toBe(2);
    expect(save).not.toHaveBeenCalled();
  });
  it('maps throwing retention inspection and preserves typed source refusals', async () => {
    const refusal = new BotDomainError(
      'UNAUTHORIZED_WORKSPACE',
      'Not authorized.',
    );
    const { service, repository } = setup({
      retentionParticipants: [
        {
          inspect: () => {
            throw new Error('private');
          },
        },
      ],
      sourceReader: {
        read: async () => {
          throw refusal;
        },
      },
    });
    await service.create(createInput);
    await expect(
      service.delete(
        {
          id: ID,
          expectedRevision: 1,
          retention: { memory: 'purge', history: 'purge' },
        },
        [ROOT],
      ),
    ).rejects.toMatchObject({
      code: 'BOT_RETENTION_UNAVAILABLE',
      message: 'Bot retention ownership could not be inspected.',
    });
    await expect(
      service.previewImport({
        source: { kind: 'preset', presetId: 'p' },
        targetScope: scope,
      }),
    ).rejects.toBe(refusal);
    expect(repository.writes).toBe(1);
  });
  it.each(['removed', 'throw', 'unavailable'] as const)(
    'preserves saved skills when catalog is %s; validates only additions',
    async (mode) => {
      let failed = false;
      const dependency: BotCatalogPort = {
        read: async () => {
          if (!failed) return catalog.read(scope);
          if (mode === 'throw') throw new Error('private dependency failure');
          return {
            ...(await catalog.read(scope)),
            skills: [],
            status: mode === 'unavailable' ? 'unavailable' : 'available',
          };
        },
      };
      const { service } = setup({ catalog: dependency });
      const created = await service.create({
        definition: {
          ...createInput.definition,
          skills: [{ id: 'installed' }],
        },
      });
      failed = true;
      const input = updateInput(created.record, { name: 'Renamed' });
      const renamed = await service.update(input, [ROOT]);
      expect(renamed.record.name).toBe('Renamed');
      expect(
        renamed.diagnostics.some(
          (d) =>
            d.code ===
            (mode === 'removed' ? 'SKILL_UNRESOLVED' : 'CATALOG_UNAVAILABLE'),
        ),
      ).toBe(true);
      await expect(
        service.update(
          updateInput(renamed.record, { skills: [{ id: 'new' }] }),
          [ROOT],
        ),
      ).rejects.toMatchObject({
        code: mode === 'removed' ? 'INVALID_PARAMS' : 'PERSISTENCE_UNAVAILABLE',
      });
    },
  );
  it('sanitizes failed V1 conversion and retains it as an unreadable list item', async () => {
    const { service, repository } = setup();
    const created = await service.create(createInput);
    const legacy: BotDefinition = {
      ...legacyDefinition(created.record),
    };
    repository.rows.set(ID, {
      raw: legacy,
      definition: legacy,
      diagnostics: [],
    });
    const failure = BotDefinitionSchemaV2.safeParse({});
    const validation = jest
      .spyOn(BotDefinitionSchemaV2, 'safeParse')
      .mockReturnValue(failure);
    try {
      expect(
        (await service.list({ workspaceRoot: ROOT })).unreadable,
      ).toHaveLength(1);
      await expect(service.get({ id: ID }, [ROOT])).rejects.toMatchObject({
        code: 'BOT_SCHEMA_UNSUPPORTED',
        message: 'Invalid or unsupported bot snapshot.',
      });
    } finally {
      validation.mockRestore();
    }
  });
});
