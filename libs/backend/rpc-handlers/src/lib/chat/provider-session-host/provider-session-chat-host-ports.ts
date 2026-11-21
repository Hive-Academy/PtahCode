/**
 * Host side of the provider-session main chat (Antigravity, Grok, OpenCode):
 * the `ProviderSessionChatPorts` the agent-sdk adapter is built from, over
 * the host's {@link ProviderSessionPool}. Mirrors `codex-host`: preparation
 * through the chat runtime profile service, streaming through the chat
 * broadcaster, identity through the session metadata store. Electron binds
 * it to `SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS` (P8).
 */
import {
  ProviderSessionChatAdapterError,
  type HostAttentionCoordinator,
  type ProviderSessionChatPorts,
  type SessionApprovalRouter,
  type SessionMetadataStore,
} from '@ptah-extension/agent-sdk';
import {
  MESSAGE_TYPES,
  type PermissionResponse,
  type ProviderInfo,
  type SessionId,
  type SessionRuntimeIdentity,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  createChatRuntimeProfileService,
  type ChatRuntimeAdmissionDeps,
} from '../session/chat-runtime-admission';
import type { ChatStreamBroadcaster } from '../streaming/chat-stream-broadcaster.service';
import { createProviderSessionApprovalPresentation } from './provider-session-approval-presentation';
import type { ProviderSessionOpenRequests } from './provider-session-open-request';
import type { ProviderSessionPool } from './provider-session-pool';

export interface ProviderSessionChatHostPortsDeps
  extends ChatRuntimeAdmissionDeps {
  readonly logger: Pick<Logger, 'warn' | 'error'>;
  readonly info: ProviderInfo;
  readonly pool: Pick<
    ProviderSessionPool,
    'acquire' | 'release' | 'releaseAll' | 'holds'
  >;
  /** Shared with the history port, so an adopted process routes approvals here. */
  readonly openRequests: ProviderSessionOpenRequests;
  readonly metadata: Pick<
    SessionMetadataStore,
    'get' | 'updateProviderSessionExecution'
  >;
  readonly approvals: Pick<SessionApprovalRouter, 'respond'>;
  readonly broadcaster: Pick<ChatStreamBroadcaster, 'streamEventsToWebview'>;
  readonly hostAttention?: Pick<HostAttentionCoordinator, 'resolve'>;
}

export interface ProviderSessionChatHostPorts extends ProviderSessionChatPorts {
  /** Host permission bridge must try this before the Claude permission handler. */
  handlePermissionResponse(response: PermissionResponse): boolean;
  /** The tab a session's stream and cards route to (the session id when unknown). */
  tabId(sessionId: SessionId): string;
}

export function createProviderSessionChatHostPorts(
  deps: ProviderSessionChatHostPortsDeps,
): ProviderSessionChatHostPorts {
  const service = createChatRuntimeProfileService(deps);
  const tabs = new Map<SessionId, string>();
  /** Sessions with a successful acquire; only `release` forgets their routing. */
  const acquired = new Set<SessionId>();
  const tabId = (sessionId: SessionId) => tabs.get(sessionId) ?? sessionId;
  const approval = createProviderSessionApprovalPresentation({
    logger: deps.logger,
    approvals: deps.approvals,
    tabId,
    webviewManager: deps.webviewManager,
    hostAttention: deps.hostAttention,
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
  });

  /** The stored binding of a resumed session; refuses a session without one. */
  const storedBinding = async (sessionId: SessionId) => {
    const stored = await deps.metadata.get(sessionId);
    const execution = stored?.providerSessionExecution;
    const nativeSessionId = stored?.providerSessionThread?.nativeSessionId;
    if (
      execution?.runtime !== 'provider-session' ||
      execution.sessionId !== sessionId ||
      !nativeSessionId
    )
      throw new ProviderSessionChatAdapterError('resume-failed', 'prepare');
    const identity: SessionRuntimeIdentity = execution;
    return { identity, nativeSessionId };
  };

  return {
    info: deps.info,
    async prepare(config, sessionId) {
      const stored = sessionId ? await storedBinding(sessionId) : undefined;
      const execution = await service.prepare(config, stored?.identity);
      if (execution.runtime !== 'provider-session')
        throw new ProviderSessionChatAdapterError('unavailable', 'prepare');
      return {
        seed: execution.seed,
        ...(stored ? { resume: { nativeSessionId: stored.nativeSessionId } } : {}),
      };
    },
    async acquire(request, signal) {
      const { sessionId, seed } = request;
      // A failed open of a session the pool holds nothing for leaves no
      // routing state behind (the adapter never releases an id it never got).
      if (request.tabId) tabs.set(sessionId, request.tabId);
      try {
        const poolRequest = await deps.openRequests.request({
          sessionId,
          profile: seed.profile,
          workspacePath: seed.workspacePath,
          ...(request.resume
            ? { nativeSessionId: request.resume.nativeSessionId }
            : {}),
          ...(seed.model ? { model: seed.model } : {}),
        });
        // Before the open: the agent may ask for approval while it starts.
        deps.openRequests.attachApprovals(sessionId, request.approvals);
        const live = await deps.pool.acquire(sessionId, poolRequest, signal);
        acquired.add(sessionId);
        return live;
      } catch (error) {
        if (!acquired.has(sessionId)) {
          deps.openRequests.detachApprovals(sessionId);
          tabs.delete(sessionId);
        }
        throw error;
      }
    },
    holds: (sessionId, session) => deps.pool.holds(sessionId, session),
    async release(sessionId, reason) {
      try {
        await deps.pool.release(sessionId, reason);
      } finally {
        // A broken session stays addressable: the next send re-acquires with
        // the same sink, and its broken-session notice still needs the tab.
        if (reason !== 'broken') {
          acquired.delete(sessionId);
          deps.openRequests.detachApprovals(sessionId);
          tabs.delete(sessionId);
        }
      }
    },
    async releaseAll() {
      try {
        await deps.pool.releaseAll();
      } finally {
        deps.openRequests.detachAll();
        tabs.clear();
        acquired.clear();
      }
    },
    identity: {
      save: (sessionId, binding, title) =>
        deps.metadata.updateProviderSessionExecution(
          sessionId,
          () => binding.execution,
          () => ({ ...binding.thread }),
          title,
        ),
    },
    presentation: approval.presentation,
    handlePermissionResponse: approval.handlePermissionResponse,
    tabId,
    publish: (id, stream) =>
      deps.broadcaster.streamEventsToWebview(id, stream, tabId(id)),
    publishNotice: async (id, events) => {
      for (const event of events) {
        await deps.webviewManager.broadcastMessage(MESSAGE_TYPES.CHAT_CHUNK, {
          tabId: tabId(id),
          sessionId: id,
          event,
        });
      }
    },
  };
}
