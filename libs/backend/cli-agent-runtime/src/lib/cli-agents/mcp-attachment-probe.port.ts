export interface McpAttachment {
  readonly agentId: string;
  readonly method: 'initialize' | 'tools/list';
  readonly port: number;
  readonly time: number;
}

export interface McpAttachmentAttempt {
  readonly agentId: string;
  readonly port: number;
  readonly reason:
    | 'auth-required'
    | 'invalid-credential'
    | 'forbidden'
    | 'auth-error'
    | 'invalid-url'
    | 'seen';
  readonly method: string;
  readonly time: number;
}

export interface IMcpAttachmentProbe {
  get(agentId: string, port: number): McpAttachment | undefined;
  /** Last request seen for the lane that did not complete the handshake. */
  getAttempt?(agentId: string, port: number): McpAttachmentAttempt | undefined;
  waitFor(
    agentId: string,
    port: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<McpAttachment | undefined>;
}

export const MCP_ATTACHMENT_TIMEOUT_MS = 15_000;
