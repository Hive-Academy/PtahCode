import type { SessionLifecycleManager } from '@ptah-extension/agent-sdk';
import type {
  LiveChatSession,
  LiveChatSessionResolver,
} from '@ptah-extension/platform-core';

type ClaudeSessionRecord = ReturnType<SessionLifecycleManager['findMatches']>[number];
type ClaudeSessionFields = Pick<ClaudeSessionRecord, 'realSessionId' | 'tabId' | 'currentModel' | 'permissionLevel'> & {
  config: Pick<ClaudeSessionRecord['config'], 'sessionName' | 'workspaceId' | 'projectPath'>;
};

export function toClaudeLiveChatSession(record: ClaudeSessionFields): LiveChatSession {
  return {
    runtime: 'claude-sdk',
    sessionId: record.realSessionId ?? record.tabId,
    sessionName: record.config.sessionName,
    tabId: record.tabId,
    workspaceRoot: record.config.workspaceId ?? record.config.projectPath,
    cwd: record.config.projectPath,
    model: record.currentModel,
    permissionLevel: record.permissionLevel,
  };
}

type LiveChatSessionSource = (callerId: string) => readonly LiveChatSession[];

export function createLiveChatSessionResolver(
  sources: readonly LiveChatSessionSource[],
): LiveChatSessionResolver {
  return {
    resolve(callerId) {
      if (!callerId.trim()) return { kind: 'unresolved' };
      const matches = sources.flatMap((source) => source(callerId));
      const [session] = matches;
      if (!session) return { kind: 'unresolved' };
      if (matches.length > 1) return { kind: 'ambiguous' };
      return { kind: 'resolved', session };
    },
  };
}
