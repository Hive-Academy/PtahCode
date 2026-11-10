/**
 * ElectronFileDialog — IFileDialog via the OS-native open dialog.
 */

import { injectable } from 'tsyringe';
import type { IFileDialog } from '@ptah-extension/platform-core';

interface DialogOwner {
  resolve: (paths: readonly string[]) => void;
  reject: (reason: unknown) => void;
}

interface OpenDialogEntry {
  dialog: Promise<readonly string[]>;
  owner: DialogOwner;
}

@injectable()
export class ElectronFileDialog implements IFileDialog {
  /** One native dialog per request shape; only its newest caller owns the result. */
  private readonly open = new Map<string, OpenDialogEntry>();

  /**
   * A repeated request cancels the previous owner's result immediately and takes
   * ownership of the dialog already on screen.
   */
  openFiles(options: {
    multiple: boolean;
    title: string;
    filters?: Record<string, string[]>;
  }): Promise<readonly string[]> {
    const key = JSON.stringify([
      options.multiple,
      options.title,
      options.filters ?? null,
    ]);
    let resolve!: DialogOwner['resolve'];
    let reject!: DialogOwner['reject'];
    const result = new Promise<readonly string[]>(
      (resolveResult, rejectResult) => {
        resolve = resolveResult;
        reject = rejectResult;
      },
    );
    const pending = this.open.get(key);
    if (pending) {
      pending.owner.resolve([]);
      pending.owner = { resolve, reject };
      return result;
    }

    const dialog = this.show(options);
    const entry: OpenDialogEntry = { dialog, owner: { resolve, reject } };
    this.open.set(key, entry);
    void entry.dialog.then(
      (paths) => {
        this.open.delete(key);
        entry.owner.resolve(paths);
      },
      (reason: unknown) => {
        this.open.delete(key);
        entry.owner.reject(reason);
      },
    );
    return result;
  }

  private async show(options: {
    multiple: boolean;
    title: string;
    filters?: Record<string, string[]>;
  }): Promise<readonly string[]> {
    const { dialog } = await import('electron');

    const properties: Array<'openFile' | 'multiSelections'> = ['openFile'];
    if (options.multiple) {
      properties.push('multiSelections');
    }

    const result = await dialog.showOpenDialog({
      properties,
      title: options.title,
      ...(options.filters
        ? {
            filters: Object.entries(options.filters).map(
              ([name, extensions]) => ({ name, extensions }),
            ),
          }
        : {}),
    });

    if (result.canceled) return [];
    return result.filePaths;
  }
}
