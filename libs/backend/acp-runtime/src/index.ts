/**
 * The ACP runtime: one Agent Client Protocol agent process per session,
 * mapped to `ProviderSessionEvent`s. A vendor supplies an `AcpVendorProfile`;
 * a consumer calls `createAcpSession` and projects the events it receives.
 *
 * Nothing here re-exports an SDK runtime value: `@agentclientprotocol/sdk` is
 * ESM-only and loads lazily through `loadAcpSdk`/`connectAcp`.
 */
export {
  ACP_CANCEL_GRACE_MS,
  ACP_HANDSHAKE_TIMEOUTS_MS,
  ACP_USAGE_DRAIN_MS,
  createAcpSession,
} from './lib/acp-session-runtime';
export type {
  AcpHandshakePhase,
  AcpSession,
  AcpSessionConfig,
  AcpSessionStart,
} from './lib/acp-session-runtime';

export { readAcpErrorDetail } from './lib/acp-vendor-profile';
export type {
  AcpModelSource,
  AcpRequestFailure,
  AcpRequestMethod,
  AcpResumeStrategy,
  AcpSessionConfigEntry,
  AcpSessionOptions,
  AcpSpawnSpec,
  AcpVendorProfile,
} from './lib/acp-vendor-profile';

export { spawnAcpProcess } from './lib/acp-process-transport';
export type {
  AcpProcessExit,
  AcpProcessTransport,
  AcpSpawnOptions,
  AcpSpawnRequest,
  AcpSpawnTransport,
  AcpTransportFactory,
} from './lib/acp-process-transport';

export {
  ACP_MAX_MESSAGE_BYTES,
  AcpUnavailableError,
  connectAcp,
  loadAcpSdk,
} from './lib/acp-sdk-loader';
export type {
  AcpByteStream,
  AcpClientHandlers,
  AcpConnectionApi,
  AcpSdkModule,
} from './lib/acp-sdk-loader';

export { grokAcpProfile } from './lib/profiles/grok-acp-profile';
