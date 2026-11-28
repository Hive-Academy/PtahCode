import type { FlatStreamEventUnion } from '@ptah-extension/shared';
import { createFlatStreamProjector } from './flat-stream-projector';
import type {
  ProviderSessionEvent,
  ProviderSessionEventBody,
} from './provider-session-events';

let sequence = 0;
function event(
  body: ProviderSessionEventBody,
  identity: Partial<ProviderSessionEvent> = {},
): ProviderSessionEvent {
  return {
    contextId: 'agent-1',
    processGeneration: 1,
    sessionId: 'sess-1',
    turnId: 'sess-1:agent-1:1',
    sequence: ++sequence,
    ...identity,
    ...body,
  } as ProviderSessionEvent;
}

function shapes(rows: FlatStreamEventUnion[]): unknown[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== 'id' && key !== 'timestamp'),
    ),
  );
}

describe('createFlatStreamProjector', () => {
  beforeEach(() => {
    sequence = 0;
  });

  it('keeps the same tool start id and timestamp as late input arrives', () => {
    let timestamp = 1000;
    const projector = createFlatStreamProjector({ now: () => timestamp });
    const start = projector.project(event({
      type: 'toolStarted',
      toolId: 'shell',
      toolName: 'Execute',
      presentation: { toolName: 'Bash' },
    })).find((row) => row.eventType === 'tool_start');
    expect(start).toBeDefined();
    timestamp += 1000;

    const replacements = projector.project(event({
      type: 'toolUpdated',
      toolId: 'shell',
      presentation: { toolName: 'Bash', input: { command: 'exit 7' } },
    }));
    expect(replacements).toEqual([{ ...start, toolInput: { command: 'exit 7' } }]);
  });

  it.each([
    [7, true],
    [0, false],
    [undefined, false],
  ])('projects completed shell exit code %s with isError %s', (exitCode, isError) => {
    const projector = createFlatStreamProjector();
    const rows = projector.project(event({
      type: 'toolCompleted',
      toolId: 'shell',
      kind: 'execute',
      status: 'completed',
      exitCode,
      output: 'shell output',
    }));
    expect(rows).toContainEqual(expect.objectContaining({
      eventType: 'tool_result',
      toolCallId: 'shell',
      isError,
      output: 'shell output',
    }));
  });

  it('opens one assistant message per turn and streams text, thinking and tools into it', () => {
    const projector = createFlatStreamProjector({ now: () => 1000 });
    const rows = [
      event({ type: 'reasoning', itemId: 't1', text: 'Plan', phase: 'delta' }),
      event({ type: 'textDelta', itemId: 'm1', delta: 'Hel' }),
      event({ type: 'textDelta', itemId: 'm1', delta: 'lo' }),
      event({
        type: 'toolStarted',
        toolId: 'read-1',
        toolName: 'Read file',
        input: { path: 'a.ts' },
      }),
      event({
        type: 'toolCompleted',
        toolId: 'read-1',
        status: 'failed',
        output: 'denied',
      }),
      event({
        type: 'usage',
        provider: 'Grok',
        turnId: 'sess-1:agent-1:1',
        usage: { inputTokens: 5, outputTokens: 2, model: 'grok-4.7', costUsd: 0.01 },
      }),
      event({ type: 'terminal', status: 'completed', disposition: 'reusable' }),
    ].flatMap((item) => projector.project(item));

    const messageId = 'sess-1:agent-1:1:assistant';
    const common = { messageId, sessionId: 'sess-1', source: 'stream' };
    expect(shapes(rows)).toEqual([
      { ...common, eventType: 'message_start', role: 'assistant' },
      { ...common, eventType: 'thinking_start', blockIndex: 0 },
      { ...common, eventType: 'thinking_delta', delta: 'Plan', blockIndex: 0 },
      { ...common, eventType: 'text_delta', delta: 'Hel', blockIndex: 0 },
      { ...common, eventType: 'text_delta', delta: 'lo', blockIndex: 0 },
      {
        ...common,
        eventType: 'tool_start',
        toolCallId: 'read-1',
        toolName: 'Read file',
        toolInput: { path: 'a.ts' },
        isTaskTool: false,
      },
      {
        ...common,
        eventType: 'tool_result',
        toolCallId: 'read-1',
        output: 'denied',
        isError: true,
      },
      {
        ...common,
        eventType: 'message_complete',
        tokenUsage: { input: 5, output: 2 },
        model: 'grok-4.7',
        cost: 0.01,
      },
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows.every((row) => row.timestamp === 1000)).toBe(true);
  });

  // Bug 5 (live test 2026-11-21): after an app restart the history read's
  // `session/load` replay and the next live turn shared context, generation
  // and a restarted sequence, so the live chunks carried the replayed rows'
  // ids and the reply never rendered.
  it('never gives a live turn the ids of the replay it follows', () => {
    const replay = createFlatStreamProjector().project(
      event(
        { type: 'textDelta', itemId: 'm1', delta: 'old reply' },
        { turnId: 'sess-1:replay:1', sequence: 1, replayed: true },
      ),
    );
    const live = createFlatStreamProjector().project(
      event(
        { type: 'textDelta', itemId: 'm1', delta: 'new reply' },
        { turnId: 'sess-1:agent-1:a1b2c3d4:1', sequence: 1 },
      ),
    );
    const replayIds = new Set(replay.map((row) => row.id));
    expect(live.length).toBeGreaterThan(0);
    expect(live.some((row) => replayIds.has(row.id))).toBe(false);
    expect(new Set(live.map((row) => row.messageId))).not.toEqual(
      new Set(replay.map((row) => row.messageId)),
    );
  });

  it('keeps setup rows of a replay and of a live process apart', () => {
    const projector = createFlatStreamProjector();
    const [replayed] = projector.project(
      event(
        { type: 'error', error: { code: 'turn-failed', message: 'x' } },
        { turnId: undefined, sequence: 1, replayed: true },
      ),
    );
    const [live] = createFlatStreamProjector().project(
      event(
        { type: 'error', error: { code: 'turn-failed', message: 'x' } },
        { turnId: undefined, sequence: 1 },
      ),
    );
    expect(replayed?.id).toBeDefined();
    expect(live?.id).toBeDefined();
    expect(live?.id).not.toBe(replayed?.id);
  });

  it('starts a new text block when the message item changes', () => {
    const projector = createFlatStreamProjector();
    const rows = [
      event({ type: 'textDelta', itemId: 'm1', delta: 'a' }),
      event({ type: 'textDelta', itemId: 'm2', delta: 'b' }),
    ].flatMap((item) => projector.project(item));
    expect(
      rows
        .filter((row) => row.eventType === 'text_delta')
        .map((row) => row.blockIndex),
    ).toEqual([0, 1]);
  });

  it('completes a turn without usage on its terminal event, and a new turn reopens', () => {
    const projector = createFlatStreamProjector();
    const first = [
      event({ type: 'textDelta', itemId: 'm1', delta: 'a' }),
      event({ type: 'terminal', status: 'failed', disposition: 'broken' }),
    ].flatMap((item) => projector.project(item));
    expect(first.map((row) => row.eventType)).toEqual([
      'message_start',
      'text_delta',
      'message_complete',
    ]);
    expect(first[2]).toMatchObject({ stopReason: 'failed' });

    const second = projector.project(
      event(
        { type: 'textDelta', itemId: 'm1', delta: 'b' },
        { turnId: 'sess-1:agent-1:2' },
      ),
    );
    expect(second.map((row) => row.eventType)).toEqual([
      'message_start',
      'text_delta',
    ]);
    expect(second[0].messageId).toBe('sess-1:agent-1:2:assistant');
  });

  it('projects a replayed user turn to the history user message the renderer rebuilds', () => {
    const projector = createFlatStreamProjector();
    const rows = projector.project(
      event(
        {
          type: 'userText',
          itemId: 'u1',
          text: 'Remember ZEBRA',
          attachments: [{ kind: 'image' }, { kind: 'file' }],
        },
        { replayed: true, turnId: undefined },
      ),
    );
    const common = {
      messageId: 'agent-1:user:u1',
      sessionId: 'sess-1',
      source: 'history',
    };
    expect(shapes(rows)).toEqual([
      { ...common, eventType: 'message_start', role: 'user', imageCount: 1 },
      { ...common, eventType: 'text_delta', delta: 'Remember ZEBRA', blockIndex: 0 },
      { ...common, eventType: 'message_complete' },
    ]);
  });

  it('omits the session id when neither the event nor the projector knows it', () => {
    const projector = createFlatStreamProjector();
    const [row] = projector.project(
      event({ type: 'textDelta', itemId: 'm1', delta: 'a' }, { sessionId: undefined }),
    );
    expect(row).not.toHaveProperty('sessionId');
    const fallback = createFlatStreamProjector({ sessionId: 'known' });
    expect(
      fallback.project(
        event({ type: 'textDelta', itemId: 'm1', delta: 'a' }, { sessionId: undefined }),
      )[0].sessionId,
    ).toBe('known');
  });

  it('keeps two replayed user turns apart by their turn ids', () => {
    const projector = createFlatStreamProjector();
    const ids = [
      event(
        { type: 'userText', itemId: 'user-message-1', text: 'one' },
        { replayed: true, turnId: 'sess-1:replay:1' },
      ),
      event(
        { type: 'userText', itemId: 'user-message-2', text: 'two' },
        { replayed: true, turnId: 'sess-1:replay:2' },
      ),
    ].map((item) => projector.project(item)[0].messageId);
    expect(ids).toEqual([
      'sess-1:replay:1:user:user-message-1',
      'sess-1:replay:2:user:user-message-2',
    ]);
  });

  it('shows an error as a text block and completes a failed turn that had no output', () => {
    const projector = createFlatStreamProjector();
    const rows = [
      event({ type: 'error', error: { code: 'handshake-timeout', message: 'no reply' } }),
      event({ type: 'terminal', status: 'failed', disposition: 'broken' }),
    ].flatMap((item) => projector.project(item));
    expect(shapes(rows)).toEqual([
      expect.objectContaining({ eventType: 'message_start', role: 'assistant' }),
      expect.objectContaining({ eventType: 'text_delta', delta: 'Error: no reply', blockIndex: 0 }),
      expect.objectContaining({ eventType: 'message_complete', stopReason: 'failed' }),
    ]);

    const silent = createFlatStreamProjector().project(
      event({ type: 'terminal', status: 'failed', disposition: 'reusable' }, { turnId: 't-9' }),
    );
    expect(shapes(silent)).toEqual([
      expect.objectContaining({ eventType: 'message_start', role: 'assistant' }),
      expect.objectContaining({
        eventType: 'text_delta',
        delta: 'Error: the turn failed',
        blockIndex: 0,
      }),
      expect.objectContaining({ eventType: 'message_complete', stopReason: 'failed' }),
    ]);

    const rejected = createFlatStreamProjector().project(
      event(
        {
          type: 'terminal',
          status: 'failed',
          disposition: 'reusable',
          error: { code: 'request-failed', message: 'Prompt rejected' },
        },
        { turnId: 't-10' },
      ),
    );
    expect(shapes(rejected)).toEqual([
      expect.objectContaining({ eventType: 'message_start' }),
      expect.objectContaining({ eventType: 'text_delta', delta: 'Error: Prompt rejected' }),
      expect.objectContaining({ eventType: 'message_complete', stopReason: 'failed' }),
    ]);
    expect(
      createFlatStreamProjector().project(
        event({ type: 'terminal', status: 'interrupted', disposition: 'reusable' }),
      ),
    ).toEqual([]);
  });

  it('ignores mid-turn usage: the open message completes only on the turn usage', () => {
    const projector = createFlatStreamProjector();
    projector.project(event({ type: 'textDelta', itemId: 'm1', delta: 'Hi' }));
    expect(
      projector.project(
        event({
          type: 'usageProgress',
          provider: 'Grok',
          turnId: 'sess-1:agent-1:1',
          usage: { inputTokens: 5, outputTokens: 2 },
        }),
      ),
    ).toEqual([]);
    const completed = projector.project(
      event({
        type: 'usage',
        provider: 'Grok',
        turnId: 'sess-1:agent-1:1',
        usage: { inputTokens: 9, outputTokens: 4 },
      }),
    );
    expect(completed.map((row) => row.eventType)).toEqual(['message_complete']);
  });

  it('gives no stream row to infos, plans and stderr, and never throws', () => {
    const projector = createFlatStreamProjector();
    for (const body of [
      { type: 'info', message: 'n' },
      { type: 'plan', entries: [] },
      { type: 'diagnostic', stream: 'stderr', line: 'l' },
      { type: 'usage', provider: 'Grok', turnId: 'sess-1:agent-1:1' },
    ] as const) {
      expect(projector.project(event(body))).toEqual([]);
    }
    expect(
      projector.project(event({ type: 'unknown' } as unknown as ProviderSessionEventBody)),
    ).toEqual([]);
  });
});
