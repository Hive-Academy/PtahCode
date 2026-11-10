import { defineConfig } from '@playwright/test';

/**
 * Design preview capture (TASK_2026_902). Separate from `playwright.config.ts`
 * so the capture never runs in the ordinary `e2e` target. Run it by hand:
 *   node scripts/verify.mjs --exec --task findings-preview -- \
 *     npx playwright test --config=apps/ptah-electron-e2e/design-preview.config.ts
 * The Electron build (`build-dev` + `copy-renderer-dev`) must exist first.
 */
export default defineConfig({
  testDir: './src/design-preview',
  testMatch: ['**/*.shot.ts'],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  outputDir: '../../dist/apps/ptah-electron-e2e/design-preview-results',
  use: { actionTimeout: 15_000, trace: 'off', video: 'off', screenshot: 'off' },
});
