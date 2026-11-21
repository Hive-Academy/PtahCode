/**
 * CLI Save Dialog Provider Implementation
 *
 * Implements ISaveDialogProvider for the CLI/TUI environment:
 * - showSaveAndWrite: Writes content to the specified default filename
 *   in the current working directory (no interactive dialog in CLI).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ISaveDialogProvider } from '@ptah-extension/rpc-handlers';
import type { Logger } from '@ptah-extension/vscode-core';

export class CliSaveDialog implements ISaveDialogProvider {
  constructor(private readonly logger?: Pick<Logger, 'error'>) {}

  async showSaveAndWrite(options: {
    defaultFilename: string;
    filters: Record<string, string[]>;
    title: string;
    content: Buffer;
  }): Promise<string | null> {
    try {
      const safeName = path.basename(options.defaultFilename);
      if (!safeName) return null;

      const cwd = process.cwd();
      const filePath = path.resolve(cwd, safeName);
      if (!filePath.startsWith(cwd + path.sep) && filePath !== cwd) {
        return null;
      }

      await fs.writeFile(filePath, options.content);

      return filePath;
    } catch (error: unknown) {
      // degradation-audit: reported - logged at error when a logger is passed
      // (the CLI container passes one); the caller gets null.
      this.logger?.error('[CliSaveDialog] Could not write the file', {
        code: (error as NodeJS.ErrnoException | null)?.code,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return null;
    }
  }
}
