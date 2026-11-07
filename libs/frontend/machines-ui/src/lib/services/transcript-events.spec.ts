import type { FlatStreamEventUnion } from '@ptah-extension/shared';
import {
  appendTranscriptEvent,
  parseFlatStreamEvent,
  toTranscriptEvents,
} from './transcript-events';
import {
  HISTORY_MESSAGE,
  LIVE_MESSAGE,
  messageStart,
  textDelta,
} from './testing/machines-fixtures';

const applyAll = (
  start: readonly FlatStreamEventUnion[],
  more: readonly FlatStreamEventUnion[],
) => more.reduce(appendTranscriptEvent, toTranscriptEvents(start));

describe('transcript events', () => {
  it('A5: history then live copies of one message equal the history alone', () => {
    expect(applyAll(HISTORY_MESSAGE, LIVE_MESSAGE)).toEqual(
      toTranscriptEvents(HISTORY_MESSAGE),
    );
  });

  it('A5: applying the history or the live copy twice changes nothing', () => {
    const live = toTranscriptEvents(LIVE_MESSAGE);
    expect(applyAll(LIVE_MESSAGE, LIVE_MESSAGE.slice(3))).toEqual(live);
    const history = toTranscriptEvents(HISTORY_MESSAGE);
    expect(applyAll(HISTORY_MESSAGE, HISTORY_MESSAGE)).toEqual(history);
  });

  it('complete replaces the accumulated stream deltas of its block in place', () => {
    const live = toTranscriptEvents(LIVE_MESSAGE);
    expect(live.map((event) => [event.eventType, event.source])).toEqual([
      ['message_start', 'complete'],
      ['text_delta', 'complete'],
      ['message_complete', 'complete'],
    ]);
  });

  it('accumulates stream deltas per block', () => {
    const events = toTranscriptEvents([
      messageStart('s', 'm', 'stream'),
      textDelta('a', 'm', 'Hel', 'stream'),
      textDelta('b', 'm', 'lo', 'stream'),
      textDelta('c', 'm', 'next', 'stream', 1),
    ]);
    expect(events).toHaveLength(3);
    expect(events[1]).toMatchObject({ id: 'a', delta: 'Hello' });
    expect(events[2]).toMatchObject({ id: 'c', delta: 'next', blockIndex: 1 });
  });

  it('keeps events without a slot once per id', () => {
    const agent = {
      id: 'agent-1',
      eventType: 'agent_start',
      timestamp: 1,
      messageId: 'm',
      toolCallId: 'tc',
      agentType: 'Explore',
    } as unknown as FlatStreamEventUnion;
    expect(toTranscriptEvents([agent, agent])).toEqual([agent]);
  });

  it('rejects malformed flat events', () => {
    expect(parseFlatStreamEvent(null)).toBeNull();
    expect(
      parseFlatStreamEvent({ id: 'x', eventType: 'text_delta' }),
    ).toBeNull();
    expect(
      parseFlatStreamEvent({
        id: 'x',
        eventType: 'text_delta',
        messageId: 'm',
        timestamp: 1,
        delta: 'a',
      }),
    ).toBeNull();
    const ok = textDelta('x', 'm', 'a', 'stream');
    expect(parseFlatStreamEvent(ok)).toBe(ok);
  });
});
