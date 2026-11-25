import type { IDisposable } from '@ptah-extension/platform-core';

/**
 * Abstract port for settings persistence backends.
 *
 * Adapters in platform-{vscode,electron,cli} implement this interface,
 * providing the actual I/O layer. ReactiveSettingsStore wraps an adapter
 * instance to add in-process event emission.
 */
export interface ISettingsStore {
  /** Read a global (non-secret) setting from persistent storage. */
  readGlobal<T>(key: string): T | undefined;

  /**
   * Whether `key` has a stored value, not counting a registered default that
   * {@link readGlobal} falls back to. A store without this method is read as
   * "stored whenever `readGlobal` returns a value".
   */
  hasGlobal?(key: string): boolean;

  /** Write a global setting to persistent storage. */
  writeGlobal<T>(key: string, value: T): Promise<void>;

  /** Read a secret value (e.g., cipher text) from secure storage. */
  readSecret(key: string): Promise<string | undefined>;

  /** Write a secret value to secure storage. */
  writeSecret(key: string, ciphertext: string): Promise<void>;

  /** Delete a secret from secure storage. */
  deleteSecret(key: string): Promise<void>;

  /**
   * Subscribe to changes on a global setting key.
   * The callback fires whenever the value at `key` changes.
   * Dispose the returned handle to unsubscribe.
   */
  watchGlobal(key: string, cb: (value: unknown) => void): IDisposable;

  /**
   * Subscribe to changes on a secret key.
   * The callback fires (without the value — secrets are read-only on demand)
   * whenever the secret at `key` is written or deleted.
   * Dispose the returned handle to unsubscribe.
   */
  watchSecret(key: string, cb: () => void): IDisposable;

  /**
   * Synchronously flush any buffered writes to disk.
   * Used by process-exit handlers to avoid data loss.
   */
  flushSync(): void;
}

/**
 * Narrow extension of {@link ISettingsStore} for stores that support atomic
 * multi-key global writes and coherent multi-key global reads.
 *
 * Kept separate from {@link ISettingsStore} so unrelated adapters and mocks do
 * not need to implement batch methods.
 */
export interface IGlobalBatchSettingsStore extends ISettingsStore {
  /**
   * Read multiple global (non-secret) settings in a single synchronous turn.
   */
  readGlobalMany(keys: readonly string[]): Record<string, unknown>;

  /**
   * Atomically persist multiple global settings in one disk transaction and
   * return the frozen slice of entries committed by this transaction.
   */
  writeGlobalBatch(
    entries: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>>;
}

/**
 * Runtime type guard for {@link IGlobalBatchSettingsStore}.
 */
export function isGlobalBatchSettingsStore(
  store: ISettingsStore | null | undefined,
): store is IGlobalBatchSettingsStore {
  if (!store || typeof store !== 'object') return false;
  const candidate = store as Partial<IGlobalBatchSettingsStore>;
  return (
    typeof candidate.writeGlobalBatch === 'function' &&
    typeof candidate.readGlobalMany === 'function'
  );
}
