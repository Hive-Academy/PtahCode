import { TaskIndexRebuildQueue, type RebuildResult } from './task-index-rebuild-queue';

const result: RebuildResult = { indexedCount: 1, excludedCount: 0, indexWritten: true };

describe('TaskIndexRebuildQueue', () => {
  it('merges superseded folders and settles every caller with the replacement', async () => {
    const queue = new TaskIndexRebuildQueue();
    let release!: () => void;
    const active = queue.enqueue('a', () => new Promise<RebuildResult>((resolve) => {
      release = () => resolve(result);
    }));
    const first = queue.enqueue('a', async () => result, ['one']);
    const second = queue.enqueue('a', async (folders) => {
      expect(folders).toEqual(expect.arrayContaining(['one', 'two']));
      return result;
    }, ['two']);
    release();
    await expect(Promise.all([active, first, second])).resolves.toEqual([result, result, result]);
    queue.dispose();
  });

  it('preserves a forced full scan when a later folder job supersedes it', async () => {
    const queue = new TaskIndexRebuildQueue();
    let release!: () => void;
    const active = queue.enqueue('a', () => new Promise<RebuildResult>((resolve) => {
      release = () => resolve(result);
    }));
    const full = queue.enqueue('a', async () => result, [], true);
    const folder = queue.enqueue('a', async (folders, forceFull) => {
      expect(folders).toEqual(['changed']);
      expect(forceFull).toBe(true);
      return result;
    }, ['changed']);
    release();
    await Promise.all([active, full, folder]);
    queue.dispose();
  });

  it('rejects only a new root when 64 roots are waiting', async () => {
    const queue = new TaskIndexRebuildQueue();
    let release!: () => void;
    const active = queue.enqueue('active', () => new Promise<RebuildResult>((resolve) => {
      release = () => resolve(result);
    }));
    const second = queue.enqueue('other-active', async () => result);
    const waiting = Array.from({ length: 64 }, (_, i) => queue.enqueue(`wait-${i}`, async () => result));
    await expect(queue.enqueue('overflow', async () => result)).rejects.toThrow('queue full');
    release();
    await Promise.all([active, second, ...waiting]);
    queue.dispose();
  });
  it('runs at most two roots and starts waiting roots in FIFO order', async () => {
    const queue = new TaskIndexRebuildQueue();
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const run = (root: string) => queue.enqueue(root, () => new Promise<RebuildResult>((resolve) => {
      started.push(root);
      releases.push(() => resolve(result));
    }));
    const a = run('a');
    const b = run('b');
    const c = run('c');
    expect(started).toEqual(['a', 'b']);
    releases[0]();
    await a;
    await Promise.resolve();
    expect(started).toEqual(['a', 'b', 'c']);
    releases[1]();
    releases[2]();
    await Promise.all([b, c]);
    queue.dispose();
  });

  it('rejects pending work on disposal', async () => {
    const queue = new TaskIndexRebuildQueue();
    const hold = () => new Promise<RebuildResult>(() => undefined);
    void queue.enqueue('a', hold);
    void queue.enqueue('b', hold);
    const pending = queue.enqueue('c', async () => result);
    queue.dispose();
    await expect(pending).rejects.toThrow('disposed');
  });
});
