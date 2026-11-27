import { classifyToolCall, type CallServer, type NativeClass } from './tool-call-classify';
import type { ToolCallSummary } from '../types/agent-process.types';

/** Maximum distinct tool-name keys kept in `ToolCallSummary.byTool`. */
export const MAX_TOOL_CALL_SUMMARY_TOOLS = 100;

/** Maximum unresolved `toolCallId` entries tracked per summary before oldest eviction. */
export const MAX_PENDING_TOOL_CALLS = 256;

/** Strict identifier shape allowed as a persisted `byTool` key (no whitespace, path separators, or non-ASCII). */
const SAFE_TOOL_NAME_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

const FORBIDDEN_TOOL_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Minimal segment shape consumed by the pure tool-call summary accumulator. */
export interface ToolCallSummarySegment {
  readonly type: string;
  readonly content?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly toolInput?: unknown;
  readonly toolArgs?: unknown;
}

interface PendingToolCall {
  readonly server: CallServer;
  readonly toolName: string;
  readonly ordinal: number;
}

interface PendingSummaryState {
  readonly byId: Map<string, PendingToolCall>;
  lastUnkeyed: PendingToolCall | null;
}

const pendingStateBySummary = new WeakMap<ToolCallSummary, PendingSummaryState>();

const NATIVE_CLASS_TO_FIELD: Readonly<
  Record<NativeClass, keyof ToolCallSummary['substitutableNative']>
> = {
  'text-search': 'textSearch',
  'file-read': 'fileRead',
  'path-listing': 'pathListing',
  'git-read': 'gitRead',
};

function stateFor(summary: ToolCallSummary): PendingSummaryState {
  let state = pendingStateBySummary.get(summary);
  if (!state) {
    state = { byId: new Map<string, PendingToolCall>(), lastUnkeyed: null };
    pendingStateBySummary.set(summary, state);
  }
  return state;
}

function fixedBucketForServer(server: CallServer): string {
  if (server === 'ptah') return 'ptah:other';
  if (server !== 'native') return 'mcp:other';
  return 'native:other';
}

/**
 * Normalize a vendor-supplied tool name into a safe `byTool` key.
 * Accepts strict ASCII identifiers (`^[A-Za-z0-9_.:-]{1,80}$`, including
 * `mcp__server__tool` and `ptah_*`), and collapses everything else into a
 * fixed per-server bucket (`native:other`, `mcp:other`, `ptah:other`) rather
 * than persisting a truncated copy of untrusted text.
 */
export function normalizeToolSummaryKey(
  rawName: string | undefined,
  server: CallServer,
): string {
  const trimmed = typeof rawName === 'string' ? rawName.trim() : '';
  if (
    SAFE_TOOL_NAME_RE.test(trimmed) &&
    !FORBIDDEN_TOOL_KEYS.has(trimmed)
  ) {
    return trimmed;
  }
  return fixedBucketForServer(server);
}

function normalizedCallId(rawId: string | undefined): string | undefined {
  if (typeof rawId !== 'string') return undefined;
  const trimmed = rawId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function recordByToolCall(summary: ToolCallSummary, toolName: string): void {
  if (Object.prototype.hasOwnProperty.call(summary.byTool, toolName)) {
    const entry = summary.byTool[toolName];
    if (entry) entry.calls++;
    return;
  }
  if (Object.keys(summary.byTool).length < MAX_TOOL_CALL_SUMMARY_TOOLS) {
    Object.defineProperty(summary.byTool, toolName, {
      value: { calls: 1, errors: 0 },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return;
  }
  summary.byToolOverflow++;
}

/**
 * Create a fresh metadata-only {@link ToolCallSummary} with an attached
 * transient `toolCallId` map for pairing tool calls with their results.
 */
export function createToolCallSummary(): ToolCallSummary {
  const summary: ToolCallSummary = {
    totalCalls: 0,
    ptahCalls: 0,
    nativeCalls: 0,
    otherMcpCalls: 0,
    discoveryCalls: 0,
    ptahErrors: 0,
    nativeErrors: 0,
    unknownOutcomes: 0,
    callsBeforeFirstPtahSuccess: null,
    substitutableNative: {
      textSearch: 0,
      fileRead: 0,
      pathListing: 0,
      gitRead: 0,
    },
    byTool: {},
    byToolOverflow: 0,
  };
  pendingStateBySummary.set(summary, {
    byId: new Map<string, PendingToolCall>(),
    lastUnkeyed: null,
  });
  return summary;
}

/**
 * Record one `tool-call` segment in `summary`, classifying it in memory and
 * tracking its `toolCallId` until a matching result arrives.
 *
 * Rules for duplicate and missing `toolCallId` values:
 * - While an id is pending, the first call wins: a repeated `tool-call` with
 *   the same `toolCallId` is treated as an update and is not counted again or
 *   reattributed to another tool.
 * - Pending ids are bounded at {@link MAX_PENDING_TOOL_CALLS}; inserting past
 *   the cap evicts the oldest entry and leaves its outcome in `unknownOutcomes`.
 * - A call without a non-empty `toolCallId` is counted once and can only be
 *   paired with an immediately adjacent id-less result before the next call or
 *   keyed result arrives.
 */
export function recordToolCall(
  summary: ToolCallSummary,
  segment: ToolCallSummarySegment,
): void {
  if (segment.type !== 'tool-call') return;

  const state = stateFor(summary);
  state.lastUnkeyed = null;

  const callId = normalizedCallId(segment.toolCallId);
  if (callId !== undefined && state.byId.has(callId)) {
    return;
  }

  const rawName = typeof segment.toolName === 'string' ? segment.toolName.trim() : '';
  const classification = classifyToolCall({
    name: rawName.length > 0 ? rawName : 'unknown',
    input: segment.toolInput !== undefined ? segment.toolInput : segment.toolArgs,
  });
  const toolName = normalizeToolSummaryKey(rawName, classification.server);

  const ordinal = summary.totalCalls;
  summary.totalCalls++;
  summary.unknownOutcomes++;

  if (classification.operation === 'ptah') {
    summary.ptahCalls++;
  } else if (classification.operation === 'discovery') {
    summary.discoveryCalls++;
    if (classification.server === 'native') {
      summary.nativeCalls++;
    } else {
      summary.otherMcpCalls++;
    }
  } else if (classification.server !== 'native') {
    summary.otherMcpCalls++;
  } else {
    summary.nativeCalls++;
    if (classification.nativeClass !== null) {
      const field = NATIVE_CLASS_TO_FIELD[classification.nativeClass];
      summary.substitutableNative[field]++;
    }
  }

  recordByToolCall(summary, toolName);

  const pendingEntry: PendingToolCall = {
    server: classification.server,
    toolName,
    ordinal,
  };
  if (callId !== undefined) {
    while (state.byId.size >= MAX_PENDING_TOOL_CALLS) {
      const oldestKey = state.byId.keys().next().value;
      if (oldestKey === undefined) break;
      state.byId.delete(oldestKey);
    }
    state.byId.set(callId, pendingEntry);
  } else {
    state.lastUnkeyed = pendingEntry;
  }
}

/**
 * Pair a `tool-result` or `tool-result-error` segment with its pending
 * `tool-call` entry by `toolCallId` (or with an immediately preceding id-less
 * `tool-call` when the result also omits `toolCallId`) and update outcome counters.
 *
 * A result whose id is unknown or already settled is ignored without altering
 * counters.
 *
 * `callsBeforeFirstPtahSuccess` is defined in call-issuance order: it tracks
 * the minimum issuance `ordinal` among Ptah calls that later succeed, so
 * out-of-order results settle to the earliest Ptah call that succeeded while an
 * earlier Ptah call that errors or never receives a result does not satisfy it.
 */
export function recordToolResult(
  summary: ToolCallSummary,
  segment: ToolCallSummarySegment,
): void {
  if (segment.type !== 'tool-result' && segment.type !== 'tool-result-error') {
    return;
  }
  const state = pendingStateBySummary.get(summary);
  if (!state) return;

  const callId = normalizedCallId(segment.toolCallId);
  let entry: PendingToolCall | undefined;
  if (callId !== undefined) {
    state.lastUnkeyed = null;
    entry = state.byId.get(callId);
    if (!entry) return;
    state.byId.delete(callId);
  } else {
    entry = state.lastUnkeyed ?? undefined;
    state.lastUnkeyed = null;
    if (!entry) return;
  }

  summary.unknownOutcomes = Math.max(0, summary.unknownOutcomes - 1);

  if (segment.type === 'tool-result-error') {
    if (entry.server === 'ptah') {
      summary.ptahErrors++;
    } else if (entry.server === 'native') {
      summary.nativeErrors++;
    }
    if (Object.prototype.hasOwnProperty.call(summary.byTool, entry.toolName)) {
      const stats = summary.byTool[entry.toolName];
      if (stats) stats.errors++;
    }
    return;
  }

  if (
    entry.server === 'ptah' &&
    (summary.callsBeforeFirstPtahSuccess === null ||
      entry.ordinal < summary.callsBeforeFirstPtahSuccess)
  ) {
    summary.callsBeforeFirstPtahSuccess = entry.ordinal;
  }
}

/**
 * Release transient pending `toolCallId` pairing state associated with `summary`.
 * Safe to call multiple times; leaves the plain summary counters intact for reading.
 */
export function releaseToolCallSummary(summary: ToolCallSummary): void {
  pendingStateBySummary.delete(summary);
}

/** Return the number of currently pending keyed `toolCallId` entries for `summary`. */
export function pendingToolCallCount(summary: ToolCallSummary): number {
  return pendingStateBySummary.get(summary)?.byId.size ?? 0;
}

/**
 * Summarize an ordered sequence of segments using the shared counting rules
 * and release transient pairing state before returning.
 */
export function summarizeToolCallSegments(
  segments: readonly ToolCallSummarySegment[],
): ToolCallSummary {
  const summary = createToolCallSummary();
  for (const segment of segments) {
    if (segment.type === 'tool-call') {
      recordToolCall(summary, segment);
    } else if (
      segment.type === 'tool-result' ||
      segment.type === 'tool-result-error'
    ) {
      recordToolResult(summary, segment);
    }
  }
  releaseToolCallSummary(summary);
  return summary;
}

/**
 * Create a plain, JSON-safe snapshot of `summary` for persistence so later
 * continuation turns cannot mutate an already-read snapshot.
 */
export function cloneToolCallSummary(
  summary: ToolCallSummary,
): ToolCallSummary {
  const byTool: Record<string, { calls: number; errors: number }> = {};
  for (const [name, stats] of Object.entries(summary.byTool)) {
    Object.defineProperty(byTool, name, {
      value: { calls: stats.calls, errors: stats.errors },
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return {
    totalCalls: summary.totalCalls,
    ptahCalls: summary.ptahCalls,
    nativeCalls: summary.nativeCalls,
    otherMcpCalls: summary.otherMcpCalls,
    discoveryCalls: summary.discoveryCalls,
    ptahErrors: summary.ptahErrors,
    nativeErrors: summary.nativeErrors,
    unknownOutcomes: summary.unknownOutcomes,
    callsBeforeFirstPtahSuccess: summary.callsBeforeFirstPtahSuccess,
    substitutableNative: { ...summary.substitutableNative },
    byTool,
    byToolOverflow: summary.byToolOverflow,
  };
}
