/**
 * session-replay.service — unit specs.
 *
 * Covers `SessionReplayService.replayToStreamEvents`, which converts parsed
 * JSONL messages to the `FlatStreamEventUnion` array consumed by the frontend.
 *
 * Focused invariants (the full replay engine is large; we assert the
 * behaviours most likely to silently break):
 *
 *   - post-compaction slicing: pre-compact_boundary messages are skipped.
 *   - user messages emit message_start → text_delta → message_complete.
 *   - assistant messages with tool_use emit tool_start; if a matching
 *     tool_result exists upstream, a tool_result event follows.
 *   - isMeta user messages are suppressed (no events).
 *   - matched task-notification records settle background agents without a user bubble.
 *
 * Wires `HistoryEventFactory` and `AgentCorrelationService` as real
 * instances (they're dependency-free, pure services), and stubs the
 * `ModelResolver` via a shape that matches the `resolveForCost` contract
 * used by the replay path.
 */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SessionReplayService,
  type HistoryReplayCollector,
} from './session-replay.service';
import { HistoryEventFactory } from './history-event-factory';
import { AgentCorrelationService } from './agent-correlation.service';
import type { AgentSessionData, SessionHistoryMessage } from './history.types';
import type { FlatStreamEventUnion } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  createMockLogger,
  type MockLogger,
} from '@ptah-extension/shared/testing';

function asLogger(mock: MockLogger): Logger {
  return mock as unknown as Logger;
}

/**
 * Minimal `ModelResolver` shape consumed by the replay service.
 * The real class lives in `../../auth/model-resolver` and the replay only
 * calls `resolveForCost`, so we satisfy that surface directly rather than
 * instantiating the full DI graph.
 */
interface ModelResolverLike {
  resolveForCost(model: string): {
    modelId: string;
    pricing: null;
    subscriptionCovered: false;
  };
}

function stubModelResolver(): ModelResolverLike {
  return {
    resolveForCost: jest.fn((m: string) => ({
      modelId: m || 'unknown',
      pricing: null,
      subscriptionCovered: false,
    })),
  };
}

function u(content: SessionHistoryMessage['message']): SessionHistoryMessage {
  return {
    type: 'user',
    timestamp: '2026-01-01T00:00:00.000Z',
    uuid: 'u-' + Math.random().toString(36).slice(2, 8),
    message: content,
  } as SessionHistoryMessage;
}
function a(content: SessionHistoryMessage['message']): SessionHistoryMessage {
  return {
    type: 'assistant',
    timestamp: '2026-01-01T00:00:01.000Z',
    uuid: 'a-' + Math.random().toString(36).slice(2, 8),
    message: content,
  } as SessionHistoryMessage;
}

function jsonlFixture(...parts: string[]): SessionHistoryMessage[] {
  return readFileSync(join(__dirname, '__fixtures__', ...parts), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as SessionHistoryMessage);
}

describe('SessionReplayService', () => {
  let service: SessionReplayService;
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
    // HistoryEventFactory and AgentCorrelationService have no heavy deps,
    // so we instantiate them directly for higher-fidelity integration.
    const factory = new HistoryEventFactory();
    const correlation = new AgentCorrelationService(
      asLogger(createMockLogger()),
    );
    service = new SessionReplayService(
      asLogger(logger),
      correlation,
      factory,
      stubModelResolver() as unknown as ConstructorParameters<
        typeof SessionReplayService
      >[3],
    );
  });

  function eventTypes(events: FlatStreamEventUnion[]): string[] {
    return events.map((e) => e.eventType);
  }

  function collector(): HistoryReplayCollector {
    return { blockOwners: new Map(), syntheticToolResults: new Set() };
  }

  it('replays missing SDK ids and timestamps identically across reads', () => {
    const messages: SessionHistoryMessage[] = [
      {
        ...a({
          role: 'assistant',
          content: [
            { type: 'text', text: 'answer' },
            { type: 'tool_use', name: 'Read', input: {} },
          ],
        }),
        timestamp: 'not-a-timestamp',
        uuid: 'fixed-line',
      },
    ];
    const first = service.replayAgentToStreamEvents('s', 'task', messages);
    const second = service.replayAgentToStreamEvents('s', 'task', messages);
    expect(second).toEqual(first);
    expect(first[0].messageId).toBe('agent_msg_task_0_fixed-line');
  });

  it('keeps one message envelope across skipped lines with the same SDK id', () => {
    const messages: SessionHistoryMessage[] = [
      a({
        role: 'assistant',
        id: 'api-one',
        content: [{ type: 'text', text: 'first' }],
      }),
      u({ role: 'user', content: 'interleaved result' }),
      a({
        role: 'assistant',
        id: 'api-one',
        content: [{ type: 'text', text: 'second' }],
      }),
    ];
    const events = service.replayAgentToStreamEvents('s', 'task', messages);
    expect(eventTypes(events)).toEqual([
      'message_start',
      'text_delta',
      'text_delta',
      'message_complete',
    ]);
    expect(
      events
        .filter((event) => event.eventType === 'text_delta')
        .map((event) => event.blockIndex),
    ).toEqual([0, 1]);
  });

  it('records main blocks without changing the uncollected event output', () => {
    const message = {
      ...a({
        role: 'assistant',
        id: 'api-main',
        content: [
          { type: 'thinking', thinking: 't' },
          { type: 'text', text: 'a' },
          { type: 'tool_use', id: 'toolu_1', name: 'Read', input: {} },
        ],
      }),
      uuid: 'fixed-uuid',
    };
    const metadata = collector();
    const withCollector = service.replayToStreamEvents(
      's',
      [message],
      [],
      metadata,
    );
    expect(service.replayToStreamEvents('s', [message], [])).toEqual(
      withCollector,
    );
    expect([...metadata.blockOwners.values()]).toEqual([
      'api-main',
      'api-main',
      'api-main',
    ]);
    expect(metadata.syntheticToolResults.size).toBe(0);
  });

  it('records correlated subagent thinking and text and marks only synthetic results', () => {
    const task = a({
      role: 'assistant',
      id: 'api-main',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_task',
          name: 'Task',
          input: { subagent_type: 'general-purpose' },
        },
      ],
    });
    const agent = {
      agentId: 'agent-one',
      filePath: '/tmp/agent-one.jsonl',
      messages: [
        a({
          role: 'assistant',
          id: 'api-thinking',
          content: [{ type: 'thinking', thinking: 'hidden' }],
        }),
        a({
          role: 'assistant',
          id: 'api-agent',
          content: [{ type: 'text', text: 'agent output' }],
        }),
      ],
    };
    const metadata = collector();
    const events = service.replayToStreamEvents('s', [task], [agent], metadata);
    expect([...metadata.blockOwners.values()]).toEqual([
      'api-main',
      'api-thinking',
      'api-agent',
    ]);
    expect([...metadata.syntheticToolResults]).toEqual([
      events.find((event) => event.eventType === 'tool_result'),
    ]);

    const persisted = collector();
    service.replayToStreamEvents(
      's',
      [
        task,
        u({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_task',
              content: 'real',
            },
          ],
        }),
      ],
      [agent],
      persisted,
    );
    expect(persisted.syntheticToolResults.size).toBe(0);
  });

  it('replays agent JSONL lines with real message ids, running block indices and timestamps', () => {
    const timestamp = '2026-01-02T03:04:05.000Z';
    const messages: SessionHistoryMessage[] = [
      {
        type: 'assistant',
        timestamp,
        message: {
          role: 'assistant',
          id: 'msg-real',
          content: [
            { type: 'thinking', thinking: 'reason' },
            { type: 'text', text: 'answer' },
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'result' },
          ],
        },
      },
    ];
    const events = service.replayAgentToStreamEvents(
      'session',
      'task',
      messages,
    );
    expect(eventTypes(events)).toEqual([
      'message_start',
      'thinking_delta',
      'text_delta',
      'tool_start',
      'tool_result',
      'message_complete',
    ]);
    expect(events.every((event) => event.messageId === 'msg-real')).toBe(true);
    expect(events.map((event) => event.timestamp)).toEqual(
      Array(events.length).fill(Date.parse(timestamp)),
    );
    expect(
      events
        .filter(
          (event) =>
            event.eventType === 'thinking_delta' ||
            event.eventType === 'text_delta',
        )
        .map((event) => event.blockIndex),
    ).toEqual([0, 1]);
  });

  it('groups adjacent lines with one API message id and skips empty thinking', () => {
    const timestamp = '2026-01-02T03:04:05.000Z';
    const messages: SessionHistoryMessage[] = [
      {
        type: 'assistant',
        timestamp,
        message: {
          role: 'assistant',
          id: 'msg-one',
          content: [
            { type: 'thinking', thinking: '' },
            { type: 'text', text: 'first' },
          ],
        },
      },
      {
        type: 'assistant',
        timestamp,
        message: {
          role: 'assistant',
          id: 'msg-one',
          content: [{ type: 'thinking', thinking: 'second' }],
        },
      },
    ];
    const events = service.replayAgentToStreamEvents(
      'session',
      'task',
      messages,
    );
    expect(eventTypes(events)).toEqual([
      'message_start',
      'text_delta',
      'thinking_delta',
      'message_complete',
    ]);
    expect(
      events
        .filter(
          (event) =>
            event.eventType === 'text_delta' ||
            event.eventType === 'thinking_delta',
        )
        .map((event) => event.blockIndex),
    ).toEqual([0, 1]);
  });

  it('does not collect orphan agent records before a compact boundary', () => {
    const task = a({
      role: 'assistant',
      id: 'api-before',
      content: [{ type: 'tool_use', id: 'toolu_old', name: 'Task', input: {} }],
    });
    const agent = {
      agentId: 'agent-orphan',
      filePath: '/tmp/agent-orphan.jsonl',
      messages: [
        a({
          role: 'assistant',
          id: 'api-orphan',
          content: [{ type: 'text', text: 'old' }],
        }),
      ],
    };
    const metadata = collector();
    service.replayToStreamEvents(
      's',
      [
        task,
        { type: 'system', subtype: 'compact_boundary' },
        a({
          role: 'assistant',
          id: 'api-after',
          content: [{ type: 'text', text: 'new' }],
        }),
      ],
      [agent],
      metadata,
    );
    expect([...metadata.blockOwners.values()]).toEqual(['api-after']);
  });

  // -------------------------------------------------------------------------
  // Basic user/assistant round-trip
  // -------------------------------------------------------------------------

  it('emits message_start / text_delta / message_complete for a user message', () => {
    const out = service.replayToStreamEvents(
      'session-1',
      [u({ role: 'user', content: 'hello' })],
      [],
    );
    expect(eventTypes(out)).toEqual([
      'message_start',
      'text_delta',
      'message_complete',
    ]);
    // All events tagged as history-sourced for the frontend.
    for (const evt of out) {
      expect((evt as { source: string }).source).toBe('history');
    }
  });

  describe('local command stdout (TASK_2026_2336)', () => {
    const usage = readFileSync(
      join(
        __dirname,
        '../../../../../../shared/src/lib/local-command/__fixtures__/usage.txt',
      ),
      'utf8',
    );
    const contextStdout = readFileSync(
      join(
        __dirname,
        '../../../../../../shared/src/lib/local-command/__fixtures__/context.txt',
      ),
      'utf8',
    );

    it.each([
      ['/usage', '<synthetic>', usage, true],
      ['/context', '<synthetic>', contextStdout, true],
      ['ordinary synthetic text', '<synthetic>', 'Command completed.', false],
      ['regular model report', 'claude-haiku-4-5', usage, false],
    ] as const)('replays persisted assistant output for %s', (_name, model, text, card) => {
      const events = service.replayToStreamEvents(
        'sess-cmd',
        [
          {
            type: 'assistant',
            uuid: 'command-assistant-record',
            timestamp: '2026-01-01T00:00:01.000Z',
            message: {
              id: 'command-assistant',
              role: 'assistant',
              model,
              content: [{ type: 'text', text }],
            },
          },
        ],
        [],
      );

      expect(eventTypes(events)).toEqual([
        'message_start',
        'text_delta',
        'message_complete',
      ]);
      expect(events[0]).toMatchObject({ role: 'assistant' });
      expect(events[1]).toMatchObject({
        delta: card ? expect.stringMatching(/^```ptah-ui\n/) : text,
      });
    });

    const command = (name = 'usage', timestamp?: string) => ({
      ...u({ role: 'user', content: `<command-name>/${name}</command-name>` }),
      timestamp,
    });
    const output = (
      shape: 'user' | 'system',
      stdout = usage,
      uuid = 'cmd-record',
    ): SessionHistoryMessage => {
      const content = `<local-command-stdout>${stdout}</local-command-stdout>`;
      return shape === 'user'
        ? { type: 'user', message: { role: 'user', content }, uuid }
        : ({
            type: 'system',
            subtype: 'local_command',
            content,
            uuid,
          } as SessionHistoryMessage);
    };

    it('replays a /usage system/local_command record as an assistant ptah-ui card', () => {
      const events = service.replayToStreamEvents(
        'sess-cmd',
        [
          command(),
          {
            type: 'system',
            subtype: 'local_command',
            uuid: 'cmd-1',
            timestamp: '2026-01-01T00:00:00.000Z',
            content: `<local-command-stdout>${usage}</local-command-stdout>`,
          } as unknown as SessionHistoryMessage,
        ],
        [],
      );

      expect(eventTypes(events)).toEqual([
        'message_start',
        'text_delta',
        'message_complete',
      ]);
      expect(events[0]).toMatchObject({
        role: 'assistant',
        messageId: 'cmd_cmd-1',
      });
      expect(
        (events[1] as { delta: string }).delta.startsWith('```ptah-ui'),
      ).toBe(true);
    });

    it('replays context stdout paired with a system command echo', () => {
      const echo = {
        type: 'system',
        subtype: 'local_command',
        content: '<command-name>/context</command-name>',
      } as const;
      const context = '## Context Usage\n\n**Tokens:** 1k / 2k (50%)';
      const events = service.replayToStreamEvents(
        'sess-cmd',
        [echo, output('system', context)],
        [],
      );
      expect(eventTypes(events)).toEqual([
        'message_start',
        'text_delta',
        'message_complete',
      ]);
      expect(events[1]).toMatchObject({
        delta: expect.stringContaining('title Context usage'),
      });
    });

    describe.each(['user', 'system'] as const)('%s stdout records', (shape) => {
      it.each([
        ['meta', { isMeta: true }],
        ['synthetic', { isSynthetic: true }],
        ['tool-sourced', { sourceToolUseID: 'tool-1' }],
        ['tool provenance without an ID', { sourceToolUseID: '' }],
      ])(
        'keeps %s records hidden even with a matching command',
        (_name, flags) => {
          expect(
            service.replayToStreamEvents(
              'sess-cmd',
              [command(), { ...output(shape), ...flags }],
              [],
            ),
          ).toEqual([]);
        },
      );

      it.each([
        '<command-name>/usage</command-name>',
        '<command-message>usage</command-message>',
        '<skill-format>true</skill-format>',
      ])('keeps reports containing metadata hidden (%s)', (metadata) => {
        expect(
          service.replayToStreamEvents(
            'sess-cmd',
            [command(), output(shape, usage + '\n' + metadata)],
            [],
          ),
        ).toEqual([]);
      });

      it.each([
        ['no command echo', [], usage],
        ['an unrelated command', [command('status')], usage],
        ['a mismatched report', [command('context')], usage],
        [
          'an unrelated stdout signature',
          [command()],
          'Current capacity: 20% used',
        ],
        ['unrecognized stdout', [command()], 'Done.'],
      ] as const)('keeps stdout hidden with %s', (_name, preceding, stdout) => {
        expect(
          service.replayToStreamEvents(
            'sess-cmd',
            [...preceding, output(shape, stdout)],
            [],
          ),
        ).toEqual([]);
      });

      it('consumes the command echo after its stdout record', () => {
        const events = service.replayToStreamEvents(
          'sess-cmd',
          [command(), output(shape, 'Done.'), output(shape)],
          [],
        );
        expect(events).toEqual([]);
      });
    });

    it('uses the preceding timed record or the following timed record for the first untimed card', () => {
      const before = '2026-01-01T00:00:00.000Z';
      const after = '2026-01-02T00:00:00.000Z';
      const card = output('system');
      const following = { ...output('system', 'Done.'), timestamp: after };

      const preceded = service.replayToStreamEvents(
        'sess-cmd',
        [command('usage', before), card, following],
        [],
      );
      expect(preceded[0]).toMatchObject({ timestamp: Date.parse(before) });
      const followed = service.replayToStreamEvents(
        'sess-cmd',
        [command(), card, following],
        [],
      );
      expect(followed[0]).toMatchObject({ timestamp: Date.parse(after) });
    });

    it('sorts consecutive untimed cards after the preceding assistant completion', () => {
      const assistant = a({
        role: 'assistant',
        content: [{ type: 'text', text: 'Answer' }],
      });
      const events = service.replayToStreamEvents(
        'sess-cmd',
        [
          assistant,
          command(),
          output('system'),
          command(),
          output('user', usage, 'second'),
        ],
        [],
      );
      expect(eventTypes(events)).toEqual([
        'message_start',
        'text_delta',
        'message_complete',
        'message_start',
        'text_delta',
        'message_complete',
        'message_start',
        'text_delta',
        'message_complete',
      ]);
      expect(events[3].timestamp).toBeGreaterThan(events[2].timestamp);
      expect(events[6].timestamp).toBeGreaterThan(events[5].timestamp);
    });

    it('replays an all-untimed transcript with identical event timestamps', () => {
      const messages = [
        {
          ...a({
            role: 'assistant',
            content: [{ type: 'text', text: 'Answer' }],
          }),
          timestamp: undefined,
        },
        command(),
        output('system'),
        command(),
        output('user', usage, 'second'),
      ];
      const timestamps = () =>
        service
          .replayToStreamEvents('sess-cmd', messages, [])
          .map((event) => event.timestamp);
      const clock = jest.spyOn(Date, 'now');
      try {
        clock.mockReturnValue(1000);
        const first = timestamps();
        clock.mockReturnValue(2000);
        expect(first).toHaveLength(9);
        expect(first[0]).toBe(0);
        expect(timestamps()).toEqual(first);
      } finally {
        clock.mockRestore();
      }
    });
  });

  describe('peer turns recognised by their lane envelope', () => {
    function peerOf(events: FlatStreamEventUnion[]): unknown {
      const start = events.find((e) => e.eventType === 'message_start');
      return start && 'inboundPeer' in start ? start.inboundPeer : undefined;
    }

    it('labels an <agent-report> user record with its lane', () => {
      const text =
        '<agent-report agent-id="lane-1" agent="Glm" cli="ptah-cli">\nAll green.\n</agent-report>';
      const out = service.replayToStreamEvents(
        'session-1',
        [u({ role: 'user', content: text })],
        [],
      );
      expect(peerOf(out)).toEqual({ label: 'ptah-cli · Glm' });
      // The text stays the raw envelope; the webview renders the header.
      const delta = out.find((e) => e.eventType === 'text_delta');
      expect(delta && 'delta' in delta ? delta.delta : undefined).toBe(text);
    });

    it('labels an <agent-lane-completed> user record with its lane', () => {
      const out = service.replayToStreamEvents(
        'session-1',
        [
          u({
            role: 'user',
            content:
              '<agent-lane-completed agent-id="lane-2" agent="Glm" cli="ptah-cli" status="completed">\nDone.\n</agent-lane-completed>',
          }),
        ],
        [],
      );
      expect(peerOf(out)).toEqual({ label: 'ptah-cli · Glm' });
    });

    it('labels a child session envelope as session · <agent>', () => {
      const out = service.replayToStreamEvents(
        'session-1',
        [
          u({
            role: 'user',
            content:
              '<agent-report agent-id="sess-9" agent="Reviewer" cli="ptah-session">\nLooks fine.\n</agent-report>',
          }),
        ],
        [],
      );
      expect(peerOf(out)).toEqual({ label: 'session · Reviewer' });
    });

    it('labels an SDK subagent message with its short sender id', () => {
      const text = [
        'Another Claude session sent a message:',
        '<agent-message from="ad589f82c811f90e5">',
        'Source follow-up finding.',
        '</agent-message>',
        '',
        'That "other Claude session" is an agent working inside this same session.',
      ].join('\n');
      const out = service.replayToStreamEvents(
        'session-1',
        [u({ role: 'user', content: text })],
        [],
      );
      expect(peerOf(out)).toEqual({ label: 'ad589f82' });
    });

    it('does not label plain user text', () => {
      const out = service.replayToStreamEvents(
        'session-1',
        [u({ role: 'user', content: 'please run the tests' })],
        [],
      );
      expect(peerOf(out)).toBeUndefined();
    });

    it('does not label a sidechain user record carrying an envelope', () => {
      const record: SessionHistoryMessage = {
        ...u({
          role: 'user',
          content:
            '<agent-report agent-id="lane-1" agent="Glm" cli="ptah-cli">\nx\n</agent-report>',
        }),
        isSidechain: true,
      };
      const out = service.replayToStreamEvents('session-1', [record], []);
      expect(peerOf(out)).toBeUndefined();
    });

    it.each([
      ['origin', { origin: { kind: 'human' } }],
      ['turnOrigin', { turnOrigin: 'human' }],
    ])(
      'does not label an envelope the human typed (marked by %s)',
      (_marker, mark) => {
        const record: SessionHistoryMessage = {
          ...u({
            role: 'user',
            content:
              '<agent-report agent-id="lane-1" agent="Reviewer" cli="codex">\nPlease explain this example.\n</agent-report>',
          }),
          ...mark,
        };
        const out = service.replayToStreamEvents('session-1', [record], []);
        expect(peerOf(out)).toBeUndefined();
      },
    );

    it('labels an injected record the CLI marks as an sdk turn', () => {
      const record: SessionHistoryMessage = {
        ...u({
          role: 'user',
          content:
            '<agent-report agent-id="lane-1" agent="Glm" cli="ptah-cli">\nx\n</agent-report>',
        }),
        turnOrigin: 'sdk',
      };
      const out = service.replayToStreamEvents('session-1', [record], []);
      expect(peerOf(out)).toEqual({ label: 'ptah-cli · Glm' });
    });
  });

  it('emits tool_start and tool_result for assistant tool_use with matching result', () => {
    const messages: SessionHistoryMessage[] = [
      u({ role: 'user', content: 'do thing' }),
      a({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 't-1',
            name: 'Read',
            input: { path: '/tmp/x' },
          },
        ],
      }),
      u({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't-1',
            content: 'file body',
            is_error: false,
          },
        ],
      }),
    ];
    const out = service.replayToStreamEvents('s', messages, []);
    // Expect at least: user message triad, assistant message_start,
    // tool_start, tool_result, and a final message_complete.
    const types = eventTypes(out);
    expect(types).toContain('tool_start');
    expect(types).toContain('tool_result');
    const toolStart = out.find((e) => e.eventType === 'tool_start') as {
      toolName: string;
      toolCallId: string;
    };
    expect(toolStart.toolName).toBe('Read');
    expect(toolStart.toolCallId).toBe('t-1');
  });

  it('preserves an unknown model cost as null on replay', () => {
    const message = {
      type: 'assistant',
      timestamp: '2026-01-01T00:00:01.000Z',
      uuid: 'a-unpriced',
      message: {
        role: 'assistant',
        model: 'unpriced-model',
        content: [{ type: 'text', text: 'answer' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    } as SessionHistoryMessage;

    const complete = service
      .replayToStreamEvents('s', [message], [])
      .find((event) => event.eventType === 'message_complete');

    expect(complete).toEqual(
      expect.objectContaining({
        tokenUsage: { input: 10, output: 5 },
        cost: null,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // isMeta / task-notification suppression
  // -------------------------------------------------------------------------

  it('suppresses user messages flagged as isMeta', () => {
    const messages: SessionHistoryMessage[] = [
      {
        type: 'user',
        isMeta: true,
        timestamp: '2026-01-01T00:00:00.000Z',
        uuid: 'u-meta',
        message: { role: 'user', content: 'meta payload' },
      } as SessionHistoryMessage,
      u({ role: 'user', content: 'real user message' }),
    ];
    const out = service.replayToStreamEvents('s', messages, []);
    // Only the real message should produce a triad (3 events total).
    expect(eventTypes(out)).toEqual([
      'message_start',
      'text_delta',
      'message_complete',
    ]);
  });

  it('suppresses user messages flagged as isSynthetic', () => {
    // Regression (PR #493 review A): JsonlReaderService used to drop the
    // isSynthetic flag during conversion, so these records reached replay.
    const messages: SessionHistoryMessage[] = [
      {
        type: 'user',
        isSynthetic: true,
        timestamp: '2026-01-01T00:00:00.000Z',
        uuid: 'u-synthetic',
        message: { role: 'user', content: 'synthetic cue' },
      } as SessionHistoryMessage,
      u({ role: 'user', content: 'real user message' }),
    ];
    const out = service.replayToStreamEvents('s', messages, []);
    expect(eventTypes(out)).toEqual([
      'message_start',
      'text_delta',
      'message_complete',
    ]);
  });

  describe('SDK-written assistant entries (TASK_2026_2288_5a47)', () => {
    function syntheticPlaceholder(): SessionHistoryMessage {
      return a({
        role: 'assistant',
        model: '<synthetic>',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        content: [{ type: 'text', text: 'No response requested.' }],
      } as SessionHistoryMessage['message']);
    }

    function textDeltas(events: FlatStreamEventUnion[]): string[] {
      return events
        .filter((e) => e.eventType === 'text_delta')
        .map((e) => (e as { delta: string }).delta);
    }

    function startRoles(events: FlatStreamEventUnion[]): string[] {
      return events
        .filter((e) => e.eventType === 'message_start')
        .map((e) => (e as { role: string }).role);
    }

    it('drops the resume placeholder after a tool_result and still replays the next prompt', () => {
      const messages: SessionHistoryMessage[] = [
        u({ role: 'user', content: 'do thing' }),
        a({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 't-1',
              name: 'Read',
              input: { path: '/x' },
            },
          ],
        }),
        u({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't-1',
              content: 'file body',
              is_error: false,
            },
          ],
        }),
        syntheticPlaceholder(),
        u({ role: 'user', content: 'continue please' }),
      ];

      const out = service.replayToStreamEvents('s', messages, []);

      expect(textDeltas(out)).toEqual(['do thing', 'continue please']);
      expect(startRoles(out)).toEqual(['user', 'assistant', 'user']);
    });

    it('opens no assistant message for a placeholder right after a prompt', () => {
      const messages: SessionHistoryMessage[] = [
        u({ role: 'user', content: 'first' }),
        syntheticPlaceholder(),
        u({ role: 'user', content: 'second' }),
      ];

      const out = service.replayToStreamEvents('s', messages, []);

      expect(startRoles(out)).toEqual(['user', 'user']);
      expect(textDeltas(out)).toEqual(['first', 'second']);
    });

    it('keeps the same text from a real model', () => {
      const messages: SessionHistoryMessage[] = [
        u({ role: 'user', content: 'say it' }),
        a({
          role: 'assistant',
          model: 'claude-opus-4',
          content: [{ type: 'text', text: 'No response requested.' }],
        } as SessionHistoryMessage['message']),
      ];

      const out = service.replayToStreamEvents('s', messages, []);

      expect(startRoles(out)).toEqual(['user', 'assistant']);
      expect(textDeltas(out)).toEqual(['say it', 'No response requested.']);
    });

    it('opens no assistant message for an interrupt-sentinel-only entry', () => {
      const messages: SessionHistoryMessage[] = [
        u({ role: 'user', content: 'first' }),
        a({
          role: 'assistant',
          content: [{ type: 'text', text: '[Request interrupted by user]' }],
        }),
        u({ role: 'user', content: 'second' }),
      ];

      const out = service.replayToStreamEvents('s', messages, []);

      expect(startRoles(out)).toEqual(['user', 'user']);
      expect(textDeltas(out)).toEqual(['first', 'second']);
    });
  });

  it('suppresses user messages starting with <task-notification>', () => {
    const messages: SessionHistoryMessage[] = [
      u({
        role: 'user',
        content: '<task-notification>subagent done</task-notification>',
      }),
      u({ role: 'user', content: 'real message' }),
    ];
    const out = service.replayToStreamEvents('s', messages, []);
    // task-notification dropped; only 'real message' triad survives.
    expect(eventTypes(out)).toEqual([
      'message_start',
      'text_delta',
      'message_complete',
    ]);
  });

  describe('background task notifications from parent JSONL', () => {
    const fixtureDir = ['with-background-subagent'];

    function fixtureAgents(): AgentSessionData[] {
      return ['bgone', 'bgtwo'].map((id) => ({
        agentId: `agent-${id}`,
        filePath: `agent-${id}.jsonl`,
        messages: jsonlFixture(...fixtureDir, `agent-${id}.jsonl`),
      }));
    }

    function fixtureReplay(): FlatStreamEventUnion[] {
      return service.replayToStreamEvents(
        'history-bg',
        jsonlFixture(...fixtureDir, 'parent.jsonl'),
        fixtureAgents(),
      );
    }

    it('settles both background tasks after their agent events without rendering notifications as user messages', () => {
      const events = fixtureReplay();
      const completed = events.filter(
        (event) => event.eventType === 'agent_completed',
      );
      expect(completed).toEqual([
        expect.objectContaining({
          eventType: 'agent_completed',
          parentToolUseId: 'toolu_bg_1',
          taskId: 'bgone',
          status: 'completed',
          summary: 'Agent "First check" finished',
          source: 'history',
        }),
        expect.objectContaining({
          eventType: 'agent_completed',
          parentToolUseId: 'toolu_bg_2',
          taskId: 'bgtwo',
          status: 'completed',
          source: 'history',
        }),
      ]);
      for (const event of completed) {
        const startIndex = events.findIndex(
          (candidate) =>
            candidate.eventType === 'agent_start' &&
            candidate.parentToolUseId === event.parentToolUseId,
        );
        const childIndex = events.findIndex(
          (candidate) =>
            candidate.eventType === 'text_delta' &&
            candidate.parentToolUseId === event.parentToolUseId,
        );
        expect(startIndex).toBeGreaterThanOrEqual(0);
        expect(childIndex).toBeGreaterThan(startIndex);
        expect(events.indexOf(event)).toBeGreaterThan(childIndex);
      }
      expect(
        events.some(
          (event) =>
            event.eventType === 'agent_completed' &&
            event.parentToolUseId === 'toolu_fg_1',
        ),
      ).toBe(false);
      expect(
        events.filter(
          (event) =>
            event.eventType === 'message_start' && event.role === 'user',
        ),
      ).toHaveLength(1);
      expect(
        events.some(
          (event) =>
            event.eventType === 'text_delta' &&
            event.delta.includes('<task-notification>'),
        ),
      ).toBe(false);
    });

    it('parses a notification with a large summary from a bounded head', () => {
      const parent = jsonlFixture(...fixtureDir, 'parent.jsonl');
      const notification = parent[parent.length - 2];
      const content = notification.message?.content;
      if (typeof content !== 'string')
        throw new Error('Expected text notification fixture');
      const expanded = {
        ...notification,
        message: {
          role: 'user',
          content: content.replace(
            'Agent "First check" finished',
            'x'.repeat(40_000),
          ),
        },
      };
      const events = service.replayToStreamEvents(
        'history-bg',
        [...parent.slice(0, 3), expanded],
        [],
      );
      expect(
        events.find((event) => event.eventType === 'agent_completed'),
      ).toMatchObject({
        taskId: 'bgone',
        summary: 'x'.repeat(240),
      });
    });

    it('emits one completion for duplicate notifications of the same task', () => {
      const parent = jsonlFixture(...fixtureDir, 'parent.jsonl');
      const notification = parent[parent.length - 2];
      const events = service.replayToStreamEvents(
        'history-bg',
        [
          ...parent.slice(0, 3),
          notification,
          { ...notification, uuid: 'duplicate-task' },
        ],
        [],
      );
      expect(
        events.filter(
          (event) =>
            event.eventType === 'agent_completed' && event.taskId === 'bgone',
        ),
      ).toHaveLength(1);
    });

    it('drops unmatched and malformed notifications and ignores a human-typed example', () => {
      const parent = jsonlFixture(...fixtureDir, 'parent.jsonl');
      const notification = parent[parent.length - 2];
      const badRecords: SessionHistoryMessage[] = [
        {
          ...notification,
          uuid: 'unmatched',
          message: {
            role: 'user',
            content:
              '<task-notification><task-id>other</task-id><tool-use-id>toolu_missing</tool-use-id><status>completed</status></task-notification>',
          },
        },
        {
          ...notification,
          uuid: 'malformed',
          message: {
            role: 'user',
            content:
              '<task-notification><task-id>bgone</task-id><tool-use-id>toolu_bg_1</tool-use-id><status>running</status></task-notification>',
          },
        },
        {
          ...notification,
          uuid: 'typed',
          origin: { kind: 'human' },
          message: notification.message,
        },
      ];
      const taskOnly = parent.slice(0, 3);
      const events = service.replayToStreamEvents(
        'history-bg',
        [...taskOnly, ...badRecords],
        [],
      );
      expect(
        events.filter((event) => event.eventType === 'agent_completed'),
      ).toHaveLength(0);
      expect(
        events.some(
          (event) =>
            event.eventType === 'text_delta' &&
            event.delta.includes('<task-notification>'),
        ),
      ).toBe(false);
    });

    it.each([
      ['failed', 'failed'],
      ['error', 'failed'],
      ['killed', 'stopped'],
      ['stopped', 'stopped'],
    ] as const)('maps notification status %s to %s', (rawStatus, expected) => {
      const parent = jsonlFixture(...fixtureDir, 'parent.jsonl');
      const notification = parent[parent.length - 2];
      const content = notification.message?.content;
      if (typeof content !== 'string')
        throw new Error('Expected text notification fixture');
      const changed = {
        ...notification,
        message: {
          role: 'user',
          content: content
            .replace(
              '<status>completed</status>',
              `<status>${rawStatus}</status>`,
            )
            .replace('Agent "First check" finished', 'x'.repeat(300)),
        },
      };
      const events = service.replayToStreamEvents(
        'history-bg',
        [...parent.slice(0, 3), changed],
        [],
      );
      expect(
        events.find((event) => event.eventType === 'agent_completed'),
      ).toMatchObject({
        parentToolUseId: 'toolu_bg_1',
        status: expected,
        summary: 'x'.repeat(240),
      });
    });

    // -----------------------------------------------------------------------
    // TASK_2026_861 B2: reload rebuilds the background tray chips.
    // -----------------------------------------------------------------------

    describe('background tray events replayed from history', () => {
      const isBackgroundStarted = (
        event: FlatStreamEventUnion,
      ): event is Extract<
        FlatStreamEventUnion,
        { eventType: 'background_agent_started' }
      > => event.eventType === 'background_agent_started';

      const isBackgroundTerminal = (
        event: FlatStreamEventUnion,
      ): event is Extract<
        FlatStreamEventUnion,
        {
          eventType: 'background_agent_completed' | 'background_agent_stopped';
        }
      > =>
        event.eventType === 'background_agent_completed' ||
        event.eventType === 'background_agent_stopped';

      const isToolResultEvent = (
        event: FlatStreamEventUnion,
      ): event is Extract<FlatStreamEventUnion, { eventType: 'tool_result' }> =>
        event.eventType === 'tool_result';

      it('replays a background_agent_started for each background Task before its placeholder tool_result', () => {
        const events = fixtureReplay();
        const started = events.filter(isBackgroundStarted);
        expect(started.map((event) => event.toolCallId)).toEqual([
          'toolu_bg_1',
          'toolu_bg_2',
        ]);
        expect(started[0]).toMatchObject({
          eventType: 'background_agent_started',
          source: 'history',
          messageId: 'a-1',
          toolCallId: 'toolu_bg_1',
          agentType: 'general-purpose',
          agentDescription: 'First check',
          teammateName: 'background-checker',
          agentId: '4f8a2c91d3e6',
          outputFilePath: 'C:\\Temp\\tasks\\bgone.output',
        });
        expect(started[1]).toMatchObject({
          toolCallId: 'toolu_bg_2',
          agentDescription: 'Second check',
        });
        // The frontend accumulator checks the chip exists before the
        // placeholder tool_result arrives, so replay keeps that order.
        for (const spawn of started) {
          const startedAt = events.indexOf(spawn);
          const resultAt = events.findIndex(
            (event) =>
              isToolResultEvent(event) && event.toolCallId === spawn.toolCallId,
          );
          expect(resultAt).toBeGreaterThan(-1);
          expect(startedAt).toBeLessThan(resultAt);
        }
      });

      it('settles each background chip with a terminal when its correlated notification replays', () => {
        const events = fixtureReplay();
        const terminals = events.filter(isBackgroundTerminal);
        // bg_1's notification carries the tool-use id; bg_2's correlates
        // through the agent file map. Both settle the chip they announced.
        expect(terminals.map((event) => event.toolCallId)).toEqual([
          'toolu_bg_1',
          'toolu_bg_2',
        ]);
        expect(terminals[0]).toMatchObject({
          eventType: 'background_agent_completed',
          source: 'history',
          toolCallId: 'toolu_bg_1',
          agentId: '4f8a2c91d3e6',
          status: 'completed',
          result: 'Agent "First check" finished',
        });
        expect(terminals[1]).toMatchObject({
          eventType: 'background_agent_completed',
          toolCallId: 'toolu_bg_2',
          // The r-2 placeholder carries no agentId line, so the terminal
          // falls back to the toolCallId identity the store keys on.
          agentId: '',
        });
        for (const terminal of terminals) {
          const startedAt = events.findIndex(
            (event) =>
              isBackgroundStarted(event) &&
              event.toolCallId === terminal.toolCallId,
          );
          expect(startedAt).toBeGreaterThan(-1);
          expect(events.indexOf(terminal)).toBeGreaterThan(startedAt);
        }
      });

      it('replays a background_agent_stopped when the correlated notification says stopped', () => {
        const parent = jsonlFixture(...fixtureDir, 'parent.jsonl');
        const notification = parent[parent.length - 2];
        const content = notification.message?.content;
        if (typeof content !== 'string') {
          throw new Error('Expected text notification fixture');
        }
        const stopped = {
          ...notification,
          message: {
            role: 'user',
            content: content.replace(
              '<status>completed</status>',
              '<status>killed</status>',
            ),
          },
        };
        const events = service.replayToStreamEvents(
          'history-bg',
          [...parent.slice(0, 3), stopped],
          [],
        );
        const terminals = events.filter(isBackgroundTerminal);
        expect(terminals).toHaveLength(1);
        expect(terminals[0]).toMatchObject({
          eventType: 'background_agent_stopped',
          source: 'history',
          toolCallId: 'toolu_bg_1',
          agentId: '4f8a2c91d3e6',
        });
      });

      it('settles a background Task when its correlated tool result is final', () => {
        const parent = jsonlFixture(...fixtureDir, 'parent.jsonl');
        const finalResult = {
          ...parent[2],
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_bg_1',
                content: 'First check finished',
                is_error: false,
              },
            ],
          },
        } as SessionHistoryMessage;
        const events = service.replayToStreamEvents(
          'history-bg',
          [...parent.slice(0, 2), finalResult],
          [],
        );
        expect(events.filter(isBackgroundStarted)).toHaveLength(1);
        expect(events.filter(isBackgroundTerminal)).toEqual([
          expect.objectContaining({
            eventType: 'background_agent_completed',
            toolCallId: 'toolu_bg_1',
            status: 'completed',
            result: 'First check finished',
          }),
        ]);
      });

      it('emits no background tray events for the foreground Task', () => {
        const events = fixtureReplay();
        // Every background event in the replay belongs to one of the two
        // background tool ids; the foreground Task (toolu_fg_1) never
        // announces a chip.
        const chipEvents = [
          ...events.filter(isBackgroundStarted),
          ...events.filter(isBackgroundTerminal),
        ];
        expect(chipEvents.map((event) => event.toolCallId).sort()).toEqual([
          'toolu_bg_1',
          'toolu_bg_1',
          'toolu_bg_2',
          'toolu_bg_2',
        ]);
      });

      it('leaves both chips started when no notification replays', () => {
        const parent = jsonlFixture(...fixtureDir, 'parent.jsonl');
        // All parent records except the two trailing task notifications.
        const events = service.replayToStreamEvents(
          'history-bg',
          parent.slice(0, 7),
          fixtureAgents(),
        );
        expect(events.filter(isBackgroundStarted)).toHaveLength(2);
        // No correlated completion, no invented terminal — the live backend
        // snapshot decides whether each task still runs.
        expect(events.filter(isBackgroundTerminal)).toHaveLength(0);
      });

      it('keeps a real SDK launch placeholder running until its correlated notification', () => {
        const parent = jsonlFixture(...fixtureDir, 'parent.jsonl');
        const launch = {
          ...parent[2],
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_bg_1',
                content:
                  'Async agent launched successfully.\nagentId: 4f8a2c91d3e6\noutput_file: C:\\Temp\\tasks\\bgone.output\nThe agent is working in the background.',
                is_error: false,
              },
            ],
          },
        } as SessionHistoryMessage;
        const running = service.replayToStreamEvents(
          'history-bg',
          [...parent.slice(0, 2), launch],
          [],
        );
        expect(running.filter(isBackgroundStarted)).toHaveLength(1);
        expect(running.filter(isBackgroundTerminal)).toHaveLength(0);

        const settled = service.replayToStreamEvents(
          'history-bg',
          [...parent.slice(0, 2), launch, parent[7]],
          [],
        );
        expect(settled.filter(isBackgroundTerminal)).toEqual([
          expect.objectContaining({
            eventType: 'background_agent_completed',
            toolCallId: 'toolu_bg_1',
            status: 'completed',
          }),
        ]);
      });
    });
  });

  describe('M9 history parity with live lane user turns', () => {
    it('keeps report and completion before the held prompt with their peer ids', () => {
      const fixturePath = join(
        __dirname,
        '..',
        '..',
        '__fixtures__',
        'lane-order',
        'cli-transcript-user-lines.json',
      );
      const records = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<{
        type: string;
        uuid: string;
        timestamp: string;
        content: string;
        origin?: { kind?: string };
        turnOrigin?: string;
      }>;
      const messages: SessionHistoryMessage[] = records.map((record) => ({
        type: 'user',
        uuid: record.uuid,
        timestamp: record.timestamp,
        origin: record.origin,
        turnOrigin: record.turnOrigin,
        message: { role: 'user', content: record.content },
      }));
      const events = service.replayToStreamEvents('m9', messages, []);
      const starts = events.filter(
        (
          event,
        ): event is Extract<
          FlatStreamEventUnion,
          { eventType: 'message_start' }
        > => event.eventType === 'message_start' && event.role === 'user',
      );
      expect(starts.map((event) => event.messageId)).toEqual([
        '5f8c5e05-e601-450d-9d13-3fdfb4083465',
        '11d28bff-5729-459c-b8d2-d6f9b40ebeb8',
        '45f1f8cc-81ed-4446-a2d7-d308466e7738',
        'e40d14e1-6713-4ad3-a6f9-f717a808933f',
      ]);
      // The captured fixture abbreviates content, so identify peer turns by
      // their envelope prefix while preserving the CLI's original UUIDs.
      expect(
        events
          .filter(
            (event) =>
              event.eventType === 'text_delta' &&
              /^<agent-(report|lane-completed)\b/.test(event.delta),
          )
          .map((event) => event.messageId),
      ).toEqual([
        '11d28bff-5729-459c-b8d2-d6f9b40ebeb8',
        '45f1f8cc-81ed-4446-a2d7-d308466e7738',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // compact_boundary
  // -------------------------------------------------------------------------

  it('skips all messages before a compact_boundary', () => {
    const messages: SessionHistoryMessage[] = [
      u({ role: 'user', content: 'OLD — should not appear' }),
      a({
        role: 'assistant',
        content: [{ type: 'text', text: 'OLD REPLY — should not appear' }],
      }),
      {
        type: 'system',
        subtype: 'compact_boundary',
        timestamp: '2026-01-01T00:30:00.000Z',
        uuid: 'boundary',
      } as SessionHistoryMessage,
      u({ role: 'user', content: 'NEW — keep' }),
    ];
    const out = service.replayToStreamEvents('s', messages, []);
    const deltas = out.filter((e) => e.eventType === 'text_delta') as Array<{
      delta: string;
    }>;
    // Only the post-boundary user content shows up.
    expect(deltas.every((d) => !d.delta.includes('OLD'))).toBe(true);
    expect(deltas.some((d) => d.delta === 'NEW — keep')).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Found compact_boundary'),
    );
  });

  // -------------------------------------------------------------------------
  // Unknown message types (format drift)
  // -------------------------------------------------------------------------

  it('ignores messages whose type is neither user nor assistant', () => {
    const messages = [
      {
        type: 'future_event_from_the_gods',
        timestamp: '2026-01-01T00:00:00.000Z',
        uuid: 'future-1',
        message: { role: 'unknown' },
      },
      u({ role: 'user', content: 'real' }),
    ] as unknown as SessionHistoryMessage[];
    const out = service.replayToStreamEvents('s', messages, []);
    expect(eventTypes(out)).toEqual([
      'message_start',
      'text_delta',
      'message_complete',
    ]);
  });
});
