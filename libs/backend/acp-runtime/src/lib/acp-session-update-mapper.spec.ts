import * as fs from 'fs';
import * as path from 'path';
import type {
  RequestPermissionRequest,
  SessionNotification,
  SessionUpdate,
} from '@agentclientprotocol/sdk';
import type { CliOutputSegment } from '@ptah-extension/shared';
import {
  createFlatStreamProjector,
  projectToCliSegments,
} from '@ptah-extension/provider-session-contracts';
import { connectAcp, type AcpClientHandlers } from './acp-sdk-loader';
import { createAcpReplayCollector } from './acp-replay-collector';
import {
  createAcpSessionUpdateMapper as createEventMapper,
  mapStopReason,
  type AcpSessionUpdateMapperOptions,
} from './acp-session-update-mapper';

/**
 * The lane view of the mapper: its events through `projectToCliSegments`,
 * plus the text deltas as the lane's output. These are the golden shapes
 * the ACP lane emitted before the runtime was extracted, so this spec pins
 * mapper and projector together.
 */
function createAcpSessionUpdateMapper(
  options?: AcpSessionUpdateMapperOptions,
): { map(update: SessionUpdate): { output: string; segments: CliOutputSegment[] } } {
  const mapper = createEventMapper(options);
  return {
    map(update) {
      const events = mapper.map(update);
      return {
        output: events
          .map((event) => (event.type === 'textDelta' ? event.delta : ''))
          .join(''),
        segments: events.flatMap(projectToCliSegments),
      };
    },
  };
}

const FIXTURE_DIRECTORY = path.join(__dirname, '__fixtures__');
const SDK_REPLAY_FIXTURES = [
  'grok-p2-permission-allow-once.ndjson',
  'grok-p2-permission-reject-once.ndjson',
  'grok-p2-cancel-mid-shell.ndjson',
  'grok-plain-turn.ndjson',
  'grok-p2-session-load-replay.ndjson',
  'grok-p1-ptah-mcp-search-use-tool.ndjson',
];

type ProbeEnvelope = {
  dir: 'in' | 'out' | 'stderr' | 'exit';
  msg?: unknown;
};

type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fixtureEnvelopes(filename: string): ProbeEnvelope[] {
  return fs
    .readFileSync(path.join(FIXTURE_DIRECTORY, filename), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ProbeEnvelope);
}

function sessionUpdates(filename: string): unknown[] {
  return fixtureEnvelopes(filename).flatMap((envelope) => {
    if (envelope.dir !== 'in' || !isRecord(envelope.msg)) return [];
    if (
      envelope.msg.method !== 'session/update' ||
      !isRecord(envelope.msg.params)
    ) {
      return [];
    }
    return envelope.msg.params.update === undefined
      ? []
      : [envelope.msg.params.update];
  });
}

function createRawPeer() {
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  const writer = agentToClient.writable.getWriter();
  const encoder = new TextEncoder();

  return {
    stream: {
      readable: agentToClient.readable,
      writable: clientToAgent.writable,
    },
    send: (message: JsonRpcNotification): Promise<void> =>
      writer.write(encoder.encode(`${JSON.stringify(message)}\n`)),
    close: (): Promise<void> => writer.close(),
  };
}

function createHandlers(): AcpClientHandlers {
  return {
    sessionUpdate: jest.fn(async (_params: SessionNotification) => undefined),
    requestPermission: jest.fn(async (_params: RequestPermissionRequest) => ({
      outcome: { outcome: 'selected' as const, optionId: 'allow-once' },
    })),
  };
}

function mapUnchecked(
  mapper: ReturnType<typeof createAcpSessionUpdateMapper>,
  update: unknown,
): ReturnType<ReturnType<typeof createAcpSessionUpdateMapper>['map']> {
  return Reflect.apply(mapper.map, mapper, [update]);
}

describe('createAcpSessionUpdateMapper', () => {
  it('maps message text as both an output delta and a text segment', () => {
    const mapper = createAcpSessionUpdateMapper();
    const update: SessionUpdate = {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Hello' },
    };

    expect(mapper.map(update)).toEqual({
      output: 'Hello',
      segments: [{ type: 'text', content: 'Hello' }],
    });
  });

  it('represents non-text message content without adding an output delta', () => {
    const mapper = createAcpSessionUpdateMapper();
    const update: SessionUpdate = {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
    };

    expect(mapper.map(update)).toEqual({
      output: '',
      segments: [{ type: 'info', content: '[image content]' }],
    });
  });

  it('maps agent thought chunks', () => {
    const mapper = createAcpSessionUpdateMapper();
    const update: SessionUpdate = {
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'Considering options' },
    };

    expect(mapper.map(update).segments).toEqual([
      { type: 'thinking', content: 'Considering options' },
    ]);
  });

  it('exposes edit and delete calls to the lane guard call count', () => {
    const mapper = createAcpSessionUpdateMapper();
    const edit: SessionUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'edit-1',
      title: 'Change a file',
      kind: 'edit',
      rawInput: { path: 'a.ts', replacement: 'new' },
    };
    const remove: SessionUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'delete-1',
      title: 'Remove a file',
      kind: 'delete',
      rawInput: { path: 'a.ts' },
    };

    expect(mapper.map(edit).segments[0]).toMatchObject({
      type: 'tool-call',
      toolName: 'edit',
      toolCallId: 'edit-1',
      toolInput: { path: 'a.ts', replacement: 'new' },
      toolArgs: '{"path":"a.ts","replacement":"new"}',
    });
    expect(mapper.map(remove).segments[0]).toMatchObject({
      type: 'tool-call',
      toolName: 'delete',
      toolCallId: 'delete-1',
    });
  });

  it('maps ordinary tool calls, plain inputs, and diff file changes', () => {
    const mapper = createAcpSessionUpdateMapper();
    const update: SessionUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'read-1',
      title: 'Read file',
      kind: 'read',
      rawInput: ['not', 'plain'],
      content: [
        {
          type: 'diff',
          path: 'new.ts',
          newText: 'new',
        },
        {
          type: 'diff',
          path: 'existing.ts',
          oldText: 'old',
          newText: 'new',
        },
      ],
    };

    expect(mapper.map(update).segments).toEqual([
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'read-1',
        toolName: 'Read file',
        toolArgs: undefined,
        toolInput: undefined,
      },
      { type: 'file-change', content: 'new.ts', changeKind: 'added' },
      { type: 'file-change', content: 'existing.ts', changeKind: 'modified' },
    ]);
  });

  it('maps completed execute calls to commands with the profile exit code', () => {
    const mapper = createAcpSessionUpdateMapper({
      extractExitCode: (raw) =>
        isRecord(raw) && raw.code === 7 ? 7 : undefined,
    });
    mapper.map({
      sessionUpdate: 'tool_call',
      toolCallId: 'run-1',
      title: 'Run tests',
      kind: 'execute',
    });

    const result = mapper.map({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'run-1',
      status: 'completed',
      content: [
        { type: 'content', content: { type: 'text', text: 'first ' } },
        { type: 'content', content: { type: 'text', text: 'second' } },
      ],
      rawOutput: { code: 7 },
    });

    expect(result.segments).toEqual([
      {
        type: 'command',
        content: 'first second',
        toolCallId: 'run-1',
        toolName: 'Run tests',
        exitCode: 7,
      },
    ]);
  });

  it('maps completed, failed, and diff-only tool updates', () => {
    const mapper = createAcpSessionUpdateMapper();
    mapper.map({
      sessionUpdate: 'tool_call',
      toolCallId: 'search-1',
      title: 'Search',
      kind: 'search',
    });

    expect(
      mapper.map({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'search-1',
        status: 'completed',
        rawOutput: { matches: 2 },
      }).segments,
    ).toEqual([
      {
        type: 'tool-result',
        content: '{"matches":2}',
        toolCallId: 'search-1',
        toolName: 'Search',
        exitCode: undefined,
      },
    ]);
    expect(
      mapper.map({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'search-1',
        status: 'failed',
        rawOutput: 'failed output',
      }).segments[0],
    ).toMatchObject({ type: 'tool-result-error', content: 'failed output' });
    expect(
      mapper.map({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'search-1',
        content: [
          { type: 'diff', path: 'change.ts', oldText: null, newText: 'text' },
        ],
      }).segments,
    ).toEqual([
      { type: 'file-change', content: 'change.ts', changeKind: 'added' },
    ]);
  });

  it('caps tool output at 64 KiB including a truncation marker', () => {
    const mapper = createAcpSessionUpdateMapper();
    const content = 'x'.repeat(70_000);
    const segment = mapper.map({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'large-1',
      status: 'completed',
      rawOutput: content,
    }).segments[0];

    expect(segment.content).toHaveLength(65_536);
    expect(segment.content).toContain('[output truncated]');
  });

  it('maps plans and ignores every non-output update kind', () => {
    const mapper = createAcpSessionUpdateMapper();
    expect(
      mapper.map({
        sessionUpdate: 'plan',
        entries: [
          { content: 'First task', priority: 'high', status: 'in_progress' },
          { content: 'Second task', priority: 'low', status: 'pending' },
        ],
      }).segments,
    ).toEqual([
      {
        type: 'info',
        content: '[in_progress] First task\n[pending] Second task',
      },
    ]);

    for (const sessionUpdate of [
      'user_message_chunk',
      'available_commands_update',
      'current_mode_update',
      'config_option_update',
      'session_info_update',
      'usage_update',
      'notice',
    ]) {
      expect(mapUnchecked(mapper, { sessionUpdate })).toEqual({
        output: '',
        segments: [],
      });
    }
  });

  it('never throws on malformed data and never returns an error segment', () => {
    const mapper = createAcpSessionUpdateMapper();
    const values: unknown[] = [
      undefined,
      null,
      'not an update',
      { sessionUpdate: 'tool_call', toolCallId: 4, title: {} },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'x',
        rawOutput: BigInt(1),
      },
    ];

    for (const value of values) {
      expect(() => mapUnchecked(mapper, value)).not.toThrow();
      expect(mapUnchecked(mapper, value).segments).not.toContainEqual(
        expect.objectContaining({ type: 'error' }),
      );
    }
  });

  it('maps all copied Grok session updates to sane non-error segments', () => {
    const files = fs
      .readdirSync(FIXTURE_DIRECTORY)
      .filter((file) => /^grok-.*\.ndjson$/.test(file));
    expect(files).toHaveLength(11);
    let mappedUpdateCount = 0;

    for (const file of files) {
      const mapper = createAcpSessionUpdateMapper();
      for (const update of sessionUpdates(file)) {
        const result = mapUnchecked(mapper, update);
        mappedUpdateCount += 1;
        for (const segment of result.segments) {
          expect(typeof segment.content).toBe('string');
          expect(segment.type).not.toBe('error');
        }
      }
    }

    expect(mappedUpdateCount).toBeGreaterThan(0);
  });
});

describe('mapStopReason', () => {
  const input = { aborted: false, displayName: 'Grok' };

  it.each([
    ['end_turn', { exitCode: 0 }],
    [
      'max_tokens',
      {
        exitCode: 0,
        segment: { type: 'info', content: 'Token limit reached.' },
      },
    ],
    [
      'max_turn_requests',
      {
        exitCode: 0,
        segment: { type: 'info', content: 'Turn request limit reached.' },
      },
    ],
  ])('maps %s as a successful terminal reason', (stopReason, expected) => {
    expect(mapStopReason({ ...input, stopReason })).toEqual(expected);
  });

  it('maps refusal, cancellation, and unknown reasons as errors', () => {
    expect(
      mapStopReason({ ...input, stopReason: 'refusal' }).segment,
    ).toMatchObject({ type: 'error' });
    expect(mapStopReason({ ...input, stopReason: 'cancelled' })).toEqual({
      exitCode: 1,
      segment: { type: 'error', content: 'turn cancelled by the agent' },
    });
    expect(mapStopReason({ ...input, stopReason: 'other' }).segment).toEqual({
      type: 'error',
      content: 'Grok stopped for unknown reason: other',
    });
  });

  it('keeps an aborted cancellation silent and reports policy permission refusal', () => {
    expect(
      mapStopReason({ ...input, stopReason: 'cancelled', aborted: true }),
    ).toEqual({ exitCode: 1 });
    expect(
      mapStopReason({
        ...input,
        stopReason: 'cancelled',
        refusedPermissionTitle: 'ptah__ptah_agent_report',
      }),
    ).toEqual({
      exitCode: 1,
      segment: {
        type: 'error',
        content:
          'Grok stopped the turn: permission refused for ptah__ptah_agent_report',
      },
    });
  });
});

describe('Grok inbound session/update SDK validation', () => {
  it('accepts the captured session updates through a real SDK connection', async () => {
    const peer = createRawPeer();
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const connection = await connectAcp(peer.stream, createHandlers());

    for (const file of SDK_REPLAY_FIXTURES) {
      for (const update of sessionUpdates(file)) {
        await peer.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { sessionId: 'fixture-session', update },
        });
      }
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    await peer.close();
    await connection.closed;

    expect(
      consoleError.mock.calls.filter((call) =>
        String(call[0]).includes('Error handling notification'),
      ),
    ).toEqual([]);
    consoleError.mockRestore();
  });

  it('reports the deliberately invalid session/update negative control', async () => {
    const peer = createRawPeer();
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const connection = await connectAcp(peer.stream, createHandlers());

    await peer.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 4,
        update: { sessionUpdate: 'agent_message_chunk' },
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await peer.close();
    await connection.closed;

    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes('Error handling notification'),
      ),
    ).toBe(true);
    consoleError.mockRestore();
  });
});

describe('replayed history through the stream projector', () => {
  /** The `session/update` notifications `session/load` replayed (`_meta.isReplay`). */
  function replayedUpdates(filename: string): unknown[] {
    return fixtureEnvelopes(filename).flatMap((envelope) => {
      if (envelope.dir !== 'in' || !isRecord(envelope.msg)) return [];
      const params = envelope.msg.params;
      if (envelope.msg.method !== 'session/update' || !isRecord(params)) {
        return [];
      }
      const meta = params['_meta'];
      return isRecord(meta) && meta['isReplay'] === true ? [params['update']] : [];
    });
  }

  it('rebuilds the user turn and the assistant reply of grok-p2-session-load-replay', () => {
    const mapper = createEventMapper();
    const projector = createFlatStreamProjector({ now: () => 0 });
    let sequence = 0;
    const rows = replayedUpdates('grok-p2-session-load-replay.ndjson').flatMap(
      (update) =>
        mapper
          .map(update as SessionUpdate)
          .flatMap((body) =>
            projector.project({
              contextId: 'agent-1',
              processGeneration: 1,
              sessionId: 'sess-replay',
              turnId: 'replay',
              sequence: ++sequence,
              replayed: true,
              ...body,
            }),
          ),
    );

    const user = rows.filter((row) => row.messageId === 'replay:user:user-message-1');
    expect(user.map((row) => row.eventType)).toEqual([
      'message_start',
      'text_delta',
      'message_complete',
    ]);
    expect(user[0]).toMatchObject({ role: 'user', source: 'history' });
    expect(user[1]).toMatchObject({
      delta: 'Remember the token ZEBRA-4471. Reply OK only.',
    });

    const assistantText = rows
      .flatMap((row) =>
        row.eventType === 'text_delta' && row.messageId === 'replay:assistant'
          ? [row.delta]
          : [],
      )
      .join('');
    expect(assistantText).toBe('OK');
    expect(rows.some((row) => row.eventType === 'thinking_delta')).toBe(true);
    expect(rows.every((row) => row.source === 'history')).toBe(true);
  });

  it('numbers id-less user turns on each role change and keeps chunks of one turn together (M-1)', () => {
    const mapper = createEventMapper();
    const user = (text: string) =>
      ({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text } }) as SessionUpdate;
    const agent = (text: string) =>
      ({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }) as SessionUpdate;
    const ids = [user('a'), user('b'), agent('ok'), user('c')].flatMap((update) =>
      mapper.map(update).flatMap((body) => (body.type === 'userText' ? [body.itemId] : [])),
    );
    expect(ids).toEqual(['user-message-1', 'user-message-1', 'user-message-2']);
  });

  it('keeps one user turn across an update that maps to no event (review M-3)', () => {
    const mapper = createEventMapper();
    const user = (text: string) =>
      ({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text } }) as SessionUpdate;
    const agent = (text: string) =>
      ({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }) as SessionUpdate;
    const usage = { sessionUpdate: 'usage_update', used: 1, size: 10 } as unknown as SessionUpdate;
    const commands = { sessionUpdate: 'available_commands_update', availableCommands: [] } as unknown as SessionUpdate;
    const ids = [user('a'), usage, commands, user('b'), agent('ok'), user('c')].flatMap((update) =>
      mapper.map(update).flatMap((body) => (body.type === 'userText' ? [body.itemId] : [])),
    );
    expect(ids).toEqual(['user-message-1', 'user-message-1', 'user-message-2']);
  });
});

describe('tool metadata lifetime (PR #1445 review)', () => {
  const started = {
    sessionUpdate: 'tool_call',
    toolCallId: 'call-1',
    title: 'Run tests',
    kind: 'execute',
    status: 'pending',
  } as SessionUpdate;
  const completed = {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call-1',
    status: 'completed',
  } as SessionUpdate;
  const toolName = (bodies: ReturnType<ReturnType<typeof createEventMapper>['map']>) =>
    bodies.find((body) => body.type === 'toolCompleted');

  it('uses the remembered title for the final update, then releases it', () => {
    const mapper = createEventMapper();
    mapper.map(started);
    expect(toolName(mapper.map(completed))).toMatchObject({ toolName: 'Run tests', kind: 'execute' });
    // A duplicate final update no longer finds the released entry.
    expect(toolName(mapper.map(completed))).toMatchObject({ toolName: undefined, kind: undefined });
  });

  it('releaseTools forgets tools that never finished', () => {
    const mapper = createEventMapper();
    mapper.map(started);
    mapper.releaseTools();
    expect(toolName(mapper.map(completed))).toMatchObject({ toolName: undefined });
  });
});

describe('tool calls across ACP updates (PR #1450 review)', () => {
  type Bodies = ReturnType<ReturnType<typeof createEventMapper>['map']>;
  const completion = (bodies: Bodies) => bodies.find((body) => body.type === 'toolCompleted');

  it('4651900750: a tool_call that arrives failed starts and finishes the tool at once', () => {
    const mapper = createEventMapper();
    const bodies = mapper.map({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-f',
      title: 'Read file',
      kind: 'read',
      status: 'failed',
      rawOutput: 'no such file',
    } as SessionUpdate);
    expect(bodies.map((body) => body.type)).toEqual(['toolStarted', 'toolCompleted']);
    expect(completion(bodies)).toMatchObject({
      toolId: 'call-f',
      status: 'failed',
      toolName: 'Read file',
      kind: 'read',
      output: 'no such file',
    });
    // The final event released the tool: a stray later update finds nothing.
    expect(
      completion(
        mapper.map({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call-f',
          status: 'failed',
        } as SessionUpdate),
      ),
    ).toMatchObject({ toolName: undefined });
  });

  it('4651900750: a pending tool_call still only starts the tool', () => {
    const mapper = createEventMapper();
    const bodies = mapper.map({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-p',
      title: 'Run',
      kind: 'execute',
      status: 'pending',
    } as SessionUpdate);
    expect(bodies.map((body) => body.type)).toEqual(['toolStarted']);
  });

  it('4651900758: keeps the output, kind and title of an earlier update for a bare completion', () => {
    const mapper = createEventMapper();
    mapper.map({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-o',
      title: 'Run',
      status: 'pending',
    } as SessionUpdate);
    mapper.map({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-o',
      status: 'in_progress',
      kind: 'search',
      title: 'Search the repo',
      rawOutput: 'done',
    } as SessionUpdate);
    expect(
      completion(
        mapper.map({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call-o',
          status: 'completed',
        } as SessionUpdate),
      ),
    ).toMatchObject({ output: 'done', kind: 'search', toolName: 'Search the repo' });
  });

  it('4651900758: an explicit value on the final update wins over the retained one', () => {
    const mapper = createEventMapper();
    mapper.map({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-x',
      status: 'in_progress',
      title: 'Old title',
      rawOutput: 'partial',
    } as SessionUpdate);
    expect(
      completion(
        mapper.map({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call-x',
          status: 'completed',
          title: 'New title',
          content: [{ type: 'content', content: { type: 'text', text: 'final' } }],
        } as SessionUpdate),
      ),
    ).toMatchObject({ output: 'final', toolName: 'New title' });
  });
});

describe('ACP chat tool cards', () => {
  function projectUpdates() {
    const mapper = createEventMapper();
    const projector = createFlatStreamProjector();
    let sequence = 0;
    return (update: SessionUpdate) =>
      mapper.map(update).flatMap((body) =>
        projector.project({
          contextId: 'agent',
          processGeneration: 1,
          turnId: 'turn',
          sequence: ++sequence,
          ...body,
        }),
      );
  }

  it('presents the agy CommandLine field as Bash input', () => {
    const project = projectUpdates();
    expect(
      project({
        sessionUpdate: 'tool_call',
        toolCallId: 'shell',
        kind: 'execute',
        title: 'pwd',
        rawInput: { CommandLine: 'pwd', IsDaemon: false },
      })[1],
    ).toMatchObject({ toolName: 'Bash', toolInput: { command: 'pwd' } });
  });

  it('presents a command on the original Bash card when input arrives late, then completes cancellation', () => {
    const project = projectUpdates();
    const [message, start] = project({
      sessionUpdate: 'tool_call',
      toolCallId: 'shell',
      kind: 'execute',
      title: 'Run',
    });
    expect(start).toMatchObject({ eventType: 'tool_start', toolName: 'Bash' });
    // Some agents send cancellation even though the ACP SDK omits that status.
    const cancelled: unknown = {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'shell',
      rawInput: { command: 'pwd', cwd: '/work' },
      status: 'cancelled',
    };
    const [update, result] = project(cancelled as SessionUpdate);
    expect(update).toMatchObject({
      eventType: 'tool_start',
      toolCallId: 'shell',
      toolName: 'Bash',
      toolInput: { command: 'pwd' },
      messageId: message.messageId,
      timestamp: start.timestamp,
    });
    expect(update.id).toBe(start.id);
    expect(result).toMatchObject({
      eventType: 'tool_result',
      toolCallId: 'shell',
      isError: true,
      output: 'Tool cancelled.',
    });
  });

  it('uses Edit when a late diff supplies the old and new text', () => {
    const project = projectUpdates();
    expect(
      project({
        sessionUpdate: 'tool_call',
        toolCallId: 'edit',
        kind: 'edit',
        title: 'Edit a.ts',
        locations: [{ path: 'a.ts' }],
      })[1],
    ).toMatchObject({
      toolName: 'FileChange',
      toolInput: {
        file_path: 'a.ts',
        changes: [{ path: 'a.ts', kind: { type: 'update' }, diff: '' }],
      },
    });
    expect(
      project({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'edit',
        status: 'completed',
        content: [
          { type: 'diff', path: 'a.ts', oldText: 'before', newText: 'after' },
        ],
      }),
    ).toMatchObject([
      {
        eventType: 'tool_start',
        toolName: 'Edit',
        toolCallId: 'edit',
        toolInput: {
          file_path: 'a.ts',
          old_string: 'before',
          new_string: 'after',
        },
      },
      { eventType: 'tool_result', isError: false },
    ]);
  });

  it('keeps multiple diff blocks on one FileChange card', () => {
    const project = projectUpdates();
    expect(
      project({
        sessionUpdate: 'tool_call',
        toolCallId: 'delete',
        kind: 'delete',
        title: 'Delete files',
        content: [
          { type: 'diff', path: 'a.ts', oldText: 'before', newText: '' },
          { type: 'diff', path: 'b.ts', oldText: 'other', newText: '' },
        ],
      })[1],
    ).toMatchObject({
      toolName: 'FileChange',
      toolInput: {
        changes: [
          { path: 'a.ts', kind: { type: 'delete' }, diff: 'before' },
          { path: 'b.ts', kind: { type: 'delete' }, diff: 'other' },
        ],
      },
    });
  });

  it('preserves a diff from an execute update in the Bash result', () => {
    const project = projectUpdates();
    project({
      sessionUpdate: 'tool_call',
      toolCallId: 'shell',
      kind: 'execute',
      title: 'Run',
      rawInput: { command: 'patch' },
    });
    expect(
      project({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'shell',
        status: 'completed',
        content: [
          { type: 'diff', path: 'a.ts', oldText: 'before', newText: 'after' },
        ],
      }),
    ).toContainEqual(
      expect.objectContaining({
        eventType: 'tool_result',
        toolCallId: 'shell',
        output: 'a.ts\n@@ -1,1 +1,1 @@\n-before\n+after',
      }),
    );
  });

  it('counts late presentation input against the replay payload budget', () => {
    const mapper = createEventMapper();
    const replay = createAcpReplayCollector(
      { contextId: 'agent', processGeneration: 1, sessionId: 'session' },
      { maxTextChars: 100 },
    );
    replay.add(
      mapper.map({
        sessionUpdate: 'tool_call',
        toolCallId: 'shell',
        kind: 'execute',
        title: 'Run',
      }),
    );
    replay.add(
      mapper.map({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'shell',
        rawInput: { command: 'x'.repeat(5_000) },
      }),
    );
    const update = replay.events().find((row) => row.type === 'toolUpdated');
    expect(update?.presentation).toEqual({ toolName: 'Bash' });
  });
});
