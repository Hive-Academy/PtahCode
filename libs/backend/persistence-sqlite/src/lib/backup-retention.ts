/**
 * Backup retention selection: which files rotation may delete.
 *
 * Pure helpers (no I/O). A file is deletable only if its name matches the
 * file-name pattern the backup service itself creates for that kind, its
 * resolved path is inside the backup directory of that kind, and it is not the
 * live database or one of its `-wal` / `-shm` sidecars.
 */
import * as path from 'node:path';

export type RetentionKind = 'pre-migration' | 'daily' | 'reset';

/** The two forms this service has created: old seconds, current millis + hex. */
const COMPACT_STAMP = String.raw`\d{8}T(?:\d{6}Z|\d{9}Z-[0-9a-f]{8})`;
const DAILY_STAMP = String.raw`\d{4}-\d{2}-\d{2}`;
const STAGING_SUFFIX = /\.[0-9a-f]{8}\.tmp(?:-wal|-shm)?$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Full-name pattern of a backup file the service creates for `kind`. */
export function backupNamePattern(prefix: string, kind: RetentionKind): RegExp {
  const stamp = kind === 'daily' ? DAILY_STAMP : COMPACT_STAMP;
  return new RegExp(`^${escapeRegExp(prefix)}${stamp}\\.sqlite$`);
}

function isOwnFinalName(file: string, prefix: string, kind: RetentionKind): boolean {
  if (!backupNamePattern(prefix, kind).test(file)) return false;
  const stamp = file.slice(prefix.length, -'.sqlite'.length);
  const iso = kind === 'daily' ? `${stamp}T00:00:00.000Z`
    : `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}.${stamp.slice(15, 18).match(/^\d{3}$/)?.[0] ?? '000'}Z`;
  const parsed = new Date(iso);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === iso;
}

/** True when `target` resolves to a path strictly inside `root`. */
export function isInsideDir(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return (
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

function isLiveDbFile(target: string, liveDbPath: string): boolean {
  const resolved = path.resolve(target);
  const live = path.resolve(liveDbPath);
  const caseFold = (value: string): string =>
    process.platform === 'win32' ? value.toLowerCase() : value;
  return [live, `${live}-wal`, `${live}-shm`].some(
    (candidate) => caseFold(candidate) === caseFold(resolved),
  );
}

function isSafeTarget(dir: string, file: string, liveDbPath: string): boolean {
  const target = path.join(dir, file);
  return isInsideDir(dir, target) && !isLiveDbFile(target, liveDbPath);
}

/** Staging roots created for an own final backup name, including sidecar-only groups. */
export function selectOwnStagingRoots(input: Omit<RetentionInput, 'keep'>): string[] {
  const roots = new Set<string>();
  for (const file of input.entries) {
    if (!STAGING_SUFFIX.test(file) || !isSafeTarget(input.dir, file, input.liveDbPath)) continue;
    const root = file.replace(/(?:-wal|-shm)$/, '');
    const finalName = root.replace(/\.[0-9a-f]{8}\.tmp$/, '');
    if (!isOwnFinalName(finalName, input.prefix, input.kind) || !isSafeTarget(input.dir, root, input.liveDbPath)) continue;
    roots.add(root);
  }
  return [...roots];
}

function stampValue(file: string, prefix: string, kind: RetentionKind): string {
  const stamp = file.slice(prefix.length, -'.sqlite'.length);
  if (kind === 'daily') return stamp.replace(/-/g, '');
  const match = /^(\d{8}T\d{6})(\d{3})?Z(?:-[0-9a-f]{8})?$/.exec(stamp);
  if (!match) return '';
  return match[1].replace('T', '') + (match[2] ?? '000');
}

export interface RetentionInput {
  readonly entries: readonly string[];
  readonly dir: string;
  readonly prefix: string;
  readonly kind: RetentionKind;
  readonly keep: number;
  readonly liveDbPath: string;
}

/**
 * Names (newest first order dropped) to delete: everything past the `keep`
 * newest matching files. Returns an empty list when `keep <= 0`.
 */
export function selectBackupsToDelete(input: RetentionInput): string[] {
  if (input.keep <= 0) return [];
  return input.entries
    .filter((file) => isOwnFinalName(file, input.prefix, input.kind))
    .sort((a, b) => stampValue(b, input.prefix, input.kind).localeCompare(stampValue(a, input.prefix, input.kind)) || b.localeCompare(a))
    .slice(input.keep)
    .filter((file) => isSafeTarget(input.dir, file, input.liveDbPath));
}
