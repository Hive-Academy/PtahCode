import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Frame, Locator, Page } from '@playwright/test';

import { test, expect } from '../support/fixtures';

/**
 * Design preview capture for the interactive review findings (TASK_2026_902).
 * All renderer RPC calls use the e2e fake listener: no GitHub request is made.
 * Output: PNG files in PTAH_PREVIEW_OUT (default: dist/.../design-preview-shots).
 */
const OUT =
  process.env['PTAH_PREVIEW_OUT'] ??
  join(
    __dirname,
    '../../../../dist/apps/ptah-electron-e2e/design-preview-shots',
  );

const repo = { owner: 'Hive-Academy', name: 'PtahCode' };
const run = {
  repo,
  prNumber: 428,
  headSha: 'a'.repeat(40),
  attemptId: 'rvw-428-01',
  trigger: 'poll',
  configHash: 'b'.repeat(40),
  status: 'succeeded',
  createdAt: '2026-11-03T10:00:00.000Z',
  startedAt: '2026-11-03T10:00:05.000Z',
  completedAt: '2026-11-03T10:04:00.000Z',
  deadlineAt: '2026-11-03T11:00:00.000Z',
  coverage: [],
  stages: [],
};

const finding = (
  severity: string,
  lens: string,
  title: string,
  path: string,
  line: number,
  confidence: number,
) => ({
  schemaVersion: 1,
  lens,
  title,
  failureMode: `${title}. The second writer overwrites the first result.`,
  affectedBehavior: 'A user can lose saved settings with no error message.',
  scenario: 'Two windows save the same workspace settings in one second.',
  path,
  line,
  evidence: [
    { path, line, excerpt: 'const parsed = JSON.parse(raw);' },
    {
      path: 'src/settings.store.ts',
      line: 88,
      excerpt: 'await this.write(next); // no version check',
    },
  ],
  affectedCaller: 'loadSettings',
  severity,
  category: 'functional',
  confidence,
  verification: 'cross-family',
  suggestedDiff: null,
  fixPrompt: `Fix: ${title}. Add a version check before the write.`,
});

const findings = [
  finding(
    'Critical',
    'security-privacy',
    'Settings parsed without a schema',
    'src/settings.ts',
    42,
    0.93,
  ),
  finding(
    'Major',
    'correctness-lifecycle',
    'Lost update in save.ts (retry path)',
    'src/save.ts',
    17,
    0.81,
  ),
  finding(
    'Minor',
    'contracts-callers',
    'Caller ignores the typed error code',
    'src/api/client.ts',
    130,
    0.66,
  ),
  finding(
    'Nitpick',
    'host-di-config',
    'Token registered two times',
    'src/di/registration.ts',
    12,
    0.52,
  ),
];

/** Dark: the default theme of the app. Light: selected with the real theme menu. */
async function setTheme(page: Page, mode: 'dark' | 'light'): Promise<void> {
  if (mode === 'dark') {
    if ((await page.locator('html').getAttribute('data-theme-mode')) === 'dark')
      return;
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('tab', { name: 'Dark', exact: true }).click();
    await page
      .getByRole('button', { name: 'Ptah Glass', exact: true })
      .first()
      .dispatchEvent('click', undefined, { timeout: 5_000 })
      .catch(() => undefined);
  } else {
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('tab', { name: 'Light', exact: true }).click();
    await page
      .getByRole('button', { name: 'Ptah Glass Light', exact: true })
      .first()
      .dispatchEvent('click', undefined, { timeout: 5_000 })
      .catch(() => undefined);
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', mode);
  await page.waitForTimeout(500);
}

/** Window capture clipped to the visible part of the target (no element scroll tricks). */
async function shoot(
  page: Page,
  target: Locator | null,
  name: string,
): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${name}.jpg`);
  if (!target) {
    await page.screenshot({
      path,
      type: 'jpeg',
      quality: 82,
      animations: 'disabled',
    });
    return;
  }
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  const box = await target.boundingBox();
  const size = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  if (!box) throw new Error(`no box for ${name}`);
  const y = Math.max(0, box.y - 8);
  const bottom = Math.min(size.h, box.y + box.height + 8);
  const x = Math.max(0, box.x - 8);
  const right = Math.min(size.w, box.x + box.width + 8);
  await page.screenshot({
    path,
    type: 'jpeg',
    quality: 82,
    animations: 'disabled',
    clip: { x, y, width: right - x, height: bottom - y },
  });
}

test.describe('design preview — interactive review findings', () => {
  test('captures the findings panel in dark and light', async ({
    ui,
    mainWindow: page,
  }) => {
    await ui.mockRpc({
      'review:listRepositories': [
        { ...repo, enabled: true, dryRun: false, publicationPaused: false },
      ],
      'review:listRuns': {
        runs: [run],
        nextCursor: null,
        poll: {
          status: 'succeeded',
          error: null,
          lastSuccessAt: '2026-11-03T10:05:00.000Z',
          lastErrorAt: null,
        },
      },
      'review:getRun': run,
      'review:listFindings': { findings },
      'review:respondToFinding': { ok: true, threadId: 'PRRT_preview' },
    });
    await ui.prepare();
    await page
      .setViewportSize({ width: 1440, height: 1000 })
      .catch(() => undefined);
    await ui.goto('chat');

    // The surface can be in a child frame: find the frame that has the run row.
    let root: Frame = page.mainFrame();
    await expect(async () => {
      await ui.pushEvent({
        type: 'switchView',
        payload: { view: 'review-runs' },
      });
      for (const frame of page.frames()) {
        if ((await frame.getByRole('button', { name: /PR 428/ }).count()) > 0) {
          root = frame;
          return;
        }
      }
      throw new Error('run row not found');
    }).toPass({ timeout: 30_000 });

    await root
      .getByRole('button', { name: /PR 428/ })
      .first()
      .click();
    const panel = root.locator('ptah-review-findings-panel').first();
    await expect(panel).toBeVisible();
    const cards = panel.locator('ptah-review-finding-card');
    await expect(cards).toHaveCount(findings.length);

    for (const mode of ['dark', 'light'] as const) {
      await setTheme(page, mode);
      await shoot(page, null, `${mode}-01-window`);
      await shoot(page, panel, `${mode}-02-panel-summary-filters`);
      await shoot(page, cards.nth(0), `${mode}-03-card-collapsed`);
      await cards.nth(1).locator('summary').click();
      await shoot(page, cards.nth(1), `${mode}-04-card-expanded`);
      await cards.nth(1).locator('summary').click();
    }

    // State changes: one time only, then one capture for each theme.
    await cards
      .nth(2)
      .getByRole('button', { name: 'Reply', exact: true })
      .click();
    await cards
      .nth(2)
      .locator('textarea')
      .fill('Thanks. The fix is in commit 4f2a.');
    await cards
      .nth(0)
      .getByRole('button', { name: 'Accept', exact: true })
      .click();
    await expect(cards.nth(0).getByText('Accepted.')).toBeVisible();
    await cards
      .nth(1)
      .getByRole('button', { name: 'Dismiss', exact: true })
      .click();
    await cards
      .nth(1)
      .locator('textarea')
      .fill('Not reachable: one writer only.');
    for (const mode of ['dark', 'light'] as const) {
      await setTheme(page, mode);
      await shoot(page, cards.nth(2), `${mode}-05-reply-box`);
      await shoot(page, cards.nth(1), `${mode}-06-dismiss-reason`);
      await shoot(page, cards.nth(0), `${mode}-07-accepted`);
    }
    await cards
      .nth(1)
      .getByRole('button', { name: 'Submit dismissal' })
      .click();
    await expect(cards.nth(1).getByText('Dismissed.')).toBeVisible();
    for (const mode of ['dark', 'light'] as const) {
      await setTheme(page, mode);
      await shoot(page, cards.nth(1), `${mode}-08-dismissed`);
      await shoot(page, panel, `${mode}-09-panel-after-triage`);
    }
  });
});
