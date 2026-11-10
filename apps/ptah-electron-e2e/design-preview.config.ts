import { defineConfig } from '@playwright/test';

/** Opt-in Electron captures for design preview pages. Never part of the default e2e target, never a gate. */
export default defineConfig({
  testDir: './src/design-preview',
  testMatch: '**/*.preview.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  globalSetup: './src/support/build-precheck.ts',
  reporter: [['list']],
  outputDir: '../../dist/apps/ptah-electron-e2e/design-preview-results',
  use: { actionTimeout: 15_000, trace: 'off', video: 'off', screenshot: 'off' },
});
