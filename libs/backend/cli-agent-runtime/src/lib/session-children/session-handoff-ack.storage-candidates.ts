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
  const unified = root.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(unified)) {
    return path.win32
      .normalize(unified)
      .replace(/[\\/]+$/, '')
      .toLowerCase();
  }
  const normalized = normalizeWorkspaceRoot(unified);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
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
  const candidates = [storage];
  if (isWorkspaceScopedStateStorage(storage)) {
    for (const root of storage.getAllWorkspacePaths()) {
      const delegate = storage.getStorageForWorkspace(root);
      if (delegate && !candidates.includes(delegate)) candidates.push(delegate);
    }
  }
  if (hasDefaultStorage(storage)) {
    const fallback = storage.getDefaultStorage();
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }
  return candidates;
}
