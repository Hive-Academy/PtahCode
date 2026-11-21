/**
 * The ACP runtime: one Agent Client Protocol agent process per session,
 * mapped to `ProviderSessionEvent`s. A vendor supplies an `AcpVendorProfile`;
 * a consumer calls `createAcpSession` and projects the events it receives.
 *
 * Nothing here re-exports an SDK runtime value: `@agentclientprotocol/sdk` is
 * ESM-only and loads lazily through `loadAcpSdk`/`connectAcp`.
 */
export {
  ACP_AUTH_REQUIRED_CODE,
  ACP_CANCEL_GRACE_MS,
  ACP_HANDSHAKE_TIMEOUTS_MS,
  ACP_INTERRUPT_REPLY_TIMEOUT_MS,
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
  AcpCancelBehavior,
  AcpExtensionHooks,
  AcpModelSource,
  AcpRequestFailure,
  AcpRequestMethod,
  AcpSessionConfigEntry,
  AcpSessionOptions,
  AcpSpawnSpec,
  AcpVendorProfile,
} from './lib/acp-vendor-profile';

export { spawnAcpProcess } from './lib/acp-process-transport';
export type {
  AcpCommandPreparer,
  AcpPreparedCommand,
  AcpProcessExit,
  AcpProcessTransport,
  AcpSpawnOptions,
  AcpTransportFactory,
} from './lib/acp-process-transport';

export { buildAcpSpawnEnv } from './lib/acp-spawn-env';
export type { AcpChildEnv, AcpSpawnEnv } from './lib/acp-spawn-env';

export {
  ACP_ACCEPTED_PROTOCOL_VERSIONS,
  ACP_REQUESTED_PROTOCOL_VERSION,
  checkInitializeReply,
} from './lib/acp-protocol-negotiation';
export type { AcpProtocolCheck } from './lib/acp-protocol-negotiation';

export {
  acpResponseForDecision,
  requestAcpApproval,
  toProviderApprovalRequest,
} from './lib/acp-approval-adapter';
export type { AcpApprovalOutcome } from './lib/acp-approval-adapter';

export { ACP_MAX_REPLAY_EVENTS } from './lib/acp-replay-collector';

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

export { antigravityAcpProfile } from './lib/profiles/antigravity-acp-profile';
export { grokAcpProfile } from './lib/profiles/grok-acp-profile';
