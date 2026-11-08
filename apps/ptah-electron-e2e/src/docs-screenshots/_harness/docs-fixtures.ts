import * as fs from 'fs';
import * as path from 'path';
import {
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { launchPtah } from '../../support/electron-launcher';
import { UiDriver } from '../../support/ui-driver';
import { sizeForCapture } from './shooter';
import { prepareDocsProfile, productionSettingsHash, assertSettingsOrRetain, assertChildHome, closeDocsApp } from './docs-profile';
import { createDocsSampleRepo } from './docs-repo';

/**
 * Run the real Electron app against a throwaway sample repository and profile.
 * The launcher supplies an isolated database. Individual shots may mock RPC.
 */

/** All default captures use the throwaway sample repository. */
export const DOCS_WORKSPACE = 'sample-repo';

export interface DocsFixtures {
  app: ElectronApplication;
  page: Page;
  /** Navigation helpers; shots may opt into a fake renderer RPC listener. */
  ui: UiDriver;
}

/**
 * Sentinel for `workspace`: build a throwaway sample repo and open that instead
 * of a real project. Git surfaces use it so a capture run can never stage,
 * rewrite or otherwise touch a developer's own repository.
 */
export const SAMPLE_REPO = 'sample-repo';

export interface DocsOptions {
  /**
   * Project the app opens for this file's shots. The default and git surfaces
   * use {@link SAMPLE_REPO}.
   */
  workspace: string;
  /**
   * Extra folders persisted into the profile copy so the workspace rail shows
   * more than one project. The opened workspace is always included first.
   */
  extraWorkspaceFolders: string[];
}

export const test = base.extend<DocsFixtures & DocsOptions>({
  workspace: [DOCS_WORKSPACE, { option: true }],
  extraWorkspaceFolders: [[], { option: true }],

  app: async ({ workspace, extraWorkspaceFolders }, use) => {
    const settingsHash = productionSettingsHash();
    const sample = workspace === SAMPLE_REPO ? createDocsSampleRepo() : null;
    try {
    const root = sample ? sample.root : workspace;
    if (!fs.existsSync(root)) {
      throw new Error(
        `[docs-shot] workspace not found: ${root}\n` +
          `Use an existing workspace path or the sample-repo fixture.`,
      );
    }
    const profile = prepareDocsProfile(
      extraWorkspaceFolders.length > 0 ? { folders: [path.resolve(root), ...extraWorkspaceFolders] } : {},
    );
    let app: ElectronApplication | undefined;
    try {
    // A real project boots much slower than the empty e2e workspace: the
    // backend indexes it before the window is shown.
    app = await launchPtah({
        args: [path.resolve(root)],
        userDataDir: profile.dir,
        env: profile.env,
        timeout: 180_000,
      });
      await assertChildHome(app, profile.home);
      await use(app);
    } finally {
      // The real app shuts a lot down on quit (cron, gateway, embedder, SQLite)
      // and has been seen to hang past Playwright's teardown budget. Give it a
      // grace period, then take the process down so the run still reports.
      if (app) await closeDocsApp(app);
      assertSettingsOrRetain(settingsHash, profile.runDir);
      profile.cleanup();
    }
    } finally { sample?.cleanup(); }
  },

  page: async ({ app }, use) => {
    const win = await app.firstWindow({ timeout: 180_000 });
    await win.waitForLoadState('domcontentloaded');
    await win.locator('ptah-electron-shell').waitFor({ state: 'visible' });
    await sizeForCapture(app, win);
    await use(win);
  },

  ui: async ({ app, page }, use) => {
    await use(new UiDriver(app, page));
  },
});

export const expect = base.expect;
