/**
 * Builds the pool request of one provider-session open, shared by the chat
 * host ports (send) and the history port (load): the binary from CLI
 * detection, the policy from the saved permission level, the Ptah MCP
 * attachment from the token the pool mints, and the session's own open
 * options (instructions, user MCP servers, tool profile). Detection and the
 * permission read run only when the pool opens a process: a send to a live
 * entry builds nothing. It also owns the approval relay:
 * a process opened for a history read is adopted by the next send, so the
 * runtime's approval sink forwards to whichever chat sink currently owns the
 * session instead of the sink present at open time.
 */
import { createHash } from 'node:crypto';
import {
  PTAH_MCP_PORT,
  ProviderSessionChatAdapterError,
  type ProviderSessionChatPrepared,
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
  /**
   * The chat session's open options. Absent (a history read): Ptah MCP
   * whenever the server runs, no user servers, no instructions.
   */
  readonly open?: NonNullable<ProviderSessionChatPrepared['open']>;
}

export interface ProviderSessionOpenRequests {
  /** The pool request for one open; its build resolves the binary. */
  request(input: ProviderSessionOpenInput): ProviderSessionPoolRequest;
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

  const ptahMcp = (
    input: ProviderSessionOpenInput,
    context: ProviderSessionPoolOpenContext,
  ): readonly ProviderMcpAttachment[] => {
    if (input.open?.ptahMcp === false) return [];
    if (!context.mcpToken || !deps.mcpServerRunning()) return [];
    // The routing segment is the session id: the pool binds the credential
    // to it, so the URL and the token name the same caller.
    const sessionUrl = ptahMcpSessionUrl(
      PTAH_MCP_PORT,
      input.sessionId,
      input.workspacePath,
    );
    // Same suffix as Claude chat; the credential carries the same profile.
    const url =
      input.open?.mcpToolProfile === 'apps'
        ? `${sessionUrl}/profile/apps`
        : sessionUrl;
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

  /** User servers in attach order; a user server never takes Ptah's name. */
  const userMcp = (input: ProviderSessionOpenInput) =>
    (input.open?.userMcp ?? []).filter((server) => server.name !== 'ptah');

  /** Ptah's entry first and authoritative: a user server never takes its name. */
  const mcp = (
    input: ProviderSessionOpenInput,
    context: ProviderSessionPoolOpenContext,
  ): readonly ProviderMcpAttachment[] => [
    ...ptahMcp(input, context),
    ...userMcp(input),
  ];

  /**
   * What a running process cannot change: whether Ptah MCP is attached, its
   * tool profile, and the user servers. Hashed, so header and env values are
   * not kept as text. A history read (no open options) keys as Ptah MCP only.
   */
  const openOptionsKey = (input: ProviderSessionOpenInput): string =>
    createHash('sha256')
      .update(
        JSON.stringify({
          ptahMcp: input.open?.ptahMcp !== false,
          toolProfile: input.open?.mcpToolProfile === 'apps' ? 'apps' : null,
          userMcp: userMcp(input),
        }),
      )
      .digest('hex');

  return {
    request(input) {
      const approvals = relay(input.sessionId);
      return {
        profile: input.profile,
        workspaceRoot: input.workspacePath,
        ...(input.nativeSessionId
          ? { nativeSessionId: input.nativeSessionId }
          : {}),
        ...(input.open?.ptahMcp === false ? { ptahMcp: false } : {}),
        ...(input.open?.mcpToolProfile === 'apps'
          ? { toolProfile: 'apps' as const }
          : {}),
        openOptionsKey: openOptionsKey(input),
        build: async (context) => {
          const detection = await deps.cliDetection.getDetection(input.profile);
          if (!detection?.installed || !detection.path)
            throw new ProviderSessionChatAdapterError('unavailable', 'acquire');
          return {
            profile: input.profile,
            binaryPath: detection.path,
            policy: {
              permission: deps.readSavedPermissionLevel(input.workspacePath),
              cwd: input.workspacePath,
            },
            ...(input.model ? { model: input.model } : {}),
            mcp: mcp(input, context),
            // A new session only: an attached (restored) one already has them.
            ...(input.open?.instructions && !context.attach
              ? { instructions: input.open.instructions }
              : {}),
            ...(context.attach ? { attach: context.attach } : {}),
            approvals,
            baseEnv: deps.baseEnv(),
            consumer: 'chat',
            runId: input.sessionId,
          };
        },
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
