import { seedPtahSettingsFile } from '@ptah-extension/platform-core';

/** Select isolated Electron settings before composition, then seed them once. */
export function prepareDevelopmentSettings(
  productionDir: string,
  developmentDir: string,
  reportFailure: (error: Error) => void,
): void {
  process.env['PTAH_SETTINGS_DIR'] = developmentDir;
  try {
    seedPtahSettingsFile(productionDir, developmentDir);
  } catch (error: unknown) {
    reportFailure(error instanceof Error ? error : new Error(String(error)));
  }
}
