/**
 * The provider-session contract: what a runtime (ACP, OpenCode) offers and
 * what a consumer (a CLI lane, the chat) may rely on. Types only; no I/O.
 *
 * The full `ProviderSession` surface is what the chat adapter and the
 * hardened runtimes implement (P2+). In P1 the ACP runtime implements the
 * lane subset (`AcpSession` in `@ptah-extension/acp-runtime`) and emits the
 * shared {@link ProviderSessionEvent} stream.
 */
import type {
  AppliedSettings,
  ProviderSessionProfileId,
} from '@ptah-extension/shared';
import type {
  ProviderApprovalSink,
  ProviderSessionEvent,
} from './provider-session-events';

export type { ProviderSessionProfileId } from '@ptah-extension/shared';

/**
 * The logging surface a runtime needs. The host `Logger` (vscode-core) and
 * the shared mock logger both satisfy it structurally, so a runtime library
 * never imports a host logger.
 */
export interface ProviderSessionLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** The lane permission modes (`LanePermissionMode` values). */
export type ProviderSessionPermission = 'plan' | 'ask' | 'auto-edit' | 'yolo';

export interface ProviderSessionPolicy {
  readonly permission: ProviderSessionPermission;
  readonly cwd: string;
}

/**
 * One MCP server the session attaches, built by the caller. Secret-bearing:
 * a header carries the lane's bearer token, so it is never logged unredacted.
 */
export interface ProviderHttpMcpAttachment {
  /** Absent means http (the Ptah server and remote user servers). */
  readonly type?: 'http' | 'sse';
  /** `'ptah'` for Ptah's own server; a user server keeps its configured name. */
  readonly name: string;
  readonly url: string;
  readonly headers: readonly { readonly name: string; readonly value: string }[];
}

/** A user-configured local MCP server, as ACP `McpServer::Stdio`. */
export interface ProviderStdioMcpAttachment {
  readonly type: 'stdio';
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env: readonly { readonly name: string; readonly value: string }[];
}

export type ProviderMcpAttachment =
  | ProviderHttpMcpAttachment
  | ProviderStdioMcpAttachment;

export interface ProviderSessionAttach {
  readonly nativeSessionId: string;
  /** Chosen per the capability the agent advertised. */
  readonly method: 'resume' | 'load';
  /** What a failed attach does: fail the open, or start a new session. */
  readonly onFailure: 'error' | 'new-session';
}

export interface ProviderSessionOpenRequest {
  readonly profile: ProviderSessionProfileId;
  readonly binaryPath: string;
  readonly policy: ProviderSessionPolicy;
  readonly model?: string;
  readonly effort?: string;
  readonly mcp: readonly ProviderMcpAttachment[];
  /**
   * Ptah's instructions for the session (identity, user system prompt,
   * enhanced prompt, output style, memory blocks). The runtime delivers it
   * per profile: a vendor system-prompt hook when the agent advertises one,
   * else in front of the first prompt of a new session. Whether a restored
   * (`attach`) session gets them again is the runtime's per-profile choice,
   * so the caller passes them on every open.
   */
  readonly instructions?: string;
  readonly attach?: ProviderSessionAttach;
  readonly approvals: ProviderApprovalSink;
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  readonly consumer: 'chat' | 'lane';
  /** The lane's agent id, or the chat session id. */
  readonly runId: string;
  /** Lanes bound a prompt; the chat has none (liveness from process exit). */
  readonly promptTimeoutMs?: number;
  /**
   * Called once when the agent process exists, normally before the
   * handshake ends, so the caller can track a process whose open is still
   * running (crash sweep). It may come after a failed or aborted `open`
   * settled; never for a process that did not start. A runtime without a
   * process of its own may never call it.
   */
  readonly onSpawn?: (process: ProviderSessionSpawnedProcess) => void;
}

/** The agent process of one open, as {@link ProviderSessionOpenRequest.onSpawn} reports it. */
export interface ProviderSessionSpawnedProcess {
  readonly pid: number;
  /** Resolves once the process has exited. Never rejects. */
  readonly exited: Promise<void>;
}

export interface ProviderSessionCapabilities {
  readonly steer: boolean;
  readonly interrupt: boolean;
  readonly setModel: boolean;
  readonly setMode: boolean;
  readonly images: boolean;
  /** From the agent's advertisement. */
  readonly resume: boolean;
  readonly load: boolean;
  readonly modes: readonly string[];
}

export interface ProviderModelInfo {
  readonly id: string;
  readonly name?: string;
  readonly isDefault?: boolean;
}

/**
 * One image of a turn, as ACP `ContentBlock::Image`: base64 data and its
 * MIME type. A runtime sends it only when the agent advertised image input
 * (`capabilities().images`, ACP `promptCapabilities.image`); a consumer must
 * refuse an image for an agent that did not, never drop it.
 */
export interface ProviderTurnImage {
  readonly mimeType: string;
  /** Base64 payload, without a `data:` prefix. */
  readonly data: string;
}

/**
 * One file the user referenced, as ACP `ContentBlock::ResourceLink`
 * (`file://` URI of `path`). Resource links are baseline ACP prompt content,
 * so every agent accepts them; the agent reads the file itself.
 */
export interface ProviderTurnFile {
  /** Absolute path on the host. */
  readonly path: string;
  /** Display name (the file's base name). */
  readonly name: string;
}

export interface ProviderTurnInput {
  readonly text: string;
  readonly images?: readonly ProviderTurnImage[];
  readonly files?: readonly ProviderTurnFile[];
}

export interface ProviderTurnReceipt {
  readonly turnId: string;
}

export interface ProviderSession {
  readonly nativeSessionId: string;
  readonly processGeneration: number;
  readonly restoredContext: boolean;
  /** Filled only by `attach.method: 'load'`. */
  readonly replay: readonly ProviderSessionEvent[];
  capabilities(): ProviderSessionCapabilities;
  listModels(): Promise<readonly ProviderModelInfo[]>;
  events(signal: AbortSignal): AsyncIterable<ProviderSessionEvent>;
  /**
   * Start one turn. Turns do not overlap: a call while a turn is running
   * rejects at once (use `steer` or `interrupt` instead).
   */
  prompt(input: ProviderTurnInput): Promise<ProviderTurnReceipt>;
  steer?(
    input: ProviderTurnInput,
    expectedTurnId: string,
  ): Promise<ProviderTurnReceipt>;
  /** Ends the turn and keeps the process. */
  interrupt(turnId: string): Promise<boolean>;
  setModel(model: string): Promise<AppliedSettings>;
  setEffort(effort: string | undefined): Promise<AppliedSettings>;
  setPermission(
    permission: ProviderSessionPolicy['permission'],
  ): Promise<AppliedSettings>;
  isTurnRunning(): boolean;
  getPid(): number | undefined;
  close(): Promise<void>;
}

export interface ProviderSessionRuntime {
  /** Rejects only before a session exists; later failures are events. */
  open(
    request: ProviderSessionOpenRequest,
    signal?: AbortSignal,
  ): Promise<ProviderSession>;
}
