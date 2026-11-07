import { test, expect } from './_harness/docs-fixtures';
import { shoot } from './_harness/shooter';

/**
 * Dashboard session analytics uses the isolated sample repository.
 * Session rail/history/tabs require saved state and are not recaptured here.
 */
test.describe('docs screenshots — sessions', () => {
  test('session analytics dashboard', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('dashboard');
    await expect(page.locator('ptah-dashboard-grid')).toBeVisible();
    await page.waitForTimeout(2_500);

    // The default range is a recent window; a project whose last session is
    // older than that reports "No sessions found". Widen it before shooting.
    const dateFilter = page.locator(
      '[title="Toggle date filter"], [aria-label="Toggle date filter"]',
    );
    if (
      await dateFilter
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await dateFilter.first().click();
      await page.waitForTimeout(500);
      for (const label of ['All time', 'Last 90 days', '90 days', 'All']) {
        const option = page.getByRole('button', { name: label, exact: true });
        if (
          await option
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          await option.first().click();
          break;
        }
      }
      await page.waitForTimeout(2_500);
    }
    const usage = page.locator('ptah-usage-dashboard');
    await expect(usage.locator('[data-testid="usage-content"], [data-testid="usage-error"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[aria-label="Loading account usage"]')).toHaveCount(0, { timeout: 60_000 });
    // Keep account identities above this panel out of the published image.
    await shoot(page, 'sessions-analytics', { crop: usage });
  });
});
