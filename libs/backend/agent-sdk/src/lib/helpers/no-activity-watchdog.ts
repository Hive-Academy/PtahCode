import type {
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  SDKMessage,
} from '../types/sdk-types/claude-sdk.types';
import { COMPACTION_MAX_DWELL_MS } from './compaction/compaction-state.types';

/**
 * Query-local root activity accounting. Silence is not evidence of failure while
 * a known tool is running: report uncertainty, never impose a tool runtime
 * limit. A compaction is accounted the same way. Where the compaction
 * coordinator controls the session (`enforceCompactionDwell` returns true) it
 * is accounted for at most {@link COMPACTION_MAX_DWELL_MS} from when it opened;
 * past that bound the watchdog stops re-arming and times out with cause
 * `'compaction-dwell'` (TASK_2026_597 A8), the same bound at which the
 * coordinator gives up on the compaction. An observe-only session keeps the
 * TASK_2026_411 B8 behaviour: an open compaction is reported overdue, never cut.
 * Otherwise only unaccounted root silence invokes the recovery callback.
 * Idle/permission holds remain reference counted; operation ownership is keyed
 * and idempotent instead. Child registration never owns a parent hold.
 *
 * A backgrounded root-owned SDK task (`task_id`) releases its root tool but is
 * still accounted: its own progress, updates and child messages refresh it,
 * and root silence only times out once every such task has also been quiet
 * for {@link BACKGROUND_TASK_QUIET_TIMEOUT_MS}. Unknown, ambient and stale-run
 * task traffic never extends the deadline.
 */
export class NoActivityWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fired = false;
  /**
   * Why the watchdog fired, or `null` while it has not. The SDK rethrows the
   * abort as a generic "Operation aborted" error that loses the abort reason,
   * so the stream reads this to report the true end cause (not `user-stop`).
   */
  private timeoutCause: WatchdogTimeoutCause | null = null;
  private stopped = false;
  private started = false;
  private holds = 0;
  private turnOpen = true;

  get firedCause(): WatchdogTimeoutCause | null {
    return this.timeoutCause;
  }

  beginTurn(): void {
    if (this.stopped || this.fired) return;
    // A real turn boundary: a tool from a late message of the previous turn
    // must not hold this turn's deadline forever.
    this.tools.clear();
    this.tasks.clear();
    this.turnOpen = true;
    this.kick();
  }
  private readonly tools = new Map<string, string>();
  /** Monotonic time the open compaction began; null while none is open. */
  private compactingSinceMs: number | null = null;
  /** Root-owned SDK tasks by `task_id`; cleared at every turn boundary. */
  private readonly tasks = new Map<string, TaskRecord>();

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: (cause: WatchdogTimeoutCause) => void,
    private readonly onOverdue: (operations: readonly string[]) => void = () =>
      undefined,
    /** Read at each arm: whether the compaction dwell bound applies now. */
    private readonly enforceCompactionDwell: () => boolean = () => false,
  ) {}

  start(): void {
    if (this.stopped || this.fired) return;
    this.started = true;
    this.arm();
  }

  kick(): void {
    if (this.stopped || this.fired || !this.started) return;
    this.arm();
  }

  hold(): void {
    if (this.stopped || this.fired) return;
    this.holds += 1;
    this.clear();
  }

  release(): void {
    if (this.holds === 0) return;
    this.holds -= 1;
    this.kick();
  }

  get isHeld(): boolean {
    return this.holds > 0;
  }

  /** Root result/interrupt is authoritative even when a terminal hook is lost. */
  endTurn(): void {
    this.turnOpen = false;
    this.tools.clear();
    this.tasks.clear();
    this.setCompacting(false);
    this.kick();
  }

  stop(): void {
    this.stopped = true;
    this.holds = 0;
    this.endTurn();
    this.clear();
  }

  /** SDK hooks are scoped to this query, never a mutable session-id lookup. */
  lifecycleHooks(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const events: HookEvent[] = [
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PreCompact',
      'PostCompact',
      'Stop',
      'StopFailure',
      'SessionEnd',
    ];
    const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
    for (const event of events) {
      hooks[event] = [
        {
          hooks: [
            async (input, _toolId, options) => {
              if (!options.signal.aborted) this.observeHook(input);
              return { continue: true };
            },
          ],
        },
      ];
    }
    return hooks;
  }

  private observeHook(input: HookInput): void {
    // SDK BaseHookInput: agent_id, not agent_type, identifies nested hooks.
    if (this.stopped || this.fired || !this.turnOpen || input.agent_id) return;
    switch (input.hook_event_name) {
      case 'PreToolUse':
        if (input.tool_use_id)
          this.tools.set(input.tool_use_id, input.tool_name);
        break;
      case 'PostToolUse':
      case 'PostToolUseFailure':
        this.tools.delete(input.tool_use_id);
        break;
      case 'PreCompact':
        this.setCompacting(true);
        break;
      case 'PostCompact':
        this.setCompacting(false);
        break;
      case 'Stop':
      case 'StopFailure':
        // Do not release the pump or publish idle from a hook: final assistant
        // messages may still be buffered. The result owns the turn boundary.
        this.endTurn();
        break;
      case 'SessionEnd':
        this.stop();
        break;
    }
    this.kick();
  }

  /**
   * Only root activity extends the root deadline. Child chatter only refreshes
   * a known background task that owns its parent tool.
   */
  observe(message: SDKMessage): void {
    if (this.stopped || this.fired) return;
    if ('parent_tool_use_id' in message && message.parent_tool_use_id) {
      const parentToolId = message.parent_tool_use_id;
      for (const record of this.tasks.values()) {
        if (record.toolUseId === parentToolId) this.touch(record);
      }
      return;
    }
    if (
      message.type === 'tool_progress' &&
      !this.tools.has(message.tool_use_id)
    )
      return;
    if (message.type === 'system' && this.observeSystem(message)) return;
    this.observeToolUses(message);
    this.observeToolResults(message);
    if (message.type === 'result') this.endTurn();
    this.kick();
  }

  /**
   * Task chatter extends the deadline only when it releases a root tool or
   * refreshes a known background task.
   */
  private observeSystem(
    message: Extract<SDKMessage, { type: 'system' }>,
  ): boolean {
    if (message.subtype === 'task_started') {
      this.observeTaskStarted(message);
      return true;
    }
    if (message.subtype === 'task_updated') {
      this.observeTaskUpdate(message);
      return true;
    }
    if (message.subtype === 'task_notification') {
      const record = this.tasks.get(message.task_id);
      if (record && !sameRun(record, message.run_id)) return true;
      const toolId = message.tool_use_id ?? record?.toolUseId;
      const released = toolId !== undefined && this.tools.delete(toolId);
      this.tasks.delete(message.task_id);
      // A terminal notification restores a full normal window.
      if (released || (record?.background && record.keepsAlive)) this.kick();
      return true;
    }
    if (message.subtype === 'task_progress') {
      const record = this.tasks.get(message.task_id);
      if (record && sameRun(record, message.run_id)) this.touch(record);
      return true;
    }
    this.observeCompaction(message);
    return false;
  }

  private observeCompaction(
    message: Extract<SDKMessage, { type: 'system' }>,
  ): void {
    if (message.subtype === 'status') {
      if (message.status === 'compacting') this.setCompacting(true);
      // null alone is not proof of completion; compact_result is explicit.
      if (message.compact_result) this.setCompacting(false);
    }
    if (message.subtype === 'compact_boundary') this.setCompacting(false);
  }

  /**
   * A re-announced compaction keeps its original start, so the dwell bound
   * covers the whole open time (PreCompact, `status:'compacting'`, retries).
   */
  private setCompacting(open: boolean): void {
    if (!open) {
      this.compactingSinceMs = null;
    } else if (this.compactingSinceMs === null) {
      this.compactingSinceMs = performance.now();
    }
  }

  /**
   * Milliseconds left before the open compaction exceeds its dwell bound; null
   * while none is open or the bound does not apply to this session.
   */
  private compactionDwellRemainingMs(): number | null {
    if (this.compactingSinceMs === null || !this.enforceCompactionDwell()) {
      return null;
    }
    return this.compactingSinceMs + COMPACTION_MAX_DWELL_MS - performance.now();
  }

  /** Only a task started by an open root tool is recorded. */
  private observeTaskStarted(
    message: Extract<SDKMessage, { subtype: 'task_started' }>,
  ): void {
    const toolUseId = message.tool_use_id;
    if (!toolUseId || !this.tools.has(toolUseId)) return;
    this.tasks.set(message.task_id, {
      toolUseId,
      runId: message.run_id,
      keepsAlive:
        !message.parent_task_id && !message.ambient && !message.skip_transcript,
      background: message.is_backgrounded === true,
      lastActivityMs: performance.now(),
    });
  }

  private observeTaskUpdate(
    message: Extract<SDKMessage, { subtype: 'task_updated' }>,
  ): void {
    const record = this.tasks.get(message.task_id);
    if (!record || !sameRun(record, message.run_id)) return;
    const terminal = ['completed', 'failed', 'killed'].includes(
      message.patch.status ?? '',
    );
    if (!terminal && !message.patch.is_backgrounded) {
      this.touch(record);
      return;
    }
    const wasWaiting = this.tools.delete(record.toolUseId);
    if (terminal) {
      this.tasks.delete(message.task_id);
      if (wasWaiting || (record.background && record.keepsAlive)) this.kick();
      return;
    }
    // Backgrounded: the root tool is released but the task stays accounted.
    record.background = true;
    if (wasWaiting) this.kick();
    this.touch(record);
  }

  /** Refreshes a live background task's quiet window and the root deadline. */
  private touch(record: TaskRecord): void {
    if (!record.background || !record.keepsAlive) return;
    record.lastActivityMs = performance.now();
    this.kick();
  }

  /**
   * Milliseconds left before every live background task has been quiet for
   * {@link BACKGROUND_TASK_QUIET_TIMEOUT_MS}; null while none is live.
   */
  private backgroundQuietRemainingMs(): number | null {
    let latestMs: number | null = null;
    for (const record of this.tasks.values()) {
      if (record.background && record.keepsAlive) {
        latestMs = Math.max(latestMs ?? 0, record.lastActivityMs);
      }
    }
    return latestMs === null
      ? null
      : latestMs + BACKGROUND_TASK_QUIET_TIMEOUT_MS - performance.now();
  }

  /**
   * A root `tool_use` in the stream opens a tool call until its result. The
   * PreToolUse hook is only an early signal: when it is missed, a long tool
   * call (for example a Bash `npm run verify` that waits in the verify lock)
   * must still hold the watchdog instead of reading as provider silence.
   *
   * A root assistant message proves that a turn is open. It reopens the turn
   * even when `beginTurn` was skipped (for example after a steer interrupt
   * whose replacement message started while the turn still counted as in
   * flight), so the tool hooks of that turn are observed again.
   */
  private observeToolUses(message: SDKMessage): void {
    if (message.type !== 'assistant') return;
    this.turnOpen = true;
    const content: unknown = message.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (block.type === 'tool_use' && typeof block.id === 'string') {
        this.tools.set(
          block.id,
          typeof block.name === 'string' ? block.name : 'tool',
        );
      }
    }
  }

  private observeToolResults(message: SDKMessage): void {
    if (message.type === 'user' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === 'tool_result') this.tools.delete(block.tool_use_id);
      }
    }
  }

  private arm(windowMs = this.timeoutMs): void {
    this.clear();
    if (this.holds > 0 || this.stopped || this.fired || !this.started) return;
    // While an enforced compaction is open the deadline never runs past its
    // dwell bound.
    const dwellRemainingMs = this.compactionDwellRemainingMs();
    const delayMs =
      dwellRemainingMs === null
        ? windowMs
        : Math.min(windowMs, Math.max(0, dwellRemainingMs));
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.stopped || this.fired) return;
      const operations = [...this.tools.values()];
      if (this.compactingSinceMs !== null) operations.push('compaction');
      const remainingMs = this.compactionDwellRemainingMs();
      // A compaction open for COMPACTION_MAX_DWELL_MS is no longer accounted
      // silence: stop re-arming and take the timeout path below.
      const dwellExceeded = remainingMs !== null && remainingMs <= 0;
      if (operations.length > 0 && !dwellExceeded) {
        // One timer, no polling I/O and no invented failure verdict. A missing
        // terminal hook is reconciled by result/interrupt/cancel/stream failure.
        // Re-arm even if a diagnostic sink throws.
        try {
          this.onOverdue(operations);
        } finally {
          this.arm();
        }
        return;
      }
      // Root silence past the normal window while a background task is still
      // inside its quiet window: report it and check again at the earlier of
      // the next window and the quiet bound. Never earlier than today's rule.
      const quietRemainingMs = this.backgroundQuietRemainingMs();
      if (!dwellExceeded && quietRemainingMs !== null && quietRemainingMs > 0) {
        try {
          this.onOverdue(['background task']);
        } finally {
          this.arm(Math.min(this.timeoutMs, quietRemainingMs));
        }
        return;
      }
      this.fired = true;
      this.timeoutCause = dwellExceeded ? 'compaction-dwell' : 'no-activity';
      this.onTimeout(this.timeoutCause);
    }, delayMs);
    this.timer.unref?.();
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Why the watchdog fired: unaccounted root silence, or an enforced compaction
 * open for `COMPACTION_MAX_DWELL_MS`.
 */
export type WatchdogTimeoutCause = 'no-activity' | 'compaction-dwell';

/**
 * Unaccounted silence recovery window, NOT a tool runtime cap. Where the
 * coordinator controls the session, compaction is capped separately at
 * `COMPACTION_MAX_DWELL_MS` from when it opened.
 */
export const NO_ACTIVITY_TIMEOUT_MS = 180_000;

/**
 * Quiet bound for a backgrounded root-owned SDK task with no open root tool:
 * root silence times out once every such task has had no qualifying activity
 * for this long. Sustained real progress can run longer.
 */
export const BACKGROUND_TASK_QUIET_TIMEOUT_MS = 600_000;

/** A root-owned SDK task, kept after backgrounding releases its root tool. */
interface TaskRecord {
  readonly toolUseId: string;
  readonly runId?: string;
  /** Nested, ambient and skip_transcript tasks only release their root tool. */
  readonly keepsAlive: boolean;
  background: boolean;
  lastActivityMs: number;
}

/** A late event of another run of the same task must not change this run. */
function sameRun(record: TaskRecord, runId: string | undefined): boolean {
  return !record.runId || !runId || record.runId === runId;
}

export interface ActivityHold {
  hold(): void;
  release(): void;
  /** Implemented by the query watchdog; plain permission holds need neither. */
  lifecycleHooks?(): Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  endTurn?(): void;
  beginTurn?(): void;
}
