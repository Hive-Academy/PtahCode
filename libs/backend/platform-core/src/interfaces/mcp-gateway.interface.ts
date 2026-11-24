/**
 * IMcpGateway — serve the user's own MCP servers (connectors, intents and
 * file-declared servers) through Ptah's single `ptah` MCP server.
 *
 * Declared here so the MCP dispatcher (vscode-lm-tools), the session and
 * one-shot builders (agent-sdk) and the cron runner can consume the hub
 * without importing cli-agent-runtime, which implements it. Every consumer
 * injects it as optional: a host without auth secrets binds no gateway.
 *
 * Only plain JSON crosses this port. The scope is copied from the caller's
 * {@link McpCallerBinding}; the token itself never reaches the gateway.
 *
 * Caller policy is applied inside `listTools` and `callTool` on every path
 * and is authoritative even when a client-side gate is bypassed:
 * - `session` callers need `privileged` and `gatewayApproval: true`
 *   (the host prompts before each call through the PreToolUse gateway gate).
 * - `internal-query` callers need `privileged` and `includeConnectors: true`
 *   (the one-shot PreToolUse hook enforces the same opt-in).
 * - `privileged` `agent` callers (CLI lanes) see every enabled server.
 * - Every other caller (`lane-report`, `read-only`, `home` and `workspace`
 *   slots) sees no gateway tools.
 */

import type { IDisposable } from '../types/platform.types';
import type {
  McpCallerBindingKind,
  McpCallerCapability,
} from './mcp-caller-credentials.interface';

/** Caller identity the gateway applies its policy to, copied from the binding. */
export interface McpGatewayScope {
  readonly kind: McpCallerBindingKind;
  readonly capability: McpCallerCapability;
  /** Workspace whose intents, project files and deny list are sourced. */
  readonly workspaceRoot?: string;
  /** See `McpCallerBinding.gatewayApproval`. */
  readonly gatewayApproval?: boolean;
  /** See `McpCallerBinding.includeConnectors`. */
  readonly includeConnectors?: boolean;
}

/**
 * One upstream tool as the gateway exposes it. `name` is the generated
 * `<alias>__<tool>` name; `inputSchema`, `annotations` and `outputSchema`
 * pass through from the upstream unchanged.
 */
export interface McpGatewayTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations?: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
}

/**
 * Result of a forwarded `tools/call`. An upstream success passes through
 * unchanged, extra MCP fields included. An upstream failure is reported as
 * `isError: true` with a text content item, never as a thrown error.
 */
export interface McpGatewayCallResult {
  readonly content: readonly unknown[];
  readonly isError?: boolean;
  readonly structuredContent?: Readonly<Record<string, unknown>>;
  readonly [field: string]: unknown;
}

/** Connection state of one upstream server. */
export type McpGatewayServerState =
  | 'connected'
  | 'failed'
  | 'needs-auth'
  | 'pending';

/** Status of one upstream server the scope can see. */
export interface McpGatewayServerStatus {
  /** Dedup key (normalized URL for HTTP servers). */
  readonly key: string;
  /** Human-readable server name. */
  readonly display: string;
  readonly status: McpGatewayServerState;
  /** Why the server is not connected, e.g. `tools/list timed out after 12s`. */
  readonly detail?: string;
}

export interface IMcpGateway {
  /**
   * Record the names of Ptah's own MCP tools. `isGatewayTool` treats every
   * other name as a gateway tool. Called by the HTTP MCP server at start.
   */
  registerHostToolNames(names: readonly string[]): void;

  /**
   * `true` iff `name` (bare or `mcp__ptah__`-prefixed) is not a registered
   * host tool name. Synchronous and fail-closed: an unknown name counts as a
   * gateway tool, so permission gates and capping treat it as third-party.
   */
  isGatewayTool(name: string): boolean;

  /** Tools the scope may see. One server's failure never fails the list. */
  listTools(
    scope: McpGatewayScope,
    signal?: AbortSignal,
  ): Promise<readonly McpGatewayTool[]>;

  /** Forward one call to its upstream after applying the caller policy. */
  callTool(
    scope: McpGatewayScope,
    name: string,
    args: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<McpGatewayCallResult>;

  /**
   * Last known status of every upstream server the scope can see. Reads the
   * cache only; it never connects.
   */
  status(scope: McpGatewayScope): McpGatewayServerStatus[];

  /**
   * File-declared server names under `root` that the gateway serves, plus
   * same-key losers, so the CLI's own copies can be switched off.
   */
  servedFileServerNames(root: string): Promise<string[]>;

  /** Fires when any scope's tool list may have changed. */
  onToolsChanged(listener: () => void): IDisposable;

  /**
   * Drop every cached source set and re-read each workspace root the gateway
   * serves, now. `onToolsChanged` fires for every root whose served set
   * changed. Call it after an install, an uninstall or a capability toggle so
   * a running session hears the change at once instead of at the next poll.
   * Never rejects.
   */
  refresh(): Promise<void>;

  /**
   * Close every upstream connection, drop listeners and stop every process the
   * gateway runs. Terminal. The process-tree kills start before this returns;
   * the promise settles once they finished, so a quit can wait for them under
   * its own budget. Never rejects.
   */
  dispose(): Promise<void>;
}
