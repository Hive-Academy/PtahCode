/**
 * `TaskWriterService` write-settle signal (TASK_2026_886, Component 4a).
 *
 * `hasWriteInFlight(root)` is true from the moment a validated write starts
 * until it has finished, index notification included; `onDidSettleWrites`
 * fires once when a root's count returns to zero. The task-end detector gates
 * on this boundary, so a gate that can stay closed (a throwing notifier) or
 * open early (a fire between overlapping writes) is a silent miss.
 */
import * as path from 'path';
import {
  createMockFileSystemProvider,
  type MockFileSystemProvider,
} from '@ptah-extension/platform-core/testing';
import { CARRIER_FILE, renderTaskMd } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';

import { normalizeWorkspaceRoot } from './normalize-workspace-root';
import type { ITaskIndexNotifier } from './task-index.port';
import { NoOpTaskFolderVisibility } from './task-folder-visibility.port';
import {
  TaskWriterService,
  type TaskWritesSettledEvent,
} from './task-writer.service';

const ROOT_A = normalizeWorkspaceRoot('d:/tmp/ws-settle-a');
const ROOT_B = normalizeWorkspaceRoot('d:/tmp/ws-settle-b');
const TASK_1 = 'TASK_2026_501';
const TASK_2 = 'TASK_2026_502';

function makeLogger(): Logger & { warn: jest.Mock } {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger & { warn: jest.Mock };
}

/**
 * A notifier whose every `applyFolderChange` waits until the test releases
 * it, so a write can be held open at its very last step.
 */
class GatedNotifier implements ITaskIndexNotifier {
  readonly calls: Array<{ root: string; folder: string }> = [];
  private readonly pending: Array<() => void> = [];

  applyFolderChange(workspaceRoot: string, folderName: string): Promise<void> {
    this.calls.push({ root: workspaceRoot, folder: folderName });
    return new Promise<void>((resolve) => this.pending.push(resolve));
  }

  /** Resolves when `count` notifications are waiting to be released. */
  async waitForPending(count: number): Promise<void> {
    for (let i = 0; i < 1000 && this.pending.length < count; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    if (this.pending.length < count) {
      throw new Error(`expected ${count} pending notifications`);
    }
  }

  releaseNext(): void {
    const next = this.pending.shift();
    if (next === undefined) throw new Error('no pending notification');
    next();
  }
}

class ThrowingNotifier implements ITaskIndexNotifier {
  async applyFolderChange(): Promise<void> {
    throw new Error('index exploded');
  }
}

class CountingNotifier implements ITaskIndexNotifier {
  calls = 0;
  async applyFolderChange(): Promise<void> {
    this.calls++;
  }
}

function carrier(taskId: string): string {
  return renderTaskMd({
    id: taskId,
    title: 'Settle under test',
    type: 'FEATURE',
    status: 'in_progress',
    now: '2026-11-01T00:00:00.000Z',
  });
}

async function seed(
  fs: MockFileSystemProvider,
  root: string,
  taskIds: readonly string[],
): Promise<void> {
  for (const id of taskIds) {
    await fs.writeFile(
      path.join(root, '.ptah', 'specs', id, CARRIER_FILE),
      carrier(id),
    );
  }
}

function makeWriter(notifier: ITaskIndexNotifier, logger = makeLogger()) {
  const fs = createMockFileSystemProvider();
  const writer = new TaskWriterService(
    fs,
    logger,
    notifier,
    new NoOpTaskFolderVisibility(),
  );
  const settled: TaskWritesSettledEvent[] = [];
  writer.onDidSettleWrites((e) => settled.push(e));
  return { fs, writer, logger, settled };
}

describe('TaskWriterService write-settle signal', () => {
  it('counts updateMetadata as in flight until its notification finishes', async () => {
    const notifier = new GatedNotifier();
    const { fs, writer, settled } = makeWriter(notifier);
    await seed(fs, ROOT_A, [TASK_1]);

    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    const write = writer.updateMetadata(ROOT_A, TASK_1, { status: 'done' });
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);

    await notifier.waitForPending(1);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);
    expect(settled).toEqual([]);

    notifier.releaseNext();
    const result = await write;

    expect(result.success).toBe(true);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);
  });

  it('counts updateStatus through updateMetadata', async () => {
    const notifier = new GatedNotifier();
    const { fs, writer, settled } = makeWriter(notifier);
    await seed(fs, ROOT_A, [TASK_1]);

    const write = writer.updateStatus(ROOT_A, TASK_1, 'done');
    await notifier.waitForPending(1);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);

    notifier.releaseNext();
    expect((await write).success).toBe(true);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toHaveLength(1);
  });

  it('counts create until its notification finishes', async () => {
    const notifier = new GatedNotifier();
    const { writer, settled } = makeWriter(notifier);

    const write = writer.create(ROOT_A, { title: 'New', type: 'FEATURE' });
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);

    await notifier.waitForPending(1);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);
    expect(settled).toEqual([]);

    notifier.releaseNext();
    expect((await write).success).toBe(true);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);
  });

  it('counts adoptFolder until its notification finishes', async () => {
    const notifier = new GatedNotifier();
    const { fs, writer, settled } = makeWriter(notifier);
    await fs.createDirectory(path.join(ROOT_A, '.ptah', 'specs', TASK_1));

    const write = writer.adoptFolder(ROOT_A, TASK_1, {
      title: 'Adopted',
      type: 'REFACTORING',
      status: 'done',
    });
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);

    await notifier.waitForPending(1);
    notifier.releaseNext();
    expect((await write).success).toBe(true);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);
  });

  it('fires once after overlapping writes on one root, and not between them', async () => {
    const notifier = new GatedNotifier();
    const { fs, writer, settled } = makeWriter(notifier);
    await seed(fs, ROOT_A, [TASK_1, TASK_2]);

    const first = writer.updateMetadata(ROOT_A, TASK_1, { status: 'done' });
    const second = writer.updateMetadata(ROOT_A, TASK_2, { status: 'done' });
    await notifier.waitForPending(2);

    notifier.releaseNext();
    expect((await first).success).toBe(true);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);
    expect(settled).toEqual([]);

    notifier.releaseNext();
    expect((await second).success).toBe(true);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);
  });

  it('keeps two roots independent', async () => {
    const notifier = new GatedNotifier();
    const { fs, writer, settled } = makeWriter(notifier);
    await seed(fs, ROOT_A, [TASK_1]);
    await seed(fs, ROOT_B, [TASK_1]);

    const onA = writer.updateMetadata(ROOT_A, TASK_1, { status: 'done' });
    const onB = writer.updateMetadata(ROOT_B, TASK_1, { status: 'done' });
    await notifier.waitForPending(2);
    expect(notifier.calls.map((c) => c.root)).toEqual([ROOT_A, ROOT_B]);

    notifier.releaseNext();
    await onA;
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(writer.hasWriteInFlight(ROOT_B)).toBe(true);
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);

    notifier.releaseNext();
    await onB;
    expect(writer.hasWriteInFlight(ROOT_B)).toBe(false);
    expect(settled).toEqual([
      { workspaceRoot: ROOT_A },
      { workspaceRoot: ROOT_B },
    ]);
  });

  it('matches an unnormalised root to the same key', async () => {
    const notifier = new GatedNotifier();
    const { fs, writer, settled } = makeWriter(notifier);
    await seed(fs, ROOT_A, [TASK_1]);

    // A trailing separator is one of the differences the normaliser removes.
    const write = writer.updateMetadata(`${ROOT_A}/`, TASK_1, {
      status: 'done',
    });
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);
    expect(writer.hasWriteInFlight(`${ROOT_A}//`)).toBe(true);

    await notifier.waitForPending(1);
    notifier.releaseNext();
    await write;
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);
  });

  it('still settles when the notifier throws', async () => {
    const { fs, writer, settled } = makeWriter(new ThrowingNotifier());
    await seed(fs, ROOT_A, [TASK_1]);

    const result = await writer.updateMetadata(ROOT_A, TASK_1, {
      status: 'done',
    });

    expect(result.success).toBe(true);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);
  });

  it('still settles when the write itself fails', async () => {
    const { fs, writer, settled } = makeWriter(new CountingNotifier());
    await seed(fs, ROOT_A, [TASK_1]);
    fs.writeFile.mockRejectedValueOnce(new Error('disk full'));

    const result = await writer.updateMetadata(ROOT_A, TASK_1, {
      status: 'done',
    });

    expect(result).toEqual({
      success: false,
      error: { code: 'WRITE_FAILED', message: 'Failed to write task.md.' },
    });
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);
  });

  it('a throwing listener changes neither the result nor later listeners', async () => {
    const notifier = new CountingNotifier();
    const { fs, writer, logger, settled } = makeWriter(notifier);
    await seed(fs, ROOT_A, [TASK_1]);
    writer.onDidSettleWrites(() => {
      throw new Error('listener exploded');
    });
    const later: TaskWritesSettledEvent[] = [];
    writer.onDidSettleWrites((e) => later.push(e));

    const result = await writer.updateMetadata(ROOT_A, TASK_1, {
      status: 'done',
    });

    expect(result.success).toBe(true);
    expect(settled).toHaveLength(1);
    expect(later).toEqual([{ workspaceRoot: ROOT_A }]);
    expect(logger.warn).toHaveBeenCalledWith(
      '[task-specs] write-settle listener failed',
      { workspaceRoot: ROOT_A, error: 'listener exploded' },
    );
  });

  it('settles a deferNotify write without notifying', async () => {
    const notifier = new CountingNotifier();
    const { fs, writer, settled } = makeWriter(notifier);
    await seed(fs, ROOT_A, [TASK_1]);

    const write = writer.updateMetadata(
      ROOT_A,
      TASK_1,
      { status: 'done' },
      { deferNotify: true },
    );
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(true);

    expect((await write).success).toBe(true);
    expect(notifier.calls).toBe(0);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toEqual([{ workspaceRoot: ROOT_A }]);
  });

  it('does not count a call rejected by argument validation', async () => {
    const { writer, settled } = makeWriter(new CountingNotifier());

    const result = await writer.updateMetadata(ROOT_A, '../escape', {
      status: 'done',
    });
    const created = await writer.create(ROOT_A, { title: ' ', type: 'BUGFIX' });

    expect(result.success).toBe(false);
    expect(created.success).toBe(false);
    expect(writer.hasWriteInFlight(ROOT_A)).toBe(false);
    expect(settled).toEqual([]);
  });

  it('stops delivering to a disposed listener', async () => {
    const { fs, writer } = makeWriter(new CountingNotifier());
    await seed(fs, ROOT_A, [TASK_1]);
    const seen: TaskWritesSettledEvent[] = [];
    const subscription = writer.onDidSettleWrites((e) => seen.push(e));
    subscription.dispose();

    await writer.updateMetadata(ROOT_A, TASK_1, { status: 'done' });

    expect(seen).toEqual([]);
  });
});
