/**
 * The pool's history read against a recorded ACP agent: the replay a Grok
 * `session/load` sent (`grok-p2-session-load-replay.ndjson`, owned by
 * acp-runtime). rpc-handlers does not depend on acp-runtime (the host injects
 * the runtime), so this spec reads the fixture file and replays its
 * `session/update` notifications from a hand-built fake session instead of
 * importing the fake ACP agent.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ProviderSession,
  ProviderSessionEvent,
  ProviderSessionOpenRequest,
} from '@ptah-extension/provider-session-contracts';
import { ProviderSessionPool, type ProviderSessionPoolRequest } from './provider-session-pool';

const FIXTURE = resolve(
  __dirname,
  '../../../../../acp-runtime/src/lib/__fixtures__/grok-p2-session-load-replay.ndjson',
);

interface Envelope {
  readonly dir: 'in' | 'out' | 'exit';
  readonly msg?: {
    readonly id?: number;
    readonly method?: string;
    readonly params?: {
      readonly sessionId?: string;
      readonly update?: {
        readonly sessionUpdate?: string;
        readonly content?: { readonly type?: string; readonly text?: string };
      };
    };
  };
}

/** The `session/update` notifications sent while `session/load` was pending. */
function loadReplay(): { nativeSessionId: string; events: ProviderSessionEvent[] } {
  const envelopes = readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Envelope);
  const loadIndex = envelopes.findIndex(
    (e) => e.dir === 'out' && e.msg?.method === 'session/load',
  );
  const loadId = envelopes[loadIndex].msg?.id;
  const replyIndex = envelopes.findIndex(
    (e, i) => i > loadIndex && e.dir === 'in' && e.msg?.id === loadId && !e.msg?.method,
  );
  const nativeSessionId = String(
    (envelopes[loadIndex].msg?.params as { sessionId: string }).sessionId,
  );
  const events: ProviderSessionEvent[] = [];
  let turn = 0;
  let sequence = 0;
  const identity = () => ({
    contextId: 'chat-1',
    processGeneration: 1,
    sessionId: nativeSessionId,
    turnId: `${nativeSessionId}:replay:${turn}`,
    sequence: ++sequence,
    replayed: true as const,
  });
  for (const envelope of envelopes.slice(loadIndex + 1, replyIndex)) {
    if (envelope.msg?.method !== 'session/update') continue;
    const update = envelope.msg.params?.update;
    const text = update?.content?.text ?? '';
    switch (update?.sessionUpdate) {
      case 'user_message_chunk':
        turn += 1;
        events.push({ ...identity(), type: 'userText', itemId: 'u', text });
        break;
      case 'agent_thought_chunk':
        events.push({ ...identity(), type: 'reasoning', itemId: 'r', text, phase: 'delta' });
        break;
      case 'agent_message_chunk':
        events.push({ ...identity(), type: 'textDelta', itemId: 'a', delta: text });
        break;
    }
  }
  return { nativeSessionId, events };
}

describe('ProviderSessionPool history (recorded grok-p2-session-load-replay)', () => {
  it('projects the loaded replay to history rows and adopts the session', async () => {
    const { nativeSessionId, events } = loadReplay();
    expect(events.length).toBeGreaterThan(0);
    const close = jest.fn(async () => undefined);
    const session = {
      nativeSessionId,
      processGeneration: 1,
      restoredContext: true,
      replay: events,
      isTurnRunning: () => false,
      getPid: () => 4242,
      close,
    } as unknown as ProviderSession;
    const open = jest.fn(async (_request: ProviderSessionOpenRequest) => session);
    const revokeSubject = jest.fn();
    const pool = new ProviderSessionPool({
      runtimeFor: () => ({ runtime: { open }, load: true }),
      credentials: { issue: () => 'token', revokeSubject },
      pidLedger: { record: jest.fn(), remove: jest.fn() },
      logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
    });
    const request: ProviderSessionPoolRequest = {
      profile: 'grok',
      workspaceRoot: 'D:/work',
      nativeSessionId,
      build: ({ attach }) => ({
        profile: 'grok',
        binaryPath: 'fake-grok',
        policy: { permission: 'ask', cwd: 'D:/work' },
        mcp: [],
        ...(attach ? { attach } : {}),
        approvals: { request: async () => 'decline' },
        baseEnv: {},
        consumer: 'chat',
        runId: 'chat-1',
      }),
    };

    const history = await pool.acquireForHistory('chat-1', request);

    expect(open.mock.calls[0][0].attach).toEqual({
      nativeSessionId,
      method: 'load',
      onFailure: 'error',
    });
    expect(history.events.every((event) => event.source === 'history')).toBe(true);
    const text = (role: 'user' | 'assistant') => {
      const ids = new Set(
        history.events
          .filter((e) => e.eventType === 'message_start' && e.role === role)
          .map((e) => e.messageId),
      );
      return history.events
        .filter((e) => e.eventType === 'text_delta' && ids.has(e.messageId))
        .map((e) => (e as { delta: string }).delta)
        .join('');
    };
    expect(text('user')).toBe('Remember the token ZEBRA-4471. Reply OK only.');
    expect(text('assistant')).toBe('OK');
    expect(history.events.some((e) => e.eventType === 'thinking_delta')).toBe(true);

    await expect(pool.acquire('chat-1', request)).resolves.toBe(session);
    expect(open).toHaveBeenCalledTimes(1);
    await pool.dispose();
    expect(close).toHaveBeenCalledTimes(1);
    expect(revokeSubject).toHaveBeenCalledWith(expect.stringMatching(/^chat-1#[0-9]+$/));
  });
});
