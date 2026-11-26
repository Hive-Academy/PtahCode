import 'reflect-metadata';
import { resolve } from 'node:path';
import { Logger } from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type {
  ProviderApprovalSink,
  ProviderModelInfo,
  ProviderSession,
  ProviderSessionCapabilities,
  ProviderSessionEvent,
  ProviderSessionEventBody,
  ProviderSessionPermission,
  ProviderTurnInput,
} from '@ptah-extension/provider-session-contracts';
import {
  resetPricingMapForTesting,
  SessionId,
  updatePricingMap,
  type AppliedSettings,
  type FlatStreamEventUnion,
  type ProviderSessionSeed,
  type QueuedFollowUpStateChange,
  type ResultStatsPayload,
} from '@ptah-extension/shared';
import { SessionApprovalRouter } from '../codex-app-server/session-approval-router';
import { SessionTurnStateRegistry } from '../helpers/session-turn-state.registry';
import { SessionAdmissionRefusedError } from '../errors/session-admission-refused.error';
import {
  ProviderSessionChatAdapter,
  type ProviderSessionChatAdapterDependencies,
} from './provider-session-chat-adapter';
import type { SessionUsageSink } from '../session-stats/session-usage-sink';
import {
  ProviderSessionChatAdapterError,
  type ProviderSessionChatAdapterErrorCode,
} from './provider-session-chat-adapter-error';
import type {
  ProviderSessionAcquireRequest,
  ProviderSessionChatPorts,
} from './provider-session-chat-ports';

const applied: AppliedSettings = { timing: 'nextTurn', revision: 1 };
const seed: ProviderSessionSeed = {
  providerId: 'antigravity-cli',
  profile: 'antigravity',
  consumer: 'chat',
  workspacePath: 'C:\\Repo',
  workspaceId: 'c:\\repo',
  model: 'gemini-pro',
};

/** A runtime error as the ACP runtime rejects with it. */
class FakeRuntimeError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** One subscriber's event queue; ends on abort or when the process "exits". */
class EventQueue implements AsyncIterator<ProviderSessionEvent> {
  private readonly buffered: ProviderSessionEvent[] = [];
  private waiting?: (result: IteratorResult<ProviderSessionEvent>) => void;
  private ended = false;

  push(event: ProviderSessionEvent): void {
    if (this.ended) return;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve({ done: false, value: event });
    } else this.buffered.push(event);
  }
  end(): void {
    this.ended = true;
    this.waiting?.({ done: true, value: undefined });
    this.waiting = undefined;
  }
  next(): Promise<IteratorResult<ProviderSessionEvent>> {
    const event = this.buffered.shift();
    if (event) return Promise.resolve({ done: false, value: event });
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => (this.waiting = resolve));
  }
  async return(): Promise<IteratorResult<ProviderSessionEvent>> {
    this.end();
    return { done: true, value: undefined };
  }
}

/** A fake runtime session: the test drives its events by hand. */
class FakeProviderSession implements ProviderSession {
  readonly restoredContext = false;
  readonly replay: readonly ProviderSessionEvent[] = [];
  readonly queues = new Set<EventQueue>();
  caps: ProviderSessionCapabilities = {
    steer: false,
    interrupt: true,
    setModel: true,
    setMode: true,
    images: false,
    resume: true,
    load: true,
    modes: [],
  };
  sequence = 0;
  turns = 0;
  currentTurn?: string;
  readonly prompt = jest.fn(async (input: ProviderTurnInput) => {
    void input;
    this.currentTurn = `turn-${++this.turns}`;
    return { turnId: this.currentTurn };
  });
  steer?: jest.Mock;
  readonly interrupt = jest.fn(async (turnId: string) => {
    this.emit(
      { type: 'terminal', status: 'interrupted', disposition: 'reusable' },
      turnId,
    );
    return true;
  });
  readonly setModel = jest.fn(async (_model: string) => applied);
  readonly setEffort = jest.fn(async (_effort: string | undefined) => applied);
  readonly setPermission = jest.fn(async (_permission: string) => applied);
  readonly getPermission = jest.fn<ProviderSessionPermission | undefined, []>(
    () => undefined,
  );
  readonly listModels = jest.fn(
    async (): Promise<readonly ProviderModelInfo[]> => [
      { id: 'gemini-pro', name: 'Gemini Pro', isDefault: true },
      { id: 'gemini-flash' },
    ],
  );
  readonly close = jest.fn(async () => undefined);

  constructor(
    readonly nativeSessionId: string,
    readonly processGeneration: number,
    readonly approvals: ProviderApprovalSink,
  ) {}

  capabilities(): ProviderSessionCapabilities {
    return this.caps;
  }
  events(signal: AbortSignal): AsyncIterable<ProviderSessionEvent> {
    const queue = new EventQueue();
    this.queues.add(queue);
    signal.addEventListener('abort', () => queue.end(), { once: true });
    return { [Symbol.asyncIterator]: () => queue };
  }
  isTurnRunning(): boolean {
    return this.currentTurn !== undefined;
  }
  getPid(): number | undefined {
    return 4242;
  }
  emit(body: ProviderSessionEventBody, turnId = this.currentTurn): void {
    const event = {
      contextId: 'ctx',
      processGeneration: this.processGeneration,
      sessionId: this.nativeSessionId,
      ...(turnId ? { turnId } : {}),
      sequence: ++this.sequence,
      ...body,
    } as ProviderSessionEvent;
    if (body.type === 'terminal') this.currentTurn = undefined;
    for (const queue of this.queues) queue.push(event);
  }
  /** The process exited: every subscription ends without a terminal. */
  exit(): void {
    for (const queue of this.queues) queue.end();
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function collect(
  stream: AsyncIterable<FlatStreamEventUnion>,
): Promise<FlatStreamEventUnion[]> {
  const events: FlatStreamEventUnion[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

/** Wait until the fake has a subscriber and a prompted turn, then return it. */
async function promptedTurn(
  live: FakeProviderSession,
  turns = 1,
): Promise<void> {
  for (let i = 0; i < 50 && live.turns < turns; i++) await flush();
  expect(live.turns).toBe(turns);
}

function setup(
  extra: Pick<
    ProviderSessionChatAdapterDependencies,
    'usageSink' | 'pricing'
  > = {},
) {
  const logger: Logger = Object.assign(
    Object.create(Logger.prototype),
    createMockLogger(),
  );
  const lives: FakeProviderSession[] = [];
  const published: FlatStreamEventUnion[] = [];
  const cancelled = jest.fn();
  const approvals = new SessionApprovalRouter(
    { handleResponse: jest.fn() },
    cancelled,
  );
  let generation = 0;
  /** Like the host pool: one live process per chat session until released. */
  const pool = new Map<SessionId, FakeProviderSession>();
  const acquire = jest.fn(
    async (request: ProviderSessionAcquireRequest, _signal: AbortSignal) => {
      const existing = pool.get(request.sessionId);
      if (existing) return existing;
      const live = new FakeProviderSession(
        request.resume?.nativeSessionId ?? 'native-1',
        ++generation,
        request.approvals,
      );
      lives.push(live);
      pool.set(request.sessionId, live);
      return live;
    },
  );
  const ports: ProviderSessionChatPorts = {
    info: {
      id: 'provider-session',
      name: 'Antigravity',
      vendor: 'Google',
      version: '1',
      description: 'Provider session',
      capabilities: {
        streaming: true,
        fileAttachments: false,
        contextManagement: false,
        sessionPersistence: true,
        multiTurn: true,
        codeGeneration: true,
        imageAnalysis: false,
        functionCalling: true,
      },
    },
    prepare: jest.fn(async (_config, sessionId?: SessionId) => ({
      seed,
      ...(sessionId ? { resume: { nativeSessionId: 'native-stored' } } : {}),
    })),
    acquire,
    release: jest.fn(async (id: SessionId) => {
      pool.delete(id);
    }),
    releaseAll: jest.fn(async () => {
      pool.clear();
    }),
    holds: (id, live) => pool.get(id) === live,
    identity: { save: jest.fn(async () => undefined) },
    presentation: { present: jest.fn(), cancelPrompt: jest.fn() },
    publish: jest.fn(async (_id, stream) => {
      for await (const event of stream) published.push(event);
    }),
    publishNotice: jest.fn(async () => undefined),
  };
  const turnState = new SessionTurnStateRegistry();
  /** Lexical by default; a spec maps a link target or marks a path missing. */
  const links = new Map<string, string>();
  const missing = new Set<string>();
  const realpath = jest.fn(async (path: string) => {
    if (missing.has(path))
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return links.get(path) ?? path;
  });
  const adapter = new ProviderSessionChatAdapter(
    { ...ports, logger, approvals, realpath, ...extra },
    turnState,
  );
  const resolved = jest.fn();
  adapter.setSessionIdResolvedCallback(resolved);
  const stats = jest.fn<void, [ResultStatsPayload]>();
  adapter.setResultStatsCallback(stats);
  const followUps: QueuedFollowUpStateChange[] = [];
  adapter.onQueuedFollowUpState((change) => followUps.push(change));
  return {
    adapter,
    ports,
    acquire,
    pool,
    lives,
    published,
    approvals,
    cancelled,
    resolved,
    stats,
    followUps,
    logger,
    links,
    missing,
  };
}

type Harness = ReturnType<typeof setup>;

/** Start a session and run its first turn to completion. */
async function startCompleted(h: Harness) {
  // The chat service adds clientMessageId beside the typed start config.
  const config = {
    tabId: 'tab-1',
    prompt: 'hello',
    clientMessageId: 'client-1',
  };
  const stream = await h.adapter.startChatSession(config);
  const events = collect(stream);
  const live = h.lives[0];
  await promptedTurn(live);
  live.emit({ type: 'textDelta', itemId: 'a', delta: 'hi' });
  live.emit({ type: 'terminal', status: 'completed', disposition: 'reusable' });
  const id = h.resolved.mock.calls[0][1] as SessionId;
  return { id, live, events: await events };
}

async function expectCode(
  promise: Promise<unknown>,
  code: ProviderSessionChatAdapterErrorCode,
): Promise<ProviderSessionChatAdapterError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProviderSessionChatAdapterError);
  expect((error as ProviderSessionChatAdapterError).code).toBe(code);
  return error as ProviderSessionChatAdapterError;
}

describe('ProviderSessionChatAdapter', () => {
  it('starts a session, saves its identity before the prompt and streams the turn', async () => {
    const h = setup();
    const order: string[] = [];
    (h.ports.identity.save as jest.Mock).mockImplementation(async () => {
      order.push('save');
    });
    const { id, live, events } = await startCompleted(h);
    order.push(...live.prompt.mock.calls.map(() => 'prompt'));

    expect(SessionId.validate(id)).toBe(true);
    expect(h.resolved).toHaveBeenCalledWith('tab-1', id);
    // The open, then the turn: every turn goes through the pool, which
    // returns its live entry (one process).
    expect(h.acquire).toHaveBeenCalledTimes(2);
    expect(h.lives).toHaveLength(1);
    expect(h.ports.identity.save).toHaveBeenCalledTimes(1);
    expect(h.acquire.mock.calls[0][0]).toMatchObject({
      sessionId: id,
      tabId: 'tab-1',
      seed,
    });
    expect(h.acquire.mock.calls[0][0].resume).toBeUndefined();
    expect(order).toEqual(['save', 'prompt']);
    expect(h.ports.identity.save).toHaveBeenCalledWith(
      id,
      {
        execution: {
          version: 1,
          runtime: 'provider-session',
          sessionId: id,
          providerId: 'antigravity-cli',
          workspaceId: 'C:\\Repo',
          providerSession: { profile: 'antigravity' },
        },
        thread: { nativeSessionId: 'native-1', processGeneration: 1 },
      },
      undefined,
    );
    expect(live.prompt).toHaveBeenCalledWith({ text: 'hello' });
    expect(events.every((event) => event.sessionId === id)).toBe(true);
    expect(events.map((event) => event.eventType)).toEqual([
      'message_start', // user echo
      'turn_state', // generating
      'message_start',
      'text_delta',
      'message_complete',
      'turn_state', // settled
    ]);
    expect(events[0]).toMatchObject({
      role: 'user',
      clientMessageId: 'client-1',
    });
    expect(events[5]).toMatchObject({ consumedClientMessageId: 'client-1' });
    expect(h.adapter.owns(id)).toBe(true);
    expect(h.adapter.canSendFollowUp(id)).toBe(true);
  });

  it('applies the prepared model to the process a history read adopted on resume after a restart', async () => {
    // Live test: after a restart the history read opened agy with `session/load`
    // and no model; the follow-up ran on agy's default. The resume's prepared
    // seed carries the saved model, and the attach sets it on that process.
    const h = setup();
    (h.ports.prepare as jest.Mock).mockImplementationOnce(async () => ({
      seed: { ...seed, model: 'gemini-4-hydrogen-low' },
      resume: { nativeSessionId: 'native-stored' },
    }));
    const id = SessionId.create();
    await collect(await h.adapter.resumeSession(id, { tabId: 'tab-r' }));
    expect(h.acquire.mock.calls[0][0].seed.model).toBe('gemini-4-hydrogen-low');
    expect(h.lives[0].setModel).toHaveBeenCalledWith('gemini-4-hydrogen-low');
  });

  it('resumes the stored native session and fails a mismatched attach as resume-failed', async () => {
    const h = setup();
    const id = SessionId.create();
    await collect(await h.adapter.resumeSession(id, { tabId: 'tab-r' }));
    expect(h.acquire.mock.calls[0][0].resume).toEqual({
      nativeSessionId: 'native-stored',
      onFailure: 'error',
    });
    expect(h.adapter.owns(id)).toBe(true);

    const other = setup();
    other.acquire.mockImplementationOnce(async (request) => {
      const live = new FakeProviderSession('native-new', 1, request.approvals);
      other.lives.push(live);
      return live;
    });
    const otherId = SessionId.create();
    await expectCode(
      other.adapter.resumeSession(otherId, { tabId: 'tab-x', prompt: 'hi' }),
      'resume-failed',
    );
    expect(other.ports.release).toHaveBeenCalledWith(otherId, 'tab-closed');
    expect(other.ports.identity.save).not.toHaveBeenCalled();
    expect(other.adapter.owns(otherId)).toBe(false);
  });

  it('maps a runtime resume failure to ProviderSessionChatAdapterError', async () => {
    const h = setup();
    h.acquire.mockRejectedValueOnce(
      new FakeRuntimeError('could not resume native-stored', 'resume-failed'),
    );
    const id = SessionId.create();
    await expectCode(
      h.adapter.resumeSession(id, { tabId: 'tab', prompt: 'hi' }),
      'resume-failed',
    );
    expect(h.ports.release).not.toHaveBeenCalled();
    expect(h.adapter.owns(id)).toBe(false);
  });

  it('maps auth-required with the provider and the sign-in hint', async () => {
    const h = setup();
    h.acquire.mockRejectedValueOnce(
      new FakeRuntimeError('Run agy login, then try again.', 'auth-required'),
    );
    const error = await expectCode(
      h.adapter.startChatSession({ tabId: 'tab', prompt: 'hi' }),
      'auth-required',
    );
    expect(error.providerId).toBe('antigravity-cli');
    expect(error.signInHint).toBe('Run agy login, then try again.');
  });

  it('refuses a resume whose session has no stored native id', async () => {
    const h = setup();
    (h.ports.prepare as jest.Mock).mockResolvedValueOnce({ seed });
    await expectCode(
      h.adapter.resumeSession(SessionId.create(), {
        tabId: 'tab',
        prompt: 'hi',
      }),
      'resume-failed',
    );
    expect(h.acquire).not.toHaveBeenCalled();
  });

  it('routes an approval round trip through the router and the host presentation', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'edit',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    const controller = new AbortController();
    const decision = live.approvals.request(
      { requestId: 'req-1', title: 'Edit file', kind: 'edit' },
      controller.signal,
    );
    expect(h.ports.presentation.present).toHaveBeenCalledTimes(1);
    const prompt = (h.ports.presentation.present as jest.Mock).mock.calls[0][0];
    expect(prompt).toMatchObject({
      sessionId: id,
      threadId: 'native-1',
      request: { requestId: 'req-1' },
    });
    const address = { sessionId: id, threadId: 'native-1', requestId: 'req-1' };
    // A reply for another process context is refused.
    expect(
      h.approvals.respond(address, {
        kind: 'provider-session',
        response: { ...address, contextId: 'stale', decision: 'accept' },
      }),
    ).toBe(false);
    expect(
      h.approvals.respond(address, {
        kind: 'provider-session',
        response: {
          ...address,
          contextId: prompt.contextId,
          decision: 'accept',
        },
      }),
    ).toBe(true);
    await expect(decision).resolves.toBe('accept');
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    await events;
  });

  it('cancels an open approval when the turn ends, never authorizing it', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'edit',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const decision = live.approvals.request(
      { requestId: 'req-2', title: 'Run command' },
      new AbortController().signal,
    );
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    await events;
    await expect(decision).resolves.toBe('cancel');
    expect(h.cancelled).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-2', reason: 'turn-ended' }),
    );
  });

  it('interrupts the running turn and keeps the process', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'long',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await h.adapter.interruptSession(id, 'user-stop');
    const out = await events;
    expect(live.interrupt).toHaveBeenCalledWith('turn-1');
    expect(out.at(-1)).toMatchObject({ eventType: 'turn_state' });
    expect(h.ports.release).not.toHaveBeenCalled();
    expect(h.adapter.isSessionActive(id)).toBe(true);
  });

  it('releases the session when an interrupt is refused', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'long',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    live.interrupt.mockImplementationOnce(async () => false);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await h.adapter.interruptSession(id, 'user-stop');
    expect(h.ports.release).toHaveBeenCalledWith(id, 'broken');
    expect(h.adapter.owns(id)).toBe(false);
    live.exit();
    await events;
  });

  it('queues a follow-up sent during a running turn and delivers it next', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'first',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await h.adapter.sendMessageToSession(id, 'second', {
      clientMessageId: 'client-2',
      queueIntent: 'next-turn',
    });
    expect(h.followUps).toEqual([
      { sessionId: id, clientMessageId: 'client-2', state: 'queued' },
    ]);
    expect(h.adapter.listQueuedFollowUps(id)).toEqual([
      { clientMessageId: 'client-2', content: 'second' },
    ]);
    // A plain send while busy is refused instead of overlapping turns.
    await expectCode(h.adapter.sendMessageToSession(id, 'third'), 'busy');
    await expect(
      h.adapter.sendMessageToSession(id, 'peer', { admission: 'require-idle' }),
    ).rejects.toBeInstanceOf(SessionAdmissionRefusedError);

    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    await events;
    await promptedTurn(live, 2);
    expect(live.prompt).toHaveBeenLastCalledWith({ text: 'second' });
    await flush();
    expect(h.followUps.at(-1)).toEqual({
      sessionId: id,
      clientMessageId: 'client-2',
      state: 'delivered',
    });
    expect(h.adapter.listQueuedFollowUps(id)).toEqual([]);
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    for (let i = 0; i < 10; i++) await flush();
    expect(h.published.some((event) => event.eventType === 'turn_state')).toBe(
      true,
    );
    expect(h.adapter.canSendFollowUp(id)).toBe(true);
  });

  it('withdraws a queued follow-up and steers only when the provider can steer', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'first',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    for (const clientMessageId of ['a', 'b'])
      await h.adapter.sendMessageToSession(id, clientMessageId, {
        clientMessageId,
        queueIntent: 'next-turn',
      });
    await expect(h.adapter.steerQueuedFollowUp(id, 'a')).resolves.toEqual({
      ok: false,
      code: 'UNSUPPORTED',
    });
    live.caps = { ...live.caps, steer: true };
    live.steer = jest.fn(async () => ({ turnId: 'turn-1' }));
    await expect(h.adapter.steerQueuedFollowUp(id, 'a')).resolves.toEqual({
      ok: true,
    });
    expect(live.steer).toHaveBeenCalledWith({ text: 'a' }, 'turn-1');
    await expect(h.adapter.withdrawQueuedFollowUp(id, 'b')).resolves.toBe(true);
    expect(h.followUps.map((change) => change.state)).toEqual([
      'queued',
      'queued',
      'steered',
      'withdrawn',
    ]);
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    await events;
    expect(live.prompt).toHaveBeenCalledTimes(1);
  });

  it('publishes one notice on a broken turn and re-acquires on the next send', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'first',
    });
    const events = collect(stream);
    const first = h.lives[0];
    await promptedTurn(first);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    first.emit({
      type: 'terminal',
      status: 'failed',
      disposition: 'broken',
      error: { code: 'process-exited', message: 'agy exited' },
    });
    const out = await events;
    expect(out.some((event) => event.eventType === 'message_complete')).toBe(
      true,
    );
    expect(h.ports.release).toHaveBeenCalledWith(id, 'broken');
    expect(h.ports.publishNotice).toHaveBeenCalledTimes(1);
    expect(h.adapter.owns(id)).toBe(true);

    await h.adapter.sendMessageToSession(id, 'again');
    expect(h.acquire).toHaveBeenCalledTimes(3);
    expect(h.acquire.mock.calls[2][0].resume).toEqual({
      nativeSessionId: 'native-1',
      onFailure: 'error',
    });
    expect(h.ports.identity.save).toHaveBeenLastCalledWith(
      id,
      expect.objectContaining({
        thread: { nativeSessionId: 'native-1', processGeneration: 2 },
      }),
      undefined,
    );
    const second = h.lives[1];
    expect(second.prompt).toHaveBeenCalledWith({ text: 'again' });
    second.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    for (let i = 0; i < 10; i++) await flush();
    expect(h.ports.publishNotice).toHaveBeenCalledTimes(1);
  });

  it('treats an event stream that ends without a terminal as a broken process', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'first',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    live.exit();
    const out = await events;
    expect(out.at(-1)).toMatchObject({ eventType: 'turn_state' });
    expect(h.ports.publishNotice).toHaveBeenCalledTimes(1);
    expect(h.ports.release).toHaveBeenCalledWith(expect.any(String), 'broken');
  });

  it('reports usage to the result stats callback once per turn', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'hi',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
      usage: {
        model: 'gemini-pro',
        inputTokens: 120,
        outputTokens: 30,
        cacheReadTokens: 10,
        contextTokens: 4000,
        costUsd: 0.002,
      },
    });
    await events;
    expect(h.stats).toHaveBeenCalledTimes(1);
    expect(h.stats.mock.calls[0][0]).toMatchObject({
      sessionId: id,
      turnCost: 0.002,
      tokens: { input: 120, output: 30, cacheRead: 10 },
      modelUsage: [
        {
          model: 'gemini-pro',
          inputTokens: 120,
          outputTokens: 30,
          costUSD: 0.002,
          cacheReadInputTokens: 10,
          lastTurnContextTokens: 4000,
        },
      ],
    });
  });

  it('applies live controls to the session and keeps them across a re-acquire', async () => {
    const h = setup();
    const { id, live } = await startCompleted(h);
    await h.adapter.setSessionModel(id, 'gemini-flash');
    await h.adapter.setSessionEffort(id, 'high');
    await h.adapter.setSessionPermissionLevel(id, 'auto-edit');
    expect(live.setModel).toHaveBeenCalledWith('gemini-flash');
    expect(live.setEffort).toHaveBeenCalledWith('high');
    expect(live.setPermission).toHaveBeenCalledWith('auto-edit');
    await expectCode(
      h.adapter.setSessionPermissionLevel(id, 'bypassPermissions'),
      'unsupported-option',
    );
    await expect(h.adapter.listSessionModels(id)).resolves.toEqual([
      { value: 'gemini-pro', displayName: 'Gemini Pro' },
      { value: 'gemini-flash', displayName: 'gemini-flash' },
    ]);

    live.caps = { ...live.caps, setModel: false };
    await expectCode(h.adapter.setSessionModel(id, 'x'), 'unsupported-option');
  });

  it('applies explicit permissionLevel on open and reports it via getPermissionLevel', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab-yolo',
      prompt: 'hello',
      permissionLevel: 'yolo',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    await events;
    const id = h.resolved.mock.calls[0][1] as SessionId;

    expect(live.setPermission).toHaveBeenCalledTimes(1);
    expect(live.setPermission).toHaveBeenCalledWith('yolo');
    expect(h.adapter.getPermissionLevel(id)).toBe('yolo');
  });

  it('skips setPermission on open when permissionLevel is omitted and reads the live default', async () => {
    const h = setup();
    const { id, live } = await startCompleted(h);

    expect(live.setPermission).not.toHaveBeenCalled();
    expect(h.adapter.getPermissionLevel(id)).toBeUndefined();

    live.getPermission.mockReturnValue('ask');
    expect(h.adapter.getPermissionLevel(id)).toBe('ask');
  });

  it('updates getPermissionLevel via setSessionPermissionLevel and returns undefined for invalid or unknown session ids', async () => {
    const h = setup();
    const { id, live } = await startCompleted(h);
    live.getPermission.mockReturnValue('ask');
    expect(h.adapter.getPermissionLevel(id)).toBe('ask');

    await h.adapter.setSessionPermissionLevel(id, 'auto-edit');
    expect(h.adapter.getPermissionLevel(id)).toBe('auto-edit');

    await h.adapter.setSessionPermissionLevel(id, 'yolo');
    expect(h.adapter.getPermissionLevel(id)).toBe('yolo');

    expect(
      h.adapter.getPermissionLevel('not-a-valid-session-id'),
    ).toBeUndefined();
    expect(h.adapter.getPermissionLevel(SessionId.create())).toBeUndefined();
  });

  it('sends images and file references with the prompt when the provider takes images', async () => {
    const h = setup();
    h.acquire.mockImplementationOnce(async (request) => {
      const live = new FakeProviderSession('native-1', 1, request.approvals);
      live.caps = { ...live.caps, images: true };
      h.lives.push(live);
      h.pool.set(request.sessionId, live);
      return live;
    });
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'look',
      images: [{ data: 'AAAA', mediaType: 'image/png' }],
      files: ['src/a.ts'],
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    expect(live.prompt).toHaveBeenCalledWith({
      text: 'look',
      images: [{ mimeType: 'image/png', data: 'AAAA' }],
      files: [
        {
          path: resolve(seed.workspacePath, 'src/a.ts'),
          name: 'a.ts',
        },
      ],
    });
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    await events;

    // A follow-up with only an image is a turn, not an empty send.
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await h.adapter.sendMessageToSession(id, '', {
      images: [{ data: 'BBBB', mediaType: 'image/jpeg' }],
    });
    expect(live.prompt).toHaveBeenLastCalledWith({
      text: '',
      images: [{ mimeType: 'image/jpeg', data: 'BBBB' }],
    });
  });

  it('refuses images for a provider without image input before anything is sent', async () => {
    const h = setup();
    // The capability is unknown before the first acquire: refused at the prompt.
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'look',
      images: [{ data: 'AAAA', mediaType: 'image/png' }],
    });
    const failure = await collect(stream).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(failure).toBeInstanceOf(ProviderSessionChatAdapterError);
    expect((failure as ProviderSessionChatAdapterError).option).toBe('images');
    expect(h.lives[0].prompt).not.toHaveBeenCalled();

    // Once the process is known, refused at the send, before any queueing.
    const id = h.resolved.mock.calls[0][1] as SessionId;
    const error = await expectCode(
      h.adapter.sendMessageToSession(id, 'look', {
        images: [{ data: 'AAAA', mediaType: 'image/png' }],
      }),
      'unsupported-option',
    );
    expect(error.option).toBe('images');
    expect(h.lives[0].prompt).not.toHaveBeenCalled();
    // Files are resource links (ACP baseline) and need no capability.
    await h.adapter.sendMessageToSession(id, 'read', { files: ['a.ts'] });
    expect(h.lives[0].prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [expect.objectContaining({ name: 'a.ts' })],
      }),
    );
  });

  it('refuses a malformed image instead of sending it', async () => {
    const h = setup();
    const error = await expectCode(
      h.adapter.startChatSession({
        tabId: 'tab',
        prompt: 'look',
        images: [{ data: '', mediaType: 'text/plain' }],
      }),
      'unsupported-option',
    );
    expect(error.option).toBe('images');
    expect(h.acquire).not.toHaveBeenCalled();
  });

  it('re-attaches to the process the pool opened after closing the cached one (S-1, M-4)', async () => {
    const h = setup();
    const { id, live: first } = await startCompleted(h);
    // The pool closed the process on its own (idle close, eviction, history
    // reopen); the adapter was not told.
    h.pool.delete(id);
    // A setting waits for the next acquire instead of reaching a dead process.
    await h.adapter.setSessionModel(id, 'gemini-flash');
    expect(first.setModel).not.toHaveBeenCalled();

    await h.adapter.sendMessageToSession(id, 'again');
    const second = h.lives[1];
    expect(second).toBeDefined();
    await promptedTurn(second);
    expect(first.prompt).toHaveBeenCalledTimes(1);
    expect(second.prompt).toHaveBeenCalledWith({ text: 'again' });
    expect(h.acquire.mock.calls.at(-1)?.[0].resume).toEqual({
      nativeSessionId: 'native-1',
      onFailure: 'error',
    });
    expect(h.ports.identity.save).toHaveBeenLastCalledWith(
      id,
      expect.objectContaining({
        thread: { nativeSessionId: 'native-1', processGeneration: 2 },
      }),
      undefined,
    );
    // An adopted (history-loaded) process gets the session's model.
    expect(second.setModel).toHaveBeenCalledWith('gemini-flash');
    expect(h.ports.release).not.toHaveBeenCalled();
    second.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
  });

  it('acquires through the pool before every turn so it counts as activity (S-2)', async () => {
    const h = setup();
    const { id, live } = await startCompleted(h);
    const before = h.acquire.mock.calls.length;
    await h.adapter.sendMessageToSession(id, 'again');
    await promptedTurn(live, 2);
    expect(h.acquire.mock.calls.length).toBe(before + 1);
    expect(h.lives).toHaveLength(1);
    // The same process is not attached again.
    expect(h.ports.identity.save).toHaveBeenCalledTimes(1);
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
  });

  it('withdraws an open approval card while the session is still owned (M-1)', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'edit',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    const ownedAtCancel: boolean[] = [];
    // register.ts routes the cancellation to the provider-session host by owns().
    h.cancelled.mockImplementation(() =>
      ownedAtCancel.push(h.adapter.owns(id)),
    );
    const decision = live.approvals.request(
      { requestId: 'req-9', title: 'Edit file' },
      new AbortController().signal,
    );
    h.adapter.endSession(id);
    await expect(decision).resolves.toBe('cancel');
    expect(h.cancelled).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-9', reason: 'disposed' }),
    );
    expect(ownedAtCancel[0]).toBe(true);
    expect(h.adapter.owns(id)).toBe(false);
    live.exit();
    await events;
  });

  it('keeps the session when a Stop races the end of the turn (M-3)', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'long',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    // The turn ended before the interrupt arrived: the provider answers false.
    live.interrupt.mockImplementationOnce(async (turnId: string) => {
      live.emit(
        { type: 'terminal', status: 'completed', disposition: 'reusable' },
        turnId,
      );
      return false;
    });
    await h.adapter.interruptSession(id, 'user-stop');
    await events;
    expect(h.ports.release).not.toHaveBeenCalled();
    expect(h.adapter.owns(id)).toBe(true);
  });

  it('fails a follow-up whose steer is refused after the session closed (M-5)', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'first',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await h.adapter.sendMessageToSession(id, 'next', {
      clientMessageId: 'c2',
      queueIntent: 'next-turn',
    });
    live.caps = { ...live.caps, steer: true };
    let refuse!: (error: Error) => void;
    live.steer = jest.fn(
      () => new Promise((_resolve, reject) => (refuse = reject)),
    );
    const steering = h.adapter.steerQueuedFollowUp(id, 'c2');
    await flush();
    h.adapter.endSession(id);
    refuse(new Error('turn gone'));
    await expect(steering).resolves.toEqual({
      ok: false,
      code: 'TURN_CHANGED',
    });
    expect(h.followUps.at(-1)).toEqual({
      sessionId: id,
      clientMessageId: 'c2',
      state: 'failed',
      reason: 'The session ended.',
    });
    live.exit();
    await events;
  });

  it('re-queues a refused steer into the live queue and delivers it when idle (M-5)', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'first',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await h.adapter.sendMessageToSession(id, 'next', {
      clientMessageId: 'c2',
      queueIntent: 'next-turn',
    });
    live.caps = { ...live.caps, steer: true };
    let refuse!: (error: Error) => void;
    live.steer = jest.fn(
      () => new Promise((_resolve, reject) => (refuse = reject)),
    );
    const steering = h.adapter.steerQueuedFollowUp(id, 'c2');
    await flush();
    // The turn ends (and drains an empty queue) while the steer is in flight.
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    await events;
    refuse(new Error('turn gone'));
    await expect(steering).resolves.toEqual({
      ok: false,
      code: 'TURN_CHANGED',
    });
    await promptedTurn(live, 2);
    expect(live.prompt).toHaveBeenLastCalledWith({ text: 'next' });
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
  });

  it('releases the session on endSession with reason tab-closed', async () => {
    const h = setup();
    const { id } = await startCompleted(h);
    h.adapter.endSession(id);
    await flush();
    expect(h.ports.release).toHaveBeenCalledWith(id, 'tab-closed');
    expect(h.adapter.owns(id)).toBe(false);
    await expectCode(h.adapter.sendMessageToSession(id, 'late'), 'unavailable');
  });

  it('gives a history-only process back when its tab closes (no adapter record)', async () => {
    const h = setup();
    const id = SessionId.create();
    h.adapter.endSession(id);
    await flush();
    expect(h.ports.release).toHaveBeenCalledWith(id, 'tab-closed');

    const other = SessionId.create();
    await h.adapter.interruptSession(other, 'user-stop');
    expect(h.ports.release).not.toHaveBeenCalledWith(other, expect.anything());
    await h.adapter.interruptSession(other, 'tab-close');
    expect(h.ports.release).toHaveBeenCalledWith(other, 'tab-closed');
  });

  it('fails queued follow-ups when the session closes', async () => {
    const h = setup();
    const stream = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'first',
    });
    const events = collect(stream);
    const live = h.lives[0];
    await promptedTurn(live);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await h.adapter.sendMessageToSession(id, 'second', {
      clientMessageId: 'client-2',
      queueIntent: 'next-turn',
    });
    await h.adapter.closeSession(id);
    expect(h.followUps.at(-1)).toMatchObject({ state: 'failed' });
    live.exit();
    await events;
    expect(live.prompt).toHaveBeenCalledTimes(1);
  });

  it('releases every session on dispose', async () => {
    const h = setup();
    await startCompleted(h);
    h.adapter.dispose();
    await flush();
    expect(h.ports.releaseAll).toHaveBeenCalledTimes(1);
    expect(h.adapter.getHealth().status).toBe('disabled');
    await expectCode(
      h.adapter.startChatSession({ tabId: 'tab-2', prompt: 'hi' }),
      'unavailable',
    );
  });

  it('cancels an open abandoned by endSession before it publishes', async () => {
    const h = setup();
    let finish!: () => void;
    h.acquire.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          finish = () => {
            const live = new FakeProviderSession(
              'native-1',
              1,
              request.approvals,
            );
            h.lives.push(live);
            resolve(live);
          };
        }),
    );
    const tabId = SessionId.create();
    const opening = h.adapter.startChatSession({ tabId, prompt: 'hi' });
    await flush();
    expect(h.adapter.owns(tabId)).toBe(true);
    h.adapter.endSession(tabId);
    finish();
    await expectCode(opening, 'cancelled');
    expect(h.ports.release).toHaveBeenCalledWith(
      expect.any(String),
      'tab-closed',
    );
    expect(h.ports.identity.save).not.toHaveBeenCalled();
  });

  describe('turn attachments (N-1, N-2) and open options', () => {
    const outside = resolve(seed.workspacePath, '..', 'secret.txt');

    it.each([
      ['an absolute path outside the workspace', outside],
      ['a relative path that leaves it', '../secret.txt'],
      ['a NUL byte', 'src/a\0.ts'],
    ])(
      'refuses a file reference with %s before the prompt',
      async (_label, file) => {
        const h = setup();
        const { id, live } = await startCompleted(h);
        const error = await expectCode(
          h.adapter.sendMessageToSession(id, 'read', { files: [file] }),
          'unsupported-option',
        );
        expect(error.option).toBe('files');
        expect(live.prompt).toHaveBeenCalledTimes(1);
      },
    );

    it('refuses a missing file and a link that leaves the workspace', async () => {
      const h = setup();
      const { id, live } = await startCompleted(h);
      const gone = resolve(seed.workspacePath, 'gone.ts');
      h.missing.add(gone);
      await expectCode(
        h.adapter.sendMessageToSession(id, 'read', { files: ['gone.ts'] }),
        'unsupported-option',
      );
      const link = resolve(seed.workspacePath, 'link.ts');
      h.links.set(link, outside);
      await expectCode(
        h.adapter.sendMessageToSession(id, 'read', { files: ['link.ts'] }),
        'unsupported-option',
      );
      expect(live.prompt).toHaveBeenCalledTimes(1);
      // A reference inside the workspace still goes out as a resource link;
      // a link inside it goes out as its checked target, so the agent never
      // re-resolves a link swapped after the check.
      const inner = resolve(seed.workspacePath, 'docs/link.md');
      h.links.set(inner, resolve(seed.workspacePath, 'docs/real.md'));
      await h.adapter.sendMessageToSession(id, 'read', {
        files: ['src/a.ts', 'docs/link.md'],
      });
      await promptedTurn(live, 2);
      expect(live.prompt).toHaveBeenLastCalledWith({
        text: 'read',
        files: [
          { path: resolve(seed.workspacePath, 'src/a.ts'), name: 'a.ts' },
          {
            path: resolve(seed.workspacePath, 'docs/real.md'),
            name: 'link.md',
          },
        ],
      });
      live.emit({
        type: 'terminal',
        status: 'completed',
        disposition: 'reusable',
      });
    });

    it('confines a peer session message the same way', async () => {
      const h = setup();
      const { id, live } = await startCompleted(h);
      await expectCode(
        h.adapter.sendMessageToSession(id, 'read this', {
          files: [outside],
          origin: { kind: 'peer', from: 'other-session', name: 'Peer' },
        }),
        'unsupported-option',
      );
      expect(live.prompt).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['not base64', [{ data: 'not base64!', mediaType: 'image/png' }]],
      ['not whole base64 quads', [{ data: 'AAA', mediaType: 'image/png' }]],
      [
        'larger than the attachment cap',
        [
          {
            data: 'A'.repeat(((5 * 1024 * 1024) / 3) * 4 + 4),
            mediaType: 'image/png',
          },
        ],
      ],
      [
        'more than ten images',
        Array.from({ length: 11 }, () => ({
          data: 'AAAA',
          mediaType: 'image/png',
        })),
      ],
    ])(
      'refuses images that are %s before anything spawns',
      async (_label, images) => {
        const h = setup();
        const error = await expectCode(
          h.adapter.startChatSession({ tabId: 'tab', prompt: 'look', images }),
          'unsupported-option',
        );
        expect(error.option).toBe('images');
        expect(h.acquire).not.toHaveBeenCalled();
      },
    );

    it('carries the prepared open options to every acquire', async () => {
      const h = setup();
      const open = { ptahMcp: true, userMcp: [], instructions: 'Be Ptah.' };
      (h.ports.prepare as jest.Mock).mockResolvedValueOnce({ seed, open });
      const { id } = await startCompleted(h);
      await h.adapter.sendMessageToSession(id, 'again');
      const opens = h.acquire.mock.calls.map(([request]) => request.open);
      expect(opens.length).toBeGreaterThan(1);
      for (const carried of opens) expect(carried).toBe(open);
    });

    it('releases for good a session closed while its new process attaches (N-4)', async () => {
      const h = setup();
      const { id } = await startCompleted(h);
      h.pool.delete(id);
      let saved!: () => void;
      (h.ports.identity.save as jest.Mock).mockImplementationOnce(
        () => new Promise<void>((done) => (saved = done)),
      );
      const sending = h.adapter.sendMessageToSession(id, 'again').then(
        () => undefined,
        (reason: unknown) => reason,
      );
      for (let i = 0; i < 50 && !saved; i++) await flush();
      const closing = h.adapter.closeSession(id);
      saved();
      await expect(sending).resolves.toBeInstanceOf(
        ProviderSessionChatAdapterError,
      );
      await closing;
      const reasons = (h.ports.release as jest.Mock).mock.calls.map(
        ([, reason]) => reason,
      );
      expect(reasons).not.toContain('broken');
      expect(reasons).toContain('tab-closed');
    });
  });
});

describe('ProviderSessionChatAdapter durable usage', () => {
  afterEach(() => resetPricingMapForTesting());

  const turnUsage = {
    model: 'gemini-pro',
    inputTokens: 120,
    outputTokens: 30,
    cacheReadTokens: 10,
  };

  type Read = NonNullable<SessionUsageSink['readSessionUsage']>;
  type Record_ = SessionUsageSink['recordUsage'];
  function fakeSink(impl: { record?: Record_; read?: Read } = {}) {
    return {
      recordUsage: jest.fn<ReturnType<Record_>, Parameters<Record_>>(
        impl.record ?? (async () => undefined),
      ),
      resumeSession: jest.fn(async () => undefined),
      readSessionUsage: jest.fn<ReturnType<Read>, Parameters<Read>>(
        impl.read ?? (async () => null),
      ),
    };
  }

  /** Run one turn of an open session to its terminal with usage. */
  async function usageTurn(
    stream: AsyncIterable<FlatStreamEventUnion>,
    live: FakeProviderSession,
    turns: number,
  ) {
    const events = collect(stream);
    await promptedTurn(live, turns);
    live.emit({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
      usage: turnUsage,
    });
    return events;
  }

  it('persists one provider-session contribution per completed turn', async () => {
    const sink = fakeSink();
    const h = setup({ usageSink: sink });
    const first = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'hi',
    });
    await usageTurn(first, h.lives[0], 1);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await usageTurn(
      await h.adapter.resumeSession(id, { prompt: 'again' }),
      h.lives[0],
      2,
    );

    expect(sink.recordUsage).toHaveBeenCalledTimes(2);
    const [one, two] = sink.recordUsage.mock.calls.map(([c]) => c);
    expect(one).toMatchObject({
      sessionId: id,
      producer: 'provider-session',
      executorType: 'session',
      providerId: 'antigravity-cli',
      eventKey: `${one.runId}#1`,
      workspaceKey: 'C:\\Repo',
      source: 'live',
      models: [
        {
          modelId: 'gemini-pro',
          inputTokens: 120,
          outputTokens: 30,
          cacheReadTokens: 10,
          cacheCreationTokens: 0,
          knownCostMicroUsd: null,
          costAuthority: 'unpriced',
        },
      ],
      totalCostMicroUsd: null,
      totalCostAuthority: 'unpriced',
      pricingVersion: null,
    });
    expect(one.turnId).toEqual(expect.any(String));
    expect(one.coverageEndMs).toBeGreaterThanOrEqual(one.coverageStartMs ?? 0);
    expect(two).toMatchObject({ runId: one.runId, eventKey: `${one.runId}#2` });
    expect(two.revision).toBeGreaterThan(one.revision);
  });

  it('persists a priced turn in micro-USD as model-priced', async () => {
    updatePricingMap({
      'gemini-pro': {
        inputCostPerToken: 1e-6,
        outputCostPerToken: 2e-6,
        cacheReadCostPerToken: 1e-7,
      },
    });
    const sink = fakeSink();
    const h = setup({ usageSink: sink });
    await usageTurn(
      await h.adapter.startChatSession({ tabId: 'tab', prompt: 'hi' }),
      h.lives[0],
      1,
    );
    const [contribution] = sink.recordUsage.mock.calls[0];
    const micro = Math.round((120 * 1e-6 + 30 * 2e-6 + 10 * 1e-7) * 1e6);
    expect(contribution.models[0]).toMatchObject({
      knownCostMicroUsd: micro,
      costAuthority: 'model-priced',
    });
    expect(contribution).toMatchObject({
      totalCostMicroUsd: micro,
      totalCostAuthority: 'model-priced',
    });
  });

  it('keeps the turn when the sink rejects or throws', async () => {
    const rejecting = fakeSink({
      record: async () => {
        throw new Error('disk full');
      },
    });
    const h = setup({ usageSink: rejecting });
    const events = await usageTurn(
      await h.adapter.startChatSession({ tabId: 'tab', prompt: 'hi' }),
      h.lives[0],
      1,
    );
    await flush();
    expect(h.stats).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.eventType === 'turn_state')).toBe(true);
    expect(h.logger.error).toHaveBeenCalledWith(
      '[ProviderSessionChatAdapter] Usage capture failed',
      expect.any(Error),
    );

    const throwing = fakeSink({
      record: () => {
        throw new Error('closed');
      },
    });
    const t = setup({ usageSink: throwing });
    await usageTurn(
      await t.adapter.startChatSession({ tabId: 'tab', prompt: 'hi' }),
      t.lives[0],
      1,
    );
    expect(t.stats).toHaveBeenCalledTimes(1);
    expect(
      t.adapter.canSendFollowUp(t.resolved.mock.calls[0][1] as SessionId),
    ).toBe(true);
  });

  it('seeds a resumed session with its persisted totals, as partial coverage', async () => {
    const sink = fakeSink({
      read: async () => ({
        events: 2,
        maxRevision: 2,
        durationMs: 500,
        models: [
          {
            modelId: 'gemini-pro',
            inputTokens: 1000,
            outputTokens: 200,
            cacheReadTokens: 50,
            cacheCreationTokens: 0,
            knownCostMicroUsd: null,
            events: 2,
            unpricedEvents: 2,
            costAuthorities: ['unpriced' as const],
          },
        ],
      }),
    });
    const h = setup({ usageSink: sink });
    const id = SessionId.create();
    const stream = await h.adapter.resumeSession(id, {
      tabId: 'tab-r',
      prompt: 'hi',
    });
    await usageTurn(stream, h.lives[0], 1);

    expect(sink.readSessionUsage).toHaveBeenCalledWith(id, 'provider-session');
    expect(sink.resumeSession).toHaveBeenCalledWith(id);
    const stats = h.stats.mock.calls[0][0].sessionStats;
    // A contiguous seed cannot prove no trailing turn was lost: never complete.
    expect(stats).toMatchObject({
      tokens: { input: 1120, output: 230, cacheRead: 60, cacheCreation: 0 },
      messageCount: 3,
      coverage: 'partial',
      totalCost: null,
      costUnavailableReason: 'rate-missing',
    });
    expect(stats?.turnCount).toBeUndefined();
    expect(sink.recordUsage.mock.calls[0][0].revision).toBeGreaterThan(2);
  });

  it('resumes without a seed when the persisted read fails', async () => {
    const sink = fakeSink({
      read: async () => {
        throw new Error('locked');
      },
    });
    const h = setup({ usageSink: sink });
    const id = SessionId.create();
    await usageTurn(
      await h.adapter.resumeSession(id, { tabId: 'tab-r', prompt: 'hi' }),
      h.lives[0],
      1,
    );
    expect(h.stats.mock.calls[0][0].sessionStats).toMatchObject({
      coverage: 'partial',
      tokens: { input: 120 },
    });
  });

  it('keeps the catalog wait out of the turn duration and coverage window', async () => {
    let hydrate!: (value: boolean) => void;
    const ensureHydrated = jest.fn(
      () => new Promise<boolean>((resolve) => (hydrate = resolve)),
    );
    const sink = fakeSink();
    const h = setup({ usageSink: sink, pricing: { ensureHydrated } });
    // Started at construction, so the wait overlaps the first turn.
    expect(ensureHydrated).toHaveBeenCalledTimes(1);
    const events = usageTurn(
      await h.adapter.startChatSession({ tabId: 'tab', prompt: 'hi' }),
      h.lives[0],
      1,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const hydratedAt = Date.now();
    hydrate(true);
    await events;
    expect(h.stats.mock.calls[0][0].duration).toBeLessThan(150);
    expect(sink.recordUsage.mock.calls[0][0].coverageEndMs).toBeLessThan(
      hydratedAt,
    );
  });

  it('waits once for the price catalog before pricing the first turn', async () => {
    const ensureHydrated = jest.fn(async () => {
      updatePricingMap({
        'gemini-pro': {
          inputCostPerToken: 1e-6,
          outputCostPerToken: 2e-6,
          cacheReadCostPerToken: 1e-7,
        },
      });
      return true;
    });
    const h = setup({ pricing: { ensureHydrated } });
    const first = await h.adapter.startChatSession({
      tabId: 'tab',
      prompt: 'hi',
    });
    await usageTurn(first, h.lives[0], 1);
    const id = h.resolved.mock.calls[0][1] as SessionId;
    await usageTurn(
      await h.adapter.resumeSession(id, { prompt: 'again' }),
      h.lives[0],
      2,
    );
    expect(h.stats.mock.calls[0][0].turnCost).not.toBeNull();
    expect(ensureHydrated).toHaveBeenCalledTimes(1);
  });
});
