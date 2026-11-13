import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { IFileSystemProvider, SessionUsageContribution } from '@ptah-extension/platform-core';
import type { UsageCollector, UsageSourceCursor } from './usage-collector.interface';

const MAX_READ = 256 * 1024;
const MAX_PARTIAL = 1024 * 1024;
const HEAD_BYTES = 4096;
const counter = z.number().finite().nonnegative().optional().catch(undefined);
const optionalString = z.string().optional().catch(undefined);
// Zod strips content and tool arguments at the JSONL boundary.
const recordSchema = z.object({
  type: optionalString,
  sessionId: optionalString,
  timestamp: optionalString,
  requestId: optionalString,
  request_id: optionalString,
  isSidechain: z.boolean().optional().catch(undefined),
  message: z.object({
    id: optionalString,
    model: optionalString,
    usage: z.object({
      input_tokens: counter,
      output_tokens: counter,
      cache_read_input_tokens: counter,
      cache_creation_input_tokens: counter,
    }).optional().catch(undefined),
  }).optional().catch(undefined),
});

function ownerFromPath(file: string): { parent: string | null; subagent: string | null; ordinary: string | null } {
  const name = path.basename(file);
  if (name.startsWith('agent-') && name.endsWith('.jsonl')) {
    const subagent = name.slice(0, -6);
    const parent = path.basename(path.dirname(file)) === 'subagents'
      ? path.basename(path.dirname(path.dirname(file))) : null;
    return { parent, subagent, ordinary: null };
  }
  return { parent: null, subagent: null, ordinary: name.endsWith('.jsonl') ? name.slice(0, -6) : null };
}

export class ClaudeJsonlUsageCollector implements UsageCollector {
  readonly sourceId = 'claude-jsonl' as const;

  constructor(private readonly files: Pick<IFileSystemProvider, 'lstat' | 'readFileRangeNoFollow'>) {}

  async collect(file: string, cursor: UsageSourceCursor | null, budgetBytes: number): Promise<{
    events: readonly SessionUsageContribution[]; next: UsageSourceCursor; more: boolean;
  }> {
    if (!this.files.readFileRangeNoFollow) throw new Error('Bounded range read is unavailable');
    const stat = await this.files.lstat(file);
    // Appends change ctime and mtime, so identity is the immutable head of the append-only file.
    const head = await this.files.readFileRangeNoFollow(file, 0, Math.min(HEAD_BYTES, Math.max(1, stat.size)));
    const headEnd = head.bytes.indexOf(10);
    const fingerprint = createHash('sha256')
      .update(headEnd >= 0 ? head.bytes.subarray(0, headEnd) : head.bytes).digest('hex').slice(0, 32);
    let offset = cursor?.sourcePath === file && cursor.fingerprint === fingerprint &&
      cursor.byteOffset <= stat.size ? cursor.byteOffset : 0;
    const events: SessionUsageContribution[] = [];
    const seen = new Map<string, number>();
    const owner = ownerFromPath(file);
    let firstSessionId: string | null = null;
    let firstRecordSeen = false;
    if (owner.subagent !== null && owner.parent === null) {
      const first = await this.files.readFileRangeNoFollow(file, 0, MAX_READ);
      const end = first.bytes.indexOf(10);
      if (end >= 0) {
        try {
          const raw: unknown = JSON.parse(new TextDecoder().decode(first.bytes.subarray(0, end)));
          const parsed = recordSchema.safeParse(raw);
          firstSessionId = parsed.success ? parsed.data.sessionId ?? null : null;
          firstRecordSeen = true;
        } catch {
          // degradation-audit: optional-capability - malformed first record cannot establish flat ownership.
        }
      }
    }
    const decoder = new TextDecoder('utf-8');
    const started = Date.now();
    let parsedBytes = 0;
    let readOffset = offset;
    let pending = new Uint8Array(0);
    const limit = Math.min(Math.max(0, budgetBytes), 1024 * 1024);
    const startOffset = offset;
    // The time slice ends a call only after the cursor advanced, so a slow read cannot stall on one line.
    while (readOffset < stat.size && parsedBytes < limit &&
      (offset === startOffset || Date.now() - started < 20)) {
      const count = Math.min(MAX_READ, stat.size - readOffset, limit - parsedBytes);
      if (count <= 0) break;
      const chunk = await this.files.readFileRangeNoFollow(file, readOffset, count);
      if (chunk.bytes.length === 0) break;
      readOffset += chunk.bytes.length;
      parsedBytes += chunk.bytes.length;
      const joined = new Uint8Array(pending.length + chunk.bytes.length);
      joined.set(pending);
      joined.set(chunk.bytes, pending.length);
      const newline = joined.lastIndexOf(10);
      if (newline < 0) {
        if (joined.length >= MAX_PARTIAL) {
          // degradation-audit: optional-capability - skip an oversized line without retaining its text.
          offset = readOffset;
          pending = new Uint8Array(0);
        } else pending = joined;
        continue;
      }
      const complete = joined.subarray(0, newline + 1);
      let lineStart = offset;
      for (const bytes of splitLines(complete)) {
        const line = decoder.decode(bytes);
        const lineOffset = lineStart;
        lineStart += bytes.length + 1;
        if (!line.trim()) continue;
        let raw: unknown;
        try { raw = JSON.parse(line); } catch {
          // degradation-audit: optional-capability - malformed JSONL has no trustworthy usage.
          continue;
        }
        const parsed = recordSchema.safeParse(raw);
        if (!parsed.success) continue;
        const record = parsed.data;
        if (!firstRecordSeen) { firstSessionId = record.sessionId ?? null; firstRecordSeen = true; }
        const usage = record.message?.usage;
        if (record.type !== 'assistant' || !usage || !record.message?.id) continue;
        const sessionId = record.sessionId;
        if (!sessionId) continue;
        const requestId = record.requestId ?? record.request_id ?? '';
        const eventKey = `claude:${sessionId}:${record.message.id}:${requestId}`;
        const nestedValid = owner.parent !== null && owner.parent === sessionId;
        const flatValid = owner.subagent !== null && owner.parent === null && firstSessionId === sessionId;
        const valid = owner.ordinary !== null ? owner.ordinary === sessionId : nestedValid || flatValid;
        const occurredAtMs = record.timestamp ? Date.parse(record.timestamp) : NaN;
        const measured = [usage.input_tokens, usage.output_tokens, usage.cache_read_input_tokens,
          usage.cache_creation_input_tokens].some((value) => value !== undefined);
        const event: SessionUsageContribution = {
          sessionId,
          producer: 'transcript-replay', runId: sessionId, nativeThreadId: sessionId,
          turnId: null, eventKey, parentSessionId: owner.subagent ? (valid ? sessionId : owner.parent) : null,
          subagentId: owner.subagent, providerId: 'claude',
          occurredAtMs: Number.isFinite(occurredAtMs) ? occurredAtMs : stat.mtime,
          revision: lineOffset, models: [{
            modelId: record.message.model ?? null, inputTokens: usage.input_tokens ?? null,
            outputTokens: usage.output_tokens ?? null,
            cacheReadTokens: usage.cache_read_input_tokens ?? null,
            cacheCreationTokens: usage.cache_creation_input_tokens ?? null,
            knownCostMicroUsd: null, costAuthority: 'unpriced',
          }], totalCostMicroUsd: null, totalCostAuthority: 'unpriced', pricingVersion: null,
          source: 'replay', missingReason: valid && measured ? null :
            valid ? 'invalid-usage' : 'unmatched-provider-event',
          billable: valid && measured, coverageStartMs: null, coverageEndMs: null,
        };
        const prior = seen.get(eventKey);
        if (prior === undefined) { seen.set(eventKey, events.length); events.push(event); }
        else events[prior] = event;
      }
      offset += complete.length;
      pending = joined.slice(newline + 1);
      if (pending.length >= MAX_PARTIAL) {
        // degradation-audit: optional-capability - the next chunk starts after this oversized line fragment.
        offset = readOffset;
        pending = new Uint8Array(0);
      }
      if (parsedBytes >= 1024 * 1024 || Date.now() - started >= 20) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return { events, next: { sourceId: this.sourceId, sourcePath: file, fingerprint,
      mtimeMs: stat.mtime, byteOffset: offset, lastEventKey: events.at(-1)?.eventKey ?? cursor?.lastEventKey ?? null },
      more: offset < stat.size };
  }
}

function* splitLines(bytes: Uint8Array): Generator<Uint8Array> {
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 10) { yield bytes.subarray(start, i); start = i + 1; }
  }
}
