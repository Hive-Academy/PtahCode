import { z } from 'zod';
import {
  BOT_AVATAR_MAX_BYTES,
  BotAvatarDataSchema,
  BotAvatarSchema,
  BotAvatarGetParamsSchema,
  BotAvatarGetResultSchema,
  BotAvatarUploadParamsSchema,
  BotCreateSourceSchema,
  BotDefinitionSchema,
  BotDefinitionSchemaV1,
  BotDefinitionSchemaV2,
  BotEditableSchema,
  BotPreviewItemSchema,
  BotRuntimeSchema,
  BotsCreateParamsSchema,
  BotsListParamsSchema,
  BotsListResultSchema,
  BotsRpcSchemas,
  BotsUpdateParamsSchema,
} from './rpc-bots.schemas';

const id = 'b4a8bb4a-67e9-4b59-a943-4f5873c40d16';
const editable = {
  name: 'Helper',
  description: '',
  instructions: '  Keep original whitespace.\n',
  scope: { kind: 'workspace', workspaceRoot: 'D:/work' },
  skills: [],
  runtime: { kind: 'default' },
  memoryScope: { kind: 'private' },
  toolRequirements: { allow: ['unknown:tool'], deny: ['unknown:tool'] },
  triggers: [],
  approvalRules: { mode: 'ask' },
};
const record = {
  ...editable,
  schemaVersion: 2,
  id,
  revision: 1,
  enabled: false,
  createdAt: 0,
  updatedAt: 0,
  archivedAt: null,
  origin: { kind: 'manual' },
};

describe('bots contracts', () => {
  it('keeps malformed preview items visible without inventing valid definitions', () => {
    const invalid = {
      source: {
        kind: 'preset',
        presetId: 'selected',
        sourceLocationId: 'trusted-store',
        itemId: 'item',
      },
      fingerprint: 'content-hash',
      originalRole: '',
      originalInstructions: '',
      status: 'invalid',
      diagnostics: [
        {
          code: 'INVALID_DEFINITION',
          message: 'Instructions missing',
          severity: 'error',
        },
      ],
    };
    expect(BotPreviewItemSchema.parse(invalid)).toEqual(invalid);
    expect(
      BotPreviewItemSchema.safeParse({ ...invalid, status: 'valid' }).success,
    ).toBe(false);
    expect(
      BotPreviewItemSchema.safeParse({
        ...invalid,
        status: 'valid',
        definition: editable,
      }).success,
    ).toBe(true);
  });
  it('defines all eleven DTOs without activating the method registry', () => {
    expect(Object.keys(BotsRpcSchemas)).toHaveLength(11);
    for (const entry of Object.values(BotsRpcSchemas)) {
      expect(entry.params).toBeInstanceOf(z.ZodObject);
      expect(entry.result).toBeInstanceOf(z.ZodObject);
      expect(entry.params.safeParse({ injected: true }).success).toBe(false);
      expect(entry.result.safeParse({ injected: true }).success).toBe(false);
    }
  });
  it('applies creation defaults only and preserves instructions', () => {
    const result = BotsCreateParamsSchema.parse({
      definition: {
        name: 'Helper',
        instructions: editable.instructions,
        scope: editable.scope,
      },
    });
    expect(result.schemaVersion).toBe(2);
    expect(result.definition.runtime).toEqual({ kind: 'default' });
    expect(result.definition.memoryScope).toEqual({ kind: 'private' });
    expect(result.definition.approvalRules).toEqual({ mode: 'ask' });
    expect(result.definition.instructions).toBe(editable.instructions);
    const { runtime: omitted, ...missingRuntime } = editable;
    expect(omitted).toEqual({ kind: 'default' });
    expect(
      BotsUpdateParamsSchema.safeParse({
        id,
        expectedRevision: 1,
        schemaVersion: 2,
        definition: missingRuntime,
      }).success,
    ).toBe(false);
    expect(
      BotsListParamsSchema.parse({ workspaceRoot: 'D:/work' }),
    ).toMatchObject({ scopeFilter: 'all', includeArchived: false });
  });
  it.each(['name', 'instructions'])('rejects blank %s', (field) => {
    expect(
      BotEditableSchema.safeParse({ ...editable, [field]: ' \n ' }).success,
    ).toBe(false);
  });
  it.each([
    'id',
    'revision',
    'origin',
    'createdAt',
    'archivedAt',
    'enabled',
    'executionAvailable',
  ])('rejects client-controlled %s', (field) => {
    expect(
      BotsCreateParamsSchema.safeParse({
        definition: { ...editable, [field]: true },
      }).success,
    ).toBe(false);
  });
  it('stores symbolic default with no provider identity', () => {
    expect(BotRuntimeSchema.parse({ kind: 'default' })).toEqual({
      kind: 'default',
    });
    expect(
      BotRuntimeSchema.safeParse({ kind: 'default', providerId: 'copied' })
        .success,
    ).toBe(false);
  });
  it.each([
    { kind: 'main', providerId: 'removed.connection', model: 'future-model' },
    {
      kind: 'lane',
      target: { kind: 'system', cli: 'future-cli' },
      modelTier: 'opus',
      effort: 'future-effort',
    },
    {
      kind: 'lane',
      target: { kind: 'ptah-cli', ptahCliId: 'removed:lane' },
      model: 'raw',
      modelTier: 'haiku',
    },
  ])('preserves unresolved runtime %j', (runtime) => {
    expect(BotRuntimeSchema.parse(runtime)).toEqual(runtime);
  });
  it.each([
    { kind: 'main', providerId: 'bad/id', model: 'x' },
    { kind: 'main', providerId: 'ok', model: '   ' },
    {
      kind: 'main',
      providerId: 'ok',
      model: 'x',
      target: { kind: 'system', cli: 'codex' },
    },
    { kind: 'lane', target: { kind: 'system', cli: 'ptah-cli' } },
    {
      kind: 'lane',
      target: { kind: 'system', cli: 'codex', ptahCliId: 'mixed' },
    },
    { kind: 'lane', target: { kind: 'system', cli: '../cmd' } },
    {
      kind: 'lane',
      target: { kind: 'ptah-cli', ptahCliId: 'x' },
      providerId: 'mixed',
    },
  ])('rejects mixed or malformed runtime %j', (runtime) => {
    expect(BotRuntimeSchema.safeParse(runtime).success).toBe(false);
  });
  it('dispatches supported versions and refuses unsupported before current validation', () => {
    const { origin, ...v1 } = record;
    expect(origin).toEqual({ kind: 'manual' });
    const legacy = {
      ...v1,
      schemaVersion: 1,
      runtime: { providerId: 'old', modelId: 'old-model' },
    };
    expect(BotDefinitionSchemaV1.parse(legacy)).toEqual(legacy);
    expect(BotDefinitionSchema.parse(legacy).schemaVersion).toBe(1);
    expect(BotDefinitionSchema.parse(record).schemaVersion).toBe(2);
    expect(BotDefinitionSchemaV2.safeParse(legacy).success).toBe(false);
    for (const schemaVersion of [0, 3, '2', undefined]) {
      const result = BotDefinitionSchema.safeParse({ schemaVersion });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0]?.path).toEqual(['schemaVersion']);
    }
    const { runtime, ...corrupt } = record;
    expect(runtime).toEqual({ kind: 'default' });
    expect(BotDefinitionSchema.safeParse(corrupt).success).toBe(false);
    expect(
      BotDefinitionSchemaV1.safeParse({
        ...legacy,
        avatar: { kind: 'icon', name: 'bot' },
      }).success,
    ).toBe(false);
  });
  it('allows only reviewed wizard provenance on create', () => {
    expect(
      BotCreateSourceSchema.parse({
        kind: 'wizard-generated',
        generationId: id,
      }),
    ).toEqual({ kind: 'wizard-generated', generationId: id });
    expect(BotCreateSourceSchema.safeParse({ kind: 'manual' }).success).toBe(
      false,
    );
    expect(
      BotsUpdateParamsSchema.safeParse({
        id,
        expectedRevision: 1,
        schemaVersion: 2,
        definition: editable,
        source: { kind: 'wizard-generated' },
      }).success,
    ).toBe(false);
  });
  it.each(['bot', 'sparkles', 'wrench', 'shield', 'code'])(
    'accepts allowlisted icon %s',
    (name) => {
      expect(BotAvatarSchema.parse({ kind: 'icon', name })).toEqual({
        kind: 'icon',
        name,
      });
    },
  );
  it.each([
    { kind: 'icon', name: 'arbitrary' },
    { kind: 'icon', name: 'Bot' },
    { kind: 'image', imageId: 'https://remote/image.png' },
    { kind: 'image', imageId: 'D:/image.png' },
    { kind: 'image', imageId: id, path: '/secret' },
  ])('rejects unsafe avatar %j', (avatar) => {
    expect(BotAvatarSchema.safeParse(avatar).success).toBe(false);
  });
  it('uses opaque image ids and strict upload/read envelopes', () => {
    expect(BotAvatarSchema.parse({ kind: 'image', imageId: id })).toEqual({
      kind: 'image',
      imageId: id,
    });
    expect(BotAvatarGetParamsSchema.parse({ botId: id, imageId: id })).toEqual({
      botId: id,
      imageId: id,
    });
    const bytes = { mediaType: 'image/png', dataBase64: 'YQ==' };
    expect(
      BotAvatarUploadParamsSchema.parse({ scope: { kind: 'user' }, ...bytes })
        .dataBase64,
    ).toBe('YQ==');
    expect(BotAvatarGetResultSchema.parse(bytes)).toEqual(bytes);
    expect(
      BotAvatarGetResultSchema.safeParse({
        ...bytes,
        mediaType: 'image/svg+xml',
      }).success,
    ).toBe(false);
  });
  it('bounds encoded and decoded bytes, enforcing canonical base64 padding', () => {
    const max = Buffer.alloc(BOT_AVATAR_MAX_BYTES).toString('base64');
    expect(BotAvatarDataSchema.safeParse(max).success).toBe(true);
    expect(
      BotAvatarDataSchema.safeParse(
        Buffer.alloc(BOT_AVATAR_MAX_BYTES + 1).toString('base64'),
      ).success,
    ).toBe(false);
    expect(
      BotAvatarDataSchema.safeParse(
        Buffer.alloc(BOT_AVATAR_MAX_BYTES + 2).toString('base64'),
      ).success,
    ).toBe(false);
    for (const value of [
      '',
      'YQ',
      'YR==',
      'YWJ=',
      'YQ==\n',
      'data:image/png;base64,YQ==',
      '/path/image.png',
    ]) {
      expect(BotAvatarDataSchema.safeParse(value).success).toBe(false);
    }
  });
  it('rejects execution availability and result extras', () => {
    const result = { record, diagnostics: [], executionAvailable: false };
    expect(BotsRpcSchemas['bots:get'].result.parse(result)).toEqual(result);
    expect(
      BotsRpcSchemas['bots:get'].result.safeParse({
        ...result,
        executionAvailable: true,
      }).success,
    ).toBe(false);
    expect(
      BotsRpcSchemas['bots:get'].result.safeParse({ ...result, injected: true })
        .success,
    ).toBe(false);
  });
  it('accepts safe unreadable identities and diagnostics alongside valid summaries', () => {
    const result = {
      executionAvailable: false,
      summaries: [
        {
          id,
          revision: 1,
          name: editable.name,
          description: editable.description,
          scope: editable.scope,
          enabled: false,
          runtime: editable.runtime,
          archivedAt: null,
          updatedAt: 0,
        },
      ],
      archivedCount: 0,
      unidentifiedRowCount: 0,
      unreadable: [
        {
          id,
          schemaVersion: 99,
          diagnostics: [
            {
              code: 'BOT_SCHEMA_UNSUPPORTED',
              message: 'Unsupported schema.',
              severity: 'error',
            },
          ],
        },
      ],
    };
    expect(BotsListResultSchema.parse(result)).toEqual(result);
    expect(
      BotsListResultSchema.safeParse({
        ...result,
        unreadable: [{ id, diagnostics: result.unreadable[0].diagnostics }],
      }).success,
    ).toBe(true);
  });
  it.each([undefined, []])(
    'refuses unreadable items without diagnostics: %j',
    (diagnostics) => {
      expect(
        BotsListResultSchema.safeParse({
          executionAvailable: false,
          summaries: [],
          archivedCount: 0,
          unidentifiedRowCount: 0,
          unreadable: [{ id, diagnostics }],
        }).success,
      ).toBe(false);
    },
  );
  it.each(['raw', 'definitionJson', 'instructions'])(
    'refuses extra unreadable item key %s',
    (key) => {
      expect(
        BotsListResultSchema.safeParse({
          executionAvailable: false,
          summaries: [],
          archivedCount: 0,
          unidentifiedRowCount: 0,
          unreadable: [
            {
              id,
              diagnostics: [
                {
                  code: 'BOT_SCHEMA_UNSUPPORTED',
                  message: 'Invalid snapshot.',
                  severity: 'error',
                },
              ],
              [key]: 'private',
            },
          ],
        }).success,
      ).toBe(false);
    },
  );
  it.each([0, 2])(
    'accepts unidentified row count %i',
    (unidentifiedRowCount) => {
      expect(
        BotsListResultSchema.parse({
          executionAvailable: false,
          summaries: [],
          unreadable: [],
          archivedCount: 0,
          unidentifiedRowCount,
        }).unidentifiedRowCount,
      ).toBe(unidentifiedRowCount);
    },
  );
  it.each([-1, 1.5, undefined])(
    'refuses invalid unidentified row count %j',
    (unidentifiedRowCount) => {
      expect(
        BotsListResultSchema.safeParse({
          executionAvailable: false,
          summaries: [],
          unreadable: [],
          archivedCount: 0,
          unidentifiedRowCount,
        }).success,
      ).toBe(false);
    },
  );
});
