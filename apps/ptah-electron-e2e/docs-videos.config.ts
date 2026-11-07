import { defineConfig } from '@playwright/test';

/** Manual Electron documentation recording; never part of ordinary e2e. */
export default defineConfig({
  testDir: './src/docs-videos',
  testMatch: ['**/*.flow.ts'],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  globalSetup: './src/docs-screenshots/_harness/docs-global-setup.ts',
  globalTeardown: './src/docs-screenshots/_harness/docs-global-teardown.ts',
  reporter: [['list']],
  outputDir: '../../dist/apps/ptah-electron-e2e/docs-videos-results',
  use: { actionTimeout: 15_000, trace: 'off', video: 'off', screenshot: 'off' },
});
