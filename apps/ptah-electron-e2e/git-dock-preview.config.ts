import { defineConfig } from '@playwright/test';

/**
 * Design preview capture for the detachable Git dock (TASK_2026_906, PR #1038).
 * Separate from `playwright.config.ts`, and the capture file is a `*.shot.ts`,
 * so the ordinary `e2e` target never runs it. Run it by hand from the
 * repository root, after `build-dev` and `copy-renderer-dev` of ptah-electron:
 *   node scripts/verify.mjs --exec --task git-dock-preview -- \
 *     npx playwright test --config=apps/ptah-electron-e2e/git-dock-preview.config.ts
 */
export default defineConfig({
  testDir: './src/specs/git-dock-preview',
  testMatch: ['**/*.shot.ts'],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 420_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  outputDir: '../../dist/apps/ptah-electron-e2e/git-dock-preview-results',
  use: { actionTimeout: 15_000, trace: 'off', video: 'off', screenshot: 'off' },
});
