import { CodexRuntimeCompositionError } from './codex-runtime-composition-error';
import type { SessionMetadataStore } from '../session-metadata-store';
import type { CodexChatMetadataPort } from '../codex-app-server/codex-chat-adapter';

/** Pass the initialized lookup as the writer so persistence also updates routing. */
export function createCodexChatMetadataPort(
  store: Pick<SessionMetadataStore, 'updateCodexExecution' | 'incrementCodexMessageCount'>,
  usageStore?: Pick<
    SessionMetadataStore,
    'get' | 'updateCodexUsageCheckpoint' | 'updateCodexTurnDuration'
  >,
): CodexChatMetadataPort {
  return {
    ...(usageStore ? {
      readUsage: async (sessionId) => {
        const row = await usageStore.get(sessionId);
        return {
          checkpoint: row?.codexUsageCheckpoint,
          duration: row?.codexTurnDuration,
          messageCount: row?.codexMessageCount ?? 0,
        };
      },
      persistUsage: (sessionId, checkpoint, duration) =>
        usageStore.updateCodexUsageCheckpoint(sessionId, checkpoint, duration),
      persistDuration: (sessionId, duration) =>
        usageStore.updateCodexTurnDuration(sessionId, duration),
    } satisfies Pick<
      CodexChatMetadataPort,
      'readUsage' | 'persistUsage' | 'persistDuration'
    > : {}),
    completedTurn: (sessionId) => store.incrementCodexMessageCount(sessionId),
    save: (sessionId, identity, title) => {
      if (sessionId !== identity.threadId) {
        return Promise.reject(
          new CodexRuntimeCompositionError('session-thread-mismatch'),
        );
      }
      return store.updateCodexExecution(sessionId, () => ({
        version: 1,
        runtime: 'codex-app-server',
        sessionId,
        providerId: identity.providerId,
        workspaceId: identity.workspaceId,
        codex: { normalizedHome: identity.normalizedHome },
      }), undefined, title);
    },
  };
}
