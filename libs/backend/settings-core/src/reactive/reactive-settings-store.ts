import { EventEmitter } from 'events';
import type { IDisposable } from '@ptah-extension/platform-core';
import {
  isGlobalBatchSettingsStore,
  type IGlobalBatchSettingsStore,
  type ISettingsStore,
} from '../ports/settings-store.interface';

/**
 * Reactive wrapper around a backend ISettingsStore.
 *
 * Adds in-process event emission so that multiple parts of the application
 * can subscribe to settings changes without polling the underlying store.
 *
 * Responsibilities:
 * - Maintains an in-memory read-through cache for global settings.
 * - On write, persists via the backend store, updates the cache, and fires listeners.
 * - On batch write, commits through the backend, publishes all committed keys
 *   to the cache in FIFO commit order before emitting events, and returns the
 *   committed slice.
 * - Delegates secret reads/writes directly to the backend (no caching of secrets).
 * - Delegates flushSync() to the backend.
 *
 * This class does NOT perform I/O itself — that is the backend store's job.
 * Adapters in platform-{electron,cli,vscode} supply the concrete backend.
 */
export class ReactiveSettingsStore implements IGlobalBatchSettingsStore {
  private readonly backend: ISettingsStore;
  private readonly globalCache = new Map<string, unknown>();
  private readonly globalEmitter = new EventEmitter();
  private readonly secretEmitter = new EventEmitter();
  /** Serializes batch cache updates and watcher emissions in FIFO commit order. */
  private batchPublicationQueue: Promise<void> = Promise.resolve();

  constructor(backend: ISettingsStore) {
    this.backend = backend;
    this.globalEmitter.setMaxListeners(100);
    this.secretEmitter.setMaxListeners(100);
  }

  readGlobal<T>(key: string): T | undefined {
    if (this.globalCache.has(key)) {
      return this.globalCache.get(key) as T | undefined;
    }
    const value = this.backend.readGlobal<T>(key);
    this.globalCache.set(key, value);
    return value;
  }

  readGlobalMany(keys: readonly string[]): Record<string, unknown> {
    const missingKeys: string[] = [];
    for (const key of keys) {
      if (!this.globalCache.has(key)) {
        missingKeys.push(key);
      }
    }
    if (missingKeys.length > 0) {
      if (isGlobalBatchSettingsStore(this.backend)) {
        const fetched = this.backend.readGlobalMany(missingKeys);
        for (const key of missingKeys) {
          this.globalCache.set(key, fetched[key]);
        }
      } else {
        for (const key of missingKeys) {
          const value = this.backend.readGlobal(key);
          this.globalCache.set(key, value);
        }
      }
    }
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = this.globalCache.get(key);
    }
    return result;
  }

  hasGlobal(key: string): boolean {
    return this.backend.hasGlobal
      ? this.backend.hasGlobal(key)
      : this.readGlobal(key) !== undefined;
  }

  async writeGlobal<T>(key: string, value: T): Promise<void> {
    await this.backend.writeGlobal(key, value);
    this.globalCache.set(key, value);
    this.globalEmitter.emit(key, value);
  }

  async writeGlobalBatch(
    entries: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (!isGlobalBatchSettingsStore(this.backend)) {
      throw new Error(
        'Underlying settings store does not support atomic batch writes (writeGlobalBatch)',
      );
    }
    const snapshot: Readonly<Record<string, unknown>> = Object.freeze({
      ...entries,
    });
    const backendPromise = this.backend.writeGlobalBatch(snapshot);
    // Attach a no-op catch synchronously so an out-of-order backend rejection
    // does not trigger UnhandledPromiseRejection while awaiting prevPublication.
    // degradation-audit: reported - Awaiting backendPromise later rejects the originating batch call.
    backendPromise.catch(() => undefined);

    const prevPublication = this.batchPublicationQueue;
    let committedSlice: Readonly<Record<string, unknown>> = Object.freeze({});

    const publish = async (): Promise<void> => {
      // degradation-audit: reported - The previous batch caller receives its own publication rejection.
      await prevPublication.catch(() => undefined);
      const committed = await backendPromise;
      const committedEntries = Object.entries(committed);
      for (const [key, value] of committedEntries) {
        this.globalCache.set(key, value);
      }
      committedSlice = committed;
      for (const [key, value] of committedEntries) {
        this.globalEmitter.emit(key, value);
      }
    };

    const step = publish();
    this.batchPublicationQueue = step;
    await step;
    return committedSlice;
  }

  readSecret(key: string): Promise<string | undefined> {
    return this.backend.readSecret(key);
  }

  async writeSecret(key: string, ciphertext: string): Promise<void> {
    await this.backend.writeSecret(key, ciphertext);
    this.secretEmitter.emit(key);
  }

  async deleteSecret(key: string): Promise<void> {
    await this.backend.deleteSecret(key);
    this.secretEmitter.emit(key);
  }

  watchGlobal(key: string, cb: (value: unknown) => void): IDisposable {
    this.globalEmitter.on(key, cb);
    return {
      dispose: () => {
        this.globalEmitter.off(key, cb);
      },
    };
  }

  watchSecret(key: string, cb: () => void): IDisposable {
    this.secretEmitter.on(key, cb);
    return {
      dispose: () => {
        this.secretEmitter.off(key, cb);
      },
    };
  }

  flushSync(): void {
    this.backend.flushSync();
  }

  /**
   * Invalidate the in-memory cache for a specific key.
   * Call this when the underlying store may have been modified out-of-band
   * (e.g., after a file-watcher fires for settings.json).
   */
  invalidateCache(key: string): void {
    this.globalCache.delete(key);
  }

  /** Invalidate the entire in-memory cache. */
  invalidateAllCache(): void {
    this.globalCache.clear();
  }
}
