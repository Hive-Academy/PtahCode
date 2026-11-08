import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MAX_SPEC_FILE_BYTES,
  readCarrier,
  readContextWorktreeLine,
  readdirOrEmpty,
  worktreeLinePath,
} from './task-spec.reader';

const TASK_ID = 'TASK_2026_001_abcd';

let root: string;

function writeSpec(file: string, content: string): string {
  const target = path.join(root, '.ptah', 'specs', TASK_ID, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-task-spec-reader-'));
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('worktreeLinePath', () => {
  it('takes the first absolute token after the heading, stripping backticks and punctuation', () => {
    expect(
      worktreeLinePath('# Ctx\n\n## Worktree\n\nPath: `/tmp/wt-a`.\n'),
    ).toBe('/tmp/wt-a');
  });

  it('returns null without a heading, for a relative token, or when a heading follows', () => {
    expect(worktreeLinePath('## Other\n/tmp/wt\n')).toBeNull();
    expect(worktreeLinePath('## Worktree\nrelative/wt\n')).toBeNull();
    expect(worktreeLinePath('## Worktree\n\n## Next\n/tmp/wt\n')).toBeNull();
  });
});

describe('readContextWorktreeLine', () => {
  it('reads the worktree line of context.md', async () => {
    writeSpec('context.md', '## Worktree\n/tmp/wt-b\n');

    expect(await readContextWorktreeLine(root, TASK_ID)).toEqual({
      kind: 'ok',
      path: '/tmp/wt-b',
    });
  });

  it('treats a missing context.md as no line', async () => {
    expect(await readContextWorktreeLine(root, TASK_ID)).toEqual({
      kind: 'ok',
      path: null,
    });
  });

  it('reports an oversized or non-regular context.md as an error', async () => {
    writeSpec('context.md', 'x'.repeat(MAX_SPEC_FILE_BYTES + 1));
    expect(await readContextWorktreeLine(root, TASK_ID)).toEqual({
      kind: 'error',
    });

    const dir = path.join(root, '.ptah', 'specs', TASK_ID, 'context.md');
    fs.rmSync(dir);
    fs.mkdirSync(dir);
    expect(await readContextWorktreeLine(root, TASK_ID)).toEqual({
      kind: 'error',
    });
  });
});

describe('readCarrier', () => {
  it('maps a missing carrier to unparseable', async () => {
    expect(await readCarrier(root, TASK_ID)).toEqual({ kind: 'unparseable' });
  });

  it('maps a carrier without a valid frontmatter to unparseable', async () => {
    writeSpec('task.md', 'not a task carrier\n');
    expect(await readCarrier(root, TASK_ID)).toEqual({ kind: 'unparseable' });
  });

  it('does not follow a symlink at the carrier path', async () => {
    const outside = path.join(root, 'outside.md');
    fs.writeFileSync(outside, 'anything');
    const target = path.join(root, '.ptah', 'specs', TASK_ID, 'task.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(outside, target);

    expect(await readCarrier(root, TASK_ID)).toEqual({ kind: 'unparseable' });
  });
});

describe('readdirOrEmpty', () => {
  it('lists a directory and returns [] for a missing one', async () => {
    writeSpec('task.md', '');
    expect(await readdirOrEmpty(path.join(root, '.ptah', 'specs'))).toEqual([
      TASK_ID,
    ]);
    expect(await readdirOrEmpty(path.join(root, 'missing'))).toEqual([]);
  });

  it('treats a path under a plain file (ENOTDIR) as missing', async () => {
    const file = path.join(root, 'plain-file');
    fs.writeFileSync(file, '');
    expect(await readdirOrEmpty(path.join(file, 'sub'))).toEqual([]);
  });

  it('rethrows a failure other than a missing path', async () => {
    jest
      .spyOn(fs.promises, 'readdir')
      .mockRejectedValue(
        Object.assign(new Error('denied'), { code: 'EACCES' }),
      );
    await expect(readdirOrEmpty(root)).rejects.toMatchObject({
      code: 'EACCES',
    });
  });
});
