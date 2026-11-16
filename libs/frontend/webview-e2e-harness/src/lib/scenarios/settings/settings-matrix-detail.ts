import type { Page } from '@playwright/test';

export async function expandMatrixDetail(page: Page, id: string): Promise<void> {
  const row = page.locator(`[data-testid="${id.includes('instance') ? 'cli-matrix-row' : 'cli-provider-card'}-${id}"]`);
  const expander = row.locator('ptah-table-row-expander button');
  if ((await expander.getAttribute('aria-expanded')) === 'true') return;
  if (await expander.isVisible()) await expander.click();
  else {
    await row.locator('ptah-table-row-actions button[aria-haspopup="menu"]').click();
    await row.getByRole('menuitem', { name: 'Details' }).click();
  }
}
