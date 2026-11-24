/**
 * IMcpSubagentRootRegistrar — answers whether an agent session started in a
 * folder gets Ptah's MCP server.
 *
 * A readiness answer, not a write (TASK_2026_979 B19). Ptah no longer writes a
 * `ptah` entry into any `.mcp.json`: every session, its Claude `Task`
 * subagents and every CLI lane get `ptah` in their own spawn config, so a
 * session started in a folder that is not open — a child session's git
 * worktree — has Ptah tools without anything written there. The port and its
 * retain/release pairing stay so callers are unchanged; the implementation
 * holds nothing.
 *
 * A port rather than the concrete server for the same reason as
 * `IMcpServerStatus`: the consumer (cli-agent-runtime) must not depend on
 * vscode-lm-tools, which builds the API the consumer's children call.
 *
 * Hosts that never start an MCP server do not register this token; consumers
 * inject it as optional and treat its absence like `registered: false`.
 */
export interface IMcpSubagentRootRegistrar {
  /**
   * Whether a session in `root` gets Ptah's server: true when the HTTP MCP
   * server is up. Nothing is written or retained.
   *
   * Never rejects. `registered: false` (with a `reason`) means the server is
   * not running, or `root` is not an absolute path: the session may still
   * start, but without Ptah tools. Callers still pair each successful retain
   * with one {@link releaseRoot}.
   */
  retainRoot(root: string): Promise<McpSubagentRootRetention>;

  /**
   * Give back one retain on `root`. Nothing is held, so this does nothing; it
   * stays so callers keep their retain/release pairing. Never rejects.
   */
  releaseRoot(root: string): Promise<void>;
}

/** The outcome of {@link IMcpSubagentRootRegistrar.retainRoot}. */
export interface McpSubagentRootRetention {
  /** True when a session in the root gets Ptah's server in its spawn config. */
  readonly registered: boolean;
  /** Present exactly when `registered` is false. */
  readonly reason?: string;
}
