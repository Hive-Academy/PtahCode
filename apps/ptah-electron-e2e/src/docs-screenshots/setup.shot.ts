import { test, expect } from './_harness/docs-fixtures';
import { shoot } from './_harness/shooter';

test.describe('docs screenshots — setup', () => {
  test('home and pre-run analysis', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('onboarding');
    const home = page.locator('ptah-onboarding-home');
    await expect(home).toBeVisible();
    await shoot(page, 'setup-hub', { crop: home });
    const teamBuilder = page.getByTestId('onboarding-path-team-builder');
    await expect(teamBuilder).toBeVisible();
    await shoot(page, 'setup-ai-team-builder', { crop: teamBuilder });

    await page.getByTestId('onboarding-path-link-analyze').click();
    const analysis = page.getByTestId('analyze-workspace');
    await expect(analysis).toBeVisible();
    await shoot(page, 'agents-setup-wizard', { crop: analysis });
  });
});
