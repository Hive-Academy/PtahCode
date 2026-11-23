/**
 * Which chat start and resume options a provider session applies, mirroring
 * `codex-chat-profile-options.ts`: a reviewed option is applied, an ambient
 * Claude-only option is stripped with a log line, and anything else is
 * refused (`unsupported-option`) instead of being dropped silently. Keys
 * only; a value never reaches a diagnostic.
 */

/** Options the provider-session host or adapter applies. */
const supportedKeys = new Set<string>([
  'projectPath',
  'workspaceId',
  'model',
  'tabId',
  'prompt',
  'name',
  'sessionName',
  'sessionTitle',
  'runtime',
  // Selects the runtime route; not a session option.
  'consumer',
  'clientMessageId',
  // Host-confirmed child identity on resume; the stored binding decides.
  'knownSessionChild',
  'permissionLevel',
  'effort',
  // Instructions (provider-session-start-options.ts).
  'systemPrompt',
  'enhancedPromptsContent',
  'outputStyleBody',
  'ptahUiFence',
  'files',
  'images',
  // Ptah MCP, its tool profile and the user's MCP servers.
  'mcpServerRunning',
  'mcpServersOverride',
  'mcpToolProfile',
  // Capability policy lineage.
  'pluginConfigAncestorRoots',
]);

/**
 * Ambient options with no provider-session meaning: Claude's partial-message
 * stream, workflow kill switch, thinking budget and output-style flag tier
 * (the style body is applied), Claude plugin directories, and the phase
 * record, whose text the chat host already folds into the prompt for every
 * runtime but Claude.
 */
const strippedKeys = new Set<string>([
  'workflowsDisabled',
  'includePartialMessages',
  'thinking',
  'outputStyleName',
  'pluginPaths',
  'phase',
]);

export interface ProviderSessionChatOptionClasses {
  readonly stripped: readonly string[];
  readonly rejected: readonly string[];
}

/** Classify the set options of one start or resume config (undefined is unset). */
export function classifyProviderSessionChatOptions(
  config: object,
): ProviderSessionChatOptionClasses {
  const stripped: string[] = [];
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || supportedKeys.has(key)) continue;
    if (strippedKeys.has(key)) stripped.push(key);
    else rejected.push(key);
  }
  return { stripped, rejected };
}
