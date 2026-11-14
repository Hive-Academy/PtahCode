import { readdir } from 'node:fs/promises';
import path from 'node:path';

export async function* listCliClaudeProjectFiles(root: string, startAfter?: string): AsyncGenerator<string> {
  async function* visit(dir: string, depth: number): AsyncGenerator<string> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => {
      const left = a.isDirectory() ? `${a.name}${path.sep}` : a.name;
      const right = b.isDirectory() ? `${b.name}${path.sep}` : b.name;
      return left < right ? 1 : left > right ? -1 : 0;
    })) {
      const file = path.join(dir, entry.name);
      if (startAfter && file > startAfter) continue;
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        if (!startAfter || file < startAfter) yield file;
      } else if (entry.isDirectory() && depth < 3) yield* visit(file, depth + 1);
    }
  }
  yield* visit(root, 0);
}
