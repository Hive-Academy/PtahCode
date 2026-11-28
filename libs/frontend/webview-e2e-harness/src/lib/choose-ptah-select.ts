import { expect, type Locator } from '@playwright/test';

/** Open a shared ptah-select host (or its trigger) and choose its visible label.
 * Options deliberately expose labels, not their internal wire values.
 */
export async function choosePtahSelect(
  control: Locator,
  label: string,
): Promise<void> {
  const trigger = control
    .locator('button[role="combobox"]')
    .or(control.and(control.page().locator('button[role="combobox"]')));
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const listboxId = await trigger.getAttribute('aria-controls');
  if (!listboxId) throw new Error('ptah-select did not open a listbox');
  const listbox = control.page().locator(`[id="${listboxId}"]`);
  const option = listbox.getByRole('option').filter({
    has: control.page().getByText(label, { exact: true }),
  });
  await expect(option).not.toHaveAttribute('aria-disabled', 'true');
  await option.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
}

/** The open listbox of a ptah-select. Options are portaled, not inside the host. */
export async function ptahSelectListbox(control: Locator): Promise<Locator> {
  const trigger = control
    .locator('button[role="combobox"]')
    .or(control.and(control.page().locator('button[role="combobox"]')));
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  }
  const listboxId = await trigger.getAttribute('aria-controls');
  if (!listboxId) throw new Error('ptah-select did not open a listbox');
  return control.page().locator(`[id="${listboxId}"]`);
}
