/**
 * ElectronFileDialog — IFileDialog via the OS-native open dialog.
 */

import { injectable } from 'tsyringe';
import type { IFileDialog } from '@ptah-extension/platform-core';

@injectable()
export class ElectronFileDialog implements IFileDialog {
  /** Open dialogs by request shape, so a repeated request joins the dialog on screen. */
  private readonly open = new Map<string, Promise<readonly string[]>>();

  /**
   * The dialog is not modal, so the same request can arrive again while it is
   * open. That request gets the result of the open dialog, not a second dialog.
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
    const pending = this.open.get(key);
    if (pending) return pending;
    const shown = this.show(options).finally(() => {
      this.open.delete(key);
    });
    this.open.set(key, shown);
    return shown;
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
