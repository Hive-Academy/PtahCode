import type { z } from 'zod';
import type * as schemas from './rpc-bots.schemas';

export type BotId = z.output<typeof schemas.BotIdSchema>;
export type Revision = z.output<typeof schemas.RevisionSchema>;
export type BotDefaultRuntime = z.output<
  typeof schemas.BotDefaultRuntimeSchema
>;
export type BotMainRuntime = z.output<typeof schemas.BotMainRuntimeSchema>;
export type BotLaneTarget = z.output<typeof schemas.BotLaneTargetSchema>;
export type BotLaneRuntime = z.output<typeof schemas.BotLaneRuntimeSchema>;
export type BotRuntime = z.output<typeof schemas.BotRuntimeSchema>;
export type BotIconAvatar = z.output<typeof schemas.BotIconAvatarSchema>;
export type BotImageAvatar = z.output<typeof schemas.BotImageAvatarSchema>;
export type BotAvatar = z.output<typeof schemas.BotAvatarSchema>;
export type BotScope = z.output<typeof schemas.BotScopeSchema>;
export type BotMemoryScope = z.output<typeof schemas.BotMemoryScopeSchema>;
export type BotRetention = z.output<typeof schemas.BotRetentionSchema>;
export type BotSourceRef = z.output<typeof schemas.BotSourceRefSchema>;
export type BotCreateSource = z.output<typeof schemas.BotCreateSourceSchema>;
export type BotOrigin = z.output<typeof schemas.BotOriginSchema>;
export type BotSkillRef = z.output<typeof schemas.BotSkillRefSchema>;
export type BotToolRequirements = z.output<
  typeof schemas.BotToolRequirementsSchema
>;
export type BotApprovalRules = z.output<typeof schemas.BotApprovalRulesSchema>;
export type BotEditable = z.output<typeof schemas.BotEditableSchema>;
export type BotDefinitionV1 = z.output<typeof schemas.BotDefinitionSchemaV1>;
export type BotDefinitionV2 = z.output<typeof schemas.BotDefinitionSchemaV2>;
export type BotDefinition = z.output<typeof schemas.BotDefinitionSchema>;
export type BotRecord = z.output<typeof schemas.BotRecordSchema>;
export type BotDiagnostic = z.output<typeof schemas.BotDiagnosticSchema>;
export type BotAvailability = z.output<typeof schemas.BotAvailabilitySchema>;
export type BotSummary = z.output<typeof schemas.BotSummarySchema>;
export type BotsListParams = z.output<typeof schemas.BotsListParamsSchema>;
export type BotsListResult = z.output<typeof schemas.BotsListResultSchema>;
export type BotsGetParams = z.output<typeof schemas.BotsGetParamsSchema>;
export type BotsGetResult = z.output<typeof schemas.BotsGetResultSchema>;
export type BotsCreateParams = z.output<typeof schemas.BotsCreateParamsSchema>;
export type BotsUpdateParams = z.output<typeof schemas.BotsUpdateParamsSchema>;
export type BotsWriteResult = z.output<typeof schemas.BotsWriteResultSchema>;
export type BotsSetEnabledParams = z.output<
  typeof schemas.BotsSetEnabledParamsSchema
>;
export type BotsArchiveParams = z.output<
  typeof schemas.BotsArchiveParamsSchema
>;
export type BotsRestoreParams = z.output<
  typeof schemas.BotsRestoreParamsSchema
>;
export type BotsDeleteParams = z.output<typeof schemas.BotsDeleteParamsSchema>;
export type BotsDeleteResult = z.output<typeof schemas.BotsDeleteResultSchema>;
export type BotPreviewItem = z.output<typeof schemas.BotPreviewItemSchema>;
export type BotsPreviewImportParams = z.output<
  typeof schemas.BotsPreviewImportParamsSchema
>;
export type BotsPreviewImportResult = z.output<
  typeof schemas.BotsPreviewImportResultSchema
>;
export type BotAvatarMediaType = z.output<
  typeof schemas.BotAvatarMediaTypeSchema
>;
export type BotAvatarData = z.output<typeof schemas.BotAvatarDataSchema>;
export type BotAvatarUploadParams = z.output<
  typeof schemas.BotAvatarUploadParamsSchema
>;
export type BotAvatarUploadResult = z.output<
  typeof schemas.BotAvatarUploadResultSchema
>;
export type BotAvatarGetParams = z.output<
  typeof schemas.BotAvatarGetParamsSchema
>;
export type BotAvatarGetResult = z.output<
  typeof schemas.BotAvatarGetResultSchema
>;

/** Wire inputs allow creation defaults; validated results use schema outputs. */
export type BotsRpcMethods = {
  [M in keyof typeof schemas.BotsRpcSchemas]: {
    params: z.input<(typeof schemas.BotsRpcSchemas)[M]['params']>;
    result: z.output<(typeof schemas.BotsRpcSchemas)[M]['result']>;
  };
};
