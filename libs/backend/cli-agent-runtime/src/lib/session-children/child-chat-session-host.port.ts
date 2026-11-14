/**
 * The chat-path host port (TASK_2026_584, TASK_2026_655).
 *
 * `cli-agent-runtime` cannot reach the chat internals (`rpc-handlers` sits
 * above it), so both kinds of agent-started session go through this port:
 * the spawner starts a child session with `startChildSession`, and
 * `SessionHandoffService` starts a top-level continuation session with
 * `startHandoffSession`. The implementation is registered by the host under
 * `CLI_AGENT_RUNTIME_TOKENS.CHILD_CHAT_SESSION_HOST`; a host without it refuses
 * `ptah_session_start` and `ptah_session_handoff` with
 * `chat-runtime-unavailable`.
 *
 * Type-only.
 */
import type {
  AgentSessionOpenedPayload,
  EffortLevel,
  PhaseDispatchV1,
  PermissionLevel,
  SessionHandoffOpenedPayload,
} from '@ptah-extension/shared';

export interface ChildChatSessionStartInput {
  /** Backend-minted UUID v4: the child's tab id and MCP routing id. */
  readonly tabId: string;
  /** Parent root: the metadata `workspaceId` and the tab partition. */
  readonly workspaceRoot: string;
  /** The session's `projectPath` and cwd. */
  readonly worktreePath: string;
  /** Contract + task: what the SDK receives. */
  readonly prompt: string;
  /** What the webview adopts. */
  readonly descriptor: AgentSessionOpenedPayload;
  readonly sessionName: string;
  readonly model?: string;
  readonly effort?: EffortLevel;
  readonly phase?: PhaseDispatchV1;
  /** Parent permission level captured while the parent was active. */
  readonly permissionLevel?: PermissionLevel;
}

/** A top-level session that continues another session's work (TASK_2026_655). */
export interface HandoffChatSessionStartInput {
  /** Backend-minted UUID v4: the new session's tab id and MCP routing id. */
  readonly tabId: string;
  /** The handing-off session's root: the metadata `workspaceId` and the tab partition. */
  readonly workspaceRoot: string;
  /** The session's `projectPath` and cwd: the handing-off session's cwd. */
  readonly cwd: string;
  /** The continuation prompt: the new session's first user message. */
  readonly prompt: string;
  readonly sessionName: string;
  /** What the webview adopts. */
  readonly descriptor: SessionHandoffOpenedPayload;
  /** The handing-off session's model; absent → the host default. */
  readonly model?: string;
  /** The handing-off session's permission level. */
  readonly permissionLevel?: PermissionLevel;
}

export type ChildChatSessionStartOutcome =
  | {
      readonly started: true;
      /** False when no webview took the tab; it is adopted late on the next bootstrap. */
      readonly uiAnnounced: boolean;
      /** Confirmed when the SDK start built query options with phase denials. */
      readonly toolProfileApplied?: boolean;
    }
  | { readonly started: false; readonly error: string };

export interface IChildChatSessionHost {
  listChildModels(input: {
    readonly workspaceRoot: string;
    readonly parentSessionId: string;
  }): Promise<readonly string[]>;
  resolveChildModel(input: {
    readonly model: string;
    readonly workspaceRoot: string;
    readonly parentSessionId: string;
  }): Promise<
    | { readonly accepted: true; readonly resolvedModel: string }
    | { readonly accepted: false; readonly code: 'invalid-model' | 'model-catalog-unavailable'; readonly message: string; readonly acceptedModels?: readonly string[] }
  >;
  startChildSession(
    input: ChildChatSessionStartInput,
  ): Promise<ChildChatSessionStartOutcome>;
  startHandoffSession(
    input: HandoffChatSessionStartInput,
  ): Promise<ChildChatSessionStartOutcome>;
}
