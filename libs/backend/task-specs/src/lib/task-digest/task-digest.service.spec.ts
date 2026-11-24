import * as path from 'path';
import { FileType, type DirectoryEntry, type FileStat, type IFileSystemProvider } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import { normalizeWorkspaceRoot } from '../normalize-workspace-root';
import { TaskIndexService } from '../task-index.service';
import type { ITaskIndexStore } from '../task-index.store';
import type { TaskScannerService } from '../task-scanner.service';
import { TaskDigestService } from './task-digest.service';

const ROOT = normalizeWorkspaceRoot(path.resolve('/workspace'));
const OTHER_ROOT = normalizeWorkspaceRoot(path.resolve('/other-workspace'));
const ID = 'TASK_2026_123';
const KB = 1024;
const ENCODER = new TextEncoder();

function carrier(title = 'Test') {
  return `---\nstatus: in_review\ntype: FEATURE\ntitle: ${title}\ncreated: 2026-07-14T10:00:00.000Z\nupdated: 2026-07-14T10:00:00.000Z\n---\nbody`;
}

function taskFolder(root = ROOT) {
  return path.join(root, '.ptah', 'specs', ID);
}

function setup() {
  const files = new Map<string, { bytes: Uint8Array; mtime: number }>();
  const directories = new Map<string, DirectoryEntry[]>();
  const links = new Set<string>();
  const listFailure = new Set<string>();
  const readFailure = new Set<string>();
  const merged = new Set<string>();
  let bytesReturned = 0;
  let probeBytes = 0;

  function addDirectory(target: string) {
    if (directories.has(target)) return;
    directories.set(target, []);
    const parent = path.dirname(target);
    if (parent === target) return;
    addDirectory(parent);
    directories.get(parent)?.unshift({ name: path.basename(target), type: FileType.Directory });
  }

  function write(name: string, contents: string | Uint8Array, root = ROOT, mtime = 1) {
    const target = path.join(taskFolder(root), name);
    const parent = path.dirname(target);
    addDirectory(parent);
    if (!files.has(target)) {
      directories.get(parent)?.unshift({ name: path.basename(target), type: FileType.File });
    }
    files.set(target, { bytes: typeof contents === 'string' ? ENCODER.encode(contents) : contents, mtime });
  }

  function missing(): Error {
    return Object.assign(new Error('missing'), { code: 'ENOENT' });
  }

  const fs = {
    realpath: jest.fn(async (target: string) => target),
    lstat: jest.fn(async (target: string): Promise<FileStat> => {
      const file = files.get(target);
      if (file) return { type: FileType.File, size: file.bytes.length, mtime: file.mtime, ctime: 0 };
      if (links.has(target)) return { type: FileType.SymbolicLink, size: 0, mtime: 0, ctime: 0 };
      if (directories.has(target)) return { type: FileType.Directory, size: 0, mtime: 0, ctime: 0 };
      throw missing();
    }),
    readDirectory: jest.fn(async (target: string) => {
      if (listFailure.has(target)) throw new Error('temporarily unavailable');
      const entries = directories.get(target);
      if (!entries) throw missing();
      return [...entries];
    }),
    readFileBoundedNoFollow: jest.fn(async (target: string, maxBytes: number) => {
      if (readFailure.has(target)) throw new Error('temporarily unreadable');
      const file = files.get(target);
      if (!file) throw missing();
      const bytes = file.bytes.slice(0, maxBytes);
      const truncated = file.bytes.length > maxBytes;
      bytesReturned += bytes.length;
      probeBytes += Number(truncated);
      return { bytes, truncated };
    }),
  };
  const index = new TaskIndexService(
    {} as Logger, fs as unknown as IFileSystemProvider, {} as TaskScannerService, {} as ITaskIndexStore,
    undefined, { mergedTaskIds: () => merged },
  );
  return {
    fs, write, links, listFailure, readFailure, merged,
    service: new TaskDigestService(index),
    mkdir: (name: string) => addDirectory(path.join(taskFolder(), name)),
    bytes: () => bytesReturned,
    probes: () => probeBytes,
    nestedCalls: () => fs.readDirectory.mock.calls.map(([target]) => path.relative(taskFolder(), target)).filter(Boolean),
  };
}

describe('TaskDigestService', () => {
  it('lists markdown-named directories to depth two and visits parents before their sorted children', async () => {
    const f = setup();
    f.write('task.md', carrier());
    f.write('notes.md/b/picture.PNG', 'img');
    f.write('notes.md/a/deeper/never-read.md', 'md');
    f.write('alpha/z/abc.MD', 'md');
    const digest = await f.service.getDigest(ROOT, ID);
    expect(f.nestedCalls()).toEqual(['alpha', 'notes.md', path.join('alpha', 'z'), path.join('notes.md', 'a'), path.join('notes.md', 'b')]);
    expect(digest?.truncatedReasons).toEqual(['depth']);
    expect(digest?.documents.map(({ name }) => name)).toEqual(['task.md']);
    expect(digest?.directories).toEqual([
      { name: 'alpha', files: 1, markdown: 1, images: 0, directories: 1, symlinks: 0, truncated: false, counted: true },
      { name: 'notes.md', files: 1, markdown: 0, images: 1, directories: 3, symlinks: 0, truncated: true, counted: true },
    ]);
  });

  it('charges empty, rejected, missing and unreadable lists and marks unvisited parents and children truncated', async () => {
    const f = setup();
    f.write('task.md', carrier());
    for (let i = 0; i < 100; i++) f.mkdir(`d${String(i).padStart(3, '0')}`);
    f.links.add(path.join(taskFolder(), 'd000'));
    const missingPath = path.join(taskFolder(), 'd001');
    const originalStat = f.fs.lstat.getMockImplementation();
    f.fs.lstat.mockImplementation(async (target) => {
      if (target === missingPath) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      if (!originalStat) throw new Error('fixture missing lstat');
      return originalStat(target);
    });
    f.listFailure.add(path.join(taskFolder(), 'd002'));
    f.mkdir('d003/child');
    const digest = await f.service.getDigest(ROOT, ID);
    expect(f.nestedCalls()).toHaveLength(62);
    expect(f.nestedCalls()).toContain('d063');
    expect(f.nestedCalls()).not.toContain('d064');
    expect(f.nestedCalls()).not.toContain(path.join('d003', 'child'));
    expect(digest?.directories?.filter(({ truncated }) => truncated)).toHaveLength(40);
    const countedOf = (name: string) => digest?.directories?.find((d) => d.name === name)?.counted;
    expect(countedOf('d003')).toBe(true);
    expect(countedOf('d002')).toBe(false);
    expect(countedOf('d064')).toBe(false);
    expect(digest?.directories?.filter(({ counted, truncated }) => !counted && !truncated)).toHaveLength(0);
    expect(digest?.truncatedReasons).toEqual(['nested']);
  });

  it('charges a rejected depth-two child against the breadth-first list budget', async () => {
    const f = setup();
    f.write('task.md', carrier());
    for (let i = 0; i < 65; i++) f.mkdir(`parent/c${String(i).padStart(3, '0')}`);
    f.links.add(path.join(taskFolder(), 'parent', 'c000'));

    const digest = await f.service.getDigest(ROOT, ID);
    const calls = f.nestedCalls();
    expect(calls).toHaveLength(63);
    expect(calls.at(-1)).toBe(path.join('parent', 'c062'));
    expect(calls).not.toContain(path.join('parent', 'c063'));
    expect(digest?.directories?.[0]).toMatchObject({ directories: 65, truncated: true });
    expect(digest?.truncatedReasons).toEqual(['nested']);
  });

  it('enumerates exactly 64 empty directories before stopping', async () => {
    const f = setup();
    f.write('task.md', carrier());
    for (let i = 0; i < 100; i++) f.mkdir(`d${String(i).padStart(3, '0')}`);
    const digest = await f.service.getDigest(ROOT, ID);
    expect(f.nestedCalls()).toHaveLength(64);
    expect(digest?.directories?.filter(({ truncated }) => truncated)).toHaveLength(36);
  });

  it.each([200, 201])('counts a sorted directory prefix and schedules no list after the 1000-entry limit (%d)', async (count) => {
    const f = setup();
    f.write('task.md', carrier());
    for (let parent = 0; parent < 5; parent++) {
      for (let i = 0; i < (parent === 0 ? count : 200); i++) {
        f.write(`p${parent}/a${String(i).padStart(3, '0')}.md`, '');
      }
    }
    f.mkdir('p5/child');
    const digest = await f.service.getDigest(ROOT, ID);
    expect(f.nestedCalls()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(digest?.directories?.map(({ files, truncated }) => [files, truncated])).toEqual([
      [200, count === 201], [200, false], [200, false], [200, false], [200, false], [0, true],
    ]);
    expect(digest?.truncatedReasons).toEqual(['nested']);
  });

  it.each([500, 501])('probes priority names beyond the sorted top cap and separates probe and revalidation stats (%d)', async (count) => {
    const f = setup();
    for (let i = 0; i < count - 1; i++) f.write(`a${String(i).padStart(3, '0')}.txt`, '');
    f.write('task.md', carrier());
    const digest = await f.service.getDigest(ROOT, ID);
    expect(digest?.entryCount).toBe(count);
    expect(digest?.documents).toHaveLength(count);
    expect(digest?.truncatedReasons).toEqual(count === 501 ? ['entries'] : []);
    const calls = f.fs.lstat.mock.calls.map(([target]) => target);
    expect(calls.filter((target) => /^a\d+\.txt$/.test(path.basename(target)))).toHaveLength(count - 1);
    expect(calls.filter((target) => path.basename(target) === 'context.md')).toHaveLength(1);
    expect(calls.filter((target) => path.basename(target) === 'task.md')).toHaveLength(3);
    expect(f.fs.readFileBoundedNoFollow).toHaveBeenCalledTimes(1);
  });

  it('retries transient reads with identical metadata and a successful warm digest reads zero bytes', async () => {
    const f = setup();
    f.write('task.md', carrier());
    f.write('context.md', '# Context');
    f.readFailure.add(path.join(taskFolder(), 'context.md'));
    const failed = await f.service.getDigest(ROOT, ID);
    expect(failed?.documents).toContainEqual(expect.objectContaining({ name: 'context.md', readable: false, extraction: 'failed' }));
    f.readFailure.clear();
    const good = await f.service.getDigest(ROOT, ID);
    expect(good?.documents).toContainEqual(expect.objectContaining({ name: 'context.md', readable: true, extraction: 'ok' }));
    const previousBytes = f.bytes();
    expect(await f.service.getDigest(ROOT, ID)).toBe(good);
    expect(f.bytes()).toBe(previousBytes);
  });

  it('revalidates metadata after a read and does not memoize an unstable fragment or digest', async () => {
    const f = setup();
    f.write('task.md', carrier());
    f.write('context.md', 'text');
    const target = path.join(taskFolder(), 'context.md');
    const lstat = f.fs.lstat.getMockImplementation();
    let inspected = 0;
    f.fs.lstat.mockImplementation(async (p) => {
      if (!lstat) throw new Error('fixture missing lstat');
      const stat = await lstat(p);
      return p === target && ++inspected === 3 ? { ...stat, mtime: 2 } : stat;
    });
    const first = await f.service.getDigest(ROOT, ID);
    expect(await f.service.getDigest(ROOT, ID)).not.toBe(first);
    expect(f.fs.readFileBoundedNoFollow.mock.calls.filter(([p]) => p === target)).toHaveLength(2);
  });

  it('refreshes nested counts and merged status using cached top-level content and omits branch and PR', async () => {
    const f = setup();
    f.write('task.md', carrier().replace('title: Test', 'title: Test\nbranch: work\npr: 42'));
    f.write('assets/a.png', 'ignored');
    const first = await f.service.getDigest(ROOT, ID);
    const bytes = f.bytes();
    f.write('assets/b.md', 'ignored');
    const second = await f.service.getDigest(ROOT, ID);
    expect(first?.directories?.[0].files).toBe(1);
    expect(second?.directories?.[0]).toMatchObject({ files: 2, images: 1, markdown: 1 });
    expect(second?.task.status).toBe('in_review');
    expect(f.fs.lstat).not.toHaveBeenCalledWith(path.join(taskFolder(), 'assets', 'b.md'));

    f.merged.add(ID);
    const merged = await f.service.getDigest(ROOT, ID);
    expect(merged?.task).toMatchObject({ status: 'done', carrierStatus: 'in_review' });
    expect(merged).not.toHaveProperty('branch');
    expect(merged).not.toHaveProperty('pr');
    expect(merged?.task).not.toHaveProperty('branch');
    expect(merged?.task).not.toHaveProperty('pr');
    expect(f.bytes()).toBe(bytes);
  });

  it('isolates canonical workspaces even when file names, sizes and mtimes match', async () => {
    const f = setup();
    f.write('task.md', carrier('One'));
    f.write('task.md', carrier('Two'), OTHER_ROOT);
    expect((await f.service.getDigest(ROOT, ID))?.task.title).toBe('One');
    expect((await f.service.getDigest(OTHER_ROOT, ID))?.task.title).toBe('Two');
  });

  it('deduplicates an in-flight failure, retries after it, and returns null for a missing carrier', async () => {
    const f = setup();
    f.mkdir('empty');
    expect(await f.service.getDigest(ROOT, ID)).toBeNull();
    f.write('task.md', new Uint8Array([0xff]));
    const failed = f.service.getDigest(ROOT, ID);
    expect(f.service.getDigest(ROOT, ID)).toBe(failed);
    await expect(failed).rejects.toThrow('Task carrier read failed: binary');
    f.write('task.md', carrier());
    await expect(f.service.getDigest(ROOT, ID)).resolves.toHaveProperty('task.title', 'Test');
  });

  it('returns null for an absent task folder or carrier and retries an invalid carrier without memoizing it', async () => {
    const f = setup();
    await expect(f.service.getDigest(ROOT, ID)).resolves.toBeNull();
    f.mkdir('empty');
    await expect(f.service.getDigest(ROOT, ID)).resolves.toBeNull();

    f.write('task.md', '---\nstatus: [\n---\n');
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(f.service.getDigest(ROOT, ID)).rejects.toMatchObject({ code: 'INVALID_TASK_CARRIER' });
    }
    expect(f.fs.readFileBoundedNoFollow).toHaveBeenCalledTimes(2);

    f.write('task.md', carrier());
    await expect(f.service.getDigest(ROOT, ID)).resolves.toHaveProperty('task.title', 'Test');
  });

  it.each([
    ['batches.md', 'progress'],
    ['tasks.md', 'progress'],
    ['decisions.md', 'decisions'],
  ] as const)('marks an unreadable or capped %s even when %s cannot be extracted', async (name, field) => {
    const f = setup();
    f.write('task.md', carrier());
    const absent = await f.service.getDigest(ROOT, ID);
    expect(absent).toMatchObject({ truncated: false, truncatedReasons: [] });
    expect(absent).not.toHaveProperty(field);

    f.write(name, '- [x] First');
    f.readFailure.add(path.join(taskFolder(), name));
    const unreadable = await f.service.getDigest(ROOT, ID);
    expect(unreadable).toMatchObject({ truncated: true, truncatedReasons: ['reads'] });
    expect(unreadable).not.toHaveProperty(field);
    expect(unreadable?.documents.find((doc) => doc.name === name)?.extraction).toBe('failed');

    f.readFailure.clear();
    f.write(name, ' '.repeat(64 * KB + 1));
    const capped = await f.service.getDigest(ROOT, ID);
    expect(capped).toMatchObject({ truncated: true, truncatedReasons: ['bytes'] });
    if (field === 'progress') expect(capped).not.toHaveProperty('progress');
    expect(capped?.documents.find((doc) => doc.name === name)?.extraction).toBe('capped');
  });

  it('marks open questions partial when one selected question source cannot be read', async () => {
    const f = setup();
    f.write('task.md', carrier());
    f.write('context.md', '# Context');
    f.write('task-description.md', '## Open questions\n- Unknown');
    f.readFailure.add(path.join(taskFolder(), 'task-description.md'));
    const digest = await f.service.getDigest(ROOT, ID);
    expect(digest).toMatchObject({ openQuestions: 0, truncated: true, truncatedReasons: ['reads'] });
  });

  it('marks listed progress and review documents that could not be inspected', async () => {
    const f = setup();
    f.write('task.md', carrier());
    f.write('batches.md', '- [x] First');
    f.write('plan-review.md', '## Verdict APPROVED');
    const stat = f.fs.lstat.getMockImplementation();
    if (!stat) throw new Error('fixture missing lstat');
    f.fs.lstat.mockImplementation(async (target) => {
      if (target === path.join(taskFolder(), 'batches.md') || target === path.join(taskFolder(), 'plan-review.md')) {
        throw new Error('temporarily unreadable');
      }
      return stat(target);
    });

    const digest = await f.service.getDigest(ROOT, ID);
    expect(digest).toMatchObject({ truncated: true, truncatedReasons: ['reads'] });
    expect(digest?.documents.filter((doc) => doc.extraction === 'failed').map(({ name }) => name))
      .toEqual(['batches.md', 'plan-review.md']);
  });

  it('marks reviews skipped by the read limit even when no source reaches the byte cap', async () => {
    const f = setup();
    f.write('task.md', carrier());
    for (let i = 0; i < 26; i++) f.write(`subject-${String(i).padStart(2, '0')}-review.md`, '## Verdict APPROVED');
    const digest = await f.service.getDigest(ROOT, ID);
    expect(digest).toMatchObject({ truncated: true, truncatedReasons: ['reads'] });
    expect(digest?.reviews?.filter(({ extraction }) => extraction === 'skipped')).toHaveLength(2);
  });

  it('limits extraction to 24 reads, 2.5 MiB returned and 25 extra probe bytes', async () => {
    const f = setup();
    f.write('task.md', carrier().padEnd(1024 * KB, ' '));
    for (let i = 0; i < 25; i++) f.write(`subject-${String(i).padStart(2, '0')}-review.md`, ' '.repeat(64 * KB + 1));
    const digest = await f.service.getDigest(ROOT, ID);
    expect(f.fs.readFileBoundedNoFollow).toHaveBeenCalledTimes(25);
    expect(f.bytes()).toBe(2.5 * 1024 * KB);
    expect(f.probes()).toBe(24);
    expect(digest?.truncatedReasons).toEqual(['bytes', 'reads']);
    expect(digest?.reviews?.at(-1)).toMatchObject({ extraction: 'skipped' });
  });

  it.each([
    [64 * KB - 1, false, 'ok', 'APPROVED'],
    [64 * KB, false, 'ok', 'APPROVED'],
    [64 * KB + 1, false, 'capped', null],
    [64 * KB + 1, true, 'capped', 'APPROVED'],
  ])('extracts only complete lines from capped reviews (%d bytes, boundary LF %s)', async (size, finalLf, extraction, verdict) => {
    const f = setup();
    f.write('task.md', carrier());
    const heading = '# Verdict APPROVED';
    const text = finalLf ? heading.padEnd(size - 2, ' ') + '\nx' : heading.padEnd(size, ' ');
    f.write('plan-review.md', text);
    const digest = await f.service.getDigest(ROOT, ID);
    expect(digest?.reviews?.[0]).toMatchObject({ extraction, verdict });
  });
});
