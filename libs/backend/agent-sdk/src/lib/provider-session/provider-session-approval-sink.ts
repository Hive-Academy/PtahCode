import type {
  ProviderApprovalDecision,
  ProviderApprovalRequest,
  ProviderApprovalSink,
} from '@ptah-extension/provider-session-contracts';
import type {
  PermissionPromptCancelledPayload,
  SessionId,
} from '@ptah-extension/shared';
import type {
  ProviderSessionApprovalOwnerSink,
  ProviderSessionApprovalReply,
  SessionApprovalAddress,
  SessionApprovalRouter,
} from '../codex-app-server/session-approval-router';
import type { ProviderSessionChatApprovalPresentation } from './provider-session-chat-ports';

interface PendingApproval {
  readonly address: SessionApprovalAddress;
  readonly settle: (decision: ProviderApprovalDecision) => void;
  readonly release: () => void;
}

/** The live process the sink currently answers for; changes on re-acquire. */
export interface ProviderSessionApprovalTarget {
  readonly threadId: string;
  readonly contextId: string;
}

/**
 * The approval sink of one chat session. Each runtime request registers a
 * `provider-session` owner on the router, then the host presents it. A reply
 * settles the runtime's request with the user's decision. An abort, the end
 * of a turn or the session closing cancels it as `cancel`: an abort never
 * implies authorization.
 */
export class ProviderSessionApprovalSink implements ProviderApprovalSink {
  private readonly pending = new Map<string, PendingApproval>();
  private disposed = false;

  constructor(
    private readonly sessionId: SessionId,
    private readonly target: () => ProviderSessionApprovalTarget | undefined,
    private readonly router: Pick<
      SessionApprovalRouter,
      'register' | 'cancelPrompt'
    >,
    private readonly presentation: ProviderSessionChatApprovalPresentation,
  ) {}

  request(
    request: ProviderApprovalRequest,
    signal: AbortSignal,
  ): Promise<ProviderApprovalDecision> {
    const target = this.target();
    if (this.disposed || !target || signal.aborted)
      return Promise.resolve('cancel');
    const address: SessionApprovalAddress = {
      sessionId: this.sessionId,
      threadId: target.threadId,
      requestId: request.requestId,
    };
    const key = JSON.stringify([address.threadId, address.requestId]);
    if (this.pending.has(key)) return Promise.resolve('cancel');
    return new Promise<ProviderApprovalDecision>((resolve) => {
      let settled = false;
      const onAbort = () => this.cancel(key, 'turn-ended');
      const settle = (decision: ProviderApprovalDecision) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        this.pending.get(key)?.release();
        this.pending.delete(key);
        resolve(decision);
      };
      const owner: ProviderSessionApprovalOwnerSink = {
        sessionId: this.sessionId,
        contextId: target.contextId,
        respond: (reply: ProviderSessionApprovalReply) => {
          if (settled) return false;
          settle(reply.decision);
          return true;
        },
        // The router presents the cancellation; this only settles the request.
        cancel: () => {
          if (settled) return false;
          settle('cancel');
          return true;
        },
      };
      const release = this.router.register(address, {
        kind: 'provider-session',
        sink: owner,
      });
      this.pending.set(key, { address, settle, release });
      signal.addEventListener('abort', onAbort, { once: true });
      this.presentation.present({
        sessionId: this.sessionId,
        threadId: target.threadId,
        contextId: target.contextId,
        request,
      });
    });
  }

  /** Withdraw every open prompt (the turn ended or the process went away). */
  cancelAll(reason: PermissionPromptCancelledPayload['reason']): void {
    for (const key of [...this.pending.keys()]) this.cancel(key, reason);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAll('disposed');
  }

  private cancel(
    key: string,
    reason: PermissionPromptCancelledPayload['reason'],
  ): void {
    const pending = this.pending.get(key);
    if (!pending) return;
    // The router settles the owner (cancel -> 'cancel') and tells the host.
    this.router.cancelPrompt(pending.address, reason);
    // A router that no longer held the owner leaves the request open.
    pending.settle('cancel');
  }
}
