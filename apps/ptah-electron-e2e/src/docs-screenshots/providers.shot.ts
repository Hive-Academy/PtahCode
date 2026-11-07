import { test, expect } from './_harness/docs-fixtures';
import { shoot } from './_harness/shooter';

test.describe('docs screenshots — providers', () => {
  test('connection settings', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('settings');
    const grid = page.getByTestId('connections-grid');
    await expect(grid).toBeVisible();
    const firstCard = grid.getByTestId('provider-connection-card').first();
    await expect(firstCard).toBeVisible();
    await shoot(page, 'providers-settings', { crop: firstCard });
  });
});
