import {
  formatAgentActionNotice,
  formatProviderInputClosed,
} from '@ptah-extension/shared';
import type {
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  SDKMessage,
} from '../types/sdk-types/claude-sdk.types';
import { COMPACTION_MAX_DWELL_MS } from './compaction/compaction-state.types';

export const NO_ACTIVITY_TIMEOUT_MS = 180_000;
export const BACKGROUND_TASK_QUIET_TIMEOUT_MS = 600_000;
export const API_RETRY_MARGIN_MS = 30_000;
export const API_RETRY_MAX_ACCOUNTED_MS = 900_000;

export type WatchdogTimeoutCause = 'provider-no-response';

export class ProviderTurnEndError extends Error {
  readonly startedAt = Date.now();

  constructor(
    readonly endCause: WatchdogTimeoutCause | 'provider-input-closed',
  ) {
    super(
      endCause === 'provider-input-closed'
        ? formatProviderInputClosed()
        : formatAgentActionNotice({
            actor: 'ptah-watchdog',
            action: 'ended',
            reason: endCause,
            nextStep: 'retry-first-turn',
            measured: NO_ACTIVITY_TIMEOUT_MS,
            unit: 'milliseconds',
          }),
    );
    this.name = 'ProviderTurnEndError';
  }
}

interface OverdueWindow {
  nextAt: number;
  interval: number;
}

interface OpenTask {
  runId?: string;
  toolUseId?: string;
  background: boolean;
  kind?: string;
  overdue: OverdueWindow;
}

function isRootHook(message: object): boolean {
  return !('parent_tool_use_id' in message && message.parent_tool_use_id) &&
    !('agent_id' in message && message.agent_id);
}

function overdueWindow(interval: number): OverdueWindow {
  return { nextAt: performance.now() + interval, interval };
}

function backOff(window: OverdueWindow, now: number): void {
  window.interval = Math.min(window.interval * 2, 3_600_000);
  window.nextAt = now + window.interval;
}

function nonNegativeMs(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function isToolLifecycleHook(event: string): boolean {
  return event === 'PreToolUse' ||
    event === 'PostToolUse' ||
    event === 'PostToolUseFailure';
}

function showsSdkWork(message: SDKMessage): boolean {
  switch (message.type) {
    case 'assistant':
    case 'stream_event':
    case 'tool_progress':
    case 'tool_use_summary':
    case 'result':
      return true;
    case 'user': {
      const { content } = message.message;
      return Array.isArray(content) &&
        content.some((block) => block.type === 'tool_use' || block.type === 'tool_result');
    }
    case 'system':
      switch (message.subtype) {
        case 'local_command_output':
        case 'files_persisted':
        case 'permission_denied':
          return true;
        case 'hook_started':
        case 'hook_progress':
        case 'hook_response':
          return isToolLifecycleHook(message.hook_event) || isRootHook(message);
        case 'compact_boundary':
          return true;
        case 'status':
          return message.status === 'compacting' || !!message.compact_result;
        default:
          return message.subtype.startsWith('task_') ||
            message.subtype === 'background_tasks_changed' ||
            message.subtype === 'thinking_tokens';
      }
    default:
      return false;
  }
}

/** Accounts for work within one SDK query, including tasks that span turns. */
export class NoActivityWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private started = false;
  private holds = 0;
  private turnOpen = false;
  private quietUntil = 0;
  private retryUntil = 0;
  private toolNoticeAt = 0;
  private compaction: OverdueWindow | null = null;
  private readonly tools = new Map<string, string>();
  private readonly hooks = new Map<string, { event: string; overdue: OverdueWindow }>();
  private readonly tasks = new Map<string, OpenTask>();
  // Run ids sort in launch order. Keep terminal ids to reject late frames
  // after a task is removed, including stale entries in a replacement snapshot.
  private readonly taskRuns = new Map<string, string>();
  private readonly finishedTasks = new Set<string>();
  private readonly finishedTools = new Set<string>();
  private sawWork = false;
  private sawOutwardEvent = false;
  private terminalError?: ProviderTurnEndError;
  private readonly interruptedTools = new Set<string>();

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: (cause: WatchdogTimeoutCause) => void,
    private readonly onOverdue: (operations: readonly string[]) => void = () =>
      undefined,
  ) {}

  get firedCause(): WatchdogTimeoutCause | null {
    return this.terminalError?.endCause === 'provider-no-response' ? 'provider-no-response' : null;
  }

  get failure(): ProviderTurnEndError | undefined {
    return this.terminalError;
  }

  recordFailure(error: ProviderTurnEndError): void {
    if (!this.terminalError) {
      this.terminalError = error;
      for (const id of this.tools.keys()) this.interruptedTools.add(id);
    }
    this.stop();
  }

  noteOutwardEvent(): void {
    if (!this.terminalError) this.sawOutwardEvent = true;
  }

  get zeroOutwardEvents(): boolean {
    return !this.sawOutwardEvent && !this.sawWork;
  }

  get isTurnOpen(): boolean {
    return this.turnOpen;
  }

  beginTurn(): void {
    if (this.stopped || this.turnOpen) return;
    this.turnOpen = true;
    this.kick();
  }

  endTurn(): void {
    this.turnOpen = false;
    this.tools.clear();
    this.finishedTools.clear();
    this.retryUntil = 0;
    this.compaction = null;
    this.clear();
  }

  start(): void {
    if (this.stopped || this.started) return;
    this.started = true;
    this.kick();
  }

  kick(): void {
    this.quietUntil = performance.now() + this.timeoutMs;
    this.toolNoticeAt = this.quietUntil;
    this.arm();
  }

  hold(): void {
    if (this.stopped) return;
    this.holds += 1;
    this.clear();
  }

  release(): void {
    if (this.holds === 0) return;
    this.holds -= 1;
    this.kick();
  }

  get isHeld(): boolean {
    return !this.stopped && (this.holds > 0 || !this.turnOpen);
  }

  stop(): void {
    this.stopped = true;
    this.holds = 0;
    this.endTurn();
    this.hooks.clear();
    this.tasks.clear();
    this.taskRuns.clear();
    this.finishedTasks.clear();
  }

  interruptedRootTools(): ReadonlySet<string> {
    return this.interruptedTools;
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
              if (!options.signal.aborted && !this.terminalError) {
                if (isToolLifecycleHook(input.hook_event_name) ||
                    input.hook_event_name === 'PreCompact' ||
                    input.hook_event_name === 'PostCompact') {
                  this.sawWork = true;
                }
                this.observeHook(input);
              }
              return { continue: true };
            },
          ],
        },
      ];
    }
    return hooks;
  }

  private observeHook(input: HookInput): void {
    if (this.stopped || input.agent_id) return;
    switch (input.hook_event_name) {
      case 'PreToolUse':
        if (!input.tool_use_id) return;
        this.beginTurn();
        this.openTool(input.tool_use_id, input.tool_name);
        break;
      case 'PostToolUse':
      case 'PostToolUseFailure':
        if (!this.turnOpen) return;
        this.closeTool(input.tool_use_id);
        break;
      case 'PreCompact':
        this.compaction ??= overdueWindow(COMPACTION_MAX_DWELL_MS);
        break;
      case 'PostCompact':
        this.compaction = null;
        break;
      case 'Stop':
      case 'StopFailure':
        // The result, rather than a hook, releases the host's input pump.
        this.endTurn();
        return;
      case 'SessionEnd':
        this.stop();
        return;
    }
    this.kick();
  }

  /** Stream callers defer turn closure until they have matched the result to its owner. */
  observe(message: SDKMessage, { deferResult = false } = {}): void {
    if (this.terminalError) return;
    if (!this.sawWork && showsSdkWork(message)) this.sawWork = true;
    if (this.stopped) return;
    if (message.type === 'system') {
      this.observeSystem(message);
      return;
    }
    if ('parent_tool_use_id' in message && message.parent_tool_use_id) {
      let changed = false;
      for (const task of this.tasks.values()) {
        if (task.toolUseId === message.parent_tool_use_id) {
          task.overdue = overdueWindow(BACKGROUND_TASK_QUIET_TIMEOUT_MS);
          changed = true;
        }
      }
      if (changed) this.arm();
      return;
    }
    switch (message.type) {
      case 'stream_event':
        if (message.event.type === 'message_start') this.beginTurn();
        if (!this.turnOpen) return;
        this.retryUntil = 0;
        break;
      case 'assistant':
        if (!this.turnOpen) return;
        this.retryUntil = 0;
        for (const block of message.message.content) {
          if (block.type === 'tool_use') this.openTool(block.id, block.name);
        }
        break;
      case 'user':
        if (!this.turnOpen || !Array.isArray(message.message.content)) return;
        for (const block of message.message.content) {
          if (block.type === 'tool_result') this.closeTool(block.tool_use_id);
        }
        break;
      case 'tool_progress':
        if (!this.tools.has(message.tool_use_id)) return;
        break;
      case 'result':
        if (deferResult) this.kick();
        else this.endTurn();
        return;
      default:
        return;
    }
    this.kick();
  }

  private observeSystem(
    message: Extract<SDKMessage, { type: 'system' }>,
  ): void {
    switch (message.subtype) {
      case 'hook_started':
      case 'hook_progress':
      case 'hook_response': {
        if (!isRootHook(message) || isToolLifecycleHook(message.hook_event)) return;
        const hook = this.hooks.get(message.hook_id);
        if (message.subtype === 'hook_started') {
          this.hooks.set(message.hook_id, hook ?? {
            event: message.hook_event,
            overdue: overdueWindow(this.timeoutMs),
          });
        } else if (message.subtype === 'hook_progress') {
          if (hook) hook.overdue = overdueWindow(this.timeoutMs);
        } else if (!this.hooks.delete(message.hook_id)) {
          return;
        }
        break;
      }
      case 'background_tasks_changed': {
        let changed = false;
        const retained = new Set(message.tasks.map((task) => task.task_id));
        for (const id of this.tasks.keys()) {
          if (!retained.has(id)) changed = this.tasks.delete(id) || changed;
        }
        for (const task of message.tasks) {
          if (!task.run_id && this.finishedTasks.has(task.task_id)) continue;
          changed = this.openTask(task.task_id, task.run_id, true, undefined, false, task.task_type) || changed;
        }
        if (!changed) return;
        break;
      }
      case 'task_started':
        if (!this.openTask(
          message.task_id,
          message.run_id,
          message.is_backgrounded === true,
          message.tool_use_id,
          true,
          message.task_type,
        )) return;
        this.finishedTasks.delete(message.task_id);
        break;
      case 'task_updated':
        if (['completed', 'failed', 'killed'].includes(message.patch.status ?? '')) {
          if (!this.finishTask(message.task_id, message.run_id)) return;
        } else if (!this.openTask(
          message.task_id,
          message.run_id,
          message.patch.is_backgrounded === true,
          undefined,
          true,
        )) {
          return;
        }
        break;
      case 'task_notification':
        if (!this.finishTask(message.task_id, message.run_id, message.tool_use_id)) return;
        break;
      case 'task_progress': {
        const task = this.tasks.get(message.task_id);
        if (!task || (message.run_id && task.runId && message.run_id !== task.runId)) return;
        task.overdue = overdueWindow(BACKGROUND_TASK_QUIET_TIMEOUT_MS);
        this.arm();
        return;
      }
      case 'api_retry': {
        if (!this.turnOpen) return;
        const accountedMs =
          nonNegativeMs(message.retry_delay_ms) +
          nonNegativeMs(message.no_response?.retry_wait_ms) +
          API_RETRY_MARGIN_MS;
        this.retryUntil = performance.now() + Math.min(
          API_RETRY_MAX_ACCOUNTED_MS,
          Math.max(this.timeoutMs, accountedMs),
        );
        this.arm();
        return;
      }
      case 'thinking_tokens':
        if (!this.turnOpen) return;
        break;
      case 'status':
        if (message.status === 'compacting') {
          this.compaction ??= overdueWindow(COMPACTION_MAX_DWELL_MS);
        } else if (message.compact_result) {
          this.compaction = null;
        } else {
          return;
        }
        break;
      case 'compact_boundary':
        this.compaction = null;
        break;
      default:
        return;
    }
    this.kick();
  }

  private openTask(
    id: string,
    runId: string | undefined,
    background: boolean,
    toolUseId?: string,
    progress = false,
    kind?: string,
  ): boolean {
    const current = this.tasks.get(id);
    const latest = this.taskRuns.get(id);
    if (runId && latest && (runId < latest || (runId === latest && !current))) return false;
    const task = current && (!runId || !current.runId || runId === current.runId)
      ? current
      : { background: false, overdue: overdueWindow(BACKGROUND_TASK_QUIET_TIMEOUT_MS) };
    task.runId = runId ?? task.runId;
    if (task.runId) this.taskRuns.set(id, task.runId);
    task.background ||= background;
    task.kind = kind ?? task.kind;
    task.toolUseId ??= toolUseId;
    if (progress) task.overdue = overdueWindow(BACKGROUND_TASK_QUIET_TIMEOUT_MS);
    this.tasks.set(id, task);
    if (this.turnOpen && task.background && task.toolUseId) this.closeTool(task.toolUseId);
    return true;
  }

  private finishTask(id: string, runId?: string, toolUseId?: string): boolean {
    const latest = this.taskRuns.get(id);
    if (runId && latest && runId < latest) return false;
    const task = this.tasks.get(id);
    const tool = toolUseId ?? task?.toolUseId;
    if (runId) this.taskRuns.set(id, runId);
    this.finishedTasks.add(id);
    this.tasks.delete(id);
    if (this.turnOpen && tool) this.closeTool(tool);
    return task !== undefined || tool !== undefined;
  }

  private openTool(id: string, name: string): void {
    // A background snapshot or terminal result can precede the full assistant
    // tool-use block. A release for that call wins over the buffered block.
    if (!this.finishedTools.has(id)) this.tools.set(id, name);
  }

  private closeTool(id: string): void {
    this.finishedTools.add(id);
    this.tools.delete(id);
  }

  private arm(): void {
    this.clear();
    if (this.isHeld || this.stopped || !this.started) return;
    let nextAt = this.hasOpenWork() ? Infinity : Math.max(this.quietUntil, this.retryUntil);
    if (this.tools.size) nextAt = Math.min(nextAt, this.toolNoticeAt);
    if (this.compaction) nextAt = Math.min(nextAt, this.compaction.nextAt);
    for (const hook of this.hooks.values()) nextAt = Math.min(nextAt, hook.overdue.nextAt);
    for (const task of this.tasks.values()) nextAt = Math.min(nextAt, task.overdue.nextAt);
    this.timer = setTimeout(() => this.onTimer(), Math.ceil(nextAt - performance.now()));
    this.timer.unref?.();
  }

  private hasOpenWork(): boolean {
    return this.tools.size > 0 || this.tasks.size > 0 ||
      this.hooks.size > 0 || this.compaction !== null;
  }

  private onTimer(): void {
    this.timer = null;
    if (this.stopped || this.isHeld) return;
    const now = performance.now();
    const operations = new Set<string>();
    if (this.tools.size && this.toolNoticeAt <= now) {
      for (const tool of this.tools.values()) operations.add(tool);
      this.toolNoticeAt = now + this.timeoutMs;
    }
    if (this.compaction && this.compaction.nextAt <= now) {
      operations.add('compaction');
      backOff(this.compaction, now);
    }
    for (const hook of this.hooks.values()) {
      if (hook.overdue.nextAt <= now) {
        operations.add(`${hook.event} hook`);
        backOff(hook.overdue, now);
      }
    }
    let taskOverdue = false;
    for (const task of this.tasks.values()) {
      if (task.overdue.nextAt <= now) {
        taskOverdue = true;
        backOff(task.overdue, now);
      }
    }
    if (taskOverdue) {
      const kinds = new Set([...this.tasks.values()].map((task) => task.kind ?? 'unknown'));
      const count = this.tasks.size;
      operations.add(`${count} open task${count === 1 ? '' : 's'} (${[...kinds].sort().join(', ')})`);
    }
    if (!this.hasOpenWork() && now >= Math.max(this.quietUntil, this.retryUntil)) {
      // Only the session owner records the failure after accepting the verdict.
      this.stop();
      this.onTimeout('provider-no-response');
      return;
    }
    try {
      if (operations.size) this.onOverdue([...operations]);
    } finally {
      this.arm();
    }
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export interface ActivityHold {
  hold(): void;
  release(): void;
  lifecycleHooks?(): Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  endTurn?(): void;
  beginTurn?(): void;
}
