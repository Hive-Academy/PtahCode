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

/** The keys of `T` that are not optional. */
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];

/** The required fields a variant adds to the base the caller checks. */
type VariantRequiredKeys<K extends EventType> = Exclude<
  RequiredKeys<EventOf<K>>,
  | 'id'
  | 'messageId'
  | 'timestamp'
  | 'eventType'
  | (K extends 'agent_status' ? 'agentId' | 'native' : never)
>;

/**
 * Marks a required field typed `unknown`: no value has the wrong type, and
 * absence is the `undefined` the type admits (JSON drops it in transit).
 */
const ANY_VALUE_IS_VALID = Symbol('any value is valid');

/**
 * A wrongly typed value for every required field of every variant. The mapped
 * type makes the compiler reject a table that misses a required field or
 * names one that is not required, so it cannot drift from the union.
 */
const WRONG_VALUES: {
  readonly [K in EventType]: {
    readonly [F in VariantRequiredKeys<K>]: unknown;
  };
} = {
  message_start: { role: 'system' },
  text_delta: { delta: 1, blockIndex: '0' },
  thinking_start: { blockIndex: '0' },
  thinking_delta: { delta: null, blockIndex: '0' },
  tool_start: { toolCallId: 1, toolName: 1, isTaskTool: 'false' },
  tool_delta: { toolCallId: 1, delta: {} },
  tool_result: { toolCallId: 1, output: ANY_VALUE_IS_VALID, isError: 0 },
  agent_start: { toolCallId: 1, agentType: 1 },
  message_complete: {},
  message_delta: { tokenUsage: 'lots' },
  signature_delta: { blockIndex: '0', signature: 1 },
  compaction_start: { trigger: 'scheduled', preTokens: '100' },
  compaction_complete: { trigger: 'scheduled' },
  background_agent_started: { toolCallId: 1, agentType: 1 },
  background_agent_completed: { toolCallId: 1, agentId: 1 },
  background_agent_stopped: { toolCallId: 1, agentId: 1 },
  background_tasks_snapshot: { sessionId: 1, tasks: {} },
  agent_progress: {
    parentToolUseId: 1,
    taskId: 1,
    description: 1,
    totalTokens: '10',
    toolUses: '1',
    durationMs: '5',
  },
  agent_status: { parentToolUseId: 1, taskId: 1, status: 'exploded' },
  agent_completed: {
    parentToolUseId: 1,
    taskId: 1,
    status: 'running',
    summary: 1,
    outputFile: 1,
  },
  turn_state: {
    phase: 'asleep',
    revision: '3',
    backgroundTasks: {},
    sessionCrons: {},
    terminalReason: 'nope',
  },
};

/** `[eventType, field, wrong value]` for every required field. */
const REQUIRED_FIELDS: readonly (readonly [EventType, string, unknown])[] = (
  Object.keys(WRONG_VALUES) as EventType[]
).flatMap((eventType) =>
  Object.entries(WRONG_VALUES[eventType]).map(
    ([field, wrong]) => [eventType, field, wrong] as const,
  ),
);

const MISTYPED_FIELDS = REQUIRED_FIELDS.filter(
  ([, , wrong]) => wrong !== ANY_VALUE_IS_VALID,
);

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
  describe('agent_status variants', () => {
    const native = {
      ...base,
      eventType: 'agent_status',
      parentToolUseId: 'tc',
      agentId: 'agent-1',
      status: 'running',
      native: {
        provider: 'codex',
        agentThreadId: 'thread-1',
        activityId: 'activity-1',
        cycleId: 'cycle-1',
        cycleOrdinal: 0,
        kind: 'started',
      },
    };

    it('accepts SDK status with taskId', () => {
      expect(parseFlatStreamEvent(VALID.agent_status)).toEqual(
        VALID.agent_status,
      );
    });

    it('rejects SDK status without taskId', () => {
      expect(parseFlatStreamEvent(withoutField('agent_status', 'taskId'))).toBeNull();
    });

    it('accepts native Codex status', () => {
      expect(parseFlatStreamEvent(native)).toEqual(native);
    });

    it('rejects native status without agentThreadId', () => {
      const missingThreadId: Record<string, unknown> = { ...native.native };
      delete missingThreadId['agentThreadId'];
      expect(parseFlatStreamEvent({ ...native, native: missingThreadId })).toBeNull();
    });

    it('rejects native status with an invalid kind', () => {
      expect(parseFlatStreamEvent({ ...native, native: { ...native.native, kind: 'unknown' } })).toBeNull();
    });

    it.each([-1, 0.5])('rejects native status with cycleOrdinal %p', (cycleOrdinal) => {
      expect(parseFlatStreamEvent({ ...native, native: { ...native.native, cycleOrdinal } })).toBeNull();
    });

    it('rejects native status with another provider', () => {
      expect(parseFlatStreamEvent({ ...native, native: { ...native.native, provider: 'other' } })).toBeNull();
    });
  });

  it.each(Object.values(VALID))('accepts a valid $eventType', (event) => {
    expect(parseFlatStreamEvent(event)).toEqual(event);
  });

  it.each(VALID_WITH_OPTIONALS)(
    'accepts $eventType with its optional fields',
    (event) => {
      expect(parseFlatStreamEvent(event)).toEqual(event);
    },
  );

  it.each(MISTYPED_FIELDS)('rejects %s without %s', (eventType, field) => {
    expect(parseFlatStreamEvent(withoutField(eventType, field))).toBeNull();
  });

  it('covers the required fields of every variant', () => {
    expect(REQUIRED_FIELDS).toContainEqual([
      'tool_result',
      'output',
      ANY_VALUE_IS_VALID,
    ]);
    expect(REQUIRED_FIELDS.length).toBeGreaterThan(48);
  });

  it.each(MISTYPED_FIELDS)(
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

  it.each([null, false, 0, '', [], {}])(
    'accepts a tool_result whose output is %p',
    (output) => {
      const event = { ...VALID.tool_result, output };
      expect(parseFlatStreamEvent(event)).toEqual(event);
    },
  );

  it('accepts a tool_result with no output or an undefined output', () => {
    // `output: unknown` admits undefined, and JSON drops an undefined-valued
    // key in transit, so a producer's `output: block.content` can arrive
    // without the key. Rejecting it would hide that tool's result.
    const missing = withoutField('tool_result', 'output');
    expect(parseFlatStreamEvent(missing)).toEqual(missing);
    expect(
      parseFlatStreamEvent({ ...VALID.tool_result, output: undefined }),
    ).toEqual(missing);
  });

  it('does not read a required field from the prototype', () => {
    const inherited = Object.create({ isError: false }) as Record<
      string,
      unknown
    >;
    Object.assign(inherited, withoutField('tool_result', 'isError'));
    expect(parseFlatStreamEvent(inherited)).toBeNull();
  });

  describe('keys that differ only by an unsafe character', () => {
    const RLO = '\u202E';
    const ZWSP = '\u200B';
    const LRI = '\u2066';
    const RLM = '\u200F';

    it('cannot replace a validated eventType', () => {
      expect(
        parseFlatStreamEvent({
          ...VALID.text_delta,
          [`eventType${RLO}`]: 'evil',
        }),
      ).toBeNull();
    });

    it('cannot replace a validated id with a value of the wrong type', () => {
      expect(
        parseFlatStreamEvent({ ...VALID.text_delta, [`id${ZWSP}`]: 7 }),
      ).toBeNull();
    });

    it('rejects a collision even when both values are well typed', () => {
      expect(
        parseFlatStreamEvent({ ...VALID.text_delta, [`${LRI}id`]: 'e2' }),
      ).toBeNull();
    });

    it('rejects an unknown raw eventType hidden behind a valid colliding one', () => {
      expect(
        parseFlatStreamEvent({
          ...VALID.text_delta,
          eventType: 'unknown',
          [`eventType${RLO}`]: 'text_delta',
        }),
      ).toBeNull();
    });

    it('rejects a mistyped raw id hidden behind a valid colliding one', () => {
      expect(
        parseFlatStreamEvent({
          ...VALID.text_delta,
          id: 7,
          [`id${RLO}`]: 'e1',
        }),
      ).toBeNull();
    });

    it('rejects a well-typed collision in a nested object', () => {
      expect(
        parseFlatStreamEvent({
          ...VALID.message_delta,
          tokenUsage: { input: '1', [`input${ZWSP}`]: 1, output: 2 },
        }),
      ).toBeNull();
    });

    it('rejects a collision inside an array element', () => {
      expect(
        parseFlatStreamEvent({
          ...VALID.background_tasks_snapshot,
          tasks: [
            {
              ...VALID.background_tasks_snapshot.tasks[0],
              status: 'done',
              [`status${RLM}`]: 'running',
            },
          ],
        }),
      ).toBeNull();
    });

    it('ignores a colliding key whose value is undefined', () => {
      expect(
        parseFlatStreamEvent({ ...VALID.text_delta, [`id${ZWSP}`]: undefined }),
      ).toEqual(VALID.text_delta);
    });

    it('cannot replace a validated nested field', () => {
      expect(
        parseFlatStreamEvent({
          ...VALID.message_delta,
          tokenUsage: { input: 1, output: 2, [`input${RLM}`]: 'many' },
        }),
      ).toBeNull();
    });
  });

  it('checks the depth-bounded copy, so a too-deep value is null when checked', () => {
    let deep: unknown = 'bottom';
    for (let i = 0; i < 80; i++) deep = { next: deep };
    const parsed = parseFlatStreamEvent({ ...VALID.tool_result, output: deep });
    expect(parsed).not.toBeNull();
    let node: unknown =
      parsed?.eventType === 'tool_result' ? parsed.output : null;
    let depth = 0;
    while (typeof node === 'object' && node !== null) {
      node = (node as Record<string, unknown>)['next'];
      depth++;
    }
    expect(node).toBeNull();
    expect(depth).toBeLessThan(80);
    expect(
      parseFlatStreamEvent({
        ...VALID.background_tasks_snapshot,
        tasks: [deep],
      }),
    ).toBeNull();
  });
});
