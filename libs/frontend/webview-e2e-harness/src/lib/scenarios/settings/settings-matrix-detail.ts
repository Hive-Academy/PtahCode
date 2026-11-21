import type { Page } from '@playwright/test';

export async function expandMatrixDetail(
  page: Page,
  id: string,
): Promise<void> {
  const row = page.locator(
    `[data-testid="${id.includes('instance') ? 'cli-matrix-row' : 'cli-provider-card'}-${id}"]`,
  );
  const expander = row.locator('ptah-table-row-expander button');
  if ((await expander.getAttribute('aria-expanded')) === 'true') return;
  // Phase 3: the expander column shows at every table width; the row kebab holds Test / Sign in only (decision 23).
  await expander.click();
}
