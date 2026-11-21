import { randomUUID } from 'node:crypto';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  createFlatStreamProjector,
  type FlatStreamProjector,
  type ProviderSession,
  type ProviderSessionEvent,
  type ProviderSessionPermission,
  type ProviderTurnImage,
  type ProviderTurnInput,
  type ProviderUsage,
} from '@ptah-extension/provider-session-contracts';
import {
  resolveContextCapacity,
  type EffortLevel,
  type FlatStreamEventUnion,
  type ResultStatsPayload,
  type SessionId,
} from '@ptah-extension/shared';
import {
  toTurnStateEvent,
  type SessionTurnStateRegistry,
} from '../helpers/session-turn-state.registry';
import type { ProviderSessionApprovalSink } from './provider-session-approval-sink';
import type { ProviderSessionChatPrepared } from './provider-session-chat-ports';
import { ProviderSessionChatAdapterError } from './provider-session-chat-adapter-error';
import { providerSessionRuntimeErrorCode } from './provider-session-error-mapping';
import {
  confineTurnFiles,
  type ProviderSessionRealpath,
} from './provider-session-turn-files';

/** The adapter's record of one chat session; outlives a broken process. */
export interface ProviderSessionChatSession {
  readonly id: SessionId;
  /** Opaque identity of this record (`getSessionToken`). */
  readonly token: string;
  readonly tabId?: string;
  readonly prepared: ProviderSessionChatPrepared;
  readonly approvals: ProviderSessionApprovalSink;
  readonly projector: FlatStreamProjector;
  /** Aborted when the session closes; cancels a re-acquire in flight. */
  readonly abort: AbortController;
  readonly title?: string;
  /** Stable across re-acquires: a re-acquire attaches to the same native id. */
  nativeSessionId: string;
  /** Absent after a broken process; the next turn re-acquires. */
  live?: ProviderSession;
  /** Changes on each acquire, so an approval reply to an older process is refused. */
  contextId: string;
  /** Changes the user made in this session; re-applied after a re-acquire. */
  settings: {
    model?: string;
    effort?: EffortLevel;
    permission?: ProviderSessionPermission;
  };
  busy: boolean;
  turnId?: string;
  /** Stop arrived before the prompt receipt; interrupt as soon as it lands. */
  pendingInterrupt: boolean;
  stopRequested: boolean;
  closing?: Promise<void>;
}

export interface ProviderSessionTurnInput {
  readonly text: string;
  readonly images?: readonly ProviderTurnImage[];
  /** As the caller sent them; resolved against the session's workspace. */
  readonly files?: readonly string[];
}

/**
 * The runtime's prompt input: file references become absolute paths inside
 * the session's workspace; any other reference is refused
 * (`unsupported-option`, option `files`) before anything is sent.
 */
export async function providerTurnInput(
  session: ProviderSessionChatSession,
  input: ProviderSessionTurnInput,
  realpath: ProviderSessionRealpath,
): Promise<ProviderTurnInput> {
  const files = await confineTurnFiles(
    input.files ?? [],
    session.prepared.seed.workspacePath,
    realpath,
  );
  return {
    text: input.text,
    ...(input.images?.length ? { images: input.images } : {}),
    ...(files.length ? { files } : {}),
  };
}

/** The prompt receipt is the boundary between admission and stream delivery. */
export interface ProviderSessionTurnAdmission {
  accepted(): void;
  rejected(error: unknown): void;
}

export interface ProviderSessionTurnOptions {
  readonly clientMessageId?: string;
  readonly inboundPeer?: { readonly label: string };
  readonly admission?: ProviderSessionTurnAdmission;
  /** The caller already marked the session busy (follow-up publication). */
  readonly reserved?: boolean;
}

export interface ProviderSessionTurnDependencies {
  readonly turnState: Pick<
    SessionTurnStateRegistry,
    'markGenerating' | 'settleTurn' | 'recordFailure' | 'forceIdle'
  >;
  readonly logger: Logger;
  /** Canonical path of a file reference (`fs.promises.realpath` in production). */
  readonly realpath: ProviderSessionRealpath;
  /** The live process, re-acquired (respawn + attach) when it broke. */
  live(session: ProviderSessionChatSession): Promise<ProviderSession>;
  stats(payload: ResultStatsPayload): void;
  failure(error: unknown, operation: string): ProviderSessionChatAdapterError;
  /** The process is gone: release it, publish one notice, keep the session. */
  broken(session: ProviderSessionChatSession): void;
  /** The turn released the session; start the next queued turn. */
  onIdle(session: ProviderSessionChatSession): void;
}

/** Shown in the projector's failure row when the events end without a terminal. */
const STREAM_ENDED_MESSAGE = 'The provider session stopped responding.';

/**
 * One chat turn of a provider session as flat stream events: the session's
 * events go through the shared FlatStream projector, with turn state around
 * them. Admission (the prompt receipt) is reported before the first event.
 * A failure before admission throws a coded error; after admission it ends
 * the stream with a failed row and turn state instead.
 */
export async function* streamProviderSessionTurn(
  session: ProviderSessionChatSession,
  input: ProviderSessionTurnInput,
  deps: ProviderSessionTurnDependencies,
  options: ProviderSessionTurnOptions = {},
): AsyncGenerator<FlatStreamEventUnion> {
  if (!options.reserved) {
    if (session.closing)
      throw new ProviderSessionChatAdapterError('unavailable', 'turn');
    if (session.busy) throw new ProviderSessionChatAdapterError('busy', 'turn');
    session.busy = true;
  }
  const subscription = new AbortController();
  const started = Date.now();
  let events: AsyncIterator<ProviderSessionEvent> | undefined;
  let live: ProviderSession | undefined;
  let admitted = false;
  let terminal = false;
  let turnId: string | undefined;
  let usage: ProviderUsage | undefined;
  let lastEvent: ProviderSessionEvent | undefined;
  const consumed =
    options.clientMessageId === undefined
      ? {}
      : { consumedClientMessageId: options.clientMessageId };
  try {
    try {
      live = await deps.live(session);
      if (session.closing)
        throw new ProviderSessionChatAdapterError('cancelled', 'turn');
      // Subscribe before the prompt so no event of this turn is missed.
      // Refused before the prompt: an image is never dropped silently.
      if (input.images?.length && !live.capabilities().images)
        throw new ProviderSessionChatAdapterError('unsupported-option', 'images', {
          option: 'images',
        });
      const prompt = await providerTurnInput(session, input, deps.realpath);
      events = live.events(subscription.signal)[Symbol.asyncIterator]();
      const receipt = await live.prompt(prompt);
      turnId = receipt.turnId;
      session.turnId = turnId;
    } catch (error) {
      const failure = deps.failure(error, 'prompt');
      // A prompt refused because the process died: the next send re-acquires.
      if (live && providerSessionRuntimeErrorCode(error) === 'process-exited')
        deps.broken(session);
      options.admission?.rejected(failure);
      throw failure;
    }
    admitted = true;
    options.admission?.accepted();
    yield* userEcho(session.id, turnId, input.text, options);
    if (session.pendingInterrupt) {
      session.pendingInterrupt = false;
      await interruptQuietly(live, turnId, deps.logger);
    }
    while (!terminal) {
      let next: IteratorResult<ProviderSessionEvent>;
      try {
        next = await events.next();
      } catch (error) {
        deps.failure(error, 'events');
        next = { done: true, value: undefined };
      }
      const event: ProviderSessionEvent = next.done
        ? endedWithoutTerminal(session, lastEvent, turnId)
        : next.value;
      if (!next.done) lastEvent = event;
      if (event.turnId !== undefined && event.turnId !== turnId) continue;
      if (event.type === 'usage' && event.usage) usage = event.usage;
      if (event.type === 'terminal') {
        terminal = true;
        usage ??= event.usage;
      }
      // FlatStream rows carry the Ptah session id, never the native one.
      for (const mapped of session.projector.project({
        ...event,
        sessionId: session.id,
      })) {
        if (
          mapped.eventType === 'message_start' &&
          mapped.role === 'assistant'
        ) {
          const generating = deps.turnState.markGenerating(session.id);
          if (generating) yield toTurnStateEvent(session.id, generating);
        }
        yield mapped;
      }
      if (event.type !== 'terminal') continue;
      if (usage) deps.stats(resultStats(session, usage, Date.now() - started));
      yield {
        ...toTurnStateEvent(session.id, settle(session.id, event, deps)),
        ...consumed,
      };
      if (event.disposition === 'broken') deps.broken(session);
    }
  } finally {
    subscription.abort();
    try {
      await events?.return?.();
    } catch (error) {
      deps.failure(error, 'event subscription cleanup');
    }
    if (admitted && !terminal) {
      // The consumer detached mid-turn: stop the turn rather than leave the
      // provider running with nobody reading it.
      if (live && turnId && !session.closing)
        await interruptQuietly(live, turnId, deps.logger);
      deps.turnState.forceIdle(session.id, 'aborted_streaming');
    }
    session.approvals.cancelAll('turn-ended');
    session.busy = false;
    session.turnId = undefined;
    session.pendingInterrupt = false;
    session.stopRequested = false;
    deps.onIdle(session);
  }
}

function settle(
  sessionId: SessionId,
  event: Extract<ProviderSessionEvent, { type: 'terminal' }>,
  deps: Pick<ProviderSessionTurnDependencies, 'turnState'>,
) {
  if (event.status === 'failed') {
    deps.turnState.recordFailure(sessionId, {
      error: 'unknown',
      terminalReason: null,
    });
    return deps.turnState.settleTurn(sessionId);
  }
  return deps.turnState.settleTurn(
    sessionId,
    event.status === 'completed' ? 'completed' : 'aborted_streaming',
  );
}

/** A failed, broken terminal for a stream that ended before its terminal. */
function endedWithoutTerminal(
  session: ProviderSessionChatSession,
  last: ProviderSessionEvent | undefined,
  turnId: string,
): ProviderSessionEvent {
  return {
    contextId: last?.contextId ?? session.id,
    processGeneration:
      last?.processGeneration ?? session.live?.processGeneration ?? 0,
    sessionId: session.id,
    turnId,
    sequence: (last?.sequence ?? 0) + 1,
    type: 'terminal',
    status: 'failed',
    disposition: 'broken',
    error: { code: 'process-exited', message: STREAM_ENDED_MESSAGE },
  };
}

async function interruptQuietly(
  live: ProviderSession,
  turnId: string,
  logger: Logger,
): Promise<void> {
  try {
    await live.interrupt(turnId);
  } catch (error) {
    // degradation-audit: reported - the turn is ending anyway; a failed
    // interrupt only means the provider finishes the turn on its own.
    logger.warn('[ProviderSessionChatAdapter] turn interrupt failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

function* userEcho(
  sessionId: SessionId,
  turnId: string,
  text: string,
  options: ProviderSessionTurnOptions,
): Generator<FlatStreamEventUnion> {
  const timestamp = Date.now();
  if (options.inboundPeer) {
    const messageId = `provider-session-peer:${sessionId}:${turnId}`;
    const base = { timestamp, sessionId, source: 'complete' as const, messageId };
    yield {
      ...base,
      id: `${messageId}:start`,
      eventType: 'message_start',
      role: 'user',
      inboundPeer: options.inboundPeer,
    };
    yield {
      ...base,
      id: `${messageId}:text`,
      eventType: 'text_delta',
      delta: text,
      blockIndex: 0,
    };
    yield { ...base, id: `${messageId}:complete`, eventType: 'message_complete' };
    return;
  }
  if (options.clientMessageId === undefined) return;
  yield {
    id: `provider-session-user:${sessionId}:${turnId}`,
    eventType: 'message_start',
    timestamp,
    sessionId,
    source: 'complete',
    messageId: options.clientMessageId,
    role: 'user',
    clientMessageId: options.clientMessageId,
  };
}

/** Live per-turn stats (plan A16): no lifetime checkpoint, no restore. */
function resultStats(
  session: ProviderSessionChatSession,
  usage: ProviderUsage,
  duration: number,
): ResultStatsPayload {
  const model =
    usage.model ?? session.settings.model ?? session.prepared.seed.model;
  const costUsd = usage.costUsd ?? null;
  const tokens = {
    input: usage.inputTokens,
    output: usage.outputTokens,
    ...(usage.cacheReadTokens === undefined
      ? {}
      : { cacheRead: usage.cacheReadTokens }),
    ...(usage.cacheWriteTokens === undefined
      ? {}
      : { cacheCreation: usage.cacheWriteTokens }),
  };
  if (!model) return { sessionId: session.id, turnCost: costUsd, tokens, duration };
  // An unknown window reads 0 while contextCapacity says 'unknown', so the
  // header shows an explicit unknown context, never a wrong percentage.
  const contextCapacity = resolveContextCapacity({
    route: { kind: 'native', providerId: session.prepared.seed.providerId },
    model,
  });
  return {
    sessionId: session.id,
    turnCost: costUsd,
    tokens,
    duration,
    modelUsage: [
      {
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        contextWindow: contextCapacity.tokens ?? 0,
        contextCapacity,
        costUSD: costUsd,
        cacheReadInputTokens: usage.cacheReadTokens ?? 0,
        ...(usage.contextTokens === undefined
          ? {}
          : { lastTurnContextTokens: usage.contextTokens }),
      },
    ],
  };
}

/** One projector per chat session (turn state lives in it). */
export function createSessionProjector(
  sessionId: SessionId,
): FlatStreamProjector {
  return createFlatStreamProjector({ sessionId });
}

const BROKEN_NOTICE =
  'The provider session stopped. Your next message reconnects to this conversation.';

/** The one notice of a broken process: a complete message outside any turn. */
export function brokenSessionNotice(
  sessionId: SessionId,
): FlatStreamEventUnion[] {
  const messageId = `provider-session-broken:${sessionId}:${randomUUID()}`;
  const base = {
    timestamp: Date.now(),
    sessionId,
    source: 'complete' as const,
    messageId,
  };
  return [
    { ...base, id: `${messageId}:start`, eventType: 'message_start', role: 'assistant' },
    {
      ...base,
      id: `${messageId}:text`,
      eventType: 'text_delta',
      delta: BROKEN_NOTICE,
      blockIndex: 0,
    },
    // No turn follows this notice, so the message is closed here.
    { ...base, id: `${messageId}:complete`, eventType: 'message_complete' },
  ];
}

/**
 * Publish a turn through the host channel. Reserves the session at once, so
 * a concurrent send queues instead of racing. Resolves when the provider
 * accepted the prompt; rejects when it was refused before admission.
 */
export function publishProviderSessionTurn(
  session: ProviderSessionChatSession,
  input: ProviderSessionTurnInput,
  options: Omit<ProviderSessionTurnOptions, 'admission' | 'reserved'>,
  deps: ProviderSessionTurnDependencies,
  host: {
    publish(
      sessionId: SessionId,
      stream: AsyncIterable<FlatStreamEventUnion>,
    ): Promise<void>;
    /** The host never iterated the stream: release the reservation. */
    unreserve(): void;
  },
): Promise<void> {
  session.busy = true;
  return new Promise<void>((resolve, reject) => {
    let decided = false;
    let started = false;
    const admission: ProviderSessionTurnAdmission = {
      accepted: () => {
        if (decided) return;
        decided = true;
        resolve();
      },
      rejected: (error) => {
        if (decided) return;
        decided = true;
        reject(error);
      },
    };
    const stream = (async function* () {
      started = true;
      yield* streamProviderSessionTurn(session, input, deps, {
        ...options,
        admission,
        reserved: true,
      });
    })();
    const settleUnstarted = () => {
      if (!started) host.unreserve();
    };
    void host.publish(session.id, stream).then(
      () => {
        settleUnstarted();
        admission.rejected(
          new ProviderSessionChatAdapterError('runtime-failed', 'publish'),
        );
      },
      (error: unknown) => {
        settleUnstarted();
        if (!decided) {
          admission.rejected(deps.failure(error, 'publish'));
          return;
        }
        deps.logger.error(
          '[ProviderSessionChatAdapter] turn publication failed after admission.',
          error instanceof Error ? error : new Error(String(error)),
        );
      },
    );
  });
}
