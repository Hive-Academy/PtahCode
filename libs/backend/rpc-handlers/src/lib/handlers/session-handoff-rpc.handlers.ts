/**
 * Session handoff chain RPC handler (TASK_2026_876, plan component 5).
 *
 * Method:
 *   - session:handoffChain - every session in the handoff chain that
 *     contains `sessionId`, root first, each with its metadata name.
 *
 * Every host serves the method (`requires: []`). The chain port and the
 * metadata store are optional injections, so a host without them answers
 * `{ sessions: [] }` instead of hiding the method. An empty chain is an empty
 * list, not an error. A metadata read that throws is logged and that entry's
 * label is `null`; the rest of the chain is still returned.
 */
import { injectable, inject } from 'tsyringe';
import { resolve } from 'node:path';
import { TOKENS, RpcUserError } from '@ptah-extension/vscode-core';
import type { Logger, RpcHandler } from '@ptah-extension/vscode-core';
import {
  SDK_TOKENS,
  type SessionMetadata,
  type SessionMetadataStore,
} from '@ptah-extension/agent-sdk';
import {
  CLI_AGENT_RUNTIME_TOKENS,
  type ISessionHandoff,
  type ISessionHandoffChain,
} from '@ptah-extension/cli-agent-runtime';
import type {
  RpcMethodName,
  SessionHandoffChainEntry,
  SessionHandoffChainParams,
  SessionHandoffChainResult,
} from '@ptah-extension/shared';
import {
  SessionHandoffChainParamsSchema,
  SessionHandoffStatusParamsSchema,
} from './session-handoff-rpc.schema';

type HandoffStatusParams = { sessionId: string; tabId: string };
type HandoffStatusResult = {
  state: 'absent' | 'starting' | 'recorded' | 'closePending' | 'closeCompleted' | 'unavailable';
  successorSessionId: string | null;
};
const UNAVAILABLE: HandoffStatusResult = { state: 'unavailable', successorSessionId: null };

const LOG_PREFIX = '[SessionHandoffChain]';

const EMPTY: SessionHandoffChainResult = { sessions: [] };

@injectable()
export class SessionHandoffChainRpcHandlers {
  /** RPC methods owned by this handler (manifest coverage invariant). */
  static readonly METHODS = [
    'session:handoffChain',
    'session:handoffStatus',
  ] as const satisfies readonly RpcMethodName[];

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.RPC_HANDLER) private readonly rpcHandler: RpcHandler,
    /** Registered by cli-agent-runtime. Absent: every call answers `[]`. */
    @inject(CLI_AGENT_RUNTIME_TOKENS.SESSION_HANDOFF_CHAIN, {
      isOptional: true,
    })
    private readonly chain?: ISessionHandoffChain,
    /** Absent: every label is `null` and the single-store read is used. */
    @inject(SDK_TOKENS.SDK_SESSION_METADATA_STORE, { isOptional: true })
    private readonly metadataStore?: SessionMetadataStore,
    @inject(CLI_AGENT_RUNTIME_TOKENS.SESSION_HANDOFF, { isOptional: true })
    private readonly handoff?: ISessionHandoff,
  ) {}

  register(): void {
    this.rpcHandler.registerMethod<
      SessionHandoffChainParams,
      SessionHandoffChainResult
    >('session:handoffChain', (params) => this.handoffChain(params));
    this.rpcHandler.registerMethod<HandoffStatusParams, HandoffStatusResult>(
      'session:handoffStatus',
      (params) => this.handoffStatus(params),
    );

    this.logger.debug('Session handoff chain RPC handlers registered', {
      methods: [...SessionHandoffChainRpcHandlers.METHODS],
    });
  }

  private async handoffStatus(params: unknown): Promise<HandoffStatusResult> {
    const parsed = SessionHandoffStatusParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new RpcUserError(
        'Invalid session:handoffStatus params (sessionId, tabId)',
        'INVALID_PARAMS',
      );
    }

    const { sessionId, tabId } = parsed.data;
    const metadata = await this.loadMetadata(sessionId);
    const workspaceId = metadata?.workspaceId?.trim();
    const workspaceRoot = workspaceId ? resolve(workspaceId) : undefined;
    if (!workspaceRoot || !this.handoff) return UNAVAILABLE;

    try {
      const { state, successorSessionId } = await this.handoff.status({
        sessionId,
        tabId,
        workspaceRoot,
      });
      return { state, successorSessionId };
    } catch (error: unknown) {
      this.logger.error(
        `${LOG_PREFIX} status read failed for ${sessionId}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return UNAVAILABLE;
    }
  }

  private async handoffChain(
    params: unknown,
  ): Promise<SessionHandoffChainResult> {
    const parsed = SessionHandoffChainParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new RpcUserError(
        'Invalid session:handoffChain params (sessionId)',
        'INVALID_PARAMS',
      );
    }
    const chain = this.chain;
    if (!chain) return EMPTY;

    const { sessionId } = parsed.data;
    const requested = await this.loadMetadata(sessionId);
    const workspacePath = requested?.workspaceId || undefined;

    let ids: readonly string[];
    try {
      ids = await chain.read(sessionId, workspacePath);
    } catch (error: unknown) {
      // The port documents `read` as never throwing; keep the RPC total.
      this.logger.error(
        `${LOG_PREFIX} chain read failed`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return EMPTY;
    }
    if (ids.length === 0) return EMPTY;

    const sessions = await Promise.all(
      ids.map(async (id): Promise<SessionHandoffChainEntry> => {
        const metadata =
          id === sessionId ? requested : await this.loadMetadata(id);
        return { sessionId: id, label: metadata?.name || null };
      }),
    );
    return { sessions };
  }

  /** One metadata row, or `null` when it is missing or the read throws. */
  private async loadMetadata(
    sessionId: string,
  ): Promise<SessionMetadata | null> {
    if (!this.metadataStore) return null;
    try {
      return await this.metadataStore.get(sessionId);
    } catch (error: unknown) {
      this.logger.error(
        `${LOG_PREFIX} metadata read failed for ${sessionId}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }
}
