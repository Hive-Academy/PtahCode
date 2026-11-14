import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCodexFiles } from './codex-rollout-file-source';

async function collect(root: string, startAfter?: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of listCodexFiles(root, startAfter)) files.push(file);
  return files;
}

it('continues after a saved path through insertion and deletion among 21 rollout files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-discovery-'));
  try {
    const day = join(root, '2026', '11', '13');
    mkdirSync(day, { recursive: true });
    const write = (index: number) => {
      const file = join(day, `rollout-2026-11-13T12-00-${String(index).padStart(2, '0')}-019a1b2c-3d4e-7f80-9a1b-2c3d4e5f6a7b.jsonl`);
      writeFileSync(file, '{}\n');
      return file;
    };
    for (let index = 0; index < 21; index++) write(index);
    const first = (await collect(root)).slice(0, 16);
    expect(first).toHaveLength(16);
    const saved = first[15];
    unlinkSync(saved);
    const inserted = write(21);
    const remaining = await collect(root, saved);
    expect(remaining).toHaveLength(5);
    expect(remaining).not.toContain(inserted);
    expect(new Set([...first, ...remaining]).size).toBe(21);
    expect(await collect(root)).toContain(inserted);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
