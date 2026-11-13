import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileType } from '@ptah-extension/platform-core';
import { CodexRolloutUsageCollector, listCodexRolloutFiles, selectedCodexUsageRoots } from './codex-rollout-usage.reader';

const thread = '11111111-1111-4111-8111-111111111111';
const file = `rollout-2026-01-01T00-00-00-${thread}.jsonl`;
const meta = JSON.stringify({ type: 'session_meta', payload: { id: thread } });
function count(input: number, output: number, cache = 0): string {
  return JSON.stringify({ type: 'event_msg', timestamp: '2026-01-01T00:00:00Z', payload: {
    type: 'token_count', info: { total_token_usage: {
      input_tokens: input, output_tokens: output, cached_input_tokens: cache,
    } },
  } });
}

function fixture(lines: string[]) {
  let bytes = new TextEncoder().encode(`${lines.join('\n')}\n`);
  let modified = 1;
  const files = {
    lstat: jest.fn(async () => ({ type: FileType.File, ctime: modified, mtime: modified, size: bytes.length })),
    readFileRangeNoFollow: jest.fn(async (_path: string, offset: number, maxBytes: number) => ({
      bytes: bytes.subarray(offset, offset + maxBytes), truncated: offset + maxBytes < bytes.length,
    })),
  };
  return {
    collector: new CodexRolloutUsageCollector(files), files,
    append(linesToAdd: string[]) {
      const next = new TextEncoder().encode(`${linesToAdd.join('\n')}\n`);
      const joined = new Uint8Array(bytes.length + next.length);
      joined.set(bytes); joined.set(next, bytes.length); bytes = joined; modified++;
    },
  };
}

describe('CodexRolloutUsageCollector', () => {
  it('deltas cumulative counts and keeps native thread ownership', async () => {
    const replay = fixture([meta, count(10, 2, 3), count(18, 5, 7)]);
    const result = await replay.collector.collect(file, null, 4096);
    expect(result.events.map((event) => event.models[0])).toMatchObject([
      { inputTokens: 10, outputTokens: 2, cacheReadTokens: 3 },
      { inputTokens: 8, outputTokens: 3, cacheReadTokens: 4 },
    ]);
    expect(result.events[0]).toMatchObject({ nativeThreadId: thread, sessionId: thread, billable: true });
    expect(result.next.byteOffset).toBeGreaterThan(0);
  });

  it('resumes an appended thread without replaying old records', async () => {
    const replay = fixture([meta, count(10, 2)]);
    const first = await replay.collector.collect(file, null, 4096);
    replay.append([count(13, 4)]);
    const second = await replay.collector.collect(file, first.next, 4096);
    expect(second.events).toHaveLength(1);
    expect(second.events[0].models[0]).toMatchObject({ inputTokens: 3, outputTokens: 2 });
    expect(second.next.fingerprint).toBe(first.next.fingerprint);
    expect(second.next.byteOffset).toBeGreaterThan(first.next.byteOffset);
  });

  it('handles a cumulative reset as a new epoch', async () => {
    const replay = fixture([meta, count(10, 2), count(3, 1)]);
    const result = await replay.collector.collect(file, null, 4096);
    expect(result.events[1].models[0]).toMatchObject({ inputTokens: 3, outputTokens: 1 });
  });

  it('rejects a path without a native UUID filename', async () => {
    const replay = fixture([meta, count(1, 1)]);
    await expect(replay.collector.collect('rollout-bad.jsonl', null, 4096)).rejects.toThrow('Invalid Codex rollout filename');
  });

  it('does not bill a rollout whose session_meta names another native thread', async () => {
    const replay = fixture([JSON.stringify({ type: 'session_meta', payload: {
      id: '22222222-2222-4222-8222-222222222222',
    } }), count(1, 1)]);
    const result = await replay.collector.collect(file, null, 4096);
    expect(result.events[0]).toMatchObject({ billable: false, missingReason: 'unmatched-provider-event' });
  });
});

describe('Codex rollout discovery', () => {
  it('scans date partitions newest first', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-stream-'));
    try {
      for (const date of ['2025/12/31', '2026/01/01']) {
        const dir = join(root, ...date.split('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, file), `${meta}\n`);
      }
      const found: string[] = [];
      for await (const path of listCodexRolloutFiles(root)) found.push(path);
      expect(found).toHaveLength(2);
      expect(found[0]).toContain(join('2026', '01', '01'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('uses the selected non-default CODEX_HOME', () => {
    const prior = process.env['CODEX_HOME'];
    try {
      process.env['CODEX_HOME'] = join(tmpdir(), 'selected-codex-home');
      expect(selectedCodexUsageRoots()).toEqual([join(process.env['CODEX_HOME'], 'sessions')]);
    } finally {
      if (prior === undefined) delete process.env['CODEX_HOME'];
      else process.env['CODEX_HOME'] = prior;
    }
  });
});
