import * as fs from 'fs';
import * as path from 'path';
import { test as base, type ElectronApplication, type Page } from '@playwright/test';
import { launchPtah } from '../../support/electron-launcher';
import { UiDriver } from '../../support/ui-driver';
import { prepareDocsProfile, productionSettingsHash, assertSettingsOrRetain, assertChildHome, closeDocsApp } from '../../docs-screenshots/_harness/docs-profile';
import { createDocsSampleRepo } from '../../docs-screenshots/_harness/docs-repo';
import { finalizeVideo } from './finalize-video';

interface VideoFixtures {
  app: ElectronApplication;
  page: Page;
  ui: UiDriver;
  markStart: () => void;
  finish: (name: string) => Promise<void>;
}

const size = { width: 1600, height: 900 };
let recordingStartAt = 0;
let recordingLaunchedAt = 0;
export const test = base.extend<VideoFixtures>({
  app: async ({ playwright }, use) => {
    void playwright;
    const settingsHash = productionSettingsHash();
    const repo = createDocsSampleRepo();
    try {
    const profile = prepareDocsProfile({ folders: [repo.root] });
    let app: ElectronApplication | undefined;
    try {
    const videoDir = path.join(profile.runDir, 'video');
    fs.mkdirSync(videoDir);
    recordingLaunchedAt = Date.now();
    app = await launchPtah({
        args: [repo.root], userDataDir: profile.dir, timeout: 180_000,
        recordVideo: { dir: videoDir, size },
        // Electron userData and os.homedir() are separate locations. Isolate both.
        env: profile.env,
      });
      await assertChildHome(app, profile.home);
      await use(app);
    } finally {
      if (app) await closeDocsApp(app);
      assertSettingsOrRetain(settingsHash, profile.runDir);
      profile.cleanup();
    }
    } finally { repo.cleanup(); }
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow({ timeout: 180_000 });
    await page.locator('ptah-electron-shell').waitFor({ state: 'visible' });
    await app.evaluate(({ BrowserWindow }, dimensions) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.setContentSize(dimensions.width, dimensions.height);
    }, size);
    await page.setViewportSize(size);
    await use(page);
  },
  ui: async ({ app, page }, use) => { await use(new UiDriver(app, page)); },
  markStart: async ({ playwright }, use) => {
    void playwright;
    recordingStartAt = 0;
    await use(() => { recordingStartAt = Date.now(); });
  },
  finish: async ({ app, page }, use) => {
    let finished = false;
    await use(async (name) => {
      if (finished) throw new Error('Video already finalized');
      const video = page.video();
      if (!video) throw new Error('Electron recording was not started');
      if (!recordingStartAt) throw new Error('Mark the intended first frame before finishing');
      await closeDocsApp(app);
      await finalizeVideo(video, name, recordingStartAt, recordingLaunchedAt);
      finished = true;
    });
  },
});
export const expect = base.expect;

/** Wait for both settings data sources and CLI discovery before the first saved frame. */
export async function waitForSettledSettings(page: Page): Promise<void> {
  const settings = page.locator('ptah-providers-settings');
  const matrix = page.getByTestId('cli-matrix');
  await expect(settings.getByTestId('connections-grid').getByTestId('provider-connection-card').first())
    .toBeVisible({ timeout: 120_000 });
  await expect(settings.getByTestId('catalog-hint-text'))
    .not.toContainText('Loading the provider catalog', { timeout: 120_000 });
  await expect(matrix).toHaveAttribute('aria-busy', 'false', { timeout: 120_000 });
  await expect(page.getByTestId('policy-order')).toBeVisible({ timeout: 120_000 });
  await expect(matrix.getByTestId('cli-matrix-row-codex'))
    .toBeVisible({ timeout: 120_000 });
  await expect(settings).not.toContainText('Detecting…', { timeout: 120_000 });
}
