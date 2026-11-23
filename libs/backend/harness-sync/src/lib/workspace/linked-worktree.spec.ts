/**
 * Linked git worktree detection (#1469).
 *
 * Source-under-test: `isLinkedWorktreeRoot` and its synchronous form. The rule
 * is git's own layout: `.git` is a FILE in a linked worktree and a directory in
 * the main checkout. Anything else, an error included, reads as false.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  isLinkedWorktreeRoot,
  isLinkedWorktreeRootSync,
} from './linked-worktree';

describe('isLinkedWorktreeRoot (#1469)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'harness-linked-worktree-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('is true when .git is a file (a linked worktree)', async () => {
    writeFileSync(join(root, '.git'), 'gitdir: /repo/.git/worktrees/wt\n');

    await expect(isLinkedWorktreeRoot(root)).resolves.toBe(true);
    expect(isLinkedWorktreeRootSync(root)).toBe(true);
  });

  it('is false when .git is a directory (the main checkout)', async () => {
    mkdirSync(join(root, '.git'));

    await expect(isLinkedWorktreeRoot(root)).resolves.toBe(false);
    expect(isLinkedWorktreeRootSync(root)).toBe(false);
  });

  it('is false when .git is missing, and for a missing root or an empty path', async () => {
    await expect(isLinkedWorktreeRoot(root)).resolves.toBe(false);
    expect(isLinkedWorktreeRootSync(root)).toBe(false);

    const missing = join(root, 'does-not-exist');
    await expect(isLinkedWorktreeRoot(missing)).resolves.toBe(false);
    expect(isLinkedWorktreeRootSync(missing)).toBe(false);

    await expect(isLinkedWorktreeRoot('')).resolves.toBe(false);
    expect(isLinkedWorktreeRootSync('')).toBe(false);
  });

  it('reads an lstat error as false', async () => {
    // A NUL byte makes lstat itself throw (ERR_INVALID_ARG_VALUE), with no
    // mock between the helper and the real fs.
    const invalid = `${root}\0bad`;

    await expect(isLinkedWorktreeRoot(invalid)).resolves.toBe(false);
    expect(isLinkedWorktreeRootSync(invalid)).toBe(false);
  });
});
