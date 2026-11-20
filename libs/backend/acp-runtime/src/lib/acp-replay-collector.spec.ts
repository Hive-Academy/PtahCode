import { createAcpReplayCollector } from './acp-replay-collector';

const ids = { contextId: 'ctx', processGeneration: 1, sessionId: 'old' };

describe('createAcpReplayCollector', () => {
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
    const collector = createAcpReplayCollector(ids, 3);
    collector.add(
      ['a', 'b', 'c', 'd', 'e'].map((delta) => ({
        type: 'textDelta' as const,
        itemId: 'm',
        delta,
      })),
    );
    const events = collector.events();
    expect(events[0]).toMatchObject({
      type: 'info',
      message: 'The replayed history was truncated: the oldest 2 events were dropped',
    });
    expect(
      events.slice(1).map((event) => (event.type === 'textDelta' ? event.delta : '')),
    ).toEqual(['c', 'd', 'e']);
  });
});
