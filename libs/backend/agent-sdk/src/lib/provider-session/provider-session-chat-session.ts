import { randomUUID } from 'node:crypto';
import type { ProviderSession } from '@ptah-extension/provider-session-contracts';
import {
  isPermissionLevel,
  type AgentSessionResumeConfig,
  type AgentSessionStartConfig,
  type SessionId,
} from '@ptah-extension/shared';
import type { SessionApprovalRouter } from '../codex-app-server/session-approval-router';
import { ProviderSessionApprovalSink } from './provider-session-approval-sink';
import type {
  ProviderSessionChatApprovalPresentation,
  ProviderSessionChatBinding,
  ProviderSessionChatPrepared,
} from './provider-session-chat-ports';
import {
  createSessionProjector,
  type ProviderSessionChatSession,
} from './provider-session-turn-stream';

/** A new chat session record; it has no live process until its first acquire. */
export function createProviderSessionChatSession(
  id: SessionId,
  prepared: ProviderSessionChatPrepared,
  config: AgentSessionStartConfig | AgentSessionResumeConfig,
  approvals: {
    readonly router: Pick<SessionApprovalRouter, 'register' | 'cancelPrompt'>;
    readonly presentation: ProviderSessionChatApprovalPresentation;
  },
): ProviderSessionChatSession {
  const title = [
    config.sessionTitle,
    config.sessionName,
    'name' in config ? config.name : undefined,
  ].find((candidate) => candidate?.trim());
  const tabId = config.tabId?.trim() ? config.tabId : undefined;
  // The sink reads the session's live process on each request; until the
  // first acquire completes it has none, so early requests are cancelled.
  const holder: { session?: ProviderSessionChatSession } = {};
  const sink = new ProviderSessionApprovalSink(
    id,
    () => {
      const current = holder.session;
      return current?.live
        ? { threadId: current.nativeSessionId, contextId: current.contextId }
        : undefined;
    },
    approvals.router,
    approvals.presentation,
  );
  const permission = isPermissionLevel(config.permissionLevel)
    ? config.permissionLevel
    : undefined;
  const session: ProviderSessionChatSession = {
    id,
    token: randomUUID(),
    ...(tabId ? { tabId } : {}),
    prepared,
    approvals: sink,
    projector: createSessionProjector(id),
    abort: new AbortController(),
    ...(title ? { title } : {}),
    nativeSessionId: prepared.resume?.nativeSessionId ?? '',
    contextId: '',
    settings: permission ? { permission } : {},
    busy: false,
    pendingInterrupt: false,
    stopRequested: false,
  };
  holder.session = session;
  return session;
}

/** The identity `updateProviderSessionExecution` stores for this process. */
export function providerSessionBinding(
  session: ProviderSessionChatSession,
  live: ProviderSession,
): ProviderSessionChatBinding {
  const seed = session.prepared.seed;
  const existing = seed.existingIdentity;
  const normalizedHome =
    existing?.runtime === 'provider-session'
      ? existing.providerSession.normalizedHome
      : undefined;
  return {
    execution: {
      version: 1,
      runtime: 'provider-session',
      sessionId: session.id,
      providerId: seed.providerId,
      // The store normalizes the key and keeps the caller's spelling.
      workspaceId: seed.workspacePath,
      providerSession: {
        profile: seed.profile,
        ...(normalizedHome === undefined ? {} : { normalizedHome }),
      },
    },
    thread: {
      nativeSessionId: live.nativeSessionId,
      processGeneration: live.processGeneration,
    },
  };
}
