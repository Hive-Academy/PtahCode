/**
 * Codex rollout usage reader (TASK_2026_597, component 14).
 *
 * Codex writes one rollout per thread under
 * `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<local timestamp>-<thread id>.jsonl`.
 * A resumed thread appends to the file it started in, so the file stays under
 * the date directory of its FIRST turn. The resume gate needs one figure from
 * it: the input size of the thread's most recent request, which is
 * `event_msg` / `token_count` → `info.last_token_usage.input_tokens` on the last
 * such record. Field names match the M reader
 * (`scripts/agent-usage/codex-rollout.reader.ts`).
 *
 * Never the `turn.completed` usage the adapter streams: that is the SUM of
 * every request in a turn, so a ten-request turn reads as ten times the
 * context it actually holds.
 *
 * Read-only, and read from the file tail: the last `token_count` is near the
 * end, and a long thread's rollout runs to tens of megabytes.
 */

import { open, readdir, stat } from 'fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'path';
import { basename } from 'path';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { codexHomeDir } from '@ptah-extension/harness-sync';
import { normalizeWorkspaceRoot, type AgentUsageDatum } from '@ptah-extension/shared';
import type { IFileSystemProvider, SessionUsageContribution } from '@ptah-extension/platform-core';
import type { UsageCollector, UsageSourceCursor } from '@ptah-extension/agent-sdk';

/** What the gate reads from one rollout. */
export interface CodexRolloutUsage {
  /** Absolute path of the rollout file that was read. */
  readonly file: string;
  /** `info.last_token_usage.input_tokens` of the last `token_count` record. */
  readonly lastRequestInputTokens: number;
  /** Most recent request context, separate from cumulative turn usage. */
  readonly requestContext?: AgentUsageDatum;
  /** The file's modification time: the thread's last write. */
  readonly modifiedAtMs: number;
}

export interface CodexRolloutUsageOptions {
  /** Overrides `<codexHomeDir()>/sessions`. Specs only. */
  readonly sessionsDir?: string;
}

/**
 * Tail windows tried in order. Most threads end with a `token_count` inside the
 * first window; a turn whose final record is a very large tool output needs a
 * wider one. The last window bounds the read on a pathological file.
 */
const TAIL_WINDOWS_BYTES = [64 * 1024, 1024 * 1024, 16 * 1024 * 1024] as const;

/** Codex thread ids are UUIDs; anything else cannot name a rollout. */
const THREAD_ID_RE = /^[A-Za-z0-9-]+$/;

/** A `YYYY`, `MM` or `DD` directory name. */
const DATE_DIR_RE = /^\d+$/;
const ROLLOUT_RE = /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const MAX_RANGE = 256 * 1024;
const MAX_PARTIAL_LINE = 1024 * 1024;
const number = z.number().finite().nonnegative();
const totalsSchema = z.object({
  input_tokens: number,
  cached_input_tokens: number.optional(),
  output_tokens: number,
});
const replayRecordSchema = z.object({
  type: z.string(),
  timestamp: z.string().optional(),
  payload: z.object({
    type: z.string().optional(),
    id: z.string().optional(),
    cwd: z.string().optional(),
    info: z.object({ total_token_usage: totalsSchema.optional() }).nullable().optional(),
  }).optional(),
});
type Totals = z.infer<typeof totalsSchema>;

/** The one Codex sessions tree selected by the current host environment. */
export function selectedCodexUsageRoots(): readonly string[] {
  return [join(codexHomeDir(), 'sessions')];
}

/** Iterate rollout files by date, newest first, using the same directory rules as the gate. */
export async function* listCodexRolloutFiles(sessionsDir = selectedCodexUsageRoots()[0], startAfter?: string): AsyncGenerator<string> {
  for (const year of await dateDirsNewestFirst(sessionsDir)) {
    if (startAfter && year > startAfter) continue;
    for (const month of await dateDirsNewestFirst(year)) {
      if (startAfter && month > startAfter) continue;
      for (const day of await dateDirsNewestFirst(month)) {
        if (startAfter && day > startAfter) continue;
        for (const name of (await listRegularFiles(day)).sort().reverse()) {
          const file = join(day, name);
          if (startAfter && file >= startAfter) continue;
          if (ROLLOUT_RE.test(name)) yield file;
        }
      }
    }
  }
}

/** Bounded, append-safe replay of Codex's cumulative token_count records. */
export class CodexRolloutUsageCollector implements UsageCollector {
  readonly sourceId = 'codex-rollout' as const;

  constructor(private readonly files: Pick<IFileSystemProvider, 'lstat' | 'readFileRangeNoFollow'>) {}

  async collect(file: string, cursor: UsageSourceCursor | null, budgetBytes: number): Promise<{
    events: readonly SessionUsageContribution[]; next: UsageSourceCursor; more: boolean;
  }> {
    const match = ROLLOUT_RE.exec(basename(file));
    if (!match) throw new Error('Invalid Codex rollout filename');
    if (!this.files.readFileRangeNoFollow) throw new Error('Bounded range read is unavailable');
    const threadId = match[1].toLowerCase();
    const stat = await this.files.lstat(file);
    const head = await this.files.readFileRangeNoFollow(file, 0, Math.min(4096, Math.max(1, stat.size)));
    const headEnd = head.bytes.indexOf(10);
    const fingerprint = createHash('sha256').update(headEnd < 0 ? head.bytes : head.bytes.subarray(0, headEnd)).digest('hex').slice(0, 32);
    const meta = headEnd < 0 ? null : parseReplayLine(new TextDecoder().decode(head.bytes.subarray(0, headEnd)));
    const nativeMatch = meta?.type !== 'session_meta' || !meta.payload?.id || meta.payload.id.toLowerCase() === threadId;
    const worktreePath = meta?.type === 'session_meta' && meta.payload?.cwd && isAbsolute(meta.payload.cwd)
      ? meta.payload.cwd : null;
    let offset = cursor?.sourcePath === file && cursor.fingerprint === fingerprint && cursor.byteOffset <= stat.size
      ? cursor.byteOffset : 0;
    const originalOffset = offset;
    const previous = offset > 0 ? await this.previousTotals(file, offset) : null;
    let totals = previous;
    const events: SessionUsageContribution[] = [];
    const decoder = new TextDecoder();
    const started = Date.now();
    let readOffset = offset;
    let pending = new Uint8Array(0);
    let discardLine = false;
    let readBytes = 0;
    const limit = Math.min(Math.max(1, budgetBytes), 1024 * 1024);
    while (readOffset < stat.size && readBytes < limit && (offset === originalOffset || Date.now() - started < 20)) {
      const chunk = await this.files.readFileRangeNoFollow(file, readOffset, Math.min(MAX_RANGE, stat.size - readOffset, limit - readBytes));
      if (chunk.bytes.length === 0) break;
      readOffset += chunk.bytes.length;
      readBytes += chunk.bytes.length;
      const joined = new Uint8Array(pending.length + chunk.bytes.length);
      joined.set(pending);
      joined.set(chunk.bytes, pending.length);
      const baseOffset = offset;
      let start = 0;
      for (let i = 0; i < joined.length; i++) {
        if (joined[i] !== 10) continue;
        const lineOffset = baseOffset + i + 1;
        if (!discardLine) {
          const record = parseReplayLine(decoder.decode(joined.subarray(start, i)));
          if (record?.type === 'event_msg' && record.payload?.type === 'token_count') {
            const current = record.payload.info?.total_token_usage;
            if (current) {
              const reset = totals !== null && (current.input_tokens < totals.input_tokens ||
                current.output_tokens < totals.output_tokens ||
                (current.cached_input_tokens ?? 0) < (totals.cached_input_tokens ?? 0));
              if (reset) totals = null;
              const input = current.input_tokens - (totals?.input_tokens ?? 0);
              const output = current.output_tokens - (totals?.output_tokens ?? 0);
              const cache = (current.cached_input_tokens ?? 0) - (totals?.cached_input_tokens ?? 0);
              totals = current;
              if (input !== 0 || output !== 0 || cache !== 0) {
                const occurredAt = record.timestamp ? Date.parse(record.timestamp) : NaN;
                const eventKey = `codex:${threadId}:0:${lineOffset}`;
                events.push({
                  sessionId: threadId, producer: 'transcript-replay', runId: threadId,
                  nativeThreadId: threadId, turnId: null, eventKey,
                  parentSessionId: null, subagentId: null, providerId: 'codex',
                  workspaceKey: worktreePath ? normalizeWorkspaceRoot(worktreePath) : null,
                  worktreePath,
                  occurredAtMs: Number.isFinite(occurredAt) ? occurredAt : Math.floor(stat.mtime),
                   revision: lineOffset, models: [{ modelId: null, inputTokens: Math.max(0, input - cache),
                    outputTokens: output, cacheReadTokens: cache, cacheCreationTokens: null,
                    knownCostMicroUsd: null, costAuthority: 'unpriced' }],
                  totalCostMicroUsd: null, totalCostAuthority: 'unpriced', pricingVersion: null,
                  source: 'replay', missingReason: nativeMatch ? null : 'unmatched-provider-event',
                  billable: nativeMatch,
                  coverageStartMs: null, coverageEndMs: null,
                });
              }
            }
          }
        }
        discardLine = false;
        start = i + 1;
        offset = lineOffset;
      }
      pending = joined.slice(start);
      if (pending.length >= MAX_PARTIAL_LINE) {
        // An oversized JSONL line has no trustworthy usage.
        pending = new Uint8Array(0);
        discardLine = true;
        offset = readOffset;
      }
      if (Date.now() - started >= 20) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return { events, next: { sourceId: this.sourceId, sourcePath: file, fingerprint,
      mtimeMs: Math.floor(stat.mtime), byteOffset: offset, lastEventKey: events.at(-1)?.eventKey ?? cursor?.lastEventKey ?? null },
      more: offset < stat.size };
  }

  private async previousTotals(file: string, offset: number): Promise<Totals | null> {
    if (!this.files.readFileRangeNoFollow) throw new Error('Bounded range read is unavailable');
    let end = offset;
    let suffix = new Uint8Array(0);
    while (end > 0) {
      const start = Math.max(0, end - MAX_RANGE);
      const part = await this.files.readFileRangeNoFollow(file, start, end - start);
      const bytes = new Uint8Array(part.bytes.length + suffix.length);
      bytes.set(part.bytes);
      bytes.set(suffix, part.bytes.length);
      let lineEnd = bytes.length - 1;
      for (let i = lineEnd - 1; i >= 0; i--) {
        if (bytes[i] !== 10) continue;
        const record = parseReplayLine(new TextDecoder().decode(bytes.subarray(i + 1, lineEnd)));
        const totals = record?.type === 'event_msg' && record.payload?.type === 'token_count'
          ? record.payload.info?.total_token_usage : null;
        if (totals) return totals;
        lineEnd = i;
      }
      suffix = bytes.subarray(0, lineEnd).slice();
      if (suffix.length > MAX_PARTIAL_LINE) suffix = new Uint8Array(0);
      end = start;
    }
    return null;
  }
}

function parseReplayLine(line: string): z.infer<typeof replayRecordSchema> | null {
  try {
    const raw: unknown = JSON.parse(line);
    const parsed = replayRecordSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    // degradation-audit: optional-capability - malformed or torn JSONL has no trustworthy usage.
    return null;
  }
}

/**
 * Read the last per-request input size of a Codex thread.
 *
 * @returns `null` when no rollout for the thread exists, or when the rollout
 *   holds no `token_count` with a per-request figure.
 * @throws when the rollout exists but cannot be read. The caller decides what
 *   an unreadable rollout means; this reader does not guess.
 */
export async function readCodexRolloutUsage(
  threadId: string,
  options: CodexRolloutUsageOptions = {},
): Promise<CodexRolloutUsage | null> {
  if (!THREAD_ID_RE.test(threadId)) return null;
  const sessionsDir = options.sessionsDir ?? join(codexHomeDir(), 'sessions');
  const file = await findRolloutFile(sessionsDir, threadId);
  if (file === null) return null;

  const { size, mtimeMs } = await stat(file);
  const tokens = await readLastRequestInputTokens(file, size);
  return tokens === null
    ? null
    : { file, lastRequestInputTokens: tokens, requestContext: { status: 'reported', value: tokens, source: 'session-file' }, modifiedAtMs: mtimeMs };
}

/**
 * Find `rollout-*-<threadId>.jsonl`, newest date directories first. Stops at
 * the first match, so a recent thread costs a few directory listings.
 */
async function findRolloutFile(
  sessionsDir: string,
  threadId: string,
): Promise<string | null> {
  const suffix = `-${threadId}.jsonl`;
  for (const year of await dateDirsNewestFirst(sessionsDir)) {
    for (const month of await dateDirsNewestFirst(year)) {
      for (const day of await dateDirsNewestFirst(month)) {
        const names = await listDir(day);
        const match = names.find(
          (name) => name.startsWith('rollout-') && name.endsWith(suffix),
        );
        if (match !== undefined) return join(day, match);
      }
    }
  }
  return null;
}

async function dateDirsNewestFirst(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory() && DATE_DIR_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(b) - Number(a))
    .map((name) => join(dir, name));
}

async function listRegularFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** A missing directory lists as empty; any other failure propagates. */
async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

async function readLastRequestInputTokens(
  file: string,
  size: number,
): Promise<number | null> {
  const handle = await open(file, 'r');
  try {
    for (const window of TAIL_WINDOWS_BYTES) {
      const length = Math.min(window, size);
      const start = size - length;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      const lines = buffer.toString('utf8').split('\n');
      // A window that does not start at byte 0 begins mid-line.
      if (start > 0) lines.shift();
      const tokens = lastRequestInputTokensIn(lines);
      if (tokens !== null) return tokens;
      if (start === 0) return null;
    }
    return null;
  } finally {
    await handle.close();
  }
}

/** Scan lines from the end for the last usable `token_count`. */
export function lastRequestInputTokensIn(
  lines: readonly string[],
): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.includes('"token_count"')) continue;
    const tokens = parseTokenCountLine(line);
    if (tokens !== null) return tokens;
  }
  return null;
}

function parseTokenCountLine(line: string): number | null {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    // degradation-audit: optional-capability — a torn final line (Codex still
    // writing) is not a record; the caller scans on to the one before it.
    return null;
  }
  const payload = field(record, 'payload');
  if (field(record, 'type') !== 'event_msg') return null;
  if (field(payload, 'type') !== 'token_count') return null;
  const input = field(
    field(field(payload, 'info'), 'last_token_usage'),
    'input_tokens',
  );
  return typeof input === 'number' && Number.isFinite(input) && input >= 0
    ? input
    : null;
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
