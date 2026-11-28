import { test, expect } from '../../test-fixtures';
import { decisionMatrixFixtures } from './settings-decision-matrix.fixtures';
import { bootSettings } from './settings.fixtures';

test.use({ useAppBuild: true });

test('decision matrix renders the dashboard and switches score sources', async ({
  page,
  fixtureServer,
}) => {
  await bootSettings(page, fixtureServer.url, 'electron', 'anubis', decisionMatrixFixtures);
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Decision matrix', exact: true })
    .click();

  const dashboard = page.locator('ptah-decision-matrix-page');
  await expect(dashboard.locator('ptah-ring')).toHaveCount(4);
  for (const name of [
    'Run pipeline',
    'Outcome mix by lane',
    'Who does the work',
    'Routing controls',
    'Current pick per task kind',
    'Outcome matrix',
  ]) {
    await expect(dashboard.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(dashboard.locator('ptah-meter').first()).toBeVisible();
  await expect(dashboard.locator('ptah-stacked-bar').first()).toBeVisible();
  await expect(dashboard.locator('ptah-donut')).toBeVisible();

  const cell = dashboard.locator('table').getByRole('button', {
    name: /(?=.*codex)(?=.*gpt-5\.5-codex)(?=.*implement)/i,
  });
  const measured = dashboard.getByRole('button', { name: 'Measured outcomes', exact: true });
  const ratings = dashboard.getByRole('button', { name: 'Model ratings', exact: true });
  await expect(measured).toHaveAttribute('aria-pressed', 'true');
  await cell.press('Enter');
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await ratings.click();
  await expect(ratings).toHaveAttribute('aria-pressed', 'true');
  await expect(cell).toContainText('91');
  await cell.press('Space');
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await measured.click();
  await expect(measured).toHaveAttribute('aria-pressed', 'true');
  await expect(cell).toBeVisible();
});
