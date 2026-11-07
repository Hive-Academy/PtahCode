import { test, expect, waitForSettledSettings } from './_harness/video-fixtures';
import { hold, holdEnding, pointTo, revealSlowly } from './_harness/pace';

test('Settings providers and connections', async ({ ui, page, markStart, finish }) => {
  await ui.goto('settings');
  await expect(page.locator('ptah-providers-settings')).toBeVisible();
  await waitForSettledSettings(page);
  markStart();
  await hold(page, 5200);
  await pointTo(page, page.getByRole('button', { name: 'Connect provider' }));
  await hold(page, 2000);
  await revealSlowly(page, page.locator('#providers-connections-heading'));
  await expect(page.getByTestId('connections-grid')).toBeVisible();
  await hold(page, 2000);
  await pointTo(page, page.getByTestId('connections-grid').getByTestId('provider-connection-card').first());
  await holdEnding(page);
  await finish('providers');
});
