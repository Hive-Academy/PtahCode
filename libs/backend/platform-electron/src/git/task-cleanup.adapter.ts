import { execFile } from 'node:child_process';
import { realpath, lstat } from 'node:fs/promises';
import * as path from 'node:path';
import type { Logger } from '@ptah-extension/vscode-core';

export interface GitResult { readonly stdout: string; readonly exitCode: number }
export type GitRunner = (args: readonly string[], cwd: string) => Promise<GitResult>;
type Result<T> = { readonly kind: 'already-removed'; readonly reason: string } | { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'refused' | 'failed'; readonly reason: string };
interface Inspection { readonly canonicalPath: string; readonly branch: string; readonly clean: boolean; readonly branchMergedIntoMain: boolean }
interface GitCleanupPort {
  inspectTaskWorktree(mainRoot: string, worktreePath: string, branch: string): Promise<Result<Inspection>>;
  removeWorktree(mainRoot: string, canonicalPath: string): Promise<Result<void>>;
  deleteBranch(mainRoot: string, branch: string): Promise<Result<void>>;
}

const TIMEOUT_MS = 10_000;
const MAX_BUFFER = 1024 * 1024;

/** Argument-vector runner; never invokes a shell. */
export const runCleanupGit: GitRunner = (args, cwd) => new Promise((resolve, reject) => {
  execFile('git', [...args], { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout) => {
    if (error && typeof error.code !== 'number') { reject(error); return; }
    resolve({ stdout, exitCode: error && typeof error.code === 'number' ? error.code : 0 });
  });
});

function inside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function listedWorktrees(porcelain: string): Array<{ path: string; branch?: string }> {
  return porcelain.split(/\r?\n\r?\n/).flatMap(block => {
    const lines = block.split(/\r?\n/);
    const worktree = lines.find(line => line.startsWith('worktree '));
    if (!worktree) return [];
    const branch = lines.find(line => line.startsWith('branch refs/heads/'));
    return [{ path: worktree.slice(9), branch: branch?.slice('branch refs/heads/'.length) }];
  });
}

export class TaskCleanupAdapter implements GitCleanupPort {
  constructor(private readonly logger: Pick<Logger, 'error'>, private readonly run: GitRunner = runCleanupGit) {}

  private async context(mainRoot: string): Promise<{ root: string; area: string; entries: Array<{ path: string; branch?: string }> }> {
    const root = await realpath(mainRoot);
    const list = await this.run(['worktree', 'list', '--porcelain'], root);
    if (list.exitCode !== 0) throw new Error('Unable to list Git worktrees');
    const entries = listedWorktrees(list.stdout);
    if (!entries.some(entry => path.resolve(entry.path) === root)) throw new Error('Main checkout is not a registered worktree');
    return { root, area: path.join(root, '.claude-worktrees'), entries };
  }

  private async candidate(mainRoot: string, worktreePath: string): Promise<{ root: string; canonicalPath: string; branch?: string } | null> {
    const context = await this.context(mainRoot);
    const canonicalPath = await realpath(worktreePath);
    if (!inside(canonicalPath, context.area) || canonicalPath === context.root) return null;
    const entry = context.entries.find(item => path.resolve(item.path) === canonicalPath);
    return entry ? { root: context.root, canonicalPath, branch: entry.branch } : null;
  }

  async inspectTaskWorktree(mainRoot: string, worktreePath: string, branch: string): Promise<Result<Inspection>> {
    try {
      const context = await this.context(mainRoot);
      const resolved = path.resolve(worktreePath);
      if (!branch || branch === 'main' || branch === 'master' || !inside(resolved, context.area))
        return { kind: 'refused', reason: 'Worktree path or branch is not eligible' };
      try {
        await lstat(resolved);
      } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          if (!context.entries.some(entry => path.resolve(entry.path) === resolved))
            return { kind: 'already-removed', reason: 'already-removed' };
          return { kind: 'refused', reason: 'Registered worktree path is missing' };
        }
        throw error;
      }
      const target = await this.candidate(mainRoot, worktreePath);
      if (!target || !branch || branch === 'main' || branch === 'master' || target.branch !== branch) return { kind: 'refused', reason: 'Worktree path or branch is not an eligible task worktree' };
      const current = await this.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], target.root);
      if (current.exitCode !== 0) return { kind: 'failed', reason: 'Unable to identify current branch' };
      if (current.stdout.trim() === branch) return { kind: 'refused', reason: 'Cannot clean the current branch' };
      const status = await this.run(['status', '--porcelain'], target.canonicalPath);
      const merged = await this.run(['merge-base', '--is-ancestor', branch, 'main'], target.root);
      if (merged.exitCode === 128) return { kind: 'refused', reason: 'Unknown merge reference' };
      if (status.exitCode !== 0 || (merged.exitCode !== 0 && merged.exitCode !== 1)) return { kind: 'failed', reason: 'Unable to verify worktree status or merge' };
      return { kind: 'ok', value: { canonicalPath: target.canonicalPath, branch, clean: status.stdout.length === 0, branchMergedIntoMain: merged.exitCode === 0 } };
    } catch (error) { this.logger.error('Git cleanup inspection failed', error instanceof Error ? error : new Error(String(error))); return { kind: 'failed', reason: 'Unable to inspect task worktree' }; }
  }

  async removeWorktree(mainRoot: string, canonicalPath: string): Promise<Result<void>> {
    try {
      const target = await this.candidate(mainRoot, canonicalPath);
      if (!target || !target.branch || target.branch === 'main' || target.branch === 'master') return { kind: 'refused', reason: 'Worktree is not an eligible task worktree' };
      const check = await this.inspectTaskWorktree(mainRoot, canonicalPath, target.branch);
      if (check.kind !== 'ok') return check;
      if (!check.value.clean || !check.value.branchMergedIntoMain) return { kind: 'refused', reason: 'Worktree is dirty or branch is unmerged' };
      const result = await this.run(['worktree', 'remove', '--', target.canonicalPath], target.root);
      return result.exitCode === 0 ? { kind: 'ok', value: undefined } : { kind: 'failed', reason: 'Git worktree removal failed' };
    } catch (error) { this.logger.error('Git worktree removal failed', error instanceof Error ? error : new Error(String(error))); return { kind: 'failed', reason: 'Unable to remove task worktree' }; }
  }

  async deleteBranch(mainRoot: string, branch: string): Promise<Result<void>> {
    if (!branch || branch === 'main' || branch === 'master' || branch.startsWith('-')) return { kind: 'refused', reason: 'Protected branch' };
    try {
      const context = await this.context(mainRoot);
      const current = await this.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], context.root);
      if (current.exitCode !== 0) return { kind: 'failed', reason: 'Unable to identify current branch' };
      if (current.stdout.trim() === branch) return { kind: 'refused', reason: 'Cannot delete current branch' };
      const exists = await this.run(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], context.root);
      if (exists.exitCode === 1) return { kind: 'ok', value: undefined };
      if (exists.exitCode !== 0) return { kind: 'failed', reason: 'Unable to verify branch' };
      if (context.entries.some(entry => entry.branch === branch)) return { kind: 'refused', reason: 'Branch still has a worktree' };
      const merged = await this.run(['merge-base', '--is-ancestor', branch, 'main'], context.root);
      if (merged.exitCode !== 0) return merged.exitCode === 1 || merged.exitCode === 128 ? { kind: 'refused', reason: 'Branch is not proven merged into main' } : { kind: 'failed', reason: 'Unable to verify merge' };
      const result = await this.run(['branch', '-d', '--', branch], context.root);
      return result.exitCode === 0 ? { kind: 'ok', value: undefined } : { kind: 'failed', reason: 'Git branch deletion failed' };
    } catch (error) { this.logger.error('Git branch deletion failed', error instanceof Error ? error : new Error(String(error))); return { kind: 'failed', reason: 'Unable to delete task branch' }; }
  }
}


