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
    const collector = createAcpReplayCollector(ids, { maxEvents: 3 });
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
