import { z } from 'zod';

export const BotIdSchema = z.uuid();
export const RevisionSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const TimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const TextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, 'Must not be blank');
const IdentitySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const ModelSchema = z.string().trim().min(1).max(200);
const EffortSchema = z.string().trim().min(1).max(64);
export const BotDefaultRuntimeSchema = z.strictObject({
  kind: z.literal('default'),
});
export const BotMainRuntimeSchema = z.strictObject({
  kind: z.literal('main'),
  providerId: IdentitySchema,
  model: ModelSchema,
  effort: EffortSchema.optional(),
});
export const BotLaneTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('system'),
    cli: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .refine((value) => value !== 'ptah-cli', 'Use a ptah-cli target'),
  }),
  z.strictObject({ kind: z.literal('ptah-cli'), ptahCliId: IdentitySchema }),
]);
export const BotLaneRuntimeSchema = z.strictObject({
  kind: z.literal('lane'),
  target: BotLaneTargetSchema,
  model: ModelSchema.optional(),
  modelTier: z.enum(['opus', 'sonnet', 'haiku']).optional(),
  effort: EffortSchema.optional(),
});
export const BotRuntimeSchema = z.discriminatedUnion('kind', [
  BotDefaultRuntimeSchema,
  BotMainRuntimeSchema,
  BotLaneRuntimeSchema,
]);
export const BotIconAvatarSchema = z.strictObject({
  kind: z.literal('icon'),
  name: z.enum(['bot', 'sparkles', 'wrench', 'shield', 'code']),
});
export const BotImageAvatarSchema = z.strictObject({
  kind: z.literal('image'),
  imageId: BotIdSchema,
});
export const BotAvatarSchema = z.discriminatedUnion('kind', [
  BotIconAvatarSchema,
  BotImageAvatarSchema,
]);
export const BotScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('workspace'), workspaceRoot: TextSchema }),
  z.strictObject({ kind: z.literal('user') }),
]);
export const BotMemoryScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('private') }),
  z.strictObject({ kind: z.literal('workspace'), workspaceRoot: TextSchema }),
]);
export const BotRetentionSchema = z.strictObject({
  memory: z.enum(['keep', 'purge']),
  history: z.enum(['keep', 'purge']),
});
export const BotSourceRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('preset'),
    presetId: TextSchema,
    sourceLocationId: TextSchema,
    itemId: TextSchema,
  }),
  z.strictObject({
    kind: z.literal('proposal'),
    workspaceRoot: TextSchema,
    sessionId: TextSchema,
    itemId: TextSchema,
  }),
]);
export const BotCreateSourceSchema = z.strictObject({
  kind: z.literal('wizard-generated'),
  generationId: BotIdSchema.optional(),
});
export const BotOriginSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('manual') }),
  BotCreateSourceSchema,
  z.strictObject({
    kind: z.literal('legacy'),
    source: BotSourceRefSchema,
    fingerprint: TextSchema,
    originalRole: z.string(),
    originalInstructions: z.string(),
    inactiveTriggers: z.array(z.string()),
    inactiveModes: z.array(z.string()),
  }),
]);
export const BotSkillRefSchema = z.strictObject({ id: TextSchema });
export const BotToolRequirementsSchema = z.strictObject({
  allow: z.array(TextSchema),
  deny: z.array(TextSchema),
});
export const BotApprovalRulesSchema = z.strictObject({
  mode: z.enum(['ask', 'auto', 'deny']),
});
export const BotEditableSchema = z.strictObject({
  name: TextSchema,
  description: z.string(),
  instructions: TextSchema,
  scope: BotScopeSchema,
  skills: z.array(BotSkillRefSchema),
  runtime: BotRuntimeSchema,
  memoryScope: BotMemoryScopeSchema,
  toolRequirements: BotToolRequirementsSchema,
  triggers: z.array(z.never()).length(0),
  approvalRules: BotApprovalRulesSchema,
  avatar: BotAvatarSchema.optional(),
});
const StoredFields = {
  id: BotIdSchema,
  revision: RevisionSchema,
  enabled: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: TimestampSchema.nullable(),
};
export const BotDefinitionSchemaV1 = BotEditableSchema.omit({
  avatar: true,
  runtime: true,
}).extend({
  ...StoredFields,
  schemaVersion: z.literal(1),
  runtime: z.strictObject({
    providerId: IdentitySchema,
    modelId: ModelSchema,
    effort: EffortSchema.optional(),
  }),
});
export const BotDefinitionSchemaV2 = BotEditableSchema.extend({
  ...StoredFields,
  schemaVersion: z.literal(2),
  origin: BotOriginSchema,
});
/** Dispatch on version before parsing; stored rows never receive creation defaults. */
export const BotDefinitionSchema = z.discriminatedUnion('schemaVersion', [
  BotDefinitionSchemaV1,
  BotDefinitionSchemaV2,
]);
export const BotRecordSchema = BotDefinitionSchemaV2;
export const BotDiagnosticSchema = z.strictObject({
  code: TextSchema,
  message: TextSchema,
  field: z.string().optional(),
  severity: z.enum(['warning', 'error']),
});
export const BotAvailabilitySchema = z.strictObject({
  executionAvailable: z.literal(false),
});
export const BotSummarySchema = BotRecordSchema.pick({
  id: true,
  revision: true,
  name: true,
  description: true,
  scope: true,
  enabled: true,
  runtime: true,
  avatar: true,
  archivedAt: true,
  updatedAt: true,
});
const DiagnosticsSchema = z.array(BotDiagnosticSchema);
const WriteKey = { id: BotIdSchema, expectedRevision: RevisionSchema };
export const BotsListParamsSchema = z.strictObject({
  workspaceRoot: TextSchema,
  scopeFilter: z.enum(['all', 'current', 'user']).default('all'),
  includeArchived: z.boolean().default(false),
  search: z.string().optional(),
});
export const BotsListResultSchema = BotAvailabilitySchema.extend({
  summaries: z.array(BotSummarySchema),
  archivedCount: z.number().int().nonnegative(),
});
export const BotsGetParamsSchema = z.strictObject({
  id: BotIdSchema,
  revision: RevisionSchema.optional(),
});
export const BotsGetResultSchema = BotAvailabilitySchema.extend({
  record: BotRecordSchema,
  diagnostics: DiagnosticsSchema,
});
const CreateEditableSchema = BotEditableSchema.extend({
  description: z.string().default(''),
  skills: z.array(BotSkillRefSchema).default([]),
  runtime: BotRuntimeSchema.default({ kind: 'default' }),
  memoryScope: BotMemoryScopeSchema.default({ kind: 'private' }),
  toolRequirements: BotToolRequirementsSchema.default({ allow: [], deny: [] }),
  triggers: z.array(z.never()).length(0).default([]),
  approvalRules: BotApprovalRulesSchema.default({ mode: 'ask' }),
});
// Scope needs an authorized workspace root; the application supplies it before parsing.
export const BotsCreateParamsSchema = z.strictObject({
  schemaVersion: z.literal(2).default(2),
  definition: CreateEditableSchema,
  source: BotCreateSourceSchema.optional(),
});
export const BotsUpdateParamsSchema = z.strictObject({
  ...WriteKey,
  schemaVersion: z.literal(2),
  definition: BotEditableSchema,
});
export const BotsWriteResultSchema = z.strictObject({
  record: BotRecordSchema,
  diagnostics: DiagnosticsSchema,
});
export const BotsSetEnabledParamsSchema = z.strictObject({
  ...WriteKey,
  enabled: z.boolean(),
});
export const BotsArchiveParamsSchema = z.strictObject(WriteKey);
export const BotsRestoreParamsSchema = z.strictObject(WriteKey);
export const BotsDeleteParamsSchema = z.strictObject({
  ...WriteKey,
  retention: BotRetentionSchema,
});
export const BotsDeleteResultSchema = z.strictObject({
  id: BotIdSchema,
  tombstoned: z.literal(true),
  retention: BotRetentionSchema,
  removed: z.strictObject({
    memory: z.number().int().nonnegative(),
    history: z.number().int().nonnegative(),
    avatars: z.number().int().nonnegative(),
  }),
});
export const BotPreviewItemSchema = z
  .strictObject({
    source: BotSourceRefSchema,
    fingerprint: TextSchema,
    definition: BotEditableSchema.optional(),
    originalRole: z.string(),
    originalInstructions: z.string(),
    status: z.enum(['valid', 'invalid', 'ambiguous']),
    diagnostics: DiagnosticsSchema,
  })
  .refine((item) => item.status !== 'valid' || item.definition !== undefined, {
    message: 'A valid preview requires a definition',
    path: ['definition'],
  });
export const BotsPreviewImportParamsSchema = z.strictObject({
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('preset'), presetId: TextSchema }),
    z.strictObject({
      kind: z.literal('proposal'),
      workspaceRoot: TextSchema,
      sessionId: TextSchema,
    }),
  ]),
  targetScope: BotScopeSchema,
});
export const BotsPreviewImportResultSchema = BotAvailabilitySchema.extend({
  items: z.array(BotPreviewItemSchema),
  diagnostics: DiagnosticsSchema,
});
export const BOT_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const BotAvatarMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/webp',
]);
/** Bound the encoded input before inspection; canonical padding also fixes decoded size. */
export const BotAvatarDataSchema = z
  .string()
  .min(4)
  .max(4 * Math.ceil(BOT_AVATAR_MAX_BYTES / 3))
  .regex(/^[A-Za-z0-9+/]*={0,2}$/)
  .refine((value) => {
    const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const last = alphabet.indexOf(value.charAt(value.length - padding - 1));
    return (
      value.length % 4 === 0 &&
      (value.length / 4) * 3 - padding <= BOT_AVATAR_MAX_BYTES &&
      (padding === 0 || (padding === 2 ? last % 16 === 0 : last % 4 === 0))
    );
  }, 'Noncanonical or oversized base64');
// Raster header, MIME and dimensions are validated by the domain image validator (B06a).
export const BotAvatarUploadParamsSchema = z.strictObject({
  scope: BotScopeSchema,
  mediaType: BotAvatarMediaTypeSchema,
  dataBase64: BotAvatarDataSchema,
});
export const BotAvatarUploadResultSchema = z.strictObject({
  imageId: BotIdSchema,
});
export const BotAvatarGetParamsSchema = z.strictObject({
  botId: BotIdSchema,
  imageId: BotIdSchema,
});
export const BotAvatarGetResultSchema = z.strictObject({
  mediaType: BotAvatarMediaTypeSchema,
  dataBase64: BotAvatarDataSchema,
});
/** DTO catalogue only: B08 owns registry activation. */
export const BotsRpcSchemas = {
  'bots:list': { params: BotsListParamsSchema, result: BotsListResultSchema },
  'bots:get': { params: BotsGetParamsSchema, result: BotsGetResultSchema },
  'bots:create': {
    params: BotsCreateParamsSchema,
    result: BotsWriteResultSchema,
  },
  'bots:update': {
    params: BotsUpdateParamsSchema,
    result: BotsWriteResultSchema,
  },
  'bots:set-enabled': {
    params: BotsSetEnabledParamsSchema,
    result: BotsWriteResultSchema,
  },
  'bots:archive': {
    params: BotsArchiveParamsSchema,
    result: BotsWriteResultSchema,
  },
  'bots:restore': {
    params: BotsRestoreParamsSchema,
    result: BotsWriteResultSchema,
  },
  'bots:delete': {
    params: BotsDeleteParamsSchema,
    result: BotsDeleteResultSchema,
  },
  'bots:preview-import': {
    params: BotsPreviewImportParamsSchema,
    result: BotsPreviewImportResultSchema,
  },
  'bots:upload-avatar': {
    params: BotAvatarUploadParamsSchema,
    result: BotAvatarUploadResultSchema,
  },
  'bots:get-avatar': {
    params: BotAvatarGetParamsSchema,
    result: BotAvatarGetResultSchema,
  },
} as const;
