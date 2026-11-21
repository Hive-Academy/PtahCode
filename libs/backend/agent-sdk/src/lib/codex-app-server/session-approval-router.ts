import type {
  ISdkPermissionHandler,
  PermissionPromptCancelledPayload,
  PermissionResponse,
  SessionApprovalDecision,
} from '@ptah-extension/shared';
import type { CodexChatApprovalReply } from './codex-chat-approval-sink';

export interface SessionApprovalAddress {
  readonly sessionId: PermissionPromptCancelledPayload['sessionId'];
  readonly threadId: string;
  readonly requestId: string;
}
export interface CodexApprovalOwnerSink {
  readonly sessionId: string;
  readonly contextId: string;
  respond(value: unknown): boolean;
  /** Settle ownership only; the router presents cancellation with its reason. */
  cancel(threadId: string, requestId: string): boolean;
}

/** A user's answer to a provider-session approval, correlated like Codex. */
export interface ProviderSessionApprovalReply {
  readonly sessionId: string;
  readonly contextId: string;
  readonly threadId: string;
  readonly requestId: string | number;
  readonly decision: SessionApprovalDecision;
  readonly reason?: string;
}

export interface ProviderSessionApprovalOwnerSink {
  readonly sessionId: string;
  readonly contextId: string;
  respond(reply: ProviderSessionApprovalReply): boolean;
  /** Settle ownership only; the router presents cancellation with its reason. */
  cancel(threadId: string, requestId: string): boolean;
}

export function sessionApprovalKey(address: SessionApprovalAddress): string {
  return JSON.stringify([
    address.sessionId,
    address.threadId,
    address.requestId,
  ]);
}

type Owner =
  | { readonly kind: 'claude' }
  | {
      readonly kind: 'codex';
      readonly sink: CodexApprovalOwnerSink;
    }
  | {
      readonly kind: 'provider-session';
      readonly sink: ProviderSessionApprovalOwnerSink;
    };
export type SessionApprovalReply =
  | { readonly kind: 'claude'; readonly response: PermissionResponse }
  | { readonly kind: 'codex'; readonly response: CodexChatApprovalReply }
  | {
      readonly kind: 'provider-session';
      readonly response: ProviderSessionApprovalReply;
    };

/** Ownership is registered when presenting, never inferred from focused provider. */
export class SessionApprovalRouter {
  private readonly owners = new Map<string, Owner>();
  constructor(
    private readonly claude: Pick<ISdkPermissionHandler, 'handleResponse'>,
    private readonly cancelled: (
      payload: PermissionPromptCancelledPayload,
    ) => void,
  ) {}

  register(address: SessionApprovalAddress, owner: Owner): () => void {
    const key = sessionApprovalKey(address);
    if (this.owners.has(key)) throw new Error('Approval already registered');
    if (owner.kind !== 'claude' && owner.sink.sessionId !== address.sessionId)
      throw new Error('Approval session mismatch');
    this.owners.set(key, owner);
    return () => {
      if (this.owners.get(key) === owner) this.owners.delete(key);
    };
  }

  respond(
    address: SessionApprovalAddress,
    reply: SessionApprovalReply,
  ): boolean {
    const key = sessionApprovalKey(address);
    const owner = this.owners.get(key);
    if (!owner || owner.kind !== reply.kind) return false;
    if (owner.kind === 'claude' && reply.kind === 'claude') {
      if (reply.response.id !== address.requestId) return false;
      this.owners.delete(key);
      this.claude.handleResponse(address.requestId, reply.response);
      return true;
    }
    if (owner.kind === 'codex' && reply.kind === 'codex') {
      const response = reply.response;
      if (!this.correlates(address, owner.sink, response)) return false;
      if (!owner.sink.respond(response)) return false;
      this.owners.delete(key);
      return true;
    }
    if (owner.kind === 'provider-session' && reply.kind === 'provider-session') {
      const response = reply.response;
      if (!this.correlates(address, owner.sink, response)) return false;
      if (!owner.sink.respond(response)) return false;
      this.owners.delete(key);
      return true;
    }
    return false;
  }

  /** The same session, thread, request and context checks for every native owner. */
  private correlates(
    address: SessionApprovalAddress,
    sink: { readonly contextId: string },
    response: {
      readonly sessionId: string;
      readonly threadId: string;
      readonly requestId: string | number;
      readonly contextId: string;
    },
  ): boolean {
    return (
      response.sessionId === address.sessionId &&
      response.threadId === address.threadId &&
      String(response.requestId) === address.requestId &&
      response.contextId === sink.contextId
    );
  }

  /** Emit one cancellation with the caller's reason after settling native ownership. */
  cancelPrompt(
    address: SessionApprovalAddress,
    reason: PermissionPromptCancelledPayload['reason'],
  ): void {
    const key = sessionApprovalKey(address);
    const owner = this.owners.get(key);
    if (!owner) return;
    this.owners.delete(key);
    if (owner.kind !== 'claude')
      owner.sink.cancel(address.threadId, address.requestId);
    this.cancelled({
      sessionId: address.sessionId,
      requestId: address.requestId,
      reason,
    });
  }
}
