/**
 * The `ProviderSessionHistoryPort` (SDK_TOKENS.PROVIDER_SESSION_HISTORY_PORT)
 * over the host pool: a history read opens the stored native session with
 * `load`, returns its replay projected to the flat stream, and leaves the
 * process as the tab's live entry for the next send (plan A15).
 *
 * Every failure rejects; `SessionHistoryRouter` maps any port rejection to
 * `nativeReadFailed`, so no host error, path or payload reaches the caller.
 */
import type {
  ProviderSessionHistoryPort,
  SessionMetadataStore,
} from '@ptah-extension/agent-sdk';
import { SessionId } from '@ptah-extension/shared';
import type { ProviderSessionOpenRequests } from './provider-session-open-request';
import {
  ProviderSessionHistoryError,
  type ProviderSessionPool,
} from './provider-session-pool';

export interface ProviderSessionHistoryPortDeps {
  readonly metadata: Pick<SessionMetadataStore, 'get'>;
  readonly pool: Pick<ProviderSessionPool, 'acquireForHistory'>;
  /** The same instance the chat host ports use. */
  readonly openRequests: Pick<ProviderSessionOpenRequests, 'request'>;
}

export function createProviderSessionHistoryPort(
  deps: ProviderSessionHistoryPortDeps,
): ProviderSessionHistoryPort {
  return {
    async read(sessionId, signal) {
      if (!SessionId.validate(sessionId))
        throw new ProviderSessionHistoryError('history-unavailable');
      const id = SessionId.from(sessionId);
      const stored = await deps.metadata.get(id);
      const execution = stored?.providerSessionExecution;
      const nativeSessionId = stored?.providerSessionThread?.nativeSessionId;
      // The detail row keeps the caller's spelling of the workspace; the
      // execution holds only its normalized key.
      const workspacePath = stored?.workspaceId;
      if (
        execution?.runtime !== 'provider-session' ||
        !nativeSessionId ||
        !workspacePath
      )
        throw new ProviderSessionHistoryError('history-unavailable');
      const request = deps.openRequests.request({
        sessionId: id,
        profile: execution.providerSession.profile,
        workspacePath,
        nativeSessionId,
      });
      const { events } = await deps.pool.acquireForHistory(id, request, signal);
      // Native replay carries no Ptah usage accounting.
      return { events, stats: null };
    },
  };
}
