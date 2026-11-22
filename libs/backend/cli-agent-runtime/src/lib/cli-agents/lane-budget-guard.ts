/**
 * Lane repeat-call guard (TASK_2026_597, component 16, R9.3/R9.4; TASK_2026_2297 P4).
 *
 * Watches a lane's `tool-call` segments for a repeat loop. There is no
 * tool-call budget: the vendor CLIs manage their own context, and a count
 * says little about cost. The guard only counts calls (the count is reported
 * in the completion signal) and catches a repeat loop:
 *
 * - When one identical call (tool name plus normalised `toolInput` JSON, else
 *   `toolArgs`, else the tool name alone) reaches `repeatAt` occurrences it
 *   asks for a handoff (`ask`), and at twice that it asks for a pause
 *   (`pause`). It never asks for a stop: Ptah pauses a lane, it does not end
 *   it. Cursor's adapter redacts or drops `toolInput`, so its keys can be
 *   coarser; that is accepted.
 * - File-edit calls (Write, Edit, Delete, ...) count toward the call count but
 *   not toward the repeat check: some adapters (Codex file changes) report only
 *   the path, so repeated normal edits to one file would share a key.
 *
 * Each action is returned once; counting continues after both. The guard only
 * decides. The manager performs the ask or pause. One guard per tracked lane,
 * dropped with the lane, and {@link reset} when the caller starts a new turn on
 * it. No timers; each segment costs one map update.
 */

import type { CliOutputSegment } from '@ptah-extension/shared';

/** Tool names (lower-cased) that edit files; left out of the repeat check. */
const FILE_EDIT_TOOLS: ReadonlySet<string> = new Set([
  'write',
  'edit',
  'multiedit',
  'delete',
  'notebookedit',
  'apply_patch',
]);

/** Bound on remembered call ids; the oldest id is dropped past this. */
const MAX_COUNTED_IDS = 512;

/** The pause point is this multiple of `repeatAt`. */
const REPEAT_PAUSE_MULTIPLIER = 2;

export interface LaneBudgetThresholds {
  /** Occurrences of one identical call after which the lane is asked for a handoff. */
  readonly repeatAt: number;
}

/** What the manager should do after a segment. */
export type LaneBudgetAction =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'ask' | 'pause';
      /** How many times the repeated call ran when the action was asked for. */
      readonly repeats: number;
      /** The occurrence count that triggered this action. */
      readonly limit: number;
    };

const NONE: LaneBudgetAction = { kind: 'none' };

/**
 * Not decorated for tsyringe: the manager builds one per lane with the
 * thresholds the spawn environment resolved.
 */
export class LaneBudgetGuard {
  private toolCalls = 0;
  private phase: 'running' | 'asked' | 'paused' = 'running';
  private readonly repeats = new Map<string, number>();
  /** Call ids already counted, so start + completion segments count once. */
  private readonly countedIds = new Set<string>();

  constructor(private readonly thresholds: LaneBudgetThresholds) {}

  /** Tool calls counted so far. */
  get toolCallCount(): number {
    return this.toolCalls;
  }

  /** Highest action already returned since the last {@link reset}. */
  get currentPhase(): 'running' | 'asked' | 'paused' {
    return this.phase;
  }

  /**
   * Count one segment. Only `tool-call` and id-carrying `command` segments count. Returns
   * `ask` once when one call reaches `repeatAt`, and `pause` once at twice that.
   */
  observe(segment: CliOutputSegment): LaneBudgetAction {
    if (!this.isNewCall(segment)) return NONE;

    this.toolCalls += 1;
    if (isFileEdit(segment)) return NONE;
    const key = callKey(segment);
    const repeats = (this.repeats.get(key) ?? 0) + 1;
    this.repeats.set(key, repeats);
    const askAt = this.thresholds.repeatAt;
    const pauseAt = askAt * REPEAT_PAUSE_MULTIPLIER;
    if (repeats >= pauseAt && this.phase !== 'paused') {
      this.phase = 'paused';
      return { kind: 'pause', repeats, limit: pauseAt };
    }
    if (repeats >= askAt && this.phase === 'running') {
      this.phase = 'asked';
      return { kind: 'ask', repeats, limit: askAt };
    }
    return NONE;
  }

  /**
   * Start counting afresh for a new task the caller sent to the lane: counts,
   * repeats and the ask/pause latch are cleared.
   */
  reset(): void {
    this.toolCalls = 0;
    this.phase = 'running';
    this.repeats.clear();
    this.countedIds.clear();
  }

  /**
   * A `tool-call` always counts and remembers its id. A `command` segment
   * counts only when it carries a `toolCallId` not seen yet: OpenCode reports
   * shell calls only as `command`, while Codex emits a `tool-call` on start
   * and a `command` on completion with the same id.
   */
  private isNewCall(segment: CliOutputSegment): boolean {
    const id = segment.toolCallId;
    if (segment.type === 'tool-call') {
      if (id) this.rememberId(id);
      return true;
    }
    if (segment.type !== 'command' || !id || this.countedIds.has(id)) {
      return false;
    }
    this.rememberId(id);
    return true;
  }

  private rememberId(id: string): void {
    if (this.countedIds.size >= MAX_COUNTED_IDS) {
      const oldest = this.countedIds.values().next();
      if (!oldest.done) this.countedIds.delete(oldest.value);
    }
    this.countedIds.add(id);
  }
}

function isFileEdit(segment: CliOutputSegment): boolean {
  return FILE_EDIT_TOOLS.has((segment.toolName ?? '').toLowerCase());
}

function callKey(segment: CliOutputSegment): string {
  const name = segment.toolName ?? '';
  if (segment.toolInput !== undefined) {
    return `${name}\u0000${normalisedJson(segment.toolInput)}`;
  }
  if (segment.toolArgs !== undefined && segment.toolArgs !== '') {
    return `${name}\u0000${segment.toolArgs.trim()}`;
  }
  return name;
}

/**
 * Code-unit order: deterministic for any two distinct keys, unlike
 * `localeCompare`, which can rank canonically equivalent keys as equal.
 */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** JSON with object keys sorted at every level, so key order does not matter. */
function normalisedJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
      return inner;
    }
    const record = inner as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(record).sort(byCodeUnit)) sorted[k] = record[k];
    return sorted;
  });
}
