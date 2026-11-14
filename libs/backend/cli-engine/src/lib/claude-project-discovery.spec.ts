import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listCliClaudeProjectFiles } from './claude-project-discovery';

it('continues from a file before a sibling directory with a shared prefix', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cli-discovery-'));
  try {
    const directoryChild = path.join(root, 'a', 'child.jsonl');
    const sibling = path.join(root, 'a.jsonl');
    mkdirSync(path.dirname(directoryChild), { recursive: true });
    writeFileSync(directoryChild, '');
    writeFileSync(sibling, '');
    const collect = async (after?: string) => {
      const files: string[] = [];
      for await (const file of listCliClaudeProjectFiles(root, after)) files.push(file);
      return files;
    };
    expect(await collect()).toEqual([directoryChild, sibling]);
    expect(await collect(directoryChild)).toEqual([sibling]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
