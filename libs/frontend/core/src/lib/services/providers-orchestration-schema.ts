import { z } from 'zod';
import { CLI_LANE_DEFAULTS_SCHEMA, SYSTEM_CLI_TYPES } from '@ptah-extension/shared';
import type { CliDetectionResult, PtahCliSummary } from '@ptah-extension/shared';
import type { ProvidersCliAgents, ProvidersOrchestration } from './providers-settings.types';

const support = z.object({ state: z.enum(['supported', 'unsupported']), reason: z.string().optional() });
const permission = support.extend({ nativeMode: z.string().optional(), networkModes: z.array(z.enum(['allow', 'deny'])) });
const roleChannel = z.enum(['task-prompt', 'developer-instructions', 'system-prompt', 'agent-selection']);
// Loose objects keep fields that this mirror of CliDetectionResult does not list yet.
const manifest = z.looseObject({
  messaging: z.object({ steer: support, interrupt: support, continuation: support, resume: support }),
  roleChannel,
  permissionModes: z.object({ plan: permission.optional(), ask: permission.optional(), 'auto-edit': permission.optional(), yolo: permission.optional() }),
  networkModes: z.object({ allow: support, deny: support }),
  limitReader: z.object({ state: z.enum(['available', 'no-reliable-source']), source: z.string().optional(), reason: z.string().optional() }),
  mcp: support,
});
const strictDetection = z.looseObject({
  cli: z.enum([...SYSTEM_CLI_TYPES, 'ptah-cli']), installed: z.boolean(),
  messagingMode: z.enum(['steer', 'interrupt', 'queue', 'none']),
  path: z.string().optional(), version: z.string().optional(),
  codexSource: z.enum(['installed', 'bundled']).optional(), codexReason: z.string().optional(),
  ptahCliId: z.string().optional(), ptahCliName: z.string().optional(),
  providerName: z.string().optional(), providerId: z.string().optional(),
  family: z.string().optional(), preferredRank: z.number().optional(), disabled: z.boolean().optional(),
  roleDelivery: z.enum(['preamble', 'native']).optional(), roleChannel: roleChannel.optional(),
  manifest: manifest.optional(),
}) satisfies z.ZodType<CliDetectionResult>;

const detection = strictDetection.extend({
  path: z.string().optional().catch(undefined), version: z.string().optional().catch(undefined),
  codexSource: z.enum(['installed', 'bundled']).optional().catch(undefined), codexReason: z.string().optional().catch(undefined),
  ptahCliId: z.string().optional().catch(undefined), ptahCliName: z.string().optional().catch(undefined),
  providerName: z.string().optional().catch(undefined), providerId: z.string().optional().catch(undefined),
  family: z.string().optional().catch(undefined), preferredRank: z.number().optional().catch(undefined), disabled: z.boolean().optional().catch(undefined),
  roleDelivery: z.enum(['preamble', 'native']).optional().catch(undefined), roleChannel: roleChannel.optional().catch(undefined),
  manifest: manifest.optional().catch(undefined),
}) satisfies z.ZodType<CliDetectionResult>;

const cliSummary = z.looseObject({
  id: z.string(), name: z.string(), providerName: z.string(), providerId: z.string(),
  credentialSource: z.enum(['instance', 'shared-connection']).optional(),
  hasApiKey: z.boolean(), hasStoredKey: z.boolean(),
  status: z.enum(['available', 'error', 'initializing', 'unconfigured']),
  enabled: z.boolean(), modelCount: z.number(),
  reasoningEffort: z.enum(['', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
}) satisfies z.ZodType<PtahCliSummary>;

export function parseCliAgents(value: unknown): ProvidersCliAgents {
  const agents = validElements(value, cliSummary);
  return z.array(cliSummary).safeParse(value).success
    ? agents : Object.assign(agents, { missingFields: ['cliAgents'] });
}

/** Invalid elements are dropped independently so one bad lane cannot hide the others. */
function validElements<T>(value: unknown, element: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const parsed = element.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
export function parseDetectedClis(value: unknown): { clis: CliDetectionResult[]; missingFields: readonly string[] } {
  return {
    clis: validElements(value, detection),
    missingFields: z.array(strictDetection).safeParse(value).success ? [] : ['detectedClis'],
  };
}
const shape = {
  detectedClis: z.array(strictDetection), disabledClis: z.array(z.string()), preferredAgentOrder: z.array(z.string()),
  cliLaneDefaults: CLI_LANE_DEFAULTS_SCHEMA,
  codexModel: z.string(), copilotModel: z.string(), cursorModel: z.string(),
  antigravityModel: z.string().optional(), grokModel: z.string().optional(), opencodeModel: z.string().optional(),
  piModel: z.string().optional(), claudeModel: z.string().optional(),
  codexReasoningEffort: z.string(), copilotReasoningEffort: z.string(),
  grokReasoningEffort: z.string().optional(), antigravityReasoningEffort: z.string().optional(),
  piReasoningEffort: z.string().optional(), claudeReasoningEffort: z.string().optional(),
  maxConcurrentAgents: z.number(), copilotAutoApprove: z.boolean(),
  subagentPromptCacheTtl: z.enum(['auto', '5m', '1h']).optional(),
  subagentPromptCacheTtlEnvOverride: z.enum(['5m', '1h', 'invalid']).optional(),
  cursorApiKeyConfigured: z.boolean(), cursorApiKeyStored: z.boolean(), cursorApiKeyEnvSet: z.boolean(),
};
const schema = z.object(shape);

export function parseOrchestration(value: unknown): ProvidersOrchestration {
  const raw = z.record(z.string(), z.unknown()).catch({}).parse(value);
  const result = schema.safeParse(raw);
  const missingFields = result.success ? [] : [...new Set(result.error.issues.map(issue => String(issue.path[0])))];
  const read = <T>(key: keyof typeof shape, field: z.ZodType<T>, fallback: T): T => {
    const parsed = field.safeParse(raw[key]);
    return parsed.success ? parsed.data : fallback;
  };
  return {
    missingFields,
    detectedClis: parseDetectedClis(raw['detectedClis']).clis,
    disabledClis: validElements(raw['disabledClis'], z.string()),
    preferredAgentOrder: validElements(raw['preferredAgentOrder'], z.string()),
    cliLaneDefaults: read('cliLaneDefaults', shape.cliLaneDefaults, {}),
    codexModel: read('codexModel', shape.codexModel, ''),
    copilotModel: read('copilotModel', shape.copilotModel, ''),
    cursorModel: read('cursorModel', shape.cursorModel, ''),
    antigravityModel: read('antigravityModel', shape.antigravityModel, undefined),
    grokModel: read('grokModel', shape.grokModel, undefined),
    opencodeModel: read('opencodeModel', shape.opencodeModel, undefined),
    piModel: read('piModel', shape.piModel, undefined),
    claudeModel: read('claudeModel', shape.claudeModel, undefined),
    codexReasoningEffort: read('codexReasoningEffort', shape.codexReasoningEffort, ''),
    copilotReasoningEffort: read('copilotReasoningEffort', shape.copilotReasoningEffort, ''),
    grokReasoningEffort: read('grokReasoningEffort', shape.grokReasoningEffort, undefined),
    antigravityReasoningEffort: read('antigravityReasoningEffort', shape.antigravityReasoningEffort, undefined),
    piReasoningEffort: read('piReasoningEffort', shape.piReasoningEffort, undefined),
    claudeReasoningEffort: read('claudeReasoningEffort', shape.claudeReasoningEffort, undefined),
    maxConcurrentAgents: read('maxConcurrentAgents', shape.maxConcurrentAgents, 1),
    copilotAutoApprove: read('copilotAutoApprove', shape.copilotAutoApprove, false),
    subagentPromptCacheTtl: read('subagentPromptCacheTtl', shape.subagentPromptCacheTtl, 'auto') ?? 'auto',
    subagentPromptCacheTtlEnvOverride: read('subagentPromptCacheTtlEnvOverride', shape.subagentPromptCacheTtlEnvOverride, undefined),
    cursorApiKeyConfigured: read('cursorApiKeyConfigured', shape.cursorApiKeyConfigured, false),
    cursorApiKeyStored: read('cursorApiKeyStored', shape.cursorApiKeyStored, false),
    cursorApiKeyEnvSet: read('cursorApiKeyEnvSet', shape.cursorApiKeyEnvSet, false),
  };
}
