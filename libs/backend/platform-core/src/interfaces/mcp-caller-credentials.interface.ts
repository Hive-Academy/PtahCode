/**
 * IMcpCallerCredentials — issue and revoke MCP caller tokens.
 *
 * Declared here so agent-sdk and cli-agent-runtime can mint a lane token
 * without importing vscode-lm-tools. The registry that implements this port
 * lives in vscode-lm-tools and is bound from registerVsCodeLmToolsServices.
 *
 * `issue` returns the raw token once. Callers put it in a client config and
 * then drop it. The adapter stores only a sha256 digest. Lane and session
 * tokens stay in memory. Persistent slot hashes are a separate store owned
 * by the registry, not this port.
 */

/** What a caller is allowed to invoke. */
export type McpCallerCapability = 'read-only' | 'lane-report' | 'privileged';

/**
 * Who the token was minted for. `home` is a persistent slot with no
 * workspace. `internal-query` is a short-lived privileged workspace query.
 */
export type McpCallerBindingKind =
  'agent' | 'session' | 'workspace' | 'home' | 'internal-query';

/** Profile segment the URL carried when the token was minted. */
export type McpCallerToolProfile = 'coding' | 'apps';

/** Interactive credentials cover a session's maximum age; teardown revokes them. */
export const INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Identity and capability bound to one token. No raw secret.
 *
 * Phase tool profile (B4c contract for session delivery and B4d lane
 * credentials). The authenticated caller id is `agentId` when `kind` is
 * `agent`, otherwise `sessionId` when `kind` is `session`. That id selects
 * the phase (`phaseKind`). `disallowedTools` is that phase's
 * `toolProfile.disallowedTools`. The dispatcher hides those names from
 * `tools/list` and rejects them in `tools/call`. A missing field, a
 * non-array, or an empty list does not hide tools. `permission` is not part
 * of this filter.
 */
export interface McpCallerBinding {
  readonly kind: McpCallerBindingKind;
  readonly agentId?: string;
  readonly sessionId?: string;
  readonly workspaceRoot?: string;
  readonly toolProfile?: McpCallerToolProfile;
  readonly capability: McpCallerCapability;
  /** Phase kind whose tool profile was copied onto this credential. */
  readonly phaseKind?: string;
  /** Exact MCP tool names the phase profile disallows. */
  readonly disallowedTools?: readonly string[];
}

export interface IMcpCallerCredentials {
  /**
   * Mint an in-memory token. `ttlMs` is measured from now. The raw token is
   * the return value and is not stored.
   */
  issue(binding: McpCallerBinding, subject: string, ttlMs: number): string;

  /** Drop every in-memory token minted for `subject`. Persistent slot hashes stay. */
  revokeSubject(subject: string): void;
}
