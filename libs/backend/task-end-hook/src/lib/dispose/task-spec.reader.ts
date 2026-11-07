/**
 * Bounded, read-only reads of task-spec files for the disposal collector:
 * the P2 carrier status (`task.md`), the P3 (c) `## Worktree` line of
 * `context.md`, and spec-folder listings. A file is never followed through
 * a symlink at its own path and never read past `MAX_SPEC_FILE_BYTES`.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  CARRIER_FILE,
  CONTEXT_FILE,
  SPEC_ROOT_SEGMENTS,
  type TaskStatus,
} from '@ptah-extension/shared';
import { parseTaskFile } from '@ptah-extension/task-specs';
import type { DisposalCarrier } from './disposal-input';
import { isMissing } from './fs-probe';

/** Bounded reads: carriers and context files are small text files. */
export const MAX_SPEC_FILE_BYTES = 1024 * 1024;

/** Reads a small regular file without following a symlink at its path. */
async function readSmallFile(
  file: string,
): Promise<string | 'absent' | 'unreadable'> {
  try {
    const info = await fs.lstat(file);
    if (!info.isFile() || info.size > MAX_SPEC_FILE_BYTES) return 'unreadable';
    return await fs.readFile(file, 'utf8');
  } catch (error: unknown) {
    return isMissing(error) ? 'absent' : 'unreadable';
  }
}

export async function readCarrierFile(
  file: string,
  taskId: string,
): Promise<TaskStatus | 'absent' | 'unparseable'> {
  const raw = await readSmallFile(file);
  if (raw === 'absent') return 'absent';
  if (raw === 'unreadable') return 'unparseable';
  const parsed = parseTaskFile(taskId, raw);
  return parsed.kind === 'task' ? parsed.task.status : 'unparseable';
}

/** P2: this task's carrier in the root it was seen in. */
export async function readCarrier(
  seenRoot: string,
  taskId: string,
): Promise<DisposalCarrier> {
  const status = await readCarrierFile(
    path.join(seenRoot, ...SPEC_ROOT_SEGMENTS, taskId, CARRIER_FILE),
    taskId,
  );
  return status === 'absent' || status === 'unparseable'
    ? { kind: 'unparseable' }
    : { kind: 'ok', status };
}

/** The P3 (c) line: a path, `null` when absent, or unreadable. */
export type ContextLine =
  | { readonly kind: 'ok'; readonly path: string | null }
  | { readonly kind: 'error' };

/**
 * P3 (c): the first absolute path token on the first non-blank line after a
 * `## Worktree` heading. Backticks and trailing punctuation around the token
 * are stripped; nothing else is normalised (the path must match exactly).
 */
export async function readContextWorktreeLine(
  root: string,
  taskId: string,
): Promise<ContextLine> {
  const raw = await readSmallFile(
    path.join(root, ...SPEC_ROOT_SEGMENTS, taskId, CONTEXT_FILE),
  );
  if (raw === 'absent') return { kind: 'ok', path: null };
  if (raw === 'unreadable') return { kind: 'error' };
  return { kind: 'ok', path: worktreeLinePath(raw) };
}

export function worktreeLinePath(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^##\s+Worktree\s*$/.test(line));
  if (heading === -1) return null;
  for (let i = heading + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (line.startsWith('#')) return null;
    for (const raw of line.split(/\s+/)) {
      const token = raw.replace(/^[`'"(]+/, '').replace(/[`'"),.;:]+$/, '');
      if (isAbsoluteToken(token)) return token;
    }
    return null;
  }
  return null;
}

function isAbsoluteToken(token: string): boolean {
  return path.isAbsolute(token) && token.length > 1;
}

export async function readdirOrEmpty(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
}
