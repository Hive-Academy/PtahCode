import type {
  AgentOrchestrationConfig,
  CliAdapterManifest,
  PtahCliConfig,
  PtahCliSummary,
  RpcMethodName,
  RpcMethodParams,
  RpcMethodResult,
} from '@ptah-extension/shared';

const INSTANCE_ID = 'preview-openrouter';

// Capabilities travel on detection results; expanding a row makes no extra RPC.
const codexManifest: CliAdapterManifest = {
  messaging: {
    steer: { state: 'supported' },
    interrupt: { state: 'supported' },
    continuation: { state: 'supported' },
    resume: { state: 'supported' },
  },
  roleChannel: 'developer-instructions',
  permissionModes: {
    plan: {
      state: 'supported',
      nativeMode: 'read-only',
      networkModes: ['deny'],
    },
    ask: {
      state: 'supported',
      nativeMode: 'on-request',
      networkModes: ['allow', 'deny'],
    },
    'auto-edit': {
      state: 'supported',
      nativeMode: 'workspace-write',
      networkModes: ['allow', 'deny'],
    },
    yolo: {
      state: 'supported',
      nativeMode: 'danger-full-access',
      networkModes: ['allow'],
    },
  },
  networkModes: { allow: { state: 'supported' }, deny: { state: 'supported' } },
  limitReader: { state: 'available', source: 'Codex usage' },
  mcp: { state: 'supported' },
};

export const agentConfig: AgentOrchestrationConfig = {
  cliLaneDefaults: {},
  codexSandboxMode: 'danger-full-access',
  detectedClis: [
    {
      cli: 'codex',
      installed: true,
      version: 'codex-cli 0.155.1',
      messagingMode: 'steer',
      manifest: codexManifest,
    },
    {
      cli: 'claude',
      installed: true,
      version: '2.1.14',
      messagingMode: 'queue',
    },
    {
      cli: 'copilot',
      installed: true,
      version: 'GitHub Copilot CLI 1.0.83',
      messagingMode: 'queue',
    },
    { cli: 'cursor', installed: false, messagingMode: 'none' },
    {
      cli: 'ptah-cli',
      installed: true,
      messagingMode: 'queue',
      ptahCliId: INSTANCE_ID,
      ptahCliName: 'OpenRouter team',
      providerId: 'openrouter',
      providerName: 'OpenRouter',
    },
  ],
  preferredAgentOrder: ['codex', 'cursor', 'claude', INSTANCE_ID, 'copilot'],
  maxConcurrentAgents: 3,
  codexModel: 'gpt-5.5-codex',
  claudeModel: 'claude-sonnet-4-6',
  copilotModel: '',
  cursorModel: '',
  codexReasoningEffort: 'medium',
  claudeReasoningEffort: 'high',
  copilotReasoningEffort: '',
  cursorApiKeyConfigured: false,
  cursorApiKeyStored: false,
  cursorApiKeyEnvSet: false,
  codexAutoApprove: true,
  copilotAutoApprove: false,
  mcpPort: 51820,
  mcpExternalCallerAccess: 'read-only',
  disabledClis: ['copilot'],
  disabledMcpNamespaces: [],
  browserAllowLocalhost: false,
  workflowsDisabled: false,
  enabledClaudeBuiltinTools: [],
  enabledClaudeBuiltinSkills: [],
  decisionModel: {
    selection: { kind: 'unset' },
    locality: null,
    reportsConfidence: false,
    state: 'unset',
    detail: null,
  },
};

const instance: PtahCliSummary = {
  id: INSTANCE_ID,
  name: 'OpenRouter team',
  providerId: 'openrouter',
  providerName: 'OpenRouter',
  credentialSource: 'shared-connection',
  hasApiKey: true,
  hasStoredKey: true,
  status: 'available',
  enabled: true,
  modelCount: 2,
  reasoningEffort: 'medium',
};

const savedInstances: PtahCliConfig[] = [
  {
    id: INSTANCE_ID,
    name: instance.name,
    providerId: instance.providerId,
    credentialSource: 'shared-connection',
    enabled: true,
    selectedModel: 'anthropic/claude-sonnet-4.6',
    reasoningEffort: 'medium',
    tierMappings: {
      sonnet: 'anthropic/claude-sonnet-4.6',
      opus: 'anthropic/claude-opus-4.6',
      haiku: 'anthropic/claude-sonnet-4.6',
    },
    updatedAt: 1794873600000,
  },
];

// A mapped type checks each wire response against its actual RPC method.
export const staticMocks = {
  'agent:getConfig': agentConfig,
  'agent:detectClis': { clis: agentConfig.detectedClis },
  'ptahCli:list': { agents: [instance] },
  'ptahCli:testConnection': { success: true, latencyMs: 142 },
  'agent:listCliModels': {
    claude: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }],
    codex: [{ id: 'gpt-5.5-codex', name: 'GPT-5.5 Codex' }],
    copilot: [{ id: 'gpt-5.5', name: 'GPT-5.5' }],
    cursor: [],
    antigravity: [],
    grok: [],
    opencode: [],
    pi: [],
  },
  'auth:getAuthStatus': {
    authMethod: 'claudeCli',
    hasApiKey: false,
    availableProviders: [],
    anthropicProviderId: 'claude-cli',
    claudeCliInstalled: true,
    hasAnyProviderKey: true,
    hasOpenRouterKey: true,
    codexAuthenticated: true,
    codexTokenStale: false,
    copilotAuthenticated: true,
    copilotUsername: 'preview-team',
  },
  'auth:getApiKeyStatus': {
    providers: [
      {
        provider: 'openrouter',
        displayName: 'OpenRouter',
        hasApiKey: true,
        isDefault: false,
        keyHint: '•••• 7a21',
      },
    ],
  },
  'auth:getEffectiveRoute': {
    route: 'cli',
    ready: true,
    blockers: [],
    driverProviderId: 'claude-cli',
    resolvedAuthModality: 'cli',
    resolvedModel: { kind: 'unresolved' },
    storedAuthMethodDiagnostic: 'claudeCli',
    storedAuthMethodScope: 'global',
    providers: [
      { id: 'claude-cli', type: 'cli', status: 'connected' },
      { id: 'openrouter', type: 'apiKey', status: 'connected' },
      { id: 'openai-codex', type: 'oauth', status: 'connected' },
      { id: 'github-copilot', type: 'oauth', status: 'connected' },
    ],
    lastSuccessfulProbeAt: '2026-11-17T00:00:00.000Z',
    lastFailedProbeAt: null,
    probedAt: '2026-11-17T00:00:00.000Z',
    fromCache: true,
  },
  'auth:getScope': {
    authMethodScope: 'global',
    providerScope: 'global',
    activePath: 'C:\\ptah-e2e-ws',
  },
  'provider:listCustomEntries': { entries: [] },
  'llm:getProviderBaseUrl': { baseUrl: '', defaultBaseUrl: '' },
  'provider:listModels': {
    models: [
      {
        id: 'anthropic/claude-sonnet-4.6',
        name: 'Claude Sonnet 4.6',
        description: '',
        contextLength: 200000,
        supportsToolUse: true,
      },
      {
        id: 'anthropic/claude-opus-4.6',
        name: 'Claude Opus 4.6',
        description: '',
        contextLength: 200000,
        supportsToolUse: true,
      },
    ],
    totalCount: 2,
    isStatic: true,
  },
  'provider:getPlanLimits': {
    generatedAt: 1794873600000,
    owners: [],
    sessionOwners: {},
  },
  'config:model-get': { model: '' },
  'config:effort-get': { effort: 'medium' },
  'memory:getTriggers': {
    enabled: true,
    triggers: {
      idleMs: 60000,
      turnThreshold: 8,
      bootScan: true,
      curatorProvider: 'openrouter',
      curatorModel: 'anthropic/claude-sonnet-4.6',
    },
  },
} satisfies Partial<{ [M in RpcMethodName]: RpcMethodResult<M> }>;

function scopedSettings(
  params: RpcMethodParams<'config:getScopes'>,
): RpcMethodResult<'config:getScopes'> {
  return {
    activePath: 'C:\\ptah-e2e-ws',
    entries: params.keys.map((key) => ({
      key,
      effectiveKey: key,
      scope: 'global',
      hasOverride: false,
      supportedTargets: ['global', 'app', 'workspace'],
      fallbackPreview: null,
      credentialSource: 'not-a-secret',
    })),
  };
}

const settingsValues: Record<string, unknown> = {
  ptahCliAgents: savedInstances,
  'skills.enhancement.provider': '',
  'skills.enhancement.model': 'inherit',
  'skills.enhancement.timeoutMs': 120000,
};

// UiDriver compiles resolver strings in the main process; no captured closures.
export const dynamicMocks = {
  'config:getScopes': scopedSettings.toString(),
  'settings:get': `(params) => ({ success: true, value: (${JSON.stringify(settingsValues)})[params.key] ?? null })`,
};
