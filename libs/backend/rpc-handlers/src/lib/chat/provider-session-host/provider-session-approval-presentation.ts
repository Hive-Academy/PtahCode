import { randomUUID } from 'node:crypto';
import {
  UNROUTABLE_PERMISSION_TIMEOUT_MS,
  type HostAttentionCoordinator,
  type ProviderSessionApprovalPrompt,
  type ProviderSessionChatApprovalPresentation,
  type SessionApprovalRouter,
} from '@ptah-extension/agent-sdk';
import {
  MESSAGE_TYPES,
  attentionRequestKey,
  type PermissionRequest,
  type PermissionResponse,
  type SessionApprovalDecision,
  type SessionId,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';

export interface ProviderSessionApprovalPresentationPorts {
  readonly logger: Pick<Logger, 'warn' | 'error'>;
  readonly approvals: Pick<SessionApprovalRouter, 'respond'>;
  tabId(sessionId: SessionId): string;
  readonly webviewManager: {
    broadcastMessage(type: string, payload: unknown): Promise<void>;
  };
  /** Releases the host notice the webview attention observer raised for a request. */
  readonly hostAttention?: Pick<HostAttentionCoordinator, 'resolve'>;
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

export interface ProviderSessionApprovalPresentation {
  readonly presentation: ProviderSessionChatApprovalPresentation;
  /** Host permission bridge must try this before the Claude permission handler. */
  handlePermissionResponse(response: PermissionResponse): boolean;
}

interface PendingPrompt {
  readonly prompt: ProviderSessionApprovalPrompt;
  readonly timestamp: number;
  readonly correlationKey: string;
  promptTimer?: ReturnType<typeof setTimeout>;
}

const DECISIONS: Readonly<
  Record<PermissionResponse['decision'], SessionApprovalDecision>
> = {
  allow: 'accept',
  always_allow: 'acceptForSession',
  deny_with_message: 'decline',
  deny: 'cancel',
};

/** The card's tool name: the provider's tool kind, else a neutral name. */
function toolNameOf(prompt: ProviderSessionApprovalPrompt): string {
  const kind = prompt.request.kind?.trim();
  return kind ? kind : 'tool';
}

function toolInputOf(
  prompt: ProviderSessionApprovalPrompt,
): Readonly<Record<string, unknown>> {
  const input = prompt.request.input;
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Readonly<Record<string, unknown>>)
    : {};
}

/**
 * Correlates provider-session approval requests with renderer cards and
 * settles every terminal path: a reply, a timeout (declined, never granted),
 * a withdrawn prompt and a failed delivery. Provider sessions run only in the
 * main chat (A9), so every card routes to a tab (the session id when the tab
 * is unknown). The timeout rule is Codex's (`codex-chat-approval-presentation`):
 * an unanswered card is declined after the unroutable-permission window.
 */
export function createProviderSessionApprovalPresentation(
  ports: ProviderSessionApprovalPresentationPorts,
): ProviderSessionApprovalPresentation {
  const pending = new Map<string, PendingPrompt>();
  const wireIds = new Map<string, string>();
  const failed = (reason: unknown) => {
    ports.logger.error(
      'Provider-session approval presentation failed.',
      reason instanceof Error ? reason : new Error(String(reason)),
    );
  };
  const send = (type: string, payload: unknown) => {
    void ports.webviewManager.broadcastMessage(type, payload).catch(failed);
  };
  // Remove state before router replies can reenter the presentation.
  const takePrompt = (id: string): PendingPrompt | undefined => {
    const entry = pending.get(id);
    if (!entry) return undefined;
    if (entry.promptTimer !== undefined) {
      ports.clearTimer(entry.promptTimer);
      entry.promptTimer = undefined;
    }
    pending.delete(id);
    wireIds.delete(entry.correlationKey);
    ports.hostAttention?.resolve(
      attentionRequestKey('permission', id),
      entry.timestamp,
    );
    return entry;
  };
  const key = (prompt: ProviderSessionApprovalPrompt) =>
    JSON.stringify([
      prompt.sessionId,
      prompt.contextId,
      prompt.threadId,
      prompt.request.requestId,
    ]);
  const respond = (
    { prompt }: PendingPrompt,
    decision: SessionApprovalDecision,
    reason?: string,
  ): boolean =>
    ports.approvals.respond(
      {
        sessionId: prompt.sessionId,
        threadId: prompt.threadId,
        requestId: prompt.request.requestId,
      },
      {
        kind: 'provider-session',
        response: {
          sessionId: prompt.sessionId,
          contextId: prompt.contextId,
          threadId: prompt.threadId,
          requestId: prompt.request.requestId,
          decision,
          ...(reason === undefined ? {} : { reason }),
        },
      },
    );
  const declineApproval = (entry: PendingPrompt, reason?: string) => {
    try {
      respond(entry, 'decline', reason);
    } catch {
      // degradation-audit: reported - coded warning omits request contents.
      ports.logger.warn('Provider-session approval decline failed.', {
        code: 'approval-delivery-decline-failed',
      });
    }
  };
  const autoResolved = (id: string, { prompt }: PendingPrompt) => {
    send(MESSAGE_TYPES.PERMISSION_AUTO_RESOLVED, {
      id,
      sessionId: prompt.sessionId,
      toolName: toolNameOf(prompt),
    });
  };

  return {
    presentation: {
      present(prompt) {
        const correlationKey = key(prompt);
        const previousId = wireIds.get(correlationKey);
        if (previousId) {
          // A repeated request replaces its card; the old one is withdrawn.
          const previous = takePrompt(previousId);
          if (previous) autoResolved(previousId, previous);
        }
        const id = randomUUID();
        const timestamp = Date.now();
        const timeoutMs = UNROUTABLE_PERMISSION_TIMEOUT_MS;
        const tabId = ports.tabId(prompt.sessionId);
        const entry: PendingPrompt = { prompt, timestamp, correlationKey };
        pending.set(id, entry);
        wireIds.set(correlationKey, id);
        const payload: PermissionRequest = {
          id,
          sessionId: prompt.sessionId,
          ...(tabId === prompt.sessionId ? {} : { tabId }),
          toolName: toolNameOf(prompt),
          toolInput: toolInputOf(prompt),
          description: prompt.request.title,
          ...(prompt.request.toolCallId
            ? { toolUseId: prompt.request.toolCallId }
            : {}),
          timestamp,
          timeoutAt: timestamp + timeoutMs,
        };
        entry.promptTimer = ports.setTimer(() => {
          const current = takePrompt(id);
          if (!current) return;
          declineApproval(
            current,
            `Permission request timed out after ${timeoutMs}ms without an answer from the UI. This was a timeout, not a user denial.`,
          );
        }, timeoutMs);
        // The manager's attention observer raises the host notice.
        void ports.webviewManager
          .broadcastMessage(MESSAGE_TYPES.PERMISSION_REQUEST, payload)
          .catch((error: unknown) => {
            failed(error);
            if (pending.get(id) !== entry) return;
            const taken = takePrompt(id);
            if (taken) declineApproval(taken);
          });
      },
      cancelPrompt(payload) {
        for (const [id, entry] of [...pending]) {
          if (
            entry.prompt.sessionId !== payload.sessionId ||
            entry.prompt.request.requestId !== payload.requestId
          )
            continue;
          if (!takePrompt(id)) continue;
          send(MESSAGE_TYPES.PERMISSION_PROMPT_CANCELLED, {
            ...payload,
            requestId: id,
          });
        }
      },
    },
    handlePermissionResponse(response) {
      const taken = takePrompt(response.id);
      if (!taken) return false;
      try {
        if (respond(taken, DECISIONS[response.decision], response.reason))
          return true;
        ports.logger.warn('Provider-session approval response rejected.', {
          code: 'approval-response-rejected',
        });
      } catch {
        // degradation-audit: reported - coded warning omits sink error content.
        ports.logger.warn('Provider-session approval response failed.', {
          code: 'approval-response-failed',
        });
      }
      autoResolved(response.id, taken);
      return true;
    },
  };
}
