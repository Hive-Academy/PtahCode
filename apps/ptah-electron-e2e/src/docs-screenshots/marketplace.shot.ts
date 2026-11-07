import { test, expect } from './_harness/docs-fixtures';
import { shoot } from './_harness/shooter';

test.describe('docs screenshots — marketplace', () => {
  test('current marketplace', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('marketplace');
    await expect(page.getByTestId('marketplace-shell')).toBeVisible();
    await page.getByRole('link', { name: 'Smithery' }).click();
    const source = page.getByTestId('marketplace-content');
    await expect(source).toBeVisible();
    await shoot(page, 'marketplace-smithery', { crop: source });
  });
});
