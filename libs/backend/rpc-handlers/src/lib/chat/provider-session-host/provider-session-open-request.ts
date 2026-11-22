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
  /**
   * What the profile's agent puts in front of each Ptah MCP tool name (agy:
   * `mcp_ptah_lane_`), so the hint names the tools as the model sees them.
   * Absent, or `undefined` for a profile: the hint names no prefix.
   */
  ptahMcpToolPrefix?(profile: ProviderSessionProfileId): string | undefined;
  /**
   * The name the profile's agent gives Ptah's attachment (agy: `ptah_lane`).
   * A user server is never given it, and the hint names the server by it.
   */
  ptahMcpServerName?(profile: ProviderSessionProfileId): string | undefined;
  readonly logger: Pick<Logger, 'debug' | 'info'>;
}

/**
 * Added to the instructions only when Ptah's MCP attachment is part of the
 * open (a credential was minted and the server runs), so the model is never
 * told about tools it does not have.
 */
export function providerSessionPtahMcpHint(
  toolPrefix?: string,
  serverName?: string,
): string {
  const names = toolPrefix
    ? `its tools (named \`${toolPrefix}<tool>\`, for example \`${toolPrefix}ptah_workspace_analyze\`)`
    : 'its ptah_* tools';
  const hint = `Ptah's MCP server is attached. Prefer ${names} for workspace analysis, file and symbol search, diagnostics and memory over shell equivalents, as its server instructions describe.`;
  // Ptah keeps no persistent `ptah` entry in agy's shared config any more
  // (TASK_2026_2297), so the session's attachment is the only Ptah server
  // the agent lists. The hint names it so the model finds its tools.
  if (!serverName || serverName === 'ptah') return hint;
  return `${hint} Ptah's server for this session is \`${serverName}\`.`;
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
   * The chat session's open options. Absent (a history read): the options
   * the chat last acquired this session with while it still owns it, so the
   * next send adopts the history process without a reopen; else Ptah MCP
   * whenever the server runs, no user servers, no instructions.
   */
  readonly open?: NonNullable<ProviderSessionChatPrepared['open']>;
}

export interface ProviderSessionOpenRequests {
  /** The pool request for one open; its build resolves the binary. */
  request(input: ProviderSessionOpenInput): ProviderSessionPoolRequest;
  /** Route the session's runtime approvals to this chat sink. */
  attachApprovals(sessionId: SessionId, sink: ProviderApprovalSink): void;
  /** The chat gave the session up: drop its sink and its remembered open options. */
  detachApprovals(sessionId: SessionId): void;
  detachAll(): void;
}

/** The Ptah MCP header name the ACP runtime forwards to the agent. */
const PTAH_MCP_AUTHORIZATION_HEADER = 'Authorization';

export function createProviderSessionOpenRequests(
  deps: ProviderSessionOpenRequestDeps,
): ProviderSessionOpenRequests {
  const sinks = new Map<SessionId, ProviderApprovalSink>();
  /** The open options of each session a chat owns, for its history reads. */
  const chatOpen = new Map<SessionId, NonNullable<ProviderSessionOpenInput['open']>>();

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

  /**
   * User servers in attach order; a user server never takes Ptah's name nor
   * the name the agent gives Ptah's attachment (agy `ptah_lane`, review
   * moderate 7), which the narrower-mode grants trust.
   */
  const userMcp = (input: ProviderSessionOpenInput) => {
    const reserved = new Set(['ptah', deps.ptahMcpServerName?.(input.profile) ?? 'ptah']);
    return (input.open?.userMcp ?? []).filter((server) => !reserved.has(server.name));
  };

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
   * not kept as text. A history read keys with the owning chat's options,
   * or as Ptah MCP only when no chat owns the session.
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

  /**
   * The session's instructions plus the Ptah MCP hint, the hint only when
   * Ptah's attachment is part of this open.
   */
  const instructionsOf = (
    input: ProviderSessionOpenInput,
    attachments: readonly ProviderMcpAttachment[],
  ): string | undefined => {
    const ptahAttached = attachments.some((attachment) => attachment.name === 'ptah');
    const parts = [
      input.open?.instructions ?? '',
      ptahAttached
        ? providerSessionPtahMcpHint(
            deps.ptahMcpToolPrefix?.(input.profile),
            deps.ptahMcpServerName?.(input.profile),
          )
        : '',
    ].filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join('\n\n') : undefined;
  };

  /** A chat request is remembered; a history read borrows the chat's options. */
  const withChatOpen = (input: ProviderSessionOpenInput): ProviderSessionOpenInput => {
    if (input.open) {
      chatOpen.set(input.sessionId, input.open);
      return input;
    }
    const open = chatOpen.get(input.sessionId);
    return open ? { ...input, open } : input;
  };

  return {
    request(requested) {
      const input = withChatOpen(requested);
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
          const attachments = mcp(input, context);
          const instructions = instructionsOf(input, attachments);
          return {
            profile: input.profile,
            binaryPath: detection.path,
            policy: {
              permission: deps.readSavedPermissionLevel(input.workspacePath),
              cwd: input.workspacePath,
            },
            ...(input.model ? { model: input.model } : {}),
            mcp: attachments,
            // On every open, an attach too: the runtime decides per profile
            // whether a restored session is sent them again.
            ...(instructions ? { instructions } : {}),
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
      chatOpen.delete(sessionId);
    },
    detachAll() {
      sinks.clear();
      chatOpen.clear();
    },
  };
}
