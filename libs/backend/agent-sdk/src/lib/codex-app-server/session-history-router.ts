import {
  normalizeCodexWorkspaceKey,
  type CodexHistoryReader,
  type CodexSessionHistory,
} from '@ptah-extension/codex-runtime';
import type { SessionMetadata, SessionMetadataStore } from '../session-metadata-store';
import type {
  CarryOverReadOptions,
  SessionHistoryReaderService,
} from '../session-history-reader.service';
import type { CarryOverTranscript } from '../helpers/history/history.types';
import { projectCodexHistory } from './codex-history-projector';
import {
  projectCodexCarryOverTranscript,
  type CodexCarryOverTail,
} from './codex-carry-over-projector';

/** Turn and page caps of one bounded native carry-over read. */
export type NativeCarryOverBound = Parameters<CodexHistoryReader['readHistoryTail']>[2];

export interface NativeSessionHistoryPort {
  /** Read the complete snapshot using execution.sessionId when the context mapping is absent. */
  readHistory(session: SessionMetadata): Promise<CodexSessionHistory>;
  /** Read only the newest complete root turns inside `bound`; absent on hosts without it. */
  readHistoryTail?(
    session: SessionMetadata,
    bound: NativeCarryOverBound,
    signal?: AbortSignal,
  ): Promise<CodexCarryOverTail>;
}

/**
 * A provider-session history snapshot, already projected to the events and
 * stats the renderer replays (the host projects native replay; A6).
 */
export type ProviderSessionHistory = Pick<SessionHistoryReadResult, 'events' | 'stats'>;

/** Host port reading a provider session's native replay by chat session id. */
export interface ProviderSessionHistoryPort {
  read(sessionId: string, signal?: AbortSignal): Promise<ProviderSessionHistory>;
}

/** Caller options of a full history read; `signal` reaches native ports that take one. */
export type SessionHistoryRouteReadOptions = Parameters<
  SessionHistoryReaderService['readSessionHistory']
>[2] & { readonly signal?: AbortSignal };

export interface CarryOverRouteOptions extends CarryOverReadOptions {
  /**
   * Bound of the native read. A caller that passes none is refused for a
   * native session before any read, as before native sources were enabled.
   */
  readonly nativeBound?: NativeCarryOverBound;
}

export type SessionHistoryReadResult = Awaited<
  ReturnType<SessionHistoryReaderService['readSessionHistory']>
>;

export type SessionHistoryRouteErrorCode =
  | 'nativePortUnavailable'
  | 'invalidNativeIdentity'
  | 'nativeReadFailed';

/** Public errors contain no session metadata, home path, or protocol payload. */
export class SessionHistoryRouteError extends Error {
  constructor(readonly code: SessionHistoryRouteErrorCode, cause?: unknown) {
    super(
      code === 'nativePortUnavailable'
        ? 'Session history is unavailable in this host.'
        : code === 'invalidNativeIdentity'
          ? 'Saved session identity is incomplete.'
          : 'Session history could not be read.',
      { cause },
    );
    this.name = 'SessionHistoryRouteError';
  }
}

/** The legacy reader takes no signal; forward its options unchanged otherwise. */
function legacyReadOptions(
  options: SessionHistoryRouteReadOptions | undefined,
): Parameters<SessionHistoryReaderService['readSessionHistory']>[2] {
  if (!options || !('signal' in options)) return options;
  const { signal: _signal, ...rest } = options;
  return rest;
}

type NativeHistorySession =
  | { readonly kind: 'codex'; readonly metadata: SessionMetadata }
  | { readonly kind: 'provider-session' };

export class SessionHistoryRouter {
  constructor(
    private readonly getMetadata: () => Pick<SessionMetadataStore, 'get'>,
    private readonly getLegacy: () => Pick<
      SessionHistoryReaderService,
      'readSessionHistory' | 'readSessionEvents' | 'readCarryOverTranscript'
    >,
    private readonly getNative: () => NativeSessionHistoryPort | null | undefined,
    private readonly getProviderSessions: () =>
      | ProviderSessionHistoryPort
      | null
      | undefined = () => undefined,
  ) {}

  async readSessionHistory(
    sessionId: string,
    workspacePath: string,
    options?: SessionHistoryRouteReadOptions,
  ): Promise<SessionHistoryReadResult> {
    const session = await this.nativeSession(sessionId, workspacePath);
    if (!session)
      return this.getLegacy().readSessionHistory(
        sessionId,
        workspacePath,
        legacyReadOptions(options),
      );
    if (session.kind === 'provider-session')
      return this.providerSessionHistory(sessionId, options?.signal);
    const snapshot = await this.nativeHistory(session.metadata);
    const { events, stats } = this.projectHistory(sessionId, snapshot);
    return { events, stats };
  }

  async readSessionEvents(
    sessionId: string,
    workspacePath: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SessionHistoryReadResult['events']> {
    const session = await this.nativeSession(sessionId, workspacePath);
    if (!session) return this.getLegacy().readSessionEvents(sessionId, workspacePath);
    if (session.kind === 'provider-session')
      return (await this.providerSessionHistory(sessionId, options?.signal)).events;
    const snapshot = await this.nativeHistory(session.metadata);
    return this.projectHistory(sessionId, snapshot).events;
  }

  /**
   * The bounded transcript a provider carry-over renders. A Claude session
   * reads its JSONL tail. A native session reads its newest root turns through
   * the host port's `readHistoryTail`, never the full `readHistory`.
   */
  async readCarryOverTranscript(
    sessionId: string,
    workspacePath: string,
    options: CarryOverRouteOptions,
  ): Promise<CarryOverTranscript> {
    const session = await this.nativeSession(sessionId, workspacePath);
    if (!session)
      return this.getLegacy().readCarryOverTranscript(sessionId, workspacePath, options);
    // Provider sessions have no bounded tail read yet; refuse before any read.
    if (!options.nativeBound || session.kind === 'provider-session')
      throw new SessionHistoryRouteError('nativePortUnavailable');
    const tail = await this.nativeHistoryTail(
      session.metadata,
      options.nativeBound,
      options.signal,
    );
    try {
      return projectCodexCarryOverTranscript(tail);
    } catch (error: unknown) {
      throw new SessionHistoryRouteError('nativeReadFailed', error);
    }
  }

  private async nativeSession(
    sessionId: string,
    workspacePath: string,
  ): Promise<NativeHistorySession | null> {
    const session = await this.getMetadata().get(sessionId);
    if (session?.providerSessionExecution?.runtime === 'provider-session') {
      const execution = session.providerSessionExecution;
      if (execution.sessionId !== sessionId)
        throw new SessionHistoryRouteError('invalidNativeIdentity');
      // The stored binding holds the normalized workspace key; the caller's
      // workspace must be that workspace, as the Codex thread mapping is.
      let workspaceKey: string;
      try {
        workspaceKey = normalizeCodexWorkspaceKey(workspacePath, process.platform);
      } catch (error: unknown) {
        throw new SessionHistoryRouteError('invalidNativeIdentity', error);
      }
      if (workspaceKey !== execution.workspaceId)
        throw new SessionHistoryRouteError('invalidNativeIdentity');
      return { kind: 'provider-session' };
    }
    if (session?.codexExecution?.runtime !== 'codex-app-server') return null;
    if (session.codexExecution.sessionId !== sessionId)
      throw new SessionHistoryRouteError('invalidNativeIdentity');
    // Execution carries the native thread id even if the separate context mapping
    // was never persisted. Read that thread; validate the mapping when present.
    if (session.codexThread) {
      let workspaceKey: string;
      try {
        workspaceKey = normalizeCodexWorkspaceKey(
          session.codexThread.workspaceId,
          process.platform,
        );
      } catch (error: unknown) {
        throw new SessionHistoryRouteError('invalidNativeIdentity', error);
      }
      if (workspaceKey !== session.codexExecution.workspaceId)
        throw new SessionHistoryRouteError('invalidNativeIdentity');
    }
    return { kind: 'codex', metadata: session };
  }

  private async providerSessionHistory(
    sessionId: string,
    signal: AbortSignal | undefined,
  ): Promise<SessionHistoryReadResult> {
    const port = this.getProviderSessions();
    if (!port) throw new SessionHistoryRouteError('nativePortUnavailable');
    try {
      const { events, stats } = await port.read(sessionId, signal);
      return { events, stats };
    } catch (error: unknown) {
      // No host error passes through: it could carry paths or payloads.
      throw new SessionHistoryRouteError('nativeReadFailed', error);
    }
  }

  private async nativeHistory(session: SessionMetadata): Promise<CodexSessionHistory> {
    const native = this.getNative();
    if (!native)
      throw new SessionHistoryRouteError('nativePortUnavailable');
    return this.collapseNativeErrors(() => native.readHistory(session));
  }

  private async nativeHistoryTail(
    session: SessionMetadata,
    bound: NativeCarryOverBound,
    signal: AbortSignal | undefined,
  ): Promise<CodexCarryOverTail> {
    const native = this.getNative();
    const readTail = native?.readHistoryTail;
    if (!native || typeof readTail !== 'function')
      throw new SessionHistoryRouteError('nativePortUnavailable');
    return this.collapseNativeErrors(() => readTail.call(native, session, bound, signal));
  }

  private async collapseNativeErrors<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error: unknown) {
      // The Electron port has fixed codes. All other native failures are
      // collapsed here so a host cannot expose paths or protocol payloads.
      if (error instanceof Error && error.name === 'ElectronCodexHistoryError')
        throw error;
      throw new SessionHistoryRouteError('nativeReadFailed', error);
    }
  }

  private projectHistory(
    sessionId: string,
    snapshot: CodexSessionHistory,
  ): ReturnType<typeof projectCodexHistory> {
    try {
      return projectCodexHistory(sessionId, snapshot);
    } catch (error: unknown) {
      throw new SessionHistoryRouteError('nativeReadFailed', error);
    }
  }
}
