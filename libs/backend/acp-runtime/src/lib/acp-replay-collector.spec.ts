import { createFlatStreamProjector } from '@ptah-extension/provider-session-contracts';
import { createAcpReplayCollector } from './acp-replay-collector';

const ids = { contextId: 'ctx', processGeneration: 1, sessionId: 'old' };

describe('createAcpReplayCollector', () => {
  it.each([
    {
      toolName: 'FileChange',
      input: {
        changes: [
          { path: 'a.ts', kind: { type: 'update' }, diff: `+${'a'.repeat(5_000)}` },
          { path: 'b.ts', kind: { type: 'add' }, diff: '+second file' },
        ],
      },
    },
    {
      toolName: 'Edit',
      input: { file_path: 'a.ts', old_string: 'a'.repeat(3_000), new_string: 'b'.repeat(3_000) },
    },
  ])('replays the complete $toolName input above the generic compaction limit', (presentation) => {
    const collector = createAcpReplayCollector(ids);
    collector.add([
      { type: 'toolStarted', toolId: 't1', toolName: 'edit', presentation },
      { type: 'toolUpdated', toolId: 't1', presentation },
    ]);

    const projector = createFlatStreamProjector();
    const rows = collector.events().flatMap((event) => projector.project(event));
    const starts = rows.filter((row) => row.eventType === 'tool_start');
    expect(starts).toHaveLength(2);
    for (const start of starts) {
      expect(start).toMatchObject({
        toolName: presentation.toolName,
        toolInput: presentation.input,
      });
    }
    expect(collector.events().map((event) => event.type)).toEqual(['toolStarted', 'toolUpdated']);
  });

  it('keeps the last complete patch when an update exceeds the entire replay budget', () => {
    const collector = createAcpReplayCollector(ids, { maxTextChars: 150 });
    const input = { changes: [{ path: 'a.ts', kind: { type: 'update' }, diff: '+old' }] };
    collector.add([
      { type: 'toolStarted', toolId: 't1', toolName: 'edit', presentation: { toolName: 'FileChange', input } },
      {
        type: 'toolUpdated',
        toolId: 't1',
        presentation: {
          toolName: 'FileChange',
          input: { changes: [{ ...input.changes[0], diff: 'x'.repeat(200) }] },
        },
      },
    ]);

    const events = collector.events();
    expect(events.map((event) => event.type)).toEqual(['info', 'toolStarted', 'toolUpdated']);
    expect(events[2]).toMatchObject({ presentation: { toolName: 'FileChange' } });
    const projector = createFlatStreamProjector();
    const rows = events.flatMap((event) => projector.project(event));
    expect(rows.filter((row) => row.eventType === 'tool_start')).toEqual([
      expect.objectContaining({ toolInput: input }),
      expect.objectContaining({ toolInput: input }),
    ]);
  });

  it('opens a replay turn per user turn and merges the chunks of one turn', () => {
    const collector = createAcpReplayCollector(ids);
    collector.add([
      { type: 'userText', itemId: 'user-message-1', text: 'Hel' },
      { type: 'userText', itemId: 'user-message-1', text: 'lo' },
      { type: 'textDelta', itemId: 'agent-message', delta: 'Hi' },
      { type: 'userText', itemId: 'user-message-2', text: 'Again' },
    ]);
    expect(collector.events()).toEqual([
      expect.objectContaining({
        type: 'userText',
        text: 'Hello',
        turnId: 'old:replay:1',
        replayed: true,
      }),
      expect.objectContaining({ type: 'textDelta', turnId: 'old:replay:1', sessionId: 'old' }),
      expect.objectContaining({ type: 'userText', text: 'Again', turnId: 'old:replay:2' }),
    ]);
  });

  it('keeps the newest events and says the history was truncated', () => {
    const collector = createAcpReplayCollector(ids, { maxEvents: 3 });
    collector.add(
      ['a', 'b', 'c', 'd', 'e'].map((delta) => ({
        type: 'textDelta' as const,
        itemId: 'm',
        delta,
      })),
    );
    const events = collector.events();
    // 4651900732: the notice takes one of the three slots.
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: 'info',
      message: 'The replayed history was truncated: the oldest 3 events were dropped',
    });
    expect(
      events.slice(1).map((event) => (event.type === 'textDelta' ? event.delta : '')),
    ).toEqual(['d', 'e']);
  });

  it('4651900732: returns every event and no notice when nothing was truncated', () => {
    const collector = createAcpReplayCollector(ids, { maxEvents: 2 });
    collector.add(
      ['a', 'b'].map((delta) => ({ type: 'textDelta' as const, itemId: 'm', delta })),
    );
    expect(collector.events().map((event) => event.type)).toEqual([
      'textDelta',
      'textDelta',
    ]);
  });

  it('4651900728: counts tool input and plan entries against the payload budget', () => {
    const collector = createAcpReplayCollector(ids, { maxTextChars: 100 });
    const big = 'x'.repeat(60);
    collector.add([
      { type: 'toolStarted', toolId: 't1', toolName: 'Run', input: { command: big } },
      { type: 'plan', entries: [{ status: 'pending', content: big }] },
    ]);
    const events = collector.events();
    // Together the two payloads exceed the budget, so the older one is dropped.
    expect(events.map((event) => event.type)).toEqual(['info', 'plan']);
    expect(events[0]).toMatchObject({
      message: 'The replayed history was truncated: the oldest 1 events were dropped',
    });
  });

  it('4651900728: compacts an oversized tool input and keeps small inputs and plans intact', () => {
    const collector = createAcpReplayCollector(ids);
    const small = { command: 'ls -la', cwd: '/repo' };
    collector.add([
      { type: 'toolStarted', toolId: 't1', toolName: 'Run', input: small },
      { type: 'plan', entries: [{ status: 'pending', content: 'step one' }] },
      {
        type: 'toolStarted',
        toolId: 't2',
        toolName: 'Write',
        input: { path: 'a.ts', content: 'y'.repeat(100_000), nested: { deep: 1 }, count: 3 },
      },
    ]);
    const events = collector.events();
    expect(events[0]).toMatchObject({
      type: 'info',
      message: 'The replayed history was truncated: 1 tool inputs over 4096 characters were shortened',
    });
    expect(events[1]).toMatchObject({ type: 'toolStarted', input: small });
    expect(events[2]).toMatchObject({
      type: 'plan',
      entries: [{ status: 'pending', content: 'step one' }],
    });
    const compacted = events[3];
    expect(compacted.type === 'toolStarted' ? compacted.input : undefined).toEqual({
      path: 'a.ts',
      content: `${'y'.repeat(256)}…`,
      count: 3,
    });
  });

  it('4651900728: a history of large tool inputs retains a bounded payload', () => {
    const collector = createAcpReplayCollector(ids);
    collector.add(
      Array.from({ length: 4_000 }, (_, index) => ({
        type: 'toolStarted' as const,
        toolId: `t${index}`,
        toolName: 'Run',
        input: { command: 'z'.repeat(100_000) },
      })),
    );
    const retained = collector
      .events()
      .reduce(
        (sum, event) =>
          sum + (event.type === 'toolStarted' ? JSON.stringify(event.input ?? {}).length : 0),
        0,
      );
    expect(retained).toBeLessThan(2_000_000);
  });

  it('bounds merged user chunks by the text budget and says the text was cut', () => {
    const collector = createAcpReplayCollector(ids, { maxTextChars: 10 });
    collector.add(
      ['abcd', 'efgh', 'ijkl', 'mnop'].map((text) => ({
        type: 'userText' as const,
        itemId: 'user-message-1',
        text,
      })),
    );
    const events = collector.events();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'info',
      message:
        'The replayed history was truncated: 6 characters of text over the 10 character limit were cut',
    });
    expect(events[1]).toMatchObject({ type: 'userText', text: 'abcdefghij' });
  });

  it('drops older events to make room before cutting the newest text', () => {
    const collector = createAcpReplayCollector(ids, { maxTextChars: 6 });
    collector.add([
      { type: 'textDelta', itemId: 'm', delta: 'old' },
      { type: 'userText', itemId: 'user-message-2', text: 'new' },
      { type: 'userText', itemId: 'user-message-2', text: 'er!' },
    ]);
    const events = collector.events();
    expect(events.map((event) => event.type)).toEqual(['info', 'userText']);
    expect(events[0]).toMatchObject({
      message: 'The replayed history was truncated: the oldest 1 events were dropped',
    });
    expect(events[1]).toMatchObject({ text: 'newer!' });
  });
});
