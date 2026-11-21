/**
 * The neutral provider-session contract: types every provider-session
 * runtime implements and every consumer reads, plus two pure projectors.
 * No I/O lives here.
 */
export type {
  ProviderMcpAttachment,
  ProviderHttpMcpAttachment,
  ProviderStdioMcpAttachment,
  ProviderModelInfo,
  ProviderSession,
  ProviderSessionAttach,
  ProviderSessionCapabilities,
  ProviderSessionLogger,
  ProviderSessionOpenRequest,
  ProviderSessionPermission,
  ProviderSessionPolicy,
  ProviderSessionProfileId,
  ProviderSessionRuntime,
  ProviderTurnFile,
  ProviderTurnImage,
  ProviderTurnInput,
  ProviderTurnReceipt,
} from './lib/provider-session.types';
export type {
  ProviderApprovalDecision,
  ProviderApprovalRequest,
  ProviderApprovalSink,
  ProviderPlanEntry,
  ProviderReplayAttachment,
  ProviderSessionError,
  ProviderSessionErrorCode,
  ProviderSessionEvent,
  ProviderSessionEventBody,
  ProviderSessionEventIdentity,
  ProviderSessionEventType,
  ProviderUsage,
} from './lib/provider-session-events';
export { projectToCliSegments } from './lib/cli-segment-projector';
export { createFlatStreamProjector } from './lib/flat-stream-projector';
export type {
  FlatStreamProjector,
  FlatStreamProjectorIds,
} from './lib/flat-stream-projector';
