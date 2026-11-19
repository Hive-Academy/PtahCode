/**
 * CliStateStorage — IStateStorage implementation using JSON file with in-memory cache.
 *
 * Replaces vscode.Memento (globalState / workspaceState).
 * Thread-safe writes via atomic rename pattern (write to .tmp then rename).
 * Serializes concurrent writes via promise chain to prevent corruption.
 *
 * Copied from ElectronStateStorage (identical logic, CLI class prefix).
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { IStateStorage } from '@ptah-extension/platform-core';

export class CliStateStorage implements IStateStorage {
  private data: Record<string, unknown> = {};
  private readonly filePath: string;
  private writePromise: Promise<void> = Promise.resolve();
  private readonly keyGenerations = new Map<string, number>();

  constructor(storageDirPath: string, filename: string) {
    this.filePath = path.join(storageDirPath, filename);
    this.loadSync();
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.data[key];
    return value !== undefined ? (value as T) : defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    const previous = this.data[key];
    const generation = (this.keyGenerations.get(key) ?? 0) + 1;
    this.keyGenerations.set(key, generation);
    if (value === undefined) delete this.data[key];
    else this.data[key] = value;
    // degradation-audit: reported — the previous update caller received its rejection.
    const write = this.writePromise.catch(() => undefined).then(async () => {
      try {
        await this.persist();
      } catch (error: unknown) {
        // A failed older write must not undo a newer in-memory update.
        if (this.keyGenerations.get(key) === generation) {
          if (previous === undefined) delete this.data[key];
          else this.data[key] = previous;
        }
        throw error;
      }
    });
    // The caller receives persistence errors; subsequent updates may retry.
    this.writePromise = write;
    await write;
  }

  keys(): readonly string[] {
    return Object.keys(this.data);
  }

  private loadSync(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fsPromises.mkdir(dir, { recursive: true });
    const tmpPath = this.filePath + '.tmp';
    await fsPromises.writeFile(
      tmpPath,
      JSON.stringify(this.data, null, 2),
      'utf-8',
    );
    await fsPromises.rename(tmpPath, this.filePath);
  }
}
