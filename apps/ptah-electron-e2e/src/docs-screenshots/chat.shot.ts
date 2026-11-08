import { test, expect } from './_harness/docs-fixtures';
import { shoot } from './_harness/shooter';

test.describe('docs screenshots — chat', () => {
  test('chat landing and model picker', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('chat');
    const chat = page.locator('ptah-chat-view');
    await expect(chat).toBeVisible();
    const model = page.locator('ptah-model-selector').first();
    await expect(model).toBeVisible();
    await model.getByRole('button', { name: 'Select model' }).click();
    const menu = model.locator('.dropdown-panel');
    await expect(menu).toBeVisible();
    await expect(menu.locator('ptah-native-option').first()).toBeVisible({ timeout: 60_000 });
    const descriptions = menu.locator('ptah-native-option .text-base-content-muted');
    expect(await descriptions.count(), '[docs-shot] model descriptions missing; price mask cannot be verified').toBeGreaterThan(0);
    await descriptions.evaluateAll((elements) => {
      for (const description of elements) {
        const walker = document.createTreeWalker(description, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node.textContent) {
            node.textContent = node.textContent.replace(/\s*[\u00B7\u2022]\s*\$[\d.]+\s*\/\s*\$[\d.]+\s*per\s*Mtok\b/gi, '');
          }
        }
      }
    });
    expect(await menu.innerText(), '[docs-shot] model price remains after masking').not.toMatch(/\$\s?\d/);
    await shoot(page, 'chat-model-selector', { crop: menu });
  });

  test('approval modes', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('chat');
    const approval = page.getByTestId('composer-approval-chip').first();
    await expect(approval).toBeVisible();
    await approval.click();
    const popover = page.getByRole('dialog', { name: 'Approval mode settings' });
    await expect(popover).toBeVisible();
    await shoot(page, 'chat-autopilot-toggle', { crop: popover });
  });

  test('file suggestions', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('chat');
    const composer = page.getByRole('combobox', { name: 'Message the orchestrator' }).first();
    await composer.fill('@');
    const suggestions = page.locator('.suggestions-panel').first();
    await expect(suggestions).toBeVisible();
    await shoot(page, 'chat-at-suggestions', { crop: suggestions });
  });
});
