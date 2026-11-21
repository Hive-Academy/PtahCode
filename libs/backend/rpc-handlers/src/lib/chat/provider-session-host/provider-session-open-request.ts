/**
 * Builds the pool request of one provider-session open, shared by the chat
 * host ports (send) and the history port (load): the binary from CLI
 * detection, the policy from the saved permission level, and the Ptah MCP
 * attachment from the token the pool mints. It also owns the approval relay:
 * a process opened for a history read is adopted by the next send, so the
 * runtime's approval sink forwards to whichever chat sink currently owns the
 * session instead of the sink present at open time.
 */
import {
  PTAH_MCP_PORT,
  ProviderSessionChatAdapterError,
} from '@ptah-extension/agent-sdk';
import type { CliDetectionService } from '@ptah-extension/cli-agent-runtime';
import { ptahMcpSessionUrl } from '@ptah-extension/codex-runtime';
import type {
  ProviderApprovalSink,
  ProviderMcpAttachment,
} from '@ptah-extension/provider-session-contracts';
import type {
  PermissionLevel,
  ProviderSessionProfileId,
  SessionId,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  ProviderSessionPoolOpenContext,
  ProviderSessionPoolRequest,
} from './provider-session-pool';

export interface ProviderSessionOpenRequestDeps {
  /** Each profile id is also the CLI type its binary is detected under. */
  readonly cliDetection: Pick<CliDetectionService, 'getDetection'>;
  readSavedPermissionLevel(workspacePath: string): PermissionLevel;
  /** Whether the Ptah MCP server is running now (read at each open). */
  mcpServerRunning(): boolean;
  /** Environment the provider process starts from (credential-free). */
  baseEnv(): Readonly<Record<string, string | undefined>>;
  readonly logger: Pick<Logger, 'debug' | 'info'>;
}

export interface ProviderSessionOpenInput {
  readonly sessionId: SessionId;
  readonly profile: ProviderSessionProfileId;
  /** Workspace of the session: the credential binding and the process cwd. */
  readonly workspacePath: string;
  /** Stored native id; the pool attaches with `resume` or `load`. */
  readonly nativeSessionId?: string;
  readonly model?: string;
}

export interface ProviderSessionOpenRequests {
  /** Resolve the binary, then return the pool request for one open. */
  request(input: ProviderSessionOpenInput): Promise<ProviderSessionPoolRequest>;
  /** Route the session's runtime approvals to this chat sink. */
  attachApprovals(sessionId: SessionId, sink: ProviderApprovalSink): void;
  detachApprovals(sessionId: SessionId): void;
  detachAll(): void;
}

/** The Ptah MCP header name the ACP runtime forwards to the agent. */
const PTAH_MCP_AUTHORIZATION_HEADER = 'Authorization';

export function createProviderSessionOpenRequests(
  deps: ProviderSessionOpenRequestDeps,
): ProviderSessionOpenRequests {
  const sinks = new Map<SessionId, ProviderApprovalSink>();

  const relay = (sessionId: SessionId): ProviderApprovalSink => ({
    request(request, signal) {
      const sink = sinks.get(sessionId);
      if (sink) return sink.request(request, signal);
      // No chat owns the session (a history-only open): an approval is never
      // granted without a user, so the runtime's request is cancelled.
      deps.logger.debug('Provider-session approval has no chat owner.', {
        code: 'provider-session-approval-unowned',
      });
      return Promise.resolve('cancel');
    },
  });

  const mcp = (
    sessionId: SessionId,
    workspacePath: string,
    context: ProviderSessionPoolOpenContext,
  ): readonly ProviderMcpAttachment[] => {
    if (!context.mcpToken || !deps.mcpServerRunning()) return [];
    // The routing segment is the session id: the pool binds the credential
    // to it, so the URL and the token name the same caller.
    const url = ptahMcpSessionUrl(PTAH_MCP_PORT, sessionId, workspacePath);
    // Pathname only: the token travels in the header, never in a log line.
    deps.logger.info('Ptah MCP is attached to the provider session.', {
      code: 'ptah-mcp-attached',
      path: new URL(url).pathname,
    });
    return [
      {
        name: 'ptah',
        url,
        headers: [
          {
            name: PTAH_MCP_AUTHORIZATION_HEADER,
            value: `Bearer ${context.mcpToken}`,
          },
        ],
      },
    ];
  };

  return {
    async request(input) {
      const detection = await deps.cliDetection.getDetection(input.profile);
      if (!detection?.installed || !detection.path)
        throw new ProviderSessionChatAdapterError('unavailable', 'acquire');
      const binaryPath = detection.path;
      const permission = deps.readSavedPermissionLevel(input.workspacePath);
      const approvals = relay(input.sessionId);
      return {
        profile: input.profile,
        workspaceRoot: input.workspacePath,
        ...(input.nativeSessionId
          ? { nativeSessionId: input.nativeSessionId }
          : {}),
        build: (context) => ({
          profile: input.profile,
          binaryPath,
          policy: { permission, cwd: input.workspacePath },
          ...(input.model ? { model: input.model } : {}),
          mcp: mcp(input.sessionId, input.workspacePath, context),
          ...(context.attach ? { attach: context.attach } : {}),
          approvals,
          baseEnv: deps.baseEnv(),
          consumer: 'chat',
          runId: input.sessionId,
        }),
      };
    },
    attachApprovals(sessionId, sink) {
      sinks.set(sessionId, sink);
    },
    detachApprovals(sessionId) {
      sinks.delete(sessionId);
    },
    detachAll() {
      sinks.clear();
    },
  };
}
