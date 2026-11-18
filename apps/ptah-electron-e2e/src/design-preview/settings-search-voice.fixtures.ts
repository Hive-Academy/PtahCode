import type {
  RpcMethodName,
  RpcMethodParams,
  RpcMethodResult,
} from '@ptah-extension/shared';

const ROOT = 'D:\\work\\demo-workspace';

export const staticMocks = {
  'workspace:getInfo': {
    folders: [ROOT], root: ROOT, activeFolder: ROOT, name: 'demo-workspace',
  },
  'webSearch:getConfig': { providers: ['tavily', 'exa'], maxResults: 5 },
  'webSearch:setConfig': { success: true },
  'webSearch:setApiKey': { success: true },
  'webSearch:deleteApiKey': { success: true },
  'webSearch:test': {
    success: true,
    results: [
      { provider: 'tavily', success: true },
      { provider: 'exa', success: true },
    ],
  },
  'voice:listProviders': {
    ok: true,
    active: { stt: 'local', tts: 'elevenlabs' },
    providers: [
      {
        id: 'local', label: 'Local (Whisper / Kokoro)', kind: 'local',
        requiresDownload: true, requiresApiKey: false,
        supports: { stt: true, tts: true }, available: true,
      },
      {
        id: 'elevenlabs', label: 'ElevenLabs', kind: 'cloud',
        requiresDownload: false, requiresApiKey: true,
        supports: { stt: true, tts: true }, available: true,
      },
    ],
  },
  'voice:getProviderConfig': {
    ok: true,
    config: {
      sttProvider: 'local', ttsProvider: 'elevenlabs',
      local: {
        whisperModel: 'base.en', modelSource: 'curated',
        sttDownloaded: true, ttsDownloaded: true, ttsVoice: 'af_heart',
      },
      elevenlabs: {
        apiKeyConfigured: true, voiceId: 'EXAVITQu4vr4xnSDxMaL',
        ttsModelId: 'eleven_multilingual_v2', outputFormat: 'mp3_44100_128',
        sttModelId: 'scribe_v1',
      },
    },
  },
  'voice:getConfig': { ok: true, config: { whisperModel: 'base.en', downloaded: true } },
  'voice:getTtsConfig': {
    ok: true, config: { voice: 'af_heart', downloaded: true, modelSource: 'curated' },
  },
  'voice:setConfig': { ok: true },
  'voice:setTtsConfig': { ok: true },
  'voice:setProviderConfig': { ok: true },
  'voice:setApiKey': { ok: true },
  'voice:testConnection': { ok: true },
  'voice:downloadModel': { ok: true, alreadyPresent: true },
  'voice:downloadTtsModel': { ok: true, alreadyPresent: true },
  'voice:synthesize': {
    ok: true,
    audioBase64: 'UklGRiYAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQIAAAAAAA==',
    mimeType: 'audio/wav',
  },
  'diagnostics:go-vet-consent-get': {
    supported: true, workspace: { root: ROOT }, state: 'off',
    goBinary: 'C:\\Program Files\\Go\\bin\\go.exe', confirmToken: 'demo-consent-token',
  },
  'diagnostics:go-vet-consent-set': { success: true, state: 'off' },
} satisfies Partial<{ [M in RpcMethodName]: RpcMethodResult<M> }>;

function keyStatus(
  params: RpcMethodParams<'webSearch:getApiKeyStatus'>,
): RpcMethodResult<'webSearch:getApiKeyStatus'> {
  return { configured: ['tavily', 'exa'].includes(params.provider) };
}

function voices(
  params: RpcMethodParams<'voice:listVoices'>,
): RpcMethodResult<'voice:listVoices'> {
  return {
    ok: true,
    voices: params.providerId === 'elevenlabs'
      ? [
          { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah', category: 'premade' },
          { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', category: 'premade' },
        ]
      : [{ id: 'af_heart', label: 'Heart (US female)' }],
  };
}

function scopes(
  params: RpcMethodParams<'config:getScopes'>,
): RpcMethodResult<'config:getScopes'> {
  return {
    activePath: 'D:\\work\\demo-workspace',
    entries: params.keys.map((key) => ({
      key, effectiveKey: key, scope: 'global', hasOverride: false,
      supportedTargets: ['global', 'app', 'workspace'],
      fallbackPreview: null, credentialSource: 'not-a-secret',
    })),
  };
}

// UiDriver evaluates these in the main process: keep resolvers free of closures.
export const dynamicMocks = {
  'webSearch:getApiKeyStatus': keyStatus.toString(),
  'voice:listVoices': voices.toString(),
  'config:getScopes': scopes.toString(),
};
