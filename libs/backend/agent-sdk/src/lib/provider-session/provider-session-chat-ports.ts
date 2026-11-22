/**
 * Host-facing ports of the provider-session main chat (Antigravity, Grok,
 * OpenCode). The host (rpc-handlers `provider-session-host`, composed by
 * Electron) implements {@link ProviderSessionChatPorts} and binds it to
 * `SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS`; agent-sdk adds its own logger and
 * approval router and builds the `ProviderSessionChatAdapter` from it.
 *
 * The adapter never spawns a provider process: the host's pool owns every
 * process (plan A15) and hands the adapter a live `ProviderSession` from
 * `acquire`. agent-sdk depends only on the neutral contract
 * (`@ptah-extension/provider-session-contracts`), never on a runtime library.
 */
import type {
  ProviderApprovalRequest,
  ProviderApprovalSink,
  ProviderMcpAttachment,
  ProviderSession,
} from '@ptah-extension/provider-session-contracts';
import type {
  AgentSessionResumeConfig,
  AgentSessionStartConfig,
  FlatStreamEventUnion,
  McpToolProfile,
  PermissionPromptCancelledPayload,
  ProviderInfo,
  ProviderSessionSeed,
  SessionId,
  SessionRuntimeIdentity,
} from '@ptah-extension/shared';

/** Why the adapter gives a session back to the host pool. */
export type ProviderSessionReleaseReason =
  /** The chat tab closed or the session ended (`endSession`, `closeSession`). */
  | 'tab-closed'
  /** A hard stop (`interruptSession` with `parent-stop`). */
  | 'session-ended'
  /** The process died or refused an interrupt; the next send re-acquires. */
  | 'broken'
  /** `reset()`: every session is closed, the adapter stays usable. */
  | 'reset';

/**
 * What the host resolved from the session's start options for each open of
 * its process. The adapter carries it unchanged to every `acquire`; the pool
 * uses it only when it opens a process.
 */
export interface ProviderSessionOpenOptions {
  /**
   * Ptah's instructions for a new session (identity, user system prompt,
   * enhanced prompt, output style, memory blocks). Absent on a resume: the
   * runtime never delivers instructions to a restored session.
   */
  readonly instructions?: string;
  /** Attach Ptah's own MCP server (the session's `mcpServerRunning` and policy). */
  readonly ptahMcp: boolean;
  /** Ptah MCP tool profile; `apps` scopes the URL and the credential. */
  readonly mcpToolProfile?: McpToolProfile;
  /**
   * The user's MCP servers, already filtered by the capability policy; never
   * one named `ptah`. Secret-bearing (headers): never logged.
   */
  readonly userMcp: readonly ProviderMcpAttachment[];
}

/** What the host resolved for one start or resume, credential-free. */
export interface ProviderSessionChatPrepared {
  readonly seed: ProviderSessionSeed;
  /**
   * The stored native session to attach to. Required on resume (the host
   * reads it from `providerSessionThread`); absent on a fresh start.
   */
  readonly resume?: { readonly nativeSessionId: string };
  /** Absent: the host opens with its defaults (Ptah MCP only, no instructions). */
  readonly open?: ProviderSessionOpenOptions;
}

export interface ProviderSessionAcquireRequest {
  /** The Ptah chat session id (UUID v4, minted by the adapter on start). */
  readonly sessionId: SessionId;
  readonly tabId?: string;
  readonly seed: ProviderSessionSeed;
  /**
   * Attach to this native session. The chat always fails a failed attach
   * (`onFailure: 'error'`, plan A8): the host must not start a new session
   * in its place. The host picks `resume` or `load` from the agent's
   * advertised capabilities.
   */
  readonly resume?: {
    readonly nativeSessionId: string;
    readonly onFailure: 'error';
  };
  /** Where the runtime sends permission requests for this session. */
  readonly approvals: ProviderApprovalSink;
  /** `ProviderSessionChatPrepared.open` of this session. */
  readonly open?: ProviderSessionOpenOptions;
}

/** One approval request, addressed for the renderer and the router. */
export interface ProviderSessionApprovalPrompt {
  readonly sessionId: SessionId;
  /** The native session id; the router's `threadId`. */
  readonly threadId: string;
  /** Changes on every acquire, so a reply to an earlier process is refused. */
  readonly contextId: string;
  readonly request: ProviderApprovalRequest;
}

export interface ProviderSessionChatApprovalPresentation {
  /**
   * Show the request (`PERMISSION_REQUEST`). The host answers through
   * `SessionApprovalRouter.respond` with a `provider-session` reply, and owns
   * the prompt timeout (it cancels through `SessionApprovalRouter.cancelPrompt`
   * with reason `timeout`).
   */
  present(prompt: ProviderSessionApprovalPrompt): void;
  /** Tell the renderer a prompt was withdrawn (`PERMISSION_PROMPT_CANCELLED`). */
  cancelPrompt(payload: PermissionPromptCancelledPayload): void;
}

/** The provider-session runtime binding, as `updateProviderSessionExecution` stores it. */
export type ProviderSessionExecutionIdentity = Extract<
  SessionRuntimeIdentity,
  { runtime: 'provider-session' }
>;

export interface ProviderSessionChatBinding {
  readonly execution: ProviderSessionExecutionIdentity;
  /** The native session mapping (`providerSessionThread`). */
  readonly thread: {
    readonly nativeSessionId: string;
    readonly processGeneration: number;
  };
}

export interface ProviderSessionChatIdentityPort {
  /**
   * Persist the binding (`SessionMetadataStore.updateProviderSessionExecution`)
   * before the session's first prompt is sent. Called after every acquire,
   * so a re-acquired process updates `processGeneration`. A rejection fails
   * the open or the turn; the session is released.
   */
  save(
    sessionId: SessionId,
    binding: ProviderSessionChatBinding,
    title?: string,
  ): Promise<void>;
}

/** What the host binds to `SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS`. */
export interface ProviderSessionChatPorts {
  readonly info: ProviderInfo;
  /**
   * Resolve the credential-free seed for this start or resume. On resume
   * (`sessionId` set) it returns the stored native session id, and rejects
   * with a `ProviderSessionChatAdapterError` (`resume-failed`) when the
   * session has no stored mapping.
   */
  prepare(
    config: AgentSessionStartConfig | AgentSessionResumeConfig,
    sessionId?: SessionId,
  ): Promise<ProviderSessionChatPrepared>;
  /**
   * A live session from the host pool: a reused entry or a newly opened one.
   * Rejects with a `ProviderSessionChatAdapterError` or with the runtime's
   * coded error (an `Error` whose `code` is a `ProviderSessionErrorCode`);
   * the adapter maps both. `signal` aborts an open the chat abandoned.
   */
  acquire(
    request: ProviderSessionAcquireRequest,
    signal: AbortSignal,
  ): Promise<ProviderSession>;
  /**
   * Whether the pool still holds `session` as this chat session's live
   * process. False once the pool closed it on its own (idle close, LRU
   * eviction, a history read's reopen); the adapter then forgets it and the
   * next turn's `acquire` attaches the replacement.
   */
  holds(sessionId: SessionId, session: ProviderSession): boolean;
  /** Give one session back to the pool (which closes or keeps the process). */
  release(
    sessionId: SessionId,
    reason: ProviderSessionReleaseReason,
  ): Promise<void>;
  /** Give every session of this adapter back (`dispose`). */
  releaseAll(): Promise<void>;
  readonly identity: ProviderSessionChatIdentityPort;
  readonly presentation: ProviderSessionChatApprovalPresentation;
  /** Drain a follow-up turn's stream into the session's chat channel. */
  publish(
    sessionId: SessionId,
    stream: AsyncIterable<FlatStreamEventUnion>,
  ): Promise<void>;
  /** Deliver standalone, complete UI messages outside any turn. */
  publishNotice(
    sessionId: SessionId,
    events: readonly FlatStreamEventUnion[],
  ): Promise<void>;
}
