import { TestBed } from '@angular/core/testing';
import { AgentStatsService } from '@ptah-extension/chat-execution-tree';
import type { FlatStreamEventUnion } from '@ptah-extension/shared';
import { toTranscriptEvents } from '../services/transcript-events';
import {
  HISTORY_MESSAGE,
  LIVE_MESSAGE,
} from '../services/testing/machines-fixtures';
import { buildRemoteTranscript } from './remote-transcript';

const TOOL_TURN: readonly FlatStreamEventUnion[] = [
  {
    id: 'a-start',
    eventType: 'message_start',
    timestamp: 10,
    messageId: 'msg-2',
    role: 'assistant',
    source: 'stream',
  },
  {
    id: 'a-text',
    eventType: 'text_delta',
    timestamp: 11,
    messageId: 'msg-2',
    delta: 'Listing files.',
    blockIndex: 0,
    source: 'stream',
  },
  {
    id: 'a-tool',
    eventType: 'tool_start',
    timestamp: 12,
    messageId: 'msg-2',
    toolCallId: 'call-1',
    toolName: 'Bash',
    isTaskTool: false,
    source: 'stream',
  },
  {
    id: 'a-tool-input',
    eventType: 'tool_delta',
    timestamp: 13,
    messageId: 'msg-2',
    toolCallId: 'call-1',
    delta: '{"command":"ls"}',
    source: 'stream',
  },
  {
    id: 'a-tool-result',
    eventType: 'tool_result',
    timestamp: 14,
    messageId: 'msg-2',
    toolCallId: 'call-1',
    output: 'README.md',
    isError: false,
    source: 'stream',
  },
];

describe('buildRemoteTranscript (plan A7 fallback)', () => {
  let stats: AgentStatsService;
  beforeEach(() => {
    stats = TestBed.inject(AgentStatsService);
  });

  it('builds one message node per root message, in order', () => {
    const items = buildRemoteTranscript(
      toTranscriptEvents([...HISTORY_MESSAGE, ...TOOL_TURN]),
      stats,
    );
    expect(items.map((item) => [item.id, item.role])).toEqual([
      ['msg-1', 'assistant'],
      ['msg-2', 'assistant'],
    ]);
    expect(items[0].node.children.map((c) => [c.type, c.content])).toEqual([
      ['text', 'Hello world'],
    ]);
  });

  it('a tool call carries its parsed input and its result', () => {
    const [item] = buildRemoteTranscript(toTranscriptEvents(TOOL_TURN), stats);
    const tool = item.node.children.find((child) => child.type === 'tool');
    expect(tool).toMatchObject({
      toolName: 'Bash',
      toolCallId: 'call-1',
      toolInput: { command: 'ls' },
      toolOutput: 'README.md',
    });
  });

  it('A5: history plus the live copy of a message renders like one copy', () => {
    const once = buildRemoteTranscript(
      toTranscriptEvents(HISTORY_MESSAGE),
      stats,
    );
    const twice = buildRemoteTranscript(
      toTranscriptEvents([...HISTORY_MESSAGE, ...LIVE_MESSAGE]),
      stats,
    );
    const shape = (items: typeof once) =>
      items.map((i) => i.node.children.map((c) => c.content));
    expect(shape(twice)).toEqual(shape(once));
  });

  it('S6: text from the worker reaches the renderer with raw HTML made inert', () => {
    const [item] = buildRemoteTranscript(
      toTranscriptEvents(
        TOOL_TURN.map((event) =>
          event.id === 'a-text'
            ? { ...event, delta: 'see <img src=x> `<kept>`' }
            : event,
        ),
      ),
      stats,
    );
    expect(item.node.children[0].content).toBe('see &lt;img src=x> `<kept>`');
  });

  it('S6: a tool result for a markdown file is made inert; other output is kept', () => {
    const turn = (path: string) =>
      TOOL_TURN.map((event) => {
        if (event.id === 'a-tool-input')
          return { ...event, delta: JSON.stringify({ file_path: path }) };
        if (event.id === 'a-tool-result')
          return { ...event, output: '![p](https://evil.example/p.png) <b>' };
        return event;
      });
    const tool = (path: string) =>
      buildRemoteTranscript(
        toTranscriptEvents(turn(path)),
        stats,
      )[0].node.children.find((child) => child.type === 'tool');
    expect(tool('/r/NOTES.md')?.toolOutput).toBe(
      '!\\[p](https://evil.example/p.png) &lt;b>',
    );
    expect(tool('/r/page.html')?.toolOutput).toBe(
      '![p](https://evil.example/p.png) <b>',
    );
  });

  it('a tool whose result is an error (a denied Write) is not "complete"', () => {
    const denied = TOOL_TURN.map((event) => {
      if (event.id === 'a-tool') return { ...event, toolName: 'Write' };
      if (event.id === 'a-tool-input')
        return {
          ...event,
          delta: JSON.stringify({ file_path: '/tmp/x.txt', content: 'x' }),
        };
      if (event.id === 'a-tool-result')
        return {
          ...event,
          output: "The user doesn't want to proceed with this tool use.",
          isError: true,
        };
      return event;
    });
    const [item] = buildRemoteTranscript(toTranscriptEvents(denied), stats);
    const tool = item.node.children.find((child) => child.type === 'tool');
    expect(tool).toMatchObject({ status: 'error', isError: true });
  });

  it('a tool whose result succeeded stays "complete"', () => {
    const [item] = buildRemoteTranscript(toTranscriptEvents(TOOL_TURN), stats);
    const tool = item.node.children.find((child) => child.type === 'tool');
    expect(tool?.status).toBe('complete');
  });

  it('an empty list gives no items', () => {
    expect(buildRemoteTranscript([], stats)).toEqual([]);
  });
});
