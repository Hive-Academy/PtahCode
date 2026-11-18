import { ADVANCED_SETTINGS } from '@ptah-extension/shared';
import type {
  OutputStyleEntry,
  RpcMethodName,
  RpcMethodParams,
  RpcMethodResult,
} from '@ptah-extension/shared';
import {
  agentConfig as lanesConfig,
  staticMocks as lanesMocks,
} from './settings-lanes.fixtures';

// Synthetic identities and paths only. Resolver strings must capture no closures.
export const WORKSPACE = 'C:\\demo-workspace';
const tools = [
  { id: 'Bash', description: 'Run shell commands in the workspace.', approxTokens: 1200, skillsNeedingIt: [] },
  { id: 'Read', description: 'Read files from the workspace.', approxTokens: 700, skillsNeedingIt: [] },
  { id: 'Edit', description: 'Make precise changes to existing files.', approxTokens: 900, skillsNeedingIt: [] },
  { id: 'Write', description: 'Create and replace workspace files.', approxTokens: 600, skillsNeedingIt: [] },
  { id: 'Glob', description: 'Find files by path pattern.', approxTokens: 400, skillsNeedingIt: [] },
  { id: 'WebSearch', description: 'Search the web for current information.', approxTokens: 1100, skillsNeedingIt: [] },
  { id: 'WebFetch', description: 'Read content from a web page.', approxTokens: 800, skillsNeedingIt: [] },
];
const enabledTools = tools.slice(0, 5).map((tool) => tool.id);
const styles: OutputStyleEntry[] = [
  { name: 'Explanatory', tier: 'builtin', description: 'Explain implementation choices as you work.', keepCodingInstructions: true, editable: false, deletable: false, immutableReason: 'built-in' },
  { name: 'Learning', tier: 'builtin', description: 'Learn through guided steps and practical examples.', keepCodingInstructions: true, editable: false, deletable: false, immutableReason: 'built-in' },
  { name: 'Team concise', tier: 'project', description: 'Clear answers, brief progress updates and focused code reviews.', keepCodingInstructions: true, editable: true, deletable: true, body: 'Use concise prose. Explain decisions and include validation results.', fileName: 'team-concise.md', relativePath: '.claude/output-styles/team-concise.md' },
];

export const staticMocks = {
  ...lanesMocks,
  'workspace:getInfo': { folders: [WORKSPACE], root: WORKSPACE, activeFolder: WORKSPACE, name: 'demo-workspace' },
  'license:getStatus': {
    valid: true, tier: 'builders', isPremium: true, isCommunity: false,
    daysRemaining: 180, expiryWarning: null,
    plan: { name: 'Ptah Builders', description: 'Builders membership', features: ['All advanced features', 'Team workflows'] },
    user: { email: 'demo@example.com', firstName: 'Demo', lastName: 'User' },
  },
  'auth:getAuthStatus': { ...lanesMocks['auth:getAuthStatus'], copilotUsername: 'demo-user' },
  'auth:getScope': { ...lanesMocks['auth:getScope'], activePath: WORKSPACE },
  'agent:getConfig': {
    ...lanesConfig, codexSandboxMode: 'workspace-write-network',
    mcpPort: 51820, mcpExternalCallerAccess: 'read-only',
    disabledMcpNamespaces: ['browser'], browserAllowLocalhost: false,
    enabledClaudeBuiltinTools: enabledTools,
    enabledClaudeBuiltinSkills: ['commit', 'anthropic-skills:docx'],
  },
  'agent:getClaudeBuiltins': {
    tools, enabledTools, enabledSkills: ['commit', 'anthropic-skills:docx'],
    terminalSkills: [{ id: 'commit', description: 'Prepare a focused commit from reviewed changes.', approxTokens: 700 }, { id: 'review', description: 'Review changes for correctness and clarity.', approxTokens: 900 }],
    syncedSkills: [{ id: 'anthropic-skills:docx', name: 'docx', description: 'Create and edit documents.', approxTokens: 1200 }],
    policyStatus: 'verified',
  },
  'enhancedPrompts:getStatus': {
    enabled: true, hasGeneratedPrompt: true, generatedAt: '2026-11-17T12:00:00.000Z', cacheValid: true,
    detectedStack: { languages: ['TypeScript'], frameworks: ['Angular'], buildTools: ['Nx'], testingFrameworks: ['Jest', 'Playwright'], additionalTools: ['Electron'], projectType: 'desktop application', configFiles: ['package.json', 'nx.json'] },
  },
  'outputStyle:list': { styles, invalid: [], active: { name: 'Team concise', tier: 'project', missing: false } },
  'outputStyle:diagnose': { decision: { path: 'flag', styleName: 'Team concise' }, visibleTiers: ['builtin', 'user', 'project'], activeName: 'Team concise', activeMissing: false },
  'config:model-get': { model: 'claude-sonnet-4-6' },
  'config:effort-get': { effort: 'high' },
  'settings:getMotion': { success: true, preference: 'reduce' },
  'llm:getProviderStatus': {
    providers: [{ provider: 'vscode-lm', displayName: 'VS Code Language Models', isConfigured: true, defaultModel: 'copilot-gpt-4.1', capabilities: ['text-chat'] }],
    defaultProvider: 'vscode-lm',
  },
  'llm:listVsCodeModels': [{ id: 'copilot-gpt-4.1', name: 'GPT-4.1', displayName: 'GPT-4.1', vendor: 'copilot', family: 'gpt-4.1', version: '1', maxInputTokens: 128000 }],
  'llm:listProviderModels': { models: [{ id: 'copilot-gpt-4.1', displayName: 'GPT-4.1' }, { id: 'copilot-claude-sonnet', displayName: 'Claude Sonnet' }] },
  'agent:setConfig': { success: true },
  'settings:set': { success: true },
} satisfies Partial<{ [M in RpcMethodName]: RpcMethodResult<M> }>;

const settingsValues: Record<string, unknown> = {
  ...Object.fromEntries(ADVANCED_SETTINGS.map((setting) => [setting.key, setting.default])),
  'provider.claudeCli.reasoningEffort': 'high',
  'skills.enhancement.provider': '',
  'skills.enhancement.model': 'inherit',
  'skills.enhancement.timeoutMs': 120000,
  ptahCliAgents: [],
};

function scopedSettings(params: RpcMethodParams<'config:getScopes'>): RpcMethodResult<'config:getScopes'> {
  return {
    activePath: 'C:\\demo-workspace',
    entries: params.keys.map((key) => ({ key, effectiveKey: key, scope: 'global', hasOverride: false, supportedTargets: ['global', 'app', 'workspace'], fallbackPreview: null, credentialSource: 'not-a-secret' })),
  };
}

export const dynamicMocks = {
  'config:getScopes': scopedSettings.toString(),
  'settings:get': `(params) => ({ success: true, value: (${JSON.stringify(settingsValues)})[params.key] ?? null })`,
  'outputStyle:get': `(params) => ({ style: (${JSON.stringify(styles)}).find(style => style.name === params.name && style.tier === params.tier) ?? null })`,
};
