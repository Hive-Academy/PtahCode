/**
 * Opt-in, real-backend Electron review; never a gate. Build separately first.
 * node scripts/verify.mjs --exec --task bots-shots -- node node_modules/@playwright/test/cli.js test --config apps/ptah-electron-e2e/design-preview.config.ts bots.shot
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import {
  BotEditableSchema,
  BotsGetResultSchema,
  BotsListResultSchema,
  BotsWriteResultSchema,
  type BotsRpcMethods,
} from '@ptah-extension/shared';
import { z } from 'zod';
import type { RpcBridge } from '../support/rpc-bridge';
import { test, expect } from './bots.fixtures';

const ROOT = resolve(__dirname, '../../../..');
const OUT = resolve(
  ROOT,
  process.env['PTAH_SHOT_DIR'] ?? '.ptah/specs/TASK_2026_2274_eb79/screens',
);
const PRIMARY = 'Release notes writer';
const SECONDARY = 'Dependency watcher';
const responseSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
});

async function rpc<M extends keyof BotsRpcMethods>(
  bridge: RpcBridge,
  method: M,
  params: BotsRpcMethods[M]['params'],
): Promise<unknown> {
  return responseSchema.parse(
    await bridge.sendRpc('rpc', {
      type: 'rpc:call',
      payload: { method, params },
    }),
  ).data;
}

async function theme(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Change theme', exact: true }).click();
  const light = name === 'ptah-glass-light';
  // The current picker groups both Ptah Glass themes under Glass. Use the
  // same theme popover as settings-lanes, then verify the actual theme + mode.
  await page.getByRole('tab', { name: 'Glass', exact: true }).click();
  await page
    .getByRole('button', {
      name: light ? 'Ptah Glass Light' : 'Ptah Glass',
      exact: true,
    })
    .first()
    .click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', name);
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme-mode',
    light ? 'light' : 'dark',
  );
}

for (const width of [1280, 900]) {
  for (const appearance of ['ptah-glass', 'ptah-glass-light']) {
    test(`Bots design review ${width} ${appearance}`, async ({
      ui,
      mainWindow: page,
      rpcBridge,
      botsWorkspace,
    }, testInfo) => {
      mkdirSync(OUT, { recursive: true });
      const evidence: {
        image: string;
        forbiddenControls: number;
        overflow: boolean;
      }[] = [];
      const evidencePath = join(OUT, `bots-review-${width}-${appearance}.json`);
      let dirtySaveBar: {
        top: number | null;
        bottom: number | null;
        viewportHeight: number;
        insideViewport: boolean;
      } | null = null;
      const cdp = await page.context().newCDPSession(page);
      const surface = page.locator('ptah-bots-page');
      const editor = surface.getByRole('article');
      const name = editor.getByRole('textbox', { name: /^Name/ });
      const saveBar = surface.locator('ptah-bot-save-bar');
      const row = (label: string) =>
        surface
          .getByRole('navigation', { name: 'Bots', exact: true })
          .getByRole('button', { name: new RegExp(`^${label},`) });
      const back = async () => {
        if (width === 900)
          await surface
            .getByRole('button', { name: 'Back to bots', exact: true })
            .click();
      };
      const capture = async (state: string) => {
        await expect(surface).toBeVisible();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
        });
        const forbidden = surface
          .getByRole('button', { name: /^(start|run|talk)\b/i })
          .or(surface.getByRole('link', { name: /^(start|run|talk)\b/i }));
        const forbiddenControls = await forbidden.count();
        const image = `bots-${state}-${width}-${appearance}.png`;
        evidence.push({
          image,
          forbiddenControls,
          overflow: await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          ),
        });
        writeFileSync(
          evidencePath,
          JSON.stringify(
            {
              evidence,
              dirtySaveBar,
              softErrors: testInfo.errors.map((error) => error.message),
            },
            null,
            2,
          ) + '\n',
        );
        await expect
          .soft(forbidden, `${state}: no Start / Run / Talk controls`)
          .toHaveCount(0);
        await page.screenshot({
          path: join(OUT, image),
          animations: 'disabled',
        });
      };
      const create = async (label: string, instructions: string) => {
        await surface
          .getByRole('button', { name: 'New bot', exact: true })
          .click();
        await name.fill(label);
        await editor
          .getByRole('textbox', { name: /^Instructions/ })
          .fill(instructions);
        await saveBar
          .getByRole('button', { name: 'Create bot', exact: true })
          .click();
        await expect(
          saveBar.locator('span[start][role="status"]'),
        ).toContainText('Saved as revision');
      };
      const more = async (action: string) => {
        await editor
          .getByRole('button', { name: 'More actions', exact: true })
          .click();
        await page.getByRole('menuitem', { name: action, exact: true }).click();
      };
      try {
        // Force fixture setup before switching theme or navigating via the shell.
        await ui.getObservedCalls('workspace:getInfo');
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1100,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await expect
          .poll(() => page.evaluate(() => window.innerWidth))
          .toBe(width);
        await theme(page, appearance);
        await page.getByRole('tab', { name: 'Bots', exact: true }).click();
        await expect(
          surface.getByText('No bots yet', { exact: true }),
        ).toBeVisible();
        await capture('empty');
        await create(
          PRIMARY,
          'Write clear release notes from completed work. Ask before publishing.',
        );
        await back();
        await create(
          SECONDARY,
          'Review dependency changes and explain compatibility risks.',
        );
        await back();
        await expect(row(PRIMARY)).toBeVisible();
        await expect(row(SECONDARY)).toBeVisible();
        await capture('populated');
        if (width === 900) await capture('list');
        await row(PRIMARY).click();
        await expect(name).toHaveValue(PRIMARY);
        await capture('editor');
        await name.fill(`${PRIMARY} draft`);
        await expect(saveBar.locator('span[start][role="status"]')).toHaveText(
          'Unsaved changes',
        );
        const bounds = await saveBar.boundingBox();
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        dirtySaveBar = {
          top: bounds?.y ?? null,
          bottom: bounds ? bounds.y + bounds.height : null,
          viewportHeight,
          insideViewport:
            bounds !== null &&
            bounds.height > 0 &&
            bounds.y >= 0 &&
            bounds.y + bounds.height <= viewportHeight,
        };
        expect
          .soft(dirtySaveBar.insideViewport, 'dirty save bar inside viewport')
          .toBe(true);
        await capture('dirty');
        await name.fill('');
        await saveBar
          .getByRole('button', { name: 'Save', exact: true })
          .click();
        await expect(
          saveBar.locator('span[start][role="alert"]'),
        ).toContainText('Fix');
        await expect(name).toHaveAttribute('aria-invalid', 'true');
        await capture('validation');
        await name.fill(PRIMARY);
        await editor
          .getByRole('textbox', { name: /^Description/ })
          .fill('Turns completed work into release notes.');
        await saveBar
          .getByRole('button', { name: 'Save', exact: true })
          .click();
        await expect(
          saveBar.locator('span[start][role="status"]'),
        ).toContainText('Saved as revision');
        await capture('saved');

        const listed = BotsListResultSchema.parse(
          await rpc(rpcBridge, 'bots:list', { workspaceRoot: botsWorkspace }),
        );
        const summary = listed.summaries.find((bot) => bot.name === PRIMARY);
        if (!summary) throw new Error('Created bot missing from real roster');
        const { record } = BotsGetResultSchema.parse(
          await rpc(rpcBridge, 'bots:get', { id: summary.id }),
        );
        await name.fill(`${PRIMARY} local edit`);
        BotsWriteResultSchema.parse(
          await rpc(rpcBridge, 'bots:update', {
            id: record.id,
            expectedRevision: record.revision,
            schemaVersion: 2,
            definition: {
              ...BotEditableSchema.strip().parse(record),
              description: 'Updated in another editor.',
            },
          }),
        );
        await saveBar
          .getByRole('button', { name: 'Save', exact: true })
          .click();
        await surface
          .getByRole('button', { name: /^Compare with revision/ })
          .click();
        await expect(
          page.getByRole('dialog', {
            name: 'Compare bot revisions',
            exact: true,
          }),
        ).toBeVisible();
        await capture('conflict');
        await page.keyboard.press('Escape');
        await surface
          .getByRole('button', { name: /^Discard mine and load revision/ })
          .click();
        await expect(name).toHaveValue(PRIMARY);

        const enabled = editor.getByRole('switch', {
          name: 'Enabled',
          exact: true,
        });
        await enabled.check();
        await expect(enabled).toBeChecked();
        await enabled.uncheck();
        await expect(enabled).not.toBeChecked();
        await capture('disabled');
        await more('Delete…');
        const removal = page.getByRole('dialog', { name: /^Remove/ });
        await expect(removal).toBeVisible();
        await removal.getByRole('radio', { name: /^Delete/ }).click();
        await expect(
          removal.getByRole('button', { name: 'Delete bot', exact: true }),
        ).toBeVisible();
        await capture('delete-dialog');
        await removal
          .getByRole('button', { name: 'Cancel', exact: true })
          .click();
        await more('Archive');
        await removal
          .getByRole('button', { name: 'Archive bot', exact: true })
          .click();
        await back();
        await surface.getByRole('checkbox', { name: /^Show archived/ }).check();
        await row(PRIMARY).click();
        await expect(
          editor.getByText('Archived', { exact: true }),
        ).toBeVisible();
        await capture('archived');
      } finally {
        writeFileSync(
          evidencePath,
          JSON.stringify(
            {
              evidence,
              dirtySaveBar,
              softErrors: testInfo.errors.map((error) => error.message),
            },
            null,
            2,
          ) + '\n',
        );
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        await cdp.detach();
      }
    });
  }
}
