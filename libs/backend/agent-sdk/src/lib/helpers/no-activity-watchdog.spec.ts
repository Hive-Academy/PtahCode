/**
 * NoActivityWatchdog specs (TASK_2026_190).
 *
 * Pins the stuck-session detection behavior that replaced the stderr-pattern
 * provider-error abort:
 *   - a fully silent window (no kick) fires onTimeout once — the "stuck stream
 *     aborts after the window" case;
 *   - repeated kicks before the deadline keep pushing it out — the
 *     "slow-but-active stream (long tool call / thinking) does NOT abort" case;
 *   - stop() disarms permanently and start()/kick() are no-ops afterwards, so
 *     the callback can never fire late or twice (leak / double-abort guard).
 *
 * Uses Jest fake timers so the tests are deterministic and instant — no real
 * 3-minute waits.
 */

import {
  API_RETRY_MARGIN_MS,
  API_RETRY_MAX_ACCOUNTED_MS,
  BACKGROUND_TASK_QUIET_TIMEOUT_MS,
  NoActivityWatchdog,
  ProviderTurnEndError,
} from './no-activity-watchdog';
import { COMPACTION_MAX_DWELL_MS } from './compaction/compaction-state.types';
import type {
  SDKAPIRetryMessage,
  HookEvent,
  HookInput,
  SDKAssistantMessage,
  SDKMessage,
  SDKTaskNotificationMessage,
  SDKTaskProgressMessage,
  SDKTaskStartedMessage,
  SDKTaskUpdatedMessage,
} from '../types/sdk-types/claude-sdk.types';

const WINDOW = 180_000;

/** Typed SDK message builders for the background task specs. */
const ENVELOPE = { uuid: '0-0-0-0-0', session_id: 's-1' } as const;

function taskStarted(
  taskId: string,
  toolUseId: string,
  extra: Partial<SDKTaskStartedMessage> = {},
): SDKTaskStartedMessage {
  return {
    type: 'system',
    subtype: 'task_started',
    task_id: taskId,
    tool_use_id: toolUseId,
    description: 'background task',
    ...ENVELOPE,
    ...extra,
  };
}

function taskUpdated(
  taskId: string,
  patch: SDKTaskUpdatedMessage['patch'],
  runId?: string,
): SDKTaskUpdatedMessage {
  return {
    type: 'system',
    subtype: 'task_updated',
    task_id: taskId,
    patch,
    ...(runId !== undefined && { run_id: runId }),
    ...ENVELOPE,
  };
}

function taskProgress(taskId: string, runId?: string): SDKTaskProgressMessage {
  return {
    type: 'system',
    subtype: 'task_progress',
    task_id: taskId,
    description: 'background task',
    usage: { total_tokens: 1, tool_uses: 1, duration_ms: 1 },
    ...(runId !== undefined && { run_id: runId }),
    ...ENVELOPE,
  };
}

function taskNotification(
  taskId: string,
  status: SDKTaskNotificationMessage['status'],
  runId?: string,
): SDKTaskNotificationMessage {
  return {
    type: 'system',
    subtype: 'task_notification',
    task_id: taskId,
    status,
    output_file: 'out.txt',
    summary: 'done',
    ...(runId !== undefined && { run_id: runId }),
    ...ENVELOPE,
  };
}

/** A text-only assistant message; `parentToolUseId` null means a root message. */
function assistantMessage(parentToolUseId: string | null): SDKAssistantMessage {
  const message: Partial<SDKAssistantMessage['message']> = { content: [] };
  return {
    type: 'assistant',
    message: message as SDKAssistantMessage['message'],
    parent_tool_use_id: parentToolUseId,
    ...ENVELOPE,
  };
}

describe('NoActivityWatchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('fires onTimeout once after a fully silent window (stuck stream)', () => {
    const onTimeout = jest.fn((cause: 'provider-no-response') => {
      wd.recordFailure(new ProviderTurnEndError(cause));
    });
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

    wd.beginTurn();

    wd.start();
    expect(wd.firedCause).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();

    // Just before the deadline: still silent, must not fire yet.
    jest.advanceTimersByTime(WINDOW - 1);
    expect(onTimeout).not.toHaveBeenCalled();

    // Deadline reached with zero activity → fire exactly once.
    jest.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(wd.firedCause).toBe('provider-no-response');
    wd.observe({ type: 'result' } as SDKMessage);
    wd.noteOutwardEvent();
    expect(wd.zeroOutwardEvents).toBe(true);

    // No further fires even if time keeps advancing.
    jest.advanceTimersByTime(WINDOW * 3);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('leaves an unaccepted timeout without a terminal failure', () => {
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);
    wd.beginTurn();
    wd.start();
    jest.advanceTimersByTime(2 * WINDOW);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(wd.firedCause).toBeNull();
    expect(wd.failure).toBeUndefined();
  });

  it('does NOT fire while kicked before each deadline (slow-but-active stream)', () => {
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

    wd.beginTurn();

    wd.start();

    // Simulate a long-but-alive turn: an event every (WINDOW - 1) ms for a
    // total elapsed time far larger than a single window. Each kick resets.
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(WINDOW - 1);
      wd.kick();
    }
    // Elapsed ~10 windows, but never a full silent window → never fired.
    expect(onTimeout).not.toHaveBeenCalled();

    // Now go silent for a full window → fires.
    jest.advanceTimersByTime(WINDOW);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('measures the window from the LAST kick, not from start()', () => {
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

    wd.beginTurn();

    wd.start();
    jest.advanceTimersByTime(WINDOW - 10);
    wd.kick(); // reset — a fresh full window is now required

    jest.advanceTimersByTime(WINDOW - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('stop() disarms permanently — no fire after stop, kick/start are no-ops', () => {
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

    wd.beginTurn();

    wd.start();
    jest.advanceTimersByTime(WINDOW - 1);
    wd.stop();

    // The pending timer must be cleared: advancing past the old deadline fires
    // nothing.
    jest.advanceTimersByTime(WINDOW * 2);
    expect(onTimeout).not.toHaveBeenCalled();

    // Post-stop kick()/start() must not re-arm.
    wd.kick();
    wd.beginTurn();
    wd.start();
    jest.advanceTimersByTime(WINDOW * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('stop() is idempotent and safe to call from multiple teardown paths', () => {
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

    wd.beginTurn();

    wd.start();
    expect(() => {
      wd.stop();
      wd.stop();
      wd.stop();
    }).not.toThrow();
    jest.advanceTimersByTime(WINDOW * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('start() before any kick still arms the timer', () => {
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

    // No kick at all — the pre-first-message stuck case (provider never
    // forwards anything).
    wd.beginTurn();
    wd.start();
    jest.advanceTimersByTime(WINDOW);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  // ---- hold / release (TASK_2026_317) --------------------------------------
  //
  // A turn parked on `canUseTool` emits zero SDK messages, so without a hold
  // the watchdog reads a human reading a prompt as a wedged provider. These
  // pin the New Project regression: an AskUserQuestion card the UI advertises
  // as untimed must survive far longer than one window.

  describe('hold/release', () => {
    it('does NOT fire while held, however long the user takes', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);

      wd.beginTurn();

      wd.start();
      wd.hold(); // canUseTool parked on an AskUserQuestion card

      jest.advanceTimersByTime(WINDOW * 10);
      expect(onTimeout).not.toHaveBeenCalled();
      expect(wd.isHeld).toBe(true);
    });

    it('release() starts a FULL fresh window — time spent waiting is not charged to the provider', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);

      wd.beginTurn();

      wd.start();
      jest.advanceTimersByTime(WINDOW - 1); // nearly out of window already
      wd.hold();
      jest.advanceTimersByTime(WINDOW * 4); // user deliberates
      wd.release();
      expect(wd.isHeld).toBe(false);

      jest.advanceTimersByTime(WINDOW - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('is reference-counted — concurrent tool calls only unblock on the last release', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);

      wd.beginTurn();

      wd.start();
      wd.hold();
      wd.hold();
      wd.release();

      jest.advanceTimersByTime(WINDOW * 3);
      expect(onTimeout).not.toHaveBeenCalled();

      wd.release();
      jest.advanceTimersByTime(WINDOW);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('kick() during a hold does not re-arm the window', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);

      wd.beginTurn();

      wd.start();
      wd.hold();
      wd.kick();
      jest.advanceTimersByTime(WINDOW * 2);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('an unbalanced release() never arms a watchdog that was never started', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);

      // Teardown paths may release without a matching hold; that must not
      // resurrect a timer on a watchdog the transformer never started.
      wd.release();
      wd.release();
      jest.advanceTimersByTime(WINDOW * 2);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('hold()/release() are inert after stop()', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);

      wd.beginTurn();

      wd.start();
      wd.stop();
      wd.hold();
      wd.release();
      jest.advanceTimersByTime(WINDOW * 2);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('a hold taken before start() defers arming until start(), then honours it', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);

      wd.hold();
      wd.beginTurn();
      wd.start();
      jest.advanceTimersByTime(WINDOW * 2);
      expect(onTimeout).not.toHaveBeenCalled();

      wd.release();
      jest.advanceTimersByTime(WINDOW);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });
  });

  async function fireHook(wd: NoActivityWatchdog, input: Record<string, unknown>) {
    const event = input['hook_event_name'] as HookEvent;
    await wd.lifecycleHooks()[event]?.[0]?.hooks[0](
      input as unknown as HookInput,
      undefined,
      { signal: new AbortController().signal },
    );
  }

  function snapshot(...tasks: { task_id: string; run_id?: string; task_type: string; ambient?: boolean; parent_task_id?: string }[]): SDKMessage {
    return {
      ...ENVELOPE,
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: tasks.map((task) => ({ ...task, description: task.task_type })),
    };
  }

  describe('zero-event retry evidence', () => {
    const toolMessage = (content: Extract<SDKMessage, { type: 'user' }>['message']['content']): SDKMessage => ({
      ...ENVELOPE,
      type: 'user',
      parent_tool_use_id: 'nested',
      message: { role: 'user', content },
    });

    const workMessages: Array<[string, SDKMessage]> = [
      ['nested assistant', assistantMessage('nested')],
      ['nested partial', {
        ...ENVELOPE,
        type: 'stream_event',
        parent_tool_use_id: 'nested',
        event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'output' } },
      }],
      ['nested tool use', toolMessage([{ type: 'tool_use', id: 'tool', name: 'Bash', input: {} }])],
      ['nested tool result', toolMessage([{ type: 'tool_result', tool_use_id: 'tool' }])],
      ['tool progress', {
        ...ENVELOPE, type: 'tool_progress', tool_use_id: 'tool', tool_name: 'Bash',
        parent_tool_use_id: null, elapsed_time_seconds: 1,
      }],
      ['tool summary', {
        ...ENVELOPE, type: 'tool_use_summary', summary: 'done', preceding_tool_use_ids: ['tool'],
      }],
      ['thinking progress', {
        ...ENVELOPE, type: 'system', subtype: 'thinking_tokens',
        estimated_tokens: 2, estimated_tokens_delta: 1,
      }],
      ['empty task snapshot', snapshot()],
      ['compaction start', {
        ...ENVELOPE, type: 'system', subtype: 'status', status: 'compacting',
      }],
      ['compaction result', {
        ...ENVELOPE, type: 'system', subtype: 'status', status: null, compact_result: 'failed',
      }],
      ['compaction boundary', {
        ...ENVELOPE, type: 'system', subtype: 'compact_boundary',
        compact_metadata: { trigger: 'auto', pre_tokens: 100 },
      }],
      ['PreToolUse frame', {
        ...ENVELOPE, type: 'system', subtype: 'hook_started',
        hook_id: 'hook', hook_name: 'PreToolUse:Bash', hook_event: 'PreToolUse',
      }],
      ['PostToolUse frame', {
        ...ENVELOPE, type: 'system', subtype: 'hook_progress',
        hook_id: 'hook', hook_name: 'PostToolUse:Bash', hook_event: 'PostToolUse',
        stdout: '', stderr: '', output: '',
      }],
      ['PostToolUseFailure frame', {
        ...ENVELOPE, type: 'system', subtype: 'hook_response',
        hook_id: 'hook', hook_name: 'PostToolUseFailure:Bash', hook_event: 'PostToolUseFailure',
        stdout: '', stderr: '', output: '', outcome: 'success',
      }],
    ];

    it.each(workMessages)('counts raw %s without outward events', (_label, message) => {
      const wd = new NoActivityWatchdog(WINDOW, jest.fn());
      expect(wd.zeroOutwardEvents).toBe(true);
      wd.observe(message);
      wd.endTurn();
      wd.beginTurn();
      wd.stop();
      expect(wd.zeroOutwardEvents).toBe(false);
    });

    it.each(['PreToolUse', 'PostToolUse', 'PostToolUseFailure'] as const)(
      'counts nested %s callbacks',
      async (hook_event_name) => {
        const wd = new NoActivityWatchdog(WINDOW, jest.fn());
        await fireHook(wd, { hook_event_name, agent_id: 'child', tool_use_id: 'tool', tool_name: 'Bash' });
        expect(wd.zeroOutwardEvents).toBe(false);
      },
    );

    it('allows a zero-event retry after a prompt echo and an idle status frame', () => {
      const wd = new NoActivityWatchdog(WINDOW, jest.fn());
      wd.observe(toolMessage('prompt echo'));
      wd.observe({
        ...ENVELOPE, type: 'system', subtype: 'status', status: null,
      });
      expect(wd.zeroOutwardEvents).toBe(true);
      wd.noteOutwardEvent();
      expect(wd.zeroOutwardEvents).toBe(false);
    });
  });

  it.each([
    assistantMessage(null),
    taskStarted('task', 'tool'),
    taskUpdated('task', { status: 'running' }),
    taskProgress('task'),
    taskNotification('task', 'completed'),
    snapshot({ task_id: 'task', run_id: 'run-1', task_type: 'monitor', ambient: true }),
    { type: 'result' },
  ] as SDKMessage[])('disqualifies a retry on raw $type $subtype', (message) => {
    const wd = new NoActivityWatchdog(WINDOW, jest.fn());
    expect(wd.zeroOutwardEvents).toBe(true);
    wd.observe(message);
    expect(wd.zeroOutwardEvents).toBe(false);
  });

  it.each(['PreToolUse', 'PostToolUse', 'PostToolUseFailure'])(
    'disqualifies a retry on a root %s hook without a rendered event',
    async (hook_event_name) => {
      const wd = new NoActivityWatchdog(WINDOW, jest.fn());
      expect(wd.zeroOutwardEvents).toBe(true);
      await fireHook(wd, { hook_event_name, tool_use_id: 'tool', tool_name: 'Bash' });
      expect(wd.zeroOutwardEvents).toBe(false);
    },
  );

  it('disqualifies a retry on a raw tool result but allows a plain user echo', () => {
    const wd = new NoActivityWatchdog(WINDOW, jest.fn());
    wd.observe({
      ...ENVELOPE,
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: 'prompt' },
    });
    expect(wd.zeroOutwardEvents).toBe(true);
    wd.observe({
      ...ENVELOPE,
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool', content: 'done' }],
      },
    });
    expect(wd.zeroOutwardEvents).toBe(false);
  });

  it('only starts an idle provider turn on reliable SDK evidence or host input', async () => {
    const timeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout);
    wd.start();
    wd.observe(taskStarted('task-a', 'tool-a'));
    wd.observe(taskUpdated('task-a', { status: 'completed' }));
    wd.observe(assistantMessage(null)); // May be a buffered complete message.
    jest.advanceTimersByTime(WINDOW * 2);
    expect(timeout).not.toHaveBeenCalled();

    await fireHook(wd, { hook_event_name: 'PreToolUse', agent_id: 'child', tool_use_id: 'child-tool' });
    jest.advanceTimersByTime(WINDOW);
    expect(timeout).not.toHaveBeenCalled();

    await fireHook(wd, { hook_event_name: 'PreToolUse', tool_use_id: 'root-tool', tool_name: 'Bash' });
    jest.advanceTimersByTime(WINDOW * 2);
    expect(timeout).not.toHaveBeenCalled();
    await fireHook(wd, { hook_event_name: 'PostToolUse', tool_use_id: 'root-tool' });
    jest.advanceTimersByTime(WINDOW);
    expect(timeout).toHaveBeenCalledWith('provider-no-response');
  });

  it('opens a provider turn on a root partial message start', () => {
    const timeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout);
    wd.start();
    wd.observe({
      ...ENVELOPE, type: 'stream_event', parent_tool_use_id: null,
      event: { type: 'message_start', message: assistantMessage(null).message },
    } as SDKMessage);
    jest.advanceTimersByTime(WINDOW);
    expect(timeout).toHaveBeenCalledWith('provider-no-response');
  });

  it('reports compaction overdue at its dwell threshold and backs off without ending', async () => {
    const timeout = jest.fn();
    const overdue = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout, overdue);
    wd.beginTurn();
    wd.start();
    await fireHook(wd, { hook_event_name: 'PreCompact' });
    expect(wd.zeroOutwardEvents).toBe(false);
    jest.advanceTimersByTime(COMPACTION_MAX_DWELL_MS - 1);
    await fireHook(wd, { hook_event_name: 'PreCompact' });
    expect(overdue).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(overdue).toHaveBeenCalledWith(['compaction']);
    jest.advanceTimersByTime(2 * COMPACTION_MAX_DWELL_MS - 1);
    expect(overdue).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(overdue).toHaveBeenCalledTimes(2);
    expect(timeout).not.toHaveBeenCalled();

    await fireHook(wd, { hook_event_name: 'PostCompact' });
    jest.advanceTimersByTime(WINDOW - 1);
    expect(timeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(timeout).toHaveBeenCalledWith('provider-no-response');
  });

  it('keeps a root UserPromptSubmit hook open for two watchdog windows', () => {
    const timeout = jest.fn();
    const overdue = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout, overdue);
    const hook = {
      ...ENVELOPE, type: 'system', hook_id: 'submit-hook',
      hook_name: 'UserPromptSubmit:memory', hook_event: 'UserPromptSubmit',
    } as const;
    wd.beginTurn();
    wd.start();
    wd.observe({ ...hook, subtype: 'hook_started' } as const);
    expect(wd.zeroOutwardEvents).toBe(false);
    jest.advanceTimersByTime(WINDOW - 1);
    wd.observe({
      ...hook, subtype: 'hook_progress', stdout: '', stderr: '', output: '',
    } as const);
    jest.advanceTimersByTime(1);
    expect(overdue).not.toHaveBeenCalled();
    jest.advanceTimersByTime(WINDOW - 1);
    expect(overdue).toHaveBeenCalledWith(['UserPromptSubmit hook']);
    wd.observe({
      ...hook, subtype: 'hook_response', hook_id: 'different-hook',
      stdout: '', stderr: '', output: '', outcome: 'success',
    } as const);
    jest.advanceTimersByTime(1);
    expect(timeout).not.toHaveBeenCalled();
    expect(overdue).toHaveBeenCalledTimes(1);
    wd.observe({
      ...hook, subtype: 'hook_response',
      stdout: '', stderr: '', output: '', outcome: 'success',
    } as const);
    jest.advanceTimersByTime(WINDOW - 1);
    expect(timeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(timeout).toHaveBeenCalledWith('provider-no-response');
  });

  it('keeps a root tool seen in the stream until its matching result arrives', () => {
    const timeout = jest.fn();
    const overdue = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout, overdue);
    wd.beginTurn();
    wd.start();
    wd.observe({
      ...assistantMessage(null),
      message: {
        content: [{ type: 'tool_use', id: 'wait', name: 'Bash', input: {} }],
      },
    } as SDKAssistantMessage);
    jest.advanceTimersByTime(WINDOW * 3);
    expect(overdue).toHaveBeenCalledTimes(3);
    expect(overdue).toHaveBeenLastCalledWith(['Bash']);
    expect(timeout).not.toHaveBeenCalled();

    wd.observe({
      ...ENVELOPE,
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'wait', content: 'done' }],
      },
    });
    jest.advanceTimersByTime(WINDOW - 1);
    expect(timeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(timeout).toHaveBeenCalledWith('provider-no-response');
  });

  it('accounts for Monitor, ambient and background shell tasks before root tool correlation', () => {
    const timeout = jest.fn();
    const overdue = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout, overdue);
    wd.beginTurn();
    wd.start();
    wd.observe(snapshot(
      { task_id: 'monitor', run_id: 'run-1', task_type: 'monitor' },
      { task_id: 'ambient', run_id: 'run-1', task_type: 'monitor', ambient: true, parent_task_id: 'other' },
      { task_id: 'shell', run_id: 'run-1', task_type: 'local_bash' },
    ));
    // The lifecycle event can arrive before the assistant tool-use block.
    wd.observe(taskStarted('monitor', 'root-monitor', { run_id: 'run-1' }));
    wd.observe({
      ...assistantMessage(null),
      message: { content: [{ type: 'tool_use', id: 'root-monitor', name: 'Monitor', input: {} }] },
    } as SDKAssistantMessage);
    jest.advanceTimersByTime(WINDOW);
    expect(overdue).not.toHaveBeenCalled();
    jest.advanceTimersByTime(BACKGROUND_TASK_QUIET_TIMEOUT_MS - WINDOW);
    expect(overdue).toHaveBeenCalledWith(['3 open tasks (local_bash, monitor)']);
    jest.advanceTimersByTime(BACKGROUND_TASK_QUIET_TIMEOUT_MS);
    expect(overdue).toHaveBeenCalledTimes(1);
    expect(timeout).not.toHaveBeenCalled();

    wd.observe(taskNotification('monitor', 'completed', 'run-1'));
    wd.observe(taskUpdated('shell', { status: 'completed' }, 'run-1'));
    jest.advanceTimersByTime(WINDOW * 2);
    expect(timeout).not.toHaveBeenCalled(); // The remaining task is ambient.
    wd.observe(snapshot());
    jest.advanceTimersByTime(WINDOW - 1);
    expect(timeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(timeout).toHaveBeenCalledWith('provider-no-response');
  });

  it('keeps reporting an ambient Monitor overdue with increasing intervals', () => {
    const timeout = jest.fn();
    const overdue = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout, overdue);
    wd.beginTurn();
    wd.start();
    wd.observe(snapshot({ task_id: 'ambient', task_type: 'monitor', ambient: true }));

    for (const [index, multiplier] of [1, 2, 4, 6].entries()) {
      jest.advanceTimersByTime(multiplier * BACKGROUND_TASK_QUIET_TIMEOUT_MS - 1);
      expect(overdue).toHaveBeenCalledTimes(index);
      jest.advanceTimersByTime(1);
      expect(overdue).toHaveBeenCalledTimes(index + 1);
      expect(overdue).toHaveBeenLastCalledWith(['1 open task (monitor)']);
      expect(timeout).not.toHaveBeenCalled();
    }
  });

  it('ignores snapshots of an unversioned finished task until another start', () => {
    const timeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout);
    const frame = snapshot({ task_id: 'monitor', task_type: 'monitor' });
    wd.beginTurn();
    wd.start();
    wd.observe(frame);
    wd.observe(taskNotification('monitor', 'completed'));
    wd.observe(frame);
    jest.advanceTimersByTime(WINDOW - 1);
    expect(timeout).not.toHaveBeenCalled();
    wd.observe(taskStarted('monitor', 'new-tool', { task_type: 'monitor' }));
    wd.observe(frame);
    jest.advanceTimersByTime(WINDOW);
    expect(timeout).not.toHaveBeenCalled();
    wd.observe(taskNotification('monitor', 'completed'));
    wd.observe(frame);
    jest.advanceTimersByTime(WINDOW);
    expect(timeout).toHaveBeenCalledWith('provider-no-response');
  });

  it('preserves tasks through idle and ignores stale runs and stopped query generations', async () => {
    const oldTimeout = jest.fn();
    const old = new NoActivityWatchdog(WINDOW, oldTimeout);
    old.beginTurn();
    old.start();
    old.stop();
    await fireHook(old, { hook_event_name: 'PreToolUse', tool_use_id: 'old', tool_name: 'Bash' });

    const timeout = jest.fn();
    const overdue = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, timeout, overdue);
    wd.beginTurn();
    wd.start();
    wd.observe(snapshot({ task_id: 'watch', run_id: 'run-2', task_type: 'monitor' }));
    await fireHook(wd, { hook_event_name: 'PreToolUse', tool_use_id: 'root-tool', tool_name: 'Bash' });
    wd.endTurn();
    wd.observe(taskProgress('watch', 'run-2'));
    jest.advanceTimersByTime(BACKGROUND_TASK_QUIET_TIMEOUT_MS);
    expect(overdue).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();

    wd.beginTurn();
    wd.observe(snapshot({ task_id: 'watch', run_id: 'run-1', task_type: 'monitor' }));
    wd.observe(taskUpdated('watch', { status: 'completed' }, 'run-1'));
    wd.observe(taskNotification('watch', 'completed', 'run-1'));
    wd.observe(taskProgress('watch', 'run-1'));
    jest.advanceTimersByTime(WINDOW * 2);
    expect(overdue.mock.calls).toEqual([[['1 open task (monitor)']]]);
    expect(timeout).not.toHaveBeenCalled();
    expect(oldTimeout).not.toHaveBeenCalled();

    wd.observe(taskNotification('watch', 'completed', 'run-2'));
    wd.observe(snapshot({ task_id: 'watch', run_id: 'run-1', task_type: 'monitor' }));
    jest.advanceTimersByTime(WINDOW);
    expect(timeout).toHaveBeenCalledWith('provider-no-response');
  });

  describe('SDK api_retry (TASK_2026_2288 A)', () => {
    function apiRetry(
      extra: Partial<SDKAPIRetryMessage> = {},
    ): SDKAPIRetryMessage {
      return {
        type: 'system',
        subtype: 'api_retry',
        attempt: 1,
        max_retries: 1,
        retry_delay_ms: 0,
        error_status: null,
        error: 'unknown',
        ...ENVELOPE,
        ...extra,
      };
    }

    it('accounts the first-byte wait of an announced retry (incident 2026-11-20)', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);
      wd.beginTurn();
      wd.start();

      // The SDK first wait ends before the window and announces one retry
      // that waits up to 599 s for its first byte.
      jest.advanceTimersByTime(150_000);
      wd.observe(
        apiRetry({ no_response: { waited_ms: 150_000, retry_wait_ms: 599_000 } }),
      );

      // A plain window after the retry must not stop the SDK recovery.
      jest.advanceTimersByTime(WINDOW);
      expect(onTimeout).not.toHaveBeenCalled();

      jest.advanceTimersByTime(599_000 + API_RETRY_MARGIN_MS - WINDOW - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledWith('provider-no-response');
    });

    it('accounts the announced retry delay', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);
      wd.beginTurn();
      wd.start();
      wd.observe(apiRetry({ retry_delay_ms: 400_000 }));

      jest.advanceTimersByTime(400_000 + API_RETRY_MARGIN_MS - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('never arms less than the normal window for a short retry', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);
      wd.beginTurn();
      wd.start();
      wd.observe(apiRetry({ retry_delay_ms: 2_000 }));

      jest.advanceTimersByTime(WINDOW - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('keeps the retry window through a hold and an unrelated kick', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);
      wd.beginTurn();
      wd.start();
      wd.observe(apiRetry({ retry_delay_ms: 400_000 }));

      // A permission hold during the retry, then its release.
      jest.advanceTimersByTime(10_000);
      wd.hold();
      jest.advanceTimersByTime(10_000);
      wd.release();
      // An unrelated kick (a keepalive task end) re-arms to the retry end too.
      jest.advanceTimersByTime(10_000);
      wd.kick();

      jest.advanceTimersByTime(400_000 + API_RETRY_MARGIN_MS - 30_000 - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledWith('provider-no-response');
    });

    it('returns to the normal window after root output of the retry', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);
      wd.beginTurn();
      wd.start();
      wd.observe(apiRetry({ retry_delay_ms: 400_000 }));
      jest.advanceTimersByTime(1_000);
      wd.observe({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'back' }] },
        parent_tool_use_id: null,
        ...ENVELOPE,
      } as unknown as SDKMessage);

      jest.advanceTimersByTime(WINDOW - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('caps the window one retry can account for and ignores bad values', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);
      wd.beginTurn();
      wd.start();
      wd.observe(
        apiRetry({
          retry_delay_ms: Number.POSITIVE_INFINITY,
          no_response: { waited_ms: 1, retry_wait_ms: 10 * API_RETRY_MAX_ACCOUNTED_MS },
        }),
      );

      jest.advanceTimersByTime(API_RETRY_MAX_ACCOUNTED_MS - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });
  });
});
