import { test, expect, waitForSettledSettings } from './_harness/video-fixtures';
import { hold, holdEnding, pointTo, revealSlowly } from './_harness/pace';

test('Settings MCP server and caller access', async ({ ui, page, markStart, finish }) => {
  await ui.goto('settings');
  await expect(page.locator('ptah-settings')).toBeVisible();
  await waitForSettledSettings(page);
  markStart();
  await hold(page, 5200);
  const advanced = page.getByRole('button', { name: 'Advanced' });
  await pointTo(page, advanced);
  await hold(page, 500);
  await advanced.click();
  await hold(page, 2000);
  const mcp = page.locator('#mcp-browser-heading');
  await expect(mcp).toBeVisible();
  await revealSlowly(page, mcp);
  await hold(page, 2500);
  await expect(page.getByTestId('mcp-port-input')).toBeVisible();
  await pointTo(page, page.getByTestId('mcp-external-caller-access'));
  await holdEnding(page);
  await finish('ptah-mcp-server');
});
