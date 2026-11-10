import { defineConfig } from '@playwright/test';

/** Isolated, opt-in Electron visual gate. Never included in the default e2e target. */
export default defineConfig({
  testDir: './src/visual-parity',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  globalSetup: './src/support/build-precheck.ts',
  reporter: [['list']],
  outputDir: '../../dist/apps/ptah-electron-e2e/visual-parity-results',
  snapshotPathTemplate: '../../.ptah/specs/TASK_2026_904/wave1/visual/snapshots/{arg}{ext}',
  use: { actionTimeout: 15_000, trace: 'off', video: 'off', screenshot: 'off' },
});
