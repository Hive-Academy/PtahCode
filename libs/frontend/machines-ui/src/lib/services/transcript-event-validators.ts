import type {
  EventSource,
  FlatStreamEventUnion,
  NativeCodexAgentStatus,
  SdkAssistantMessageError,
  SdkTerminalReason,
  SessionTurnPhase,
} from '@ptah-extension/shared';
import {
  parseSdkBackgroundTaskSummary,
  parseSdkSessionCronSummary,
} from '@ptah-extension/shared';

/**
 * Field checks for each {@link FlatStreamEventUnion} variant, used by
 * `parseFlatStreamEvent` on worker-supplied events.
 *
 * Every required field of a variant is checked for its primitive type, its
 * literal union or its nested shape. An optional field may be absent; when
 * present it must have its declared type.
 *
 * The checks run on the copy `displayBlockValue` made, which has no
 * `undefined`-valued keys, and read own properties only. So "present" means
 * an own key with a value other than `undefined`.
 *
 * A required field typed `unknown` (a tool's `output`) passes with any value
 * and also when absent: `unknown` admits `undefined`, and JSON drops an
 * `undefined`-valued key on the way from the worker, so absence is the
 * `undefined` the type allows. Producers send `output: block.content`, which
 * can be undefined.
 */

type EventType = FlatStreamEventUnion['eventType'];
type EventOf<K extends EventType> = Extract<
  FlatStreamEventUnion,
  { eventType: K }
>;
type Predicate = (value: unknown) => boolean;
type Raw = Readonly<Record<string, unknown>>;
/** Field name to the check its value must pass. */
type FieldChecks = Readonly<Record<string, Predicate>>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString: Predicate = (value) => typeof value === 'string';
const isNumber: Predicate = (value) => typeof value === 'number';
const isBoolean: Predicate = (value) => typeof value === 'boolean';
/** A required field of type `unknown`: every value, `undefined` included. */
const isAnyValue: Predicate = () => true;

/**
 * A check for the members of a string literal union. Taking the members as
 * the keys of a `Record<T, true>` makes the compiler reject a list that
 * misses or adds a member.
 */
function isOneOf<T extends string>(
  members: Readonly<Record<T, true>>,
): Predicate {
  return (value) =>
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(members, value);
}

function optional(check: Predicate): Predicate {
  return (value) => value === undefined || check(value);
}

function nullable(check: Predicate): Predicate {
  return (value) => value === null || check(value);
}

function arrayOf(check: Predicate): Predicate {
  return (value) => Array.isArray(value) && value.every(check);
}

/** The own property `key` of `raw`; never a value inherited from a prototype. */
function ownField(raw: Raw, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined;
}

function hasFields(raw: Raw, checks: FieldChecks): boolean {
  return Object.keys(checks).every((key) => checks[key](ownField(raw, key)));
}

function shape(checks: FieldChecks): Predicate {
  return (value) => isRecord(value) && hasFields(value, checks);
}

const isEventSource = isOneOf<EventSource>({
  stream: true,
  complete: true,
  history: true,
  hook: true,
});

const isTrigger = isOneOf<EventOf<'compaction_start'>['trigger']>({
  manual: true,
  auto: true,
});

const isTerminalReason = isOneOf<SdkTerminalReason>({
  blocking_limit: true,
  rapid_refill_breaker: true,
  prompt_too_long: true,
  image_error: true,
  model_error: true,
  api_error: true,
  malformed_tool_use_exhausted: true,
  aborted_streaming: true,
  aborted_tools: true,
  stop_hook_prevented: true,
  hook_stopped: true,
  tool_deferred: true,
  tool_deferred_unavailable: true,
  max_turns: true,
  background_requested: true,
  budget_exhausted: true,
  structured_output_retry_exhausted: true,
  turn_setup_failed: true,
  completed: true,
});

const isAssistantMessageError = isOneOf<SdkAssistantMessageError>({
  authentication_failed: true,
  oauth_org_not_allowed: true,
  account_on_hold: true,
  verification_required: true,
  billing_error: true,
  rate_limit: true,
  overloaded: true,
  invalid_request: true,
  model_not_found: true,
  server_error: true,
  unknown: true,
  max_output_tokens: true,
  cloud_credential_error: true,
});

const isTurnPhase = isOneOf<SessionTurnPhase>({
  generating: true,
  'awaiting-background': true,
  sleeping: true,
  idle: true,
  failed: true,
});

const optionalString = optional(isString);
const optionalNumber = optional(isNumber);
const optionalBoolean = optional(isBoolean);

/** The optional fields of the `FlatStreamEvent` base, checked on every event. */
const BASE_OPTIONAL: FieldChecks = {
  sessionId: optionalString,
  source: optional(isEventSource),
  parentToolUseId: optionalString,
  toolCallId: optionalString,
  blockIndex: optionalNumber,
};

/** The optional workflow and agent ids the `agent_*` task events share. */
const AGENT_TASK_OPTIONAL: FieldChecks = {
  agentId: optionalString,
  workflowRunId: optionalString,
  workflowName: optionalString,
};

const isTokenUsage = shape({ input: isNumber, output: isNumber });
const isNativeCodexAgentStatus = shape({
  provider: (value) => value === 'codex',
  agentThreadId: isString,
  activityId: isString,
  cycleId: isString,
  cycleOrdinal: (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0,
  kind: isOneOf<NativeCodexAgentStatus['kind']>({
    started: true,
    interacted: true,
    interrupted: true,
    completed: true,
  }),
});

function hasAgentStatusVariant(raw: Raw): boolean {
  const native = ownField(raw, 'native');
  const taskId = ownField(raw, 'taskId');
  return native === undefined
    ? isString(taskId)
    : taskId === undefined &&
        isString(ownField(raw, 'agentId')) &&
        isNativeCodexAgentStatus(native);
}

/**
 * One entry per variant; the mapped type makes adding a union member without
 * its checks a compile error.
 */
const EVENT_FIELD_CHECKS: { readonly [K in EventType]: FieldChecks } = {
  message_start: {
    role: isOneOf<EventOf<'message_start'>['role']>({
      user: true,
      assistant: true,
    }),
    clientMessageId: optionalString,
    imageCount: optionalNumber,
    inboundPeer: optional(
      shape({ label: isString, beforeClientMessageId: optionalString }),
    ),
  },
  text_delta: { delta: isString, blockIndex: isNumber },
  thinking_start: { blockIndex: isNumber },
  thinking_delta: {
    delta: isString,
    blockIndex: isNumber,
    signature: optionalString,
  },
  tool_start: {
    toolCallId: isString,
    toolName: isString,
    isTaskTool: isBoolean,
    toolInput: optional(isRecord),
    agentType: optionalString,
    agentDescription: optionalString,
    agentPrompt: optionalString,
  },
  tool_delta: { toolCallId: isString, delta: isString },
  tool_result: {
    toolCallId: isString,
    output: isAnyValue,
    isError: isBoolean,
    isPermissionRequest: optionalBoolean,
  },
  agent_start: {
    toolCallId: isString,
    agentType: isString,
    agentDescription: optionalString,
    agentPrompt: optionalString,
    agentId: optionalString,
    teammateName: optionalString,
    taskId: optionalString,
    workflowRunId: optionalString,
    workflowName: optionalString,
  },
  message_complete: {
    stopReason: optionalString,
    tokenUsage: optional(
      shape({
        input: isNumber,
        output: isNumber,
        contextTokens: optionalNumber,
      }),
    ),
    cost: optional(nullable(isNumber)),
    duration: optionalNumber,
    model: optionalString,
  },
  message_delta: { tokenUsage: isTokenUsage },
  signature_delta: { blockIndex: isNumber, signature: isString },
  compaction_start: { trigger: isTrigger, preTokens: isNumber },
  compaction_complete: {
    trigger: isTrigger,
    boundaryId: optionalString,
    measurement: optional(
      shape({
        source: isOneOf<
          NonNullable<EventOf<'compaction_complete'>['measurement']>['source']
        >({ 'sdk-compact-metadata': true }),
        boundaryId: isString,
        preTokens: isNumber,
        postTokens: isNumber,
      }),
    ),
    idleCompaction: optional(shape({ preTokens: isNumber })),
    preTokens: optionalNumber,
    postTokens: optionalNumber,
    durationMs: optionalNumber,
  },
  background_agent_started: {
    toolCallId: isString,
    agentType: isString,
    agentDescription: optionalString,
    agentId: optionalString,
    teammateName: optionalString,
    outputFilePath: optionalString,
    tabId: optionalString,
  },
  background_agent_completed: {
    toolCallId: isString,
    agentId: isString,
    agentType: optionalString,
    status: optional(
      isOneOf<NonNullable<EventOf<'background_agent_completed'>['status']>>({
        completed: true,
        failed: true,
      }),
    ),
    result: optionalString,
    cost: optionalNumber,
    duration: optionalNumber,
    tabId: optionalString,
  },
  background_agent_stopped: {
    toolCallId: isString,
    agentId: isString,
    agentType: optionalString,
    tabId: optionalString,
  },
  background_tasks_snapshot: {
    sessionId: isString,
    tasks: arrayOf(
      shape({
        taskId: isString,
        taskType: isString,
        description: isString,
        command: optionalString,
        status: isOneOf<
          EventOf<'background_tasks_snapshot'>['tasks'][number]['status']
        >({ running: true }),
      }),
    ),
  },
  agent_progress: {
    parentToolUseId: isString,
    taskId: isString,
    description: isString,
    totalTokens: isNumber,
    toolUses: isNumber,
    durationMs: isNumber,
    summary: optionalString,
    lastToolName: optionalString,
    ...AGENT_TASK_OPTIONAL,
  },
  agent_status: {
    parentToolUseId: isString,
    status: isOneOf<EventOf<'agent_status'>['status']>({
      pending: true,
      running: true,
      completed: true,
      failed: true,
      killed: true,
      paused: true,
    }),
    description: optionalString,
    errorMessage: optionalString,
    ...AGENT_TASK_OPTIONAL,
  },
  agent_completed: {
    parentToolUseId: isString,
    taskId: isString,
    status: isOneOf<EventOf<'agent_completed'>['status']>({
      completed: true,
      failed: true,
      stopped: true,
    }),
    summary: isString,
    outputFile: isString,
    totalTokens: optionalNumber,
    toolUses: optionalNumber,
    durationMs: optionalNumber,
    ...AGENT_TASK_OPTIONAL,
  },
  turn_state: {
    phase: isTurnPhase,
    revision: isNumber,
    backgroundTasks: arrayOf(
      (task) => parseSdkBackgroundTaskSummary(task) !== null,
    ),
    sessionCrons: arrayOf((cron) => parseSdkSessionCronSummary(cron) !== null),
    terminalReason: nullable(isTerminalReason),
    lastAssistantMessage: optional(nullable(isString)),
    error: optional(isAssistantMessageError),
    consumedClientMessageId: optionalString,
    retirementOnly: optionalBoolean,
  },
};

/** True when `eventType` names a {@link FlatStreamEventUnion} variant. */
export function isFlatEventType(eventType: string): eventType is EventType {
  return Object.prototype.hasOwnProperty.call(EVENT_FIELD_CHECKS, eventType);
}

/**
 * True when `raw` carries the base optional fields and every field of its
 * variant with the declared types. The base required fields (`id`,
 * `messageId`, `timestamp`, `eventType`) are checked by the caller.
 */
export function hasEventFields(eventType: EventType, raw: Raw): boolean {
  return (
    hasFields(raw, BASE_OPTIONAL) &&
    hasFields(raw, EVENT_FIELD_CHECKS[eventType]) &&
    (eventType !== 'agent_status' || hasAgentStatusVariant(raw))
  );
}
