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
  BACKGROUND_TASK_QUIET_TIMEOUT_MS,
  NoActivityWatchdog,
} from './no-activity-watchdog';
import { COMPACTION_MAX_DWELL_MS } from './compaction/compaction-state.types';
import type {
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
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

    wd.start();
    expect(wd.firedCause).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();

    // Just before the deadline: still silent, must not fire yet.
    jest.advanceTimersByTime(WINDOW - 1);
    expect(onTimeout).not.toHaveBeenCalled();

    // Deadline reached with zero activity → fire exactly once.
    jest.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(wd.firedCause).toBe('no-activity');

    // No further fires even if time keeps advancing.
    jest.advanceTimersByTime(WINDOW * 3);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire while kicked before each deadline (slow-but-active stream)', () => {
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

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

    wd.start();
    jest.advanceTimersByTime(WINDOW - 1);
    wd.stop();

    // The pending timer must be cleared: advancing past the old deadline fires
    // nothing.
    jest.advanceTimersByTime(WINDOW * 2);
    expect(onTimeout).not.toHaveBeenCalled();

    // Post-stop kick()/start() must not re-arm.
    wd.kick();
    wd.start();
    jest.advanceTimersByTime(WINDOW * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('stop() is idempotent and safe to call from multiple teardown paths', () => {
    const onTimeout = jest.fn();
    const wd = new NoActivityWatchdog(WINDOW, onTimeout);

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

      wd.start();
      wd.hold(); // canUseTool parked on an AskUserQuestion card

      jest.advanceTimersByTime(WINDOW * 10);
      expect(onTimeout).not.toHaveBeenCalled();
      expect(wd.isHeld).toBe(true);
    });

    it('release() starts a FULL fresh window — time spent waiting is not charged to the provider', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);

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
      wd.start();
      jest.advanceTimersByTime(WINDOW * 2);
      expect(onTimeout).not.toHaveBeenCalled();

      wd.release();
      jest.advanceTimersByTime(WINDOW);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe('compaction dwell bound (TASK_2026_597 A8)', () => {
    const signal = new AbortController().signal;

    async function fireHook(
      wd: NoActivityWatchdog,
      input: Record<string, unknown>,
    ): Promise<void> {
      const event = input['hook_event_name'] as HookEvent;
      const hooks = wd.lifecycleHooks();
      await hooks[event]?.[0]?.hooks?.[0]?.(
        input as unknown as HookInput,
        undefined,
        { signal },
      );
    }

    const preCompact = { hook_event_name: 'PreCompact', trigger: 'auto' };
    const postCompact = { hook_event_name: 'PostCompact', trigger: 'auto' };
    /** The coordinator controls the session, so the dwell bound applies. */
    const enforced = () => true;

    it('reports an open compaction as overdue, then stops re-arming at COMPACTION_MAX_DWELL_MS and times out', async () => {
      const onTimeout = jest.fn();
      const onOverdue = jest.fn();
      const wd = new NoActivityWatchdog(10_000, onTimeout, onOverdue, enforced);
      wd.start();

      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(COMPACTION_MAX_DWELL_MS - 1);
      expect(onOverdue).toHaveBeenCalledWith(['compaction']);
      const overdueCalls = onOverdue.mock.calls.length;
      expect(overdueCalls).toBe(29);
      expect(onTimeout).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout).toHaveBeenCalledWith('compaction-dwell');
      expect(wd.firedCause).toBe('compaction-dwell');
      expect(onOverdue).toHaveBeenCalledTimes(overdueCalls);

      // Fired once: no timer is left to re-arm.
      jest.advanceTimersByTime(COMPACTION_MAX_DWELL_MS);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onOverdue).toHaveBeenCalledTimes(overdueCalls);
    });

    it('with the production window, an open compaction is overdue at 180 s and times out at the 300 s bound', async () => {
      const onTimeout = jest.fn();
      const onOverdue = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout, onOverdue, enforced);
      wd.start();

      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(WINDOW);
      expect(onOverdue).toHaveBeenCalledWith(['compaction']);
      expect(onTimeout).not.toHaveBeenCalled();

      jest.advanceTimersByTime(COMPACTION_MAX_DWELL_MS - WINDOW - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onOverdue).toHaveBeenCalledTimes(1);
    });

    it('root activity during the compaction does not push the deadline past the dwell bound', async () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout, undefined, enforced);
      wd.start();

      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(COMPACTION_MAX_DWELL_MS - 10_000);
      wd.observe({
        type: 'system',
        subtype: 'status',
        status: 'compacting',
      } as unknown as SDKMessage);
      jest.advanceTimersByTime(10_000);

      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('a compaction closed before the bound restores the normal window, and the next one gets a fresh bound', async () => {
      const onTimeout = jest.fn();
      const onOverdue = jest.fn();
      const wd = new NoActivityWatchdog(10_000, onTimeout, onOverdue, enforced);
      wd.start();

      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(100_000);
      await fireHook(wd, postCompact);
      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(COMPACTION_MAX_DWELL_MS - 1);
      expect(onTimeout).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('a re-announced compaction keeps its original start', async () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(10_000, onTimeout, jest.fn(), enforced);
      wd.start();

      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(COMPACTION_MAX_DWELL_MS / 2);
      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(COMPACTION_MAX_DWELL_MS / 2);

      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('without enforcement (OBSERVE_ONLY) a 400 s compaction is reported overdue, never cut', async () => {
      const onTimeout = jest.fn();
      const onOverdue = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout, onOverdue);
      wd.start();

      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(400_000);
      expect(onOverdue).toHaveBeenCalledTimes(2);
      expect(onOverdue).toHaveBeenLastCalledWith(['compaction']);
      expect(onTimeout).not.toHaveBeenCalled();

      // Closing it restores the plain no-activity window.
      await fireHook(wd, postCompact);
      jest.advanceTimersByTime(WINDOW);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout).toHaveBeenCalledWith('no-activity');
    });

    it('an enforced compaction closed at 216 s (B8 measurement) completes', async () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn(), enforced);
      wd.start();

      await fireHook(wd, preCompact);
      jest.advanceTimersByTime(216_000);
      await fireHook(wd, postCompact);
      jest.advanceTimersByTime(WINDOW - 1);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('an outstanding root tool is still not capped', async () => {
      const onTimeout = jest.fn();
      const onOverdue = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout, onOverdue);
      wd.start();

      await fireHook(wd, {
        hook_event_name: 'PreToolUse',
        tool_use_id: 'tool-1',
        tool_name: 'Bash',
      });
      jest.advanceTimersByTime(WINDOW * 3);

      expect(onOverdue).toHaveBeenCalledTimes(3);
      expect(onOverdue).toHaveBeenLastCalledWith(['Bash']);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('holds an open root tool seen in the stream until its result arrives', () => {
      const onTimeout = jest.fn();
      const onOverdue = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout, onOverdue);
      wd.start();

      wd.observe({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tool-2', name: 'Bash', input: {} },
          ],
        },
      } as unknown as SDKMessage);
      jest.advanceTimersByTime(WINDOW * 3);
      expect(onOverdue).toHaveBeenCalledTimes(3);
      expect(onOverdue).toHaveBeenLastCalledWith(['Bash']);
      expect(onTimeout).not.toHaveBeenCalled();
      expect(wd.firedCause).toBeNull();

      wd.observe({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool-2', content: 'done' },
          ],
        },
      } as unknown as SDKMessage);
      jest.advanceTimersByTime(WINDOW);
      expect(onTimeout).toHaveBeenCalledWith('no-activity');
    });

    it('drops a stale tool from a late message when the next turn begins', () => {
      const onTimeout = jest.fn();
      const wd = new NoActivityWatchdog(WINDOW, onTimeout);
      wd.start();
      wd.observe({ type: 'result' } as unknown as SDKMessage);
      wd.hold();
      wd.observe({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'late', name: 'Bash', input: {} }],
        },
      } as unknown as SDKMessage);
      wd.beginTurn();
      wd.release();
      jest.advanceTimersByTime(WINDOW);
      expect(onTimeout).toHaveBeenCalledWith('no-activity');
    });

    describe('background SDK tasks', () => {
      async function startBackgroundTask(
        wd: NoActivityWatchdog,
        toolId: string,
        taskId: string,
        extra: Partial<SDKTaskStartedMessage> = {},
      ): Promise<void> {
        await fireHook(wd, {
          hook_event_name: 'PreToolUse',
          tool_use_id: toolId,
          tool_name: 'Task',
        });
        wd.observe(
          taskStarted(taskId, toolId, { is_backgrounded: false, ...extra }),
        );
        wd.observe(
          taskUpdated(taskId, { is_backgrounded: true }, extra.run_id),
        );
      }

      it('reproduces a root abort while a background task is active', async () => {
        const onTimeout = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout);
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a');
        await startBackgroundTask(wd, 'tool-b', 'task-b');
        jest.advanceTimersByTime(60_000);
        wd.observe(taskProgress('task-b'));
        jest.advanceTimersByTime(30_000);
        wd.observe(taskNotification('task-a', 'completed'));
        jest.advanceTimersByTime(30_000);
        wd.observe(assistantMessage('tool-b'));
        jest.advanceTimersByTime(30_000);
        wd.observe(taskUpdated('task-b', { status: 'running' }));
        jest.advanceTimersByTime(31_000);
        expect(onTimeout).not.toHaveBeenCalled();
      });

      it('progress, updates and correlated child messages keep a backgrounded root turn alive past 180 s', async () => {
        const onTimeout = jest.fn();
        const onOverdue = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, onOverdue);
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a');

        // 400 s of child activity only, each gap well inside the quiet bound.
        jest.advanceTimersByTime(150_000);
        wd.observe(taskProgress('task-a'));
        jest.advanceTimersByTime(150_000);
        wd.observe(taskUpdated('task-a', { status: 'running' }));
        jest.advanceTimersByTime(150_000);
        wd.observe(assistantMessage('tool-a'));
        jest.advanceTimersByTime(250_000);

        expect(onTimeout).not.toHaveBeenCalled();
        expect(onOverdue).toHaveBeenLastCalledWith(['background task']);
        expect(wd.firedCause).toBeNull();
      });

      it('a terminal notification restores a full normal window', async () => {
        const onTimeout = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn());
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a');
        jest.advanceTimersByTime(400_000);
        expect(onTimeout).not.toHaveBeenCalled();

        wd.observe(taskNotification('task-a', 'completed'));
        jest.advanceTimersByTime(WINDOW - 1);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
        expect(onTimeout).toHaveBeenCalledWith('no-activity');
      });

      it('a stale run_id does not close or refresh a newer run', async () => {
        const onTimeout = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn());
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a', { run_id: 'run-2' });

        jest.advanceTimersByTime(100_000);
        wd.observe(taskNotification('task-a', 'completed', 'run-1'));
        wd.observe(taskUpdated('task-a', { status: 'killed' }, 'run-1'));
        jest.advanceTimersByTime(300_000);
        // Still accounted: the stale terminal events did not close run-2.
        expect(onTimeout).not.toHaveBeenCalled();

        // Stale progress does not refresh it: the quiet bound counts from 0 s.
        wd.observe(taskProgress('task-a', 'run-1'));
        jest.advanceTimersByTime(199_999);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
      });

      it('a matching run_id notification closes the run', async () => {
        const onTimeout = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn());
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a', { run_id: 'run-2' });
        jest.advanceTimersByTime(100_000);
        wd.observe(taskNotification('task-a', 'failed', 'run-2'));
        jest.advanceTimersByTime(WINDOW);
        expect(onTimeout).toHaveBeenCalledWith('no-activity');
      });

      it('a dead background task times out exactly once with no-activity at 600 s quiet', async () => {
        const onTimeout = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn());
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a');

        jest.advanceTimersByTime(BACKGROUND_TASK_QUIET_TIMEOUT_MS - 1);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
        expect(onTimeout).toHaveBeenCalledWith('no-activity');
        expect(wd.firedCause).toBe('no-activity');

        jest.advanceTimersByTime(BACKGROUND_TASK_QUIET_TIMEOUT_MS * 2);
        expect(onTimeout).toHaveBeenCalledTimes(1);
      });

      it('unknown task and unrelated child traffic cannot keep a dead task alive', async () => {
        const onTimeout = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn());
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a');

        for (let i = 0; i < 5; i += 1) {
          jest.advanceTimersByTime(100_000);
          wd.observe(taskProgress('task-unknown'));
          wd.observe(taskUpdated('task-unknown', { status: 'running' }));
          wd.observe(assistantMessage('tool-unknown'));
        }
        jest.advanceTimersByTime(99_999);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
        expect(onTimeout).toHaveBeenCalledWith('no-activity');
      });

      it('ambient and skip_transcript tasks get no background extension', async () => {
        for (const extra of [{ ambient: true }, { skip_transcript: true }]) {
          const onTimeout = jest.fn();
          const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn());
          wd.start();
          await startBackgroundTask(wd, 'tool-a', 'task-a', extra);

          jest.advanceTimersByTime(100_000);
          wd.observe(taskProgress('task-a'));
          wd.observe(assistantMessage('tool-a'));
          // Today's rule: 180 s after the last root kick (the backgrounding).
          jest.advanceTimersByTime(WINDOW - 100_000);
          expect(onTimeout).toHaveBeenCalledTimes(1);
          expect(onTimeout).toHaveBeenCalledWith('no-activity');
          wd.stop();
        }
      });

      it('a root assistant message during a silent background task never times out earlier than 180 s after it', async () => {
        const onTimeout = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn());
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a');

        jest.advanceTimersByTime(590_000);
        wd.observe(assistantMessage(null));
        // The quiet bound passed at 600 s, but the root kick at 590 s owns
        // a full normal window.
        jest.advanceTimersByTime(WINDOW - 1);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
        expect(onTimeout).toHaveBeenCalledWith('no-activity');
      });

      it('a root tool during a silent background task keeps the normal uncapped tool rule', async () => {
        const onTimeout = jest.fn();
        const onOverdue = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, onOverdue);
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a');

        jest.advanceTimersByTime(500_000);
        await fireHook(wd, {
          hook_event_name: 'PreToolUse',
          tool_use_id: 'tool-bash',
          tool_name: 'Bash',
        });
        jest.advanceTimersByTime(WINDOW * 3);
        expect(onOverdue).toHaveBeenLastCalledWith(['Bash']);
        expect(onTimeout).not.toHaveBeenCalled();

        await fireHook(wd, {
          hook_event_name: 'PostToolUse',
          tool_use_id: 'tool-bash',
          tool_name: 'Bash',
        });
        jest.advanceTimersByTime(WINDOW - 1);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledWith('no-activity');
      });

      it('endTurn clears the records: a task that outlives its turn cannot affect the next turn', async () => {
        const onTimeout = jest.fn();
        const wd = new NoActivityWatchdog(WINDOW, onTimeout, jest.fn());
        wd.start();
        await startBackgroundTask(wd, 'tool-a', 'task-a');
        wd.observe(assistantMessage(null));
        wd.endTurn();
        // Idle between turns, as the executor holds the watchdog.
        wd.hold();
        jest.advanceTimersByTime(BACKGROUND_TASK_QUIET_TIMEOUT_MS * 2);
        wd.beginTurn();
        wd.release();
        expect(onTimeout).not.toHaveBeenCalled();

        // Root activity keeps the new turn alive past the old quiet bound.
        for (let i = 0; i < 4; i += 1) {
          jest.advanceTimersByTime(WINDOW - 1);
          wd.observe(assistantMessage(null));
        }
        expect(onTimeout).not.toHaveBeenCalled();

        // The old task's traffic no longer extends the deadline.
        jest.advanceTimersByTime(100_000);
        wd.observe(taskProgress('task-a'));
        wd.observe(assistantMessage('tool-a'));
        jest.advanceTimersByTime(WINDOW - 100_000 - 1);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
        expect(onTimeout).toHaveBeenCalledWith('no-activity');
      });
    });
  });
});
