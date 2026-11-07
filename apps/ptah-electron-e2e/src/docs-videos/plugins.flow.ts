import { test, expect } from './_harness/video-fixtures';
import { hold, holdEnding, pointTo } from './_harness/pace';

test('Marketplace plugin browsing', async ({ ui, page, markStart, finish }) => {
  await ui.goto('marketplace');
  await expect(page.getByTestId('marketplace-shell')).toBeVisible();
  await page.getByRole('link', { name: 'Skills & Plugins' }).click();
  await expect(page.getByText('Nothing installed yet.').first()).toBeVisible();
  await hold(page, 500);
  markStart();
  await hold(page, 5200);
  const ptahPlugins = page.getByTestId('marketplace-nav').locator('[data-nav-id="ptah-plugins"]');
  await pointTo(page, ptahPlugins);
  await hold(page, 500);
  await ptahPlugins.click();
  await expect(page.getByTestId('source-band-heading')).toBeVisible();
  await hold(page, 2500);
  await pointTo(page, page.getByText('Ptah Core', { exact: true }).first());
  await holdEnding(page);
  await finish('plugins');
});
