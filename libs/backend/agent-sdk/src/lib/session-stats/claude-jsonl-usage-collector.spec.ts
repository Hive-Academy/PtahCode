import path from 'node:path';
import { FileType } from '@ptah-extension/platform-core';
import { ClaudeJsonlUsageCollector } from './claude-jsonl-usage-collector';

const parent = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

function line(sessionId: string, id: string, tokens: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: 'assistant', sessionId, timestamp: '2026-01-01T00:00:00Z',
    requestId: 'request-1', message: { id, model: 'claude-test', usage: {
      input_tokens: tokens, output_tokens: 2, cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    } }, ...extra });
}

function collector(lines: string[]) {
  let bytes = new TextEncoder().encode(`${lines.join('\n')}\n`);
  let ctime = 1;
  const files = {
    append(more: string[]): void {
      const added = new TextEncoder().encode(`${more.join('\n')}\n`);
      const next = new Uint8Array(bytes.length + added.length);
      next.set(bytes);
      next.set(added, bytes.length);
      bytes = next;
      ctime += 1;
    },
    lstat: jest.fn(async () => ({ type: FileType.File, ctime, mtime: ctime + 1.5, size: bytes.length })),
    readFileRangeNoFollow: jest.fn(async (_file: string, offset: number, maxBytes: number) => ({
      bytes: bytes.subarray(offset, offset + maxBytes), truncated: offset + maxBytes < bytes.length,
    })),
  };
  return Object.assign(new ClaudeJsonlUsageCollector(files), { append: files.append });
}

describe('ClaudeJsonlUsageCollector', () => {
  it('attributes a standalone replay to its transcript working directory', async () => {
    const cwd = path.resolve('standalone-worktree');
    const result = await collector([line(parent, 'm0', 3, { cwd })]).collect(`${parent}.jsonl`, null, 1024);
    expect(result.events[0]).toMatchObject({ worktreePath: cwd,
      workspaceKey: cwd.replace(/\\/g, '/').toLowerCase() });
  });
  it('uses the JSONL session ID and rejects a mismatched ordinary filename', async () => {
    const result = await collector([line(other, 'm1', 3)]).collect(`${parent}.jsonl`, null, 1024);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ sessionId: other, billable: false,
      missingReason: 'unmatched-provider-event' });
  });

  it('dedupes repeated message and request IDs with the latest counters', async () => {
    const result = await collector([line(parent, 'm1', 3), line(parent, 'm1', 7)])
      .collect(`${parent}.jsonl`, null, 1024);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].models[0].inputTokens).toBe(7);
    expect(result.events[0].billable).toBe(true);
  });

  it('links nested sidechain usage to its parent for live interval ownership', async () => {
    const file = path.join(parent, 'subagents', 'agent-one.jsonl');
    const result = await collector([line(parent, 'm2', 4, { isSidechain: true })])
      .collect(file, null, 1024);
    expect(result.events[0]).toMatchObject({ sessionId: parent, parentSessionId: parent,
      subagentId: 'agent-one', billable: true });
  });

  it('accepts a flat subagent when its first record names the parent', async () => {
    const result = await collector([JSON.stringify({ type: 'user', sessionId: parent, isSidechain: true }),
      line(parent, 'm3', 5)])
      .collect('agent-one.jsonl', null, 1024);
    expect(result.events[0]).toMatchObject({ sessionId: parent, billable: true });
  });

  it('resumes at the cursor after an append instead of reading the file again', async () => {
    const replay = collector([line(parent, 'm5', 1)]);
    const first = await replay.collect(`${parent}.jsonl`, null, 1024 * 1024);
    expect(first.events).toHaveLength(1);
    replay.append([line(parent, 'm6', 2)]);
    const second = await replay.collect(`${parent}.jsonl`, first.next, 1024 * 1024);
    expect(second.next.fingerprint).toBe(first.next.fingerprint);
    expect(Number.isInteger(second.next.mtimeMs)).toBe(true);
    expect(second.events.map((event) => event.models[0].inputTokens)).toEqual([2]);
  });

  it('starts again from zero when the file was replaced', async () => {
    const first = await collector([line(parent, 'm7', 1)]).collect(`${parent}.jsonl`, null, 1024 * 1024);
    const second = await collector([line(parent, 'm8', 4), line(parent, 'm9', 5)])
      .collect(`${parent}.jsonl`, first.next, 1024 * 1024);
    expect(second.events).toHaveLength(2);
  });

  it('keeps a partial JSONL line at the cursor until a complete line is available', async () => {
    const replay = collector([line(parent, 'm4', 9, { padding: 'x'.repeat(300_000) })]);
    const first = await replay.collect(`${parent}.jsonl`, null, 256 * 1024);
    expect(first.events).toHaveLength(0);
    expect(first.next.byteOffset).toBe(0);
    const second = await replay.collect(`${parent}.jsonl`, first.next, 512 * 1024);
    expect(second.events[0].models[0].inputTokens).toBe(9);
  });
});
