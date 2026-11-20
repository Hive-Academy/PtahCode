/** Populated Schedules visual gate. The coordinator runs this Electron spec. */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

const ROOT = resolve(__dirname, '../../../..');
const OUT = resolve(
  ROOT,
  process.env['PTAH_SHOT_DIR'] ?? '.ptah/tmp/schedules-shots',
);
const PHASE = process.env['PTAH_SHOT_PHASE'] ?? 'after';
const HEIGHT = 1100;
const WORKSPACE = 'C:\\demo-workspace';
const jpeg = {
  type: 'jpeg',
  quality: 72,
  scale: 'css',
  animations: 'disabled',
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

interface JobFixture {
  id: string;
  name: string;
  cronExpr: string;
  timezone: string;
  prompt: string;
  workspaceRoot: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  createdBy: { kind: 'user' } | { kind: 'session'; sessionId: string };
  lastRunStatus: RunStatus | null;
}

function job(
  now: number,
  id: string,
  overrides: Partial<JobFixture>,
): JobFixture {
  return {
    id,
    name: id,
    cronExpr: '0 9 * * 1-5',
    timezone: 'UTC',
    prompt: 'Summarize the open pull requests and post the result.',
    workspaceRoot: WORKSPACE,
    enabled: true,
    createdAt: now - 30 * 24 * HOUR,
    updatedAt: now - 2 * 24 * HOUR,
    lastRunAt: now - 3 * HOUR,
    nextRunAt: now + 5 * HOUR,
    createdBy: { kind: 'user' },
    lastRunStatus: 'succeeded',
    ...overrides,
  };
}

function fixtures(now: number) {
  const jobs = [
    job(now, 'job-triage', {
      name: 'Morning issue triage',
      prompt:
        'Read the issues opened since the last run. Label each one, find duplicates, and write a short summary to docs/triage/latest.md.',
    }),
    job(now, 'job-deps', {
      name: 'Weekly dependency review',
      cronExpr: '30 7 * * 1',
      timezone: 'Europe/Berlin',
      lastRunAt: now - 26 * HOUR,
      nextRunAt: now + 6 * 24 * HOUR,
      lastRunStatus: 'failed',
      createdBy: {
        kind: 'session',
        sessionId: '7f3c2a9e-51d4-4b8e-9a60-1c2d3e4f5a6b',
      },
    }),
    job(now, 'job-nightly', {
      name: 'Nightly test report with a long name that must truncate cleanly',
      cronExpr: '0 2 * * *',
      lastRunAt: now - 4 * MINUTE,
      nextRunAt: now + 20 * HOUR,
      lastRunStatus: 'running',
    }),
    job(now, 'job-changelog', {
      name: 'Release notes draft',
      cronExpr: '0 16 * * 5',
      enabled: false,
      lastRunAt: now - 9 * 24 * HOUR,
      nextRunAt: null,
      lastRunStatus: 'skipped',
    }),
    job(now, 'job-new', {
      name: 'Docs link check',
      cronExpr: '*/30 * * * *',
      lastRunAt: null,
      nextRunAt: now + 12 * MINUTE,
      lastRunStatus: null,
    }),
  ];
  const runs = [
    {
      id: 'run-3',
      jobId: 'job-deps',
      scheduledFor: now - 26 * HOUR,
      startedAt: now - 26 * HOUR,
      endedAt: now - 26 * HOUR + 4 * MINUTE,
      status: 'failed',
      resultSummary: null,
      errorMessage:
        'The run stopped: npm audit returned a network error after 3 tries.',
      sessionId: 'a1b2c3d4-0000-4000-8000-000000000003',
    },
    {
      id: 'run-2',
      jobId: 'job-deps',
      scheduledFor: now - 8 * 24 * HOUR,
      startedAt: now - 8 * 24 * HOUR,
      endedAt: now - 8 * 24 * HOUR + 6 * MINUTE,
      status: 'succeeded',
      resultSummary:
        'Reviewed 14 updates. Two major versions need a manual check.',
      errorMessage: null,
      sessionId: 'a1b2c3d4-0000-4000-8000-000000000002',
    },
    {
      id: 'run-1',
      jobId: 'job-deps',
      scheduledFor: now - 15 * 24 * HOUR,
      startedAt: null,
      endedAt: null,
      status: 'skipped',
      resultSummary: null,
      errorMessage: null,
      sessionId: null,
    },
  ];
  return { jobs, runs };
}

async function settled(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  if ((await page.locator('html').getAttribute('data-theme-mode')) !== theme) {
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page
      .getByRole('tab', {
        name: theme === 'dark' ? 'Dark' : 'Light',
        exact: true,
      })
      .click();
    if (
      (await page.locator('html').getAttribute('data-theme-mode')) !== theme
    ) {
      const glass = page
        .getByRole('button', { name: 'Ptah Glass', exact: true })
        .first();
      await (
        (await glass.isVisible())
          ? glass
          : page.locator('button.theme-tile:visible').first()
      ).click();
    }
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', theme);
}

async function blur(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

test('captures the populated Schedules page, drawer and form', async ({
  ui,
  mainWindow: page,
}) => {
  test.setTimeout(240_000);
  expect(['before', 'after']).toContain(PHASE);
  mkdirSync(OUT, { recursive: true });
  const { jobs, runs } = fixtures(Date.now());
  await ui.mockRpc({
    'workspace:getInfo': {
      folders: [WORKSPACE],
      root: WORKSPACE,
      activeFolder: WORKSPACE,
      name: 'demo-workspace',
    },
    'cron:list': { jobs },
    'cron:runs': { runs },
    'cron:nextFire': { nextRunAt: jobs[1]?.nextRunAt ?? null },
  });
  await ui.openTab('cron');
  await expect(page.getByTestId('cron-job-card')).toHaveCount(jobs.length);

  const cdp = await page.context().newCDPSession(page);
  const resize = async (width: number, height = HEIGHT): Promise<void> => {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await settled(page);
  };
  const shot = async (name: string): Promise<void> => {
    await settled(page);
    await page.screenshot({
      ...jpeg,
      path: join(OUT, `schedules-${name}-${PHASE}.jpg`),
    });
  };

  try {
    await setTheme(page, 'dark');
    for (const width of [1024, 1440, 1920, 2560]) {
      await resize(width);
      await blur(page);
      await shot(`list-dark-${width}`);
    }

    // Detail drawer with run history (a failed, a succeeded and a skipped run).
    await resize(1920);
    await page.getByTestId('cron-job-card').nth(1).click();
    await expect(page.getByText('npm audit returned')).toBeVisible();
    await shot('drawer-dark-1920');
    await resize(1024);
    await shot('drawer-dark-1024');
    await page.keyboard.press('Escape');

    // Inline delete confirmation on a card.
    await resize(1440);
    await page.getByRole('button', { name: 'Delete job' }).first().click();
    await shot('delete-confirm-dark-1440');
    await page.getByTestId('cron-job-delete-cancel').click();

    // Form: empty, focus, validation errors, with value, open timezone menu.
    await resize(1920);
    await page.getByTestId('cron-new-job-btn').click();
    await expect(page.getByTestId('cron-form')).toBeVisible();
    await blur(page);
    await shot('form-empty-dark-1920');
    await page.getByTestId('cron-form-name').focus();
    await shot('form-focus-dark-1920');
    await page.getByTestId('cron-form-submit').click();
    await shot('form-errors-dark-1920');
    await page.getByTestId('cron-form-name').fill('Morning issue triage');
    await page.getByTestId('cron-form-expr').fill('0 9 * * 1-5');
    await page
      .getByTestId('cron-form-prompt')
      .fill('Read the issues opened since the last run and label each one.');
    await blur(page);
    await shot('form-value-dark-1920');
    await page.getByTestId('cron-form-timezone').click();
    await shot('form-menu-dark-1920');
    await page.keyboard.press('Escape');
    await resize(1024);
    await blur(page);
    await shot('form-value-dark-1024');
    // Close the form before the theme switch: the open form drawer covers
    // the theme button. Light is last: the theme picker does not return to
    // the same dark theme.
    await page.getByTestId('cron-form-cancel').click();
    await expect(page.getByTestId('cron-form')).toBeHidden();
    await resize(1440);
    await setTheme(page, 'light');
    await blur(page);
    await shot('list-light-1440');
    await page.getByTestId('cron-job-card').nth(1).click();
    await expect(page.getByText('npm audit returned')).toBeVisible();
    await shot('drawer-light-1440');
    await page.keyboard.press('Escape');
    await page.getByTestId('cron-new-job-btn').click();
    await expect(page.getByTestId('cron-form')).toBeVisible();
    await page.getByTestId('cron-form-name').fill('Morning issue triage');
    await page.getByTestId('cron-form-expr').fill('0 9 * * 1-5');
    await page
      .getByTestId('cron-form-prompt')
      .fill('Read the issues opened since the last run and label each one.');
    await blur(page);
    await shot('form-value-light-1440');
  } finally {
    await cdp
      .send('Emulation.clearDeviceMetricsOverride')
      .catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
});
