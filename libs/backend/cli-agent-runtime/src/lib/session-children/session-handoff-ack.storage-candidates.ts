import * as path from 'node:path';
import {
  isWorkspaceScopedStateStorage,
  normalizeWorkspaceRoot,
  type IStateStorage,
} from '@ptah-extension/platform-core';

function hasDefaultStorage(storage: IStateStorage): storage is IStateStorage & {
  getDefaultStorage(): IStateStorage;
} {
  return (
    typeof (storage as { getDefaultStorage?: unknown }).getDefaultStorage ===
    'function'
  );
}

function rootKey(root: string): string {
  const windowsRoot =
    process.platform === 'win32' || /^[a-zA-Z]:[\\/]/.test(root);
  // path.posix keeps literal backslashes distinct, including when a test
  // models POSIX roots on a Windows host.
  if (!windowsRoot) return path.posix.resolve(root).replace(/\/+$/, '');
  const unified = root.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(unified)) {
    return path.win32
      .normalize(unified)
      .replace(/[\\/]+$/, '')
      .toLowerCase();
  }
  const normalized = normalizeWorkspaceRoot(unified);
  return normalized.toLowerCase();
}

export function defaultStorage(
  storage: IStateStorage,
): IStateStorage | undefined {
  return hasDefaultStorage(storage) ? storage.getDefaultStorage() : undefined;
}

export function storageForRoot(
  storage: IStateStorage,
  root: string,
): IStateStorage | undefined {
  if (!isWorkspaceScopedStateStorage(storage)) return storage;
  const key = rootKey(root);
  const registered = storage
    .getAllWorkspacePaths()
    .find((candidate) => rootKey(candidate) === key);
  return registered === undefined
    ? undefined
    : storage.getStorageForWorkspace(registered);
}

export function storageCandidates(storage: IStateStorage): IStateStorage[] {
  if (!isWorkspaceScopedStateStorage(storage)) return [storage];
  const candidates: IStateStorage[] = [];
  for (const root of storage.getAllWorkspacePaths()) {
    const delegate = storage.getStorageForWorkspace(root);
    if (delegate && !candidates.includes(delegate)) candidates.push(delegate);
  }
  const fallback = defaultStorage(storage);
  if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
  if (!fallback && !candidates.includes(storage)) candidates.push(storage);
  return candidates;
}

/** Positive when left has precedence; ties retain the first match. */
export function compareAckMatches(
  left: { record: { generation?: number }; pinned: boolean },
  right: { record: { generation?: number }; pinned: boolean },
): number {
  return (
    (left.record.generation ?? 0) - (right.record.generation ?? 0) ||
    Number(left.pinned) - Number(right.pinned)
  );
}
