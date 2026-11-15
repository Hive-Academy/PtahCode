import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listClaudeProjectFiles } from './claude-project-discovery';

it('continues across directory names whose path order differs from name order', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'claude-discovery-'));
  try {
    const first = path.join(root, '-repo', 'child.jsonl');
    const second = path.join(root, '-repo-extra', 'child.jsonl');
    for (const file of [first, second]) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, '');
    }
    const collect = async (after?: string) => {
      const files: string[] = [];
      for await (const file of listClaudeProjectFiles(root, after)) files.push(file);
      return files;
    };
    expect(await collect()).toEqual([first, second]);
    expect(await collect(first)).toEqual([second]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
