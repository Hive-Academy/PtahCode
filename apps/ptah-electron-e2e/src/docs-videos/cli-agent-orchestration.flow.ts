import { test, expect, waitForSettledSettings } from './_harness/video-fixtures';
import { hold, holdEnding, pointTo, revealSlowly } from './_harness/pace';

test('pre-run CLI orchestration surface', async ({ ui, page, markStart, finish }) => {
  await ui.goto('settings');
  await expect(page.locator('ptah-providers-settings')).toBeVisible();
  const matrix = page.getByTestId('cli-matrix');
  await waitForSettledSettings(page);
  markStart();
  await hold(page, 5200);
  await revealSlowly(page, matrix);
  await expect(matrix).toBeVisible();
  await hold(page, 2500);
  await pointTo(page, matrix.getByTestId('cli-matrix-row-codex'));
  await holdEnding(page);
  await finish('cli-agent-orchestration');
});
