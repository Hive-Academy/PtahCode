/**
 * Anthropic-compatible provider registry (shared foundation).
 *
 * Moved from `libs/backend/agent-sdk/src/lib/providers/_shared/provider-registry.ts`
 * to break the agent-sdk ↔ auth-providers dependency cycle (TASK_2026_123 Win 5).
 *
 * Both `agent-sdk` and `auth-providers` import the registry from here so
 * neither depends on the other for these pure value types.
 */

export * from './provider-registry';
export { ANTHROPIC_API_LANE_ENTRY } from './entries/anthropic-api-lane-entry';
export * from './provider-base-url';
export * from './proxy-token-placeholders';
export { isCloudTag, toCloudId } from './ollama-cloud-model-id';
export {
  CREDENTIAL_FAILURE_REASONS,
  describeModelListFailure,
  modelListErrorText,
  modelListNoticeText,
} from './model-list-failure';
export { closestLiveModel } from './closest-live-model';
export {
  COPILOT_PROVIDER_ENTRY,
  COPILOT_DEFAULT_TIERS,
} from './entries/copilot-provider-entry';
export {
  CODEX_PROVIDER_ENTRY,
  CODEX_DEFAULT_TIERS,
  resolveCodexModel,
} from './entries/codex-provider-entry';
export {
  OLLAMA_PROVIDER_ENTRY,
  OLLAMA_CLOUD_PROVIDER_ENTRY,
  OLLAMA_CLOUD_DIRECT_BASE_URL,
  LM_STUDIO_PROVIDER_ENTRY,
} from './entries/local-provider-entry';
export {
  SAKANA_PROVIDER_ENTRY,
  SAKANA_DEFAULT_TIERS,
} from './entries/sakana-provider-entry';
export { REQUESTY_PROVIDER_ENTRY } from './entries/requesty-provider-entry';
export {
  KIMI_CODE_PROVIDER_ENTRY,
  KIMI_CODE_DEFAULT_TIERS,
  KIMI_CODE_MODEL_CAPABILITIES,
} from './entries/kimi-code-provider-entry';
export { parseKimiCodeModels } from './entries/kimi-code-models';
export {
  OPENCODE_ZEN_PROVIDER_ENTRY,
  OPENCODE_GO_PROVIDER_ENTRY,
  OPENCODE_ZEN_DEFAULT_TIERS,
  OPENCODE_GO_DEFAULT_TIERS,
  isOpenCodeProviderId,
  type OpenCodeProviderId,
  type OpenCodeProtocol,
} from './entries/opencode-provider-entry';
export { ANTIGRAVITY_CLI_PROVIDER_ENTRY } from './entries/provider-session-provider-entries';

export { isChatBuiltinCommand } from './chat-builtin-commands';
