/**
 * ProviderSessionEvent — the one event stream every provider-session runtime
 * (ACP, OpenCode) emits, whatever the consumer (a CLI lane or the chat).
 *
 * The runtime maps its wire protocol to these events once. Consumers never
 * read the wire protocol; they project these events with
 * `projectToCliSegments` (lanes) or `createFlatStreamProjector` (stream
 * events), so every provider renders through the same two code paths.
 */

/** Token counters of one completed turn, as the provider reported them. */
export interface ProviderUsage {
  readonly model?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly contextTokens?: number;
  /**
   * The context window the agent reported for the session (ACP
   * `usage_update.size`); absent when it reported none.
   */
  readonly contextWindow?: number;
  readonly costUsd?: number;
}

/**
 * Why a session or a turn failed. `request-failed` is a JSON-RPC (or HTTP)
 * error answer to one of the runtime's requests; `turn-failed` is any other
 * failure inside a turn. The message is always user-facing.
 */
export type ProviderSessionErrorCode =
  | 'binary-missing'
  | 'handshake-timeout'
  | 'auth-required'
  | 'resume-failed'
  | 'server-start-failed'
  | 'server-auth-failed'
  | 'protocol-unsupported'
  | 'prompt-timeout'
  | 'process-exited'
  | 'cancelled'
  | 'request-failed'
  | 'turn-failed';

export interface ProviderSessionError {
  readonly code: ProviderSessionErrorCode;
  /** User-facing; never carries a credential. */
  readonly message: string;
}

/** An image or file the user attached to a turn replayed from history. */
export interface ProviderReplayAttachment {
  readonly kind: 'image' | 'file';
  readonly name?: string;
  readonly mimeType?: string;
}

/** What the agent asks the user to allow. */
export interface ProviderApprovalRequest {
  readonly requestId: string;
  readonly toolCallId?: string;
  readonly title: string;
  readonly kind?: string;
  readonly input?: unknown;
}

/** Mirrors `SessionApprovalDecision` in `@ptah-extension/shared`. */
export type ProviderApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel';

/** Where a runtime sends an approval request; abort never implies authorization. */
export interface ProviderApprovalSink {
  request(
    request: ProviderApprovalRequest,
    signal: AbortSignal,
  ): Promise<ProviderApprovalDecision>;
}

/** Status of one plan entry, as the agent reported it (`pending` when absent). */
export interface ProviderPlanEntry {
  readonly content: string;
  readonly status: string;
}

/**
 * The payload of one event, without its identity. A mapper returns bodies;
 * the runtime stamps the identity ({@link ProviderSessionEventIdentity}).
 */
export type ProviderSessionEventBody =
  /** A user turn, replayed from history (`session/load`). */
  | {
      readonly type: 'userText';
      readonly itemId: string;
      readonly text: string;
      readonly attachments?: readonly ProviderReplayAttachment[];
    }
  | { readonly type: 'textDelta'; readonly itemId: string; readonly delta: string }
  | {
      readonly type: 'reasoning';
      readonly itemId: string;
      readonly text: string;
      readonly phase: 'delta' | 'final';
    }
  | {
      readonly type: 'toolStarted';
      readonly toolId: string;
      /** The name to show: the tool title, or the kind for `edit` / `delete`. */
      readonly toolName: string;
      readonly kind?: string;
      /** The tool input when the agent sent a plain object. */
      readonly input?: Record<string, unknown>;
    }
  | { readonly type: 'toolUpdated'; readonly toolId: string; readonly output?: unknown }
  | {
      readonly type: 'toolCompleted';
      readonly toolId: string;
      readonly status: 'completed' | 'failed' | 'cancelled';
      /** The tool title remembered from `toolStarted`, when known. */
      readonly toolName?: string;
      readonly kind?: string;
      /** Text output, already capped by the runtime. */
      readonly output: string;
      readonly exitCode?: number;
      readonly errorText?: string;
    }
  | {
      readonly type: 'fileChange';
      readonly path: string;
      readonly changeKind: 'added' | 'modified';
    }
  | { readonly type: 'plan'; readonly entries: readonly ProviderPlanEntry[] }
  /** One completed turn's usage; `usage` absent means the provider sent none. */
  | {
      readonly type: 'usage';
      /** The provider's display name, used in labels and the fallback model id. */
      readonly provider: string;
      readonly turnId: string;
      readonly usage?: ProviderUsage;
    }
  | { readonly type: 'approvalRequested'; readonly request: ProviderApprovalRequest }
  | {
      readonly type: 'approvalSettled';
      readonly requestId: string;
      readonly decision: ProviderApprovalDecision;
    }
  | { readonly type: 'modeChanged'; readonly mode: string }
  | { readonly type: 'configChanged' }
  | {
      readonly type: 'info';
      readonly message: string;
      /**
       * `permission-refused`: a headless lane refused a tool request. A lane
       * writes it to its output too, so the parent reading the lane sees it.
       */
      readonly notice?: 'permission-refused';
    }
  | { readonly type: 'diagnostic'; readonly stream: 'stderr'; readonly line: string }
  | { readonly type: 'error'; readonly error: ProviderSessionError }
  | {
      readonly type: 'terminal';
      readonly status: 'completed' | 'interrupted' | 'failed';
      readonly disposition: 'reusable' | 'broken';
      readonly usage?: ProviderUsage;
      readonly error?: ProviderSessionError;
    };

export type ProviderSessionEventType = ProviderSessionEventBody['type'];

/**
 * Where an event belongs. `sessionId` and `turnId` are absent while the
 * session is still being set up (no native id yet, no turn running).
 */
export interface ProviderSessionEventIdentity {
  /** The run the session serves: the lane's agent id or the chat session id. */
  readonly contextId: string;
  /** Increments each time the runtime respawns the provider process. */
  readonly processGeneration: number;
  readonly sessionId?: string;
  readonly turnId?: string;
  /** Monotonic per session, starting at 1. */
  readonly sequence: number;
  /** Set on events collected from history replay. */
  readonly replayed?: true;
}

export type ProviderSessionEvent = ProviderSessionEventIdentity &
  ProviderSessionEventBody;
