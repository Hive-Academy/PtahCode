import type { FlatStreamEventUnion } from '@ptah-extension/shared';
import { parseFlatStreamEvent } from './transcript-events';

type EventType = FlatStreamEventUnion['eventType'];
type EventOf<K extends EventType> = Extract<
  FlatStreamEventUnion,
  { eventType: K }
>;

const base = { id: 'e1', messageId: 'm1', timestamp: 1 };

/** One valid event per variant; the mapped type makes the compiler check each. */
const VALID: { readonly [K in EventType]: EventOf<K> } = {
  message_start: { ...base, eventType: 'message_start', role: 'user' },
  text_delta: { ...base, eventType: 'text_delta', delta: 'hi', blockIndex: 0 },
  thinking_start: { ...base, eventType: 'thinking_start', blockIndex: 0 },
  thinking_delta: {
    ...base,
    eventType: 'thinking_delta',
    delta: 'hmm',
    blockIndex: 0,
  },
  tool_start: {
    ...base,
    eventType: 'tool_start',
    toolCallId: 'tc',
    toolName: 'Bash',
    isTaskTool: false,
  },
  tool_delta: {
    ...base,
    eventType: 'tool_delta',
    toolCallId: 'tc',
    delta: '{',
  },
  tool_result: {
    ...base,
    eventType: 'tool_result',
    toolCallId: 'tc',
    output: 'ok',
    isError: false,
  },
  agent_start: {
    ...base,
    eventType: 'agent_start',
    toolCallId: 'tc',
    agentType: 'Explore',
  },
  message_complete: { ...base, eventType: 'message_complete' },
  message_delta: {
    ...base,
    eventType: 'message_delta',
    tokenUsage: { input: 1, output: 2 },
  },
  signature_delta: {
    ...base,
    eventType: 'signature_delta',
    blockIndex: 0,
    signature: 'sig',
  },
  compaction_start: {
    ...base,
    eventType: 'compaction_start',
    trigger: 'auto',
    preTokens: 100,
  },
  compaction_complete: {
    ...base,
    eventType: 'compaction_complete',
    trigger: 'manual',
  },
  background_agent_started: {
    ...base,
    eventType: 'background_agent_started',
    toolCallId: 'tc',
    agentType: 'Explore',
  },
  background_agent_completed: {
    ...base,
    eventType: 'background_agent_completed',
    toolCallId: 'tc',
    agentId: 'a1',
  },
  background_agent_stopped: {
    ...base,
    eventType: 'background_agent_stopped',
    toolCallId: 'tc',
    agentId: 'a1',
  },
  background_tasks_snapshot: {
    ...base,
    eventType: 'background_tasks_snapshot',
    sessionId: 's1',
    tasks: [
      {
        taskId: 't1',
        taskType: 'bash',
        description: 'build',
        status: 'running',
      },
    ],
  },
  agent_progress: {
    ...base,
    eventType: 'agent_progress',
    parentToolUseId: 'tc',
    taskId: 't1',
    description: 'reading',
    totalTokens: 10,
    toolUses: 1,
    durationMs: 5,
  },
  agent_status: {
    ...base,
    eventType: 'agent_status',
    parentToolUseId: 'tc',
    taskId: 't1',
    status: 'running',
  },
  agent_completed: {
    ...base,
    eventType: 'agent_completed',
    parentToolUseId: 'tc',
    taskId: 't1',
    status: 'completed',
    summary: '',
    outputFile: '/tmp/out',
  },
  turn_state: {
    ...base,
    eventType: 'turn_state',
    phase: 'idle',
    revision: 3,
    backgroundTasks: [
      { id: 'b1', type: 'bash', status: 'running', description: 'build' },
    ],
    sessionCrons: [
      { id: 'c1', schedule: '* * * * *', recurring: true, prompt: 'ping' },
    ],
    terminalReason: 'completed',
  },
};

/** Valid events with every optional field present and well typed. */
const VALID_WITH_OPTIONALS: readonly FlatStreamEventUnion[] = [
  {
    ...VALID.message_start,
    sessionId: 's1',
    source: 'history',
    clientMessageId: 'c1',
    imageCount: 2,
    inboundPeer: { label: 'peer', beforeClientMessageId: 'c0' },
  },
  {
    ...VALID.message_complete,
    stopReason: 'end_turn',
    tokenUsage: { input: 1, output: 2, contextTokens: 3 },
    cost: null,
    duration: 4,
    model: 'opus',
  },
  {
    ...VALID.compaction_complete,
    boundaryId: 'b',
    measurement: {
      source: 'sdk-compact-metadata',
      boundaryId: 'b',
      preTokens: 10,
      postTokens: 5,
    },
    idleCompaction: { preTokens: 10 },
    preTokens: 10,
    postTokens: 5,
    durationMs: 7,
  },
  { ...VALID.background_agent_completed, status: 'failed', cost: 0.1 },
  {
    ...VALID.turn_state,
    phase: 'failed',
    terminalReason: null,
    lastAssistantMessage: null,
    error: 'rate_limit',
    retirementOnly: false,
  },
];

/** `[eventType, field, wrong value]`: each required field, mistyped. */
const REQUIRED_FIELDS: readonly (readonly [EventType, string, unknown])[] = [
  ['message_start', 'role', 'system'],
  ['text_delta', 'delta', 1],
  ['text_delta', 'blockIndex', '0'],
  ['thinking_start', 'blockIndex', '0'],
  ['thinking_delta', 'delta', null],
  ['thinking_delta', 'blockIndex', '0'],
  ['tool_start', 'toolCallId', 1],
  ['tool_start', 'toolName', 1],
  ['tool_start', 'isTaskTool', 'false'],
  ['tool_delta', 'toolCallId', 1],
  ['tool_delta', 'delta', {}],
  ['tool_result', 'toolCallId', 1],
  ['tool_result', 'isError', 0],
  ['agent_start', 'toolCallId', 1],
  ['agent_start', 'agentType', 1],
  ['message_delta', 'tokenUsage', 'lots'],
  ['signature_delta', 'blockIndex', '0'],
  ['signature_delta', 'signature', 1],
  ['compaction_start', 'trigger', 'scheduled'],
  ['compaction_start', 'preTokens', '100'],
  ['compaction_complete', 'trigger', 'scheduled'],
  ['background_agent_started', 'toolCallId', 1],
  ['background_agent_started', 'agentType', 1],
  ['background_agent_completed', 'toolCallId', 1],
  ['background_agent_completed', 'agentId', 1],
  ['background_agent_stopped', 'toolCallId', 1],
  ['background_agent_stopped', 'agentId', 1],
  ['background_tasks_snapshot', 'sessionId', 1],
  ['background_tasks_snapshot', 'tasks', {}],
  ['agent_progress', 'parentToolUseId', 1],
  ['agent_progress', 'taskId', 1],
  ['agent_progress', 'description', 1],
  ['agent_progress', 'totalTokens', '10'],
  ['agent_progress', 'toolUses', '1'],
  ['agent_progress', 'durationMs', '5'],
  ['agent_status', 'parentToolUseId', 1],
  ['agent_status', 'taskId', 1],
  ['agent_status', 'status', 'exploded'],
  ['agent_completed', 'parentToolUseId', 1],
  ['agent_completed', 'taskId', 1],
  ['agent_completed', 'status', 'running'],
  ['agent_completed', 'summary', 1],
  ['agent_completed', 'outputFile', 1],
  ['turn_state', 'phase', 'asleep'],
  ['turn_state', 'revision', '3'],
  ['turn_state', 'backgroundTasks', {}],
  ['turn_state', 'sessionCrons', {}],
  ['turn_state', 'terminalReason', 'nope'],
];

function withField(
  eventType: EventType,
  field: string,
  value: unknown,
): Record<string, unknown> {
  return { ...VALID[eventType], [field]: value };
}

function withoutField(
  eventType: EventType,
  field: string,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...VALID[eventType] };
  delete copy[field];
  return copy;
}

describe('parseFlatStreamEvent field checks', () => {
  it.each(Object.values(VALID))('accepts a valid $eventType', (event) => {
    expect(parseFlatStreamEvent(event)).toEqual(event);
  });

  it.each(VALID_WITH_OPTIONALS)(
    'accepts $eventType with its optional fields',
    (event) => {
      expect(parseFlatStreamEvent(event)).toEqual(event);
    },
  );

  it.each(REQUIRED_FIELDS)('rejects %s without %s', (eventType, field) => {
    expect(parseFlatStreamEvent(withoutField(eventType, field))).toBeNull();
  });

  it.each(REQUIRED_FIELDS)(
    'rejects %s with a mistyped %s (%p)',
    (eventType, field, wrong) => {
      expect(
        parseFlatStreamEvent(withField(eventType, field, wrong)),
      ).toBeNull();
    },
  );

  it.each(Object.keys(VALID) as EventType[])(
    'rejects %s with a bad base field',
    (eventType) => {
      for (const [field, wrong] of [
        ['id', 1],
        ['messageId', null],
        ['timestamp', '1'],
        ['source', 'replay'],
        ['sessionId', 1],
      ] as const) {
        expect(
          parseFlatStreamEvent(withField(eventType, field, wrong)),
        ).toBeNull();
      }
      expect(parseFlatStreamEvent(withoutField(eventType, 'id'))).toBeNull();
    },
  );

  it.each([
    [
      'message_delta input',
      withField('message_delta', 'tokenUsage', { output: 2 }),
    ],
    [
      'message_delta output',
      withField('message_delta', 'tokenUsage', { input: 1, output: '2' }),
    ],
    [
      'message_complete tokenUsage',
      withField('message_complete', 'tokenUsage', { input: 1 }),
    ],
    [
      'message_complete contextTokens',
      withField('message_complete', 'tokenUsage', {
        input: 1,
        output: 2,
        contextTokens: '3',
      }),
    ],
    ['message_complete cost', withField('message_complete', 'cost', '0.1')],
    [
      'message_start inboundPeer',
      withField('message_start', 'inboundPeer', { beforeClientMessageId: 'c' }),
    ],
    [
      'compaction_complete measurement',
      withField('compaction_complete', 'measurement', {
        source: 'guess',
        boundaryId: 'b',
        preTokens: 1,
        postTokens: 1,
      }),
    ],
    [
      'compaction_complete idleCompaction',
      withField('compaction_complete', 'idleCompaction', {}),
    ],
    [
      'background_agent_completed status',
      withField('background_agent_completed', 'status', 'stopped'),
    ],
    [
      'snapshot task status',
      withField('background_tasks_snapshot', 'tasks', [
        { taskId: 't', taskType: 'bash', description: 'd', status: 'done' },
      ]),
    ],
    [
      'snapshot task without taskId',
      withField('background_tasks_snapshot', 'tasks', [
        { taskType: 'bash', description: 'd', status: 'running' },
      ]),
    ],
    [
      'snapshot task that is not an object',
      withField('background_tasks_snapshot', 'tasks', ['t1']),
    ],
    [
      'turn_state background task',
      withField('turn_state', 'backgroundTasks', [{ id: 'b', type: 'bash' }]),
    ],
    [
      'turn_state cron',
      withField('turn_state', 'sessionCrons', [
        { id: 'c', schedule: '*', recurring: 'yes', prompt: 'p' },
      ]),
    ],
    ['turn_state error', withField('turn_state', 'error', 'meltdown')],
    [
      'turn_state lastAssistantMessage',
      withField('turn_state', 'lastAssistantMessage', 42),
    ],
    ['tool_start toolInput', withField('tool_start', 'toolInput', ['ls'])],
    [
      'tool_result isPermissionRequest',
      withField('tool_result', 'isPermissionRequest', 'y'),
    ],
  ])('rejects a malformed nested or optional field: %s', (_label, event) => {
    expect(parseFlatStreamEvent(event)).toBeNull();
  });

  it('keeps an unknown tool output and strips bidi characters from strings', () => {
    const event = {
      ...VALID.tool_result,
      output: { text: 'a\u202Eb' },
    };
    expect(parseFlatStreamEvent(event)).toEqual({
      ...VALID.tool_result,
      output: { text: 'ab' },
    });
  });
});
