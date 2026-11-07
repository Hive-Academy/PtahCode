import { test, expect } from './_harness/docs-fixtures';
import { shoot } from './_harness/shooter';

test.describe('docs screenshots — agents', () => {
  test('CLI matrix', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('settings');
    const matrix = page.locator('[data-testid="cli-matrix"]');
    await expect(matrix).toBeVisible();
    await expect(matrix).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
    await expect(matrix.locator('tbody:not([data-testid="cli-matrix-uninstalled"]) [data-testid^="cli-matrix-row-"]').first()).toBeVisible({ timeout: 60_000 });
    await shoot(page, 'agents-cli-panel', { crop: matrix });
  });
});
