import { choosePtahSelect } from '../../choose-ptah-select';
/**
 * E2E: CLI matrix and background roles interaction scenes (TASK_2026_555; on the Providers tab since the Context
 * Management regroup). Batch 32 started this file with the Batch 14 review's
 * carry-forward (finding 3) for the two CLI-matrix modals: focus moves into the dialog on open, stays inside it on Tab,
 * and returns to the opener (the "Add Ptah CLI Instance" button / Glm's Tiers) after Esc, a backdrop click and a
 * submit. Batch 36 adds the tab's validation-note scenes (batches.md Task 36.1): a matrix cell pick, on/off, the full
 * tier object, the Copilot sign-in gate, the roles collapsed by default, and the preferred-order popover. Batch 36c adds the "More actions" menu
 * bounds. Batch 36d adds the Cursor key scenes (opt-in key store, `settings-cursor-key.fixtures.ts`).
 *
 * Runs against the real `ptah-extension-webview` build in both hosts. Each scene boots fresh, so the fixture state
 * starts from the BRIEF baseline and every RPC a scene asserts was sent by that scene's own clicks.
 */
import type { Locator, Page } from '@playwright/test';
import { expandMatrixDetail } from './settings-matrix-detail';

import { test, expect } from '../../test-fixtures';
import {
  AUTH_STATUS_FIXTURE,
  bootSettings,
  getFixtureState,
  waitForSettled,
} from './settings.fixtures';
import {
  expectCall,
  agentsRoutingTab,
  contextManagementTab,
  visibleEnabled,
} from './settings-drawer.reach';
import { cursorKeyStoreOverrides } from './settings-cursor-key.fixtures';

test.use({ useAppBuild: true });

const HOSTS = ['vscode', 'electron'] as const;
const GLM_ID = 'glm-instance-1';
/** Glm's saved tier mapping (`PTAH_CLI_AGENTS_SETTING_FIXTURE`). */
const GLM_TIERS = {
  sonnet: 'glm-5.3:cloud',
  opus: 'glm-5.3:cloud',
  haiku: 'glm-5.3:cloud',
};

interface ModalCase {
  readonly name: string;
  readonly testid: string;
  readonly opener: (page: Page) => Locator;
}

const MODALS: readonly ModalCase[] = [
  {
    name: 'add-instance modal',
    testid: 'add-cli-instance-modal',
    opener: (page) => page.locator('[data-testid="cli-matrix-add"]'),
  },
  {
    name: 'tier-mapping modal',
    testid: 'cli-tier-mapping-modal',
    opener: (page) =>
      page.locator(`#lane-detail-${GLM_ID} button:text-is("Edit tiers")`),
  },
];

const dialogOf = (page: Page, testid: string): Locator =>
  page.locator(`[data-testid="native-modal-dialog"]:has([data-testid="${testid}"])`);

/** The panel holds focus, or a listbox owned by a control inside the panel does. */
async function dialogHasFocus(dialog: Locator): Promise<boolean> {
  return dialog.evaluate((node) => {
    const active = node.ownerDocument.activeElement;
    if (!(active instanceof Element)) return false;
    if (node.contains(active)) return true;
    for (const control of node.querySelectorAll<HTMLElement>('[aria-controls]')) {
      const id = control.getAttribute('aria-controls');
      const popup = id ? node.ownerDocument.getElementById(id) : null;
      if (popup && (popup === active || popup.contains(active))) return true;
    }
    return false;
  });
}
const toastMessage = (page: Page): Locator =>
  page.locator('[data-testid="settings-toast-message"]').last();
const toastUndo = (page: Page): Locator =>
  page.locator('[data-testid="settings-toast-undo"]').last();

async function open(page: Page, modal: ModalCase): Promise<Locator> {
  const opener = modal.opener(page);
  if (modal.testid === 'cli-tier-mapping-modal') {
    await expandMatrixDetail(page, GLM_ID);
    await page
      .locator(`#lane-detail-${GLM_ID} button:text-is("Edit tiers")`)
      .click();
  } else await opener.click();
  const dialog = dialogOf(page, modal.testid);
  await expect(dialog).toBeVisible();
  // The dialog moves focus onto its first control.
  await expect.poll(() => dialogHasFocus(dialog)).toBe(true);
  return dialog;
}

async function expectClosedToOpener(
  page: Page,
  modal: ModalCase,
): Promise<void> {
  await expect(dialogOf(page, modal.testid)).toHaveCount(0);
  await expect(modal.opener(page)).toBeFocused();
}

/** Boots Settings on the Providers tab with the CLI matrix (below the Main agent and Connections) rendered (its deferred chunk). */
async function bootOrchestration(
  page: Page,
  url: string,
  host: (typeof HOSTS)[number],
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await bootSettings(page, url, host, 'anubis', overrides);
  await waitForSettled(page);
  await agentsRoutingTab(page);
  await expect(page.locator('[data-testid="cli-matrix"]')).toBeVisible();
}

/** Glm's tier-mapping modal, open with its saved mapping read. */
async function openGlmTiers(page: Page): Promise<Locator> {
  const dialog = await open(page, MODALS[1]);
  await expect(
    dialog.locator('[data-testid="cli-tier-source-haiku"]'),
  ).toContainText('This instance: glm-5.3:cloud');
  return dialog;
}

for (const host of HOSTS) {
  test.describe(`webview > settings > orchestration scenes (${host})`, () => {
    test.beforeEach(async ({ page, fixtureServer }) => {
      await bootOrchestration(page, fixtureServer.url, host);
    });

    for (const modal of MODALS) {
      test(`${modal.name} (Batch 14 finding 3): focus moves in, Tab stays inside, Esc returns focus to the opener`, async ({
        page,
      }) => {
        const dialog = await open(page, modal);
        for (let i = 0; i < 14; i += 1) {
          await page.keyboard.press('Tab');
          expect(await dialogHasFocus(dialog)).toBe(true);
        }
        // A tier field opens its list on focus, and its Esc closes only that list (the shared search field's rule);
        // the dialog stays open and the next Esc closes it.
        if (
          await page.evaluate(
            () =>
              document.activeElement?.getAttribute('aria-expanded') === 'true',
          )
        ) {
          await page.keyboard.press('Escape');
          await expect(dialog).toBeVisible();
          await expect
            .poll(() =>
              page.evaluate(() =>
                document.activeElement?.getAttribute('aria-expanded'),
              ),
            )
            .toBe('false');
        }
        await page.keyboard.press('Escape');
        await expectClosedToOpener(page, modal);
      });

      test(`${modal.name}: a backdrop click closes it and focus returns to the opener`, async ({
        page,
      }) => {
        await open(page, modal);
        // The backdrop is the dialog's own ::backdrop area: a click outside the panel.
        await page.mouse.click(5, 5);
        await expectClosedToOpener(page, modal);
      });
    }

    test('add-instance modal: a create closes it and focus returns to Add', async ({
      page,
    }) => {
      const modal = MODALS[0];
      const dialog = await open(page, modal);
      const before = getFixtureState(page).calls.length;
      await dialog
        .locator('[data-testid="add-cli-instance-name"]')
        .fill('Llama-Local');
      // A local provider needs no key (#48).
      await choosePtahSelect(
        dialog.locator('[data-testid="add-cli-instance-provider"]'),
        'Ollama · Local server',
      );
      await expect(
        dialog.locator('[data-testid="add-cli-instance-key-help"]'),
      ).toContainText('No API key needed');
      await dialog.locator('[data-testid="add-cli-instance-submit"]').click();
      await expectCall(page, before, 'ptahCli:create', {
        name: 'Llama-Local',
        providerId: 'ollama',
        apiKey: '',
      });
      await expectClosedToOpener(page, modal);
      // M4: a create runs the new instance's Test at once and its named result replaces the save toast.
      await expect(toastMessage(page)).toHaveText('Llama-Local: Test passed.');
      await expect(
        page.locator('[data-testid^="cli-matrix-row-created-"]'),
      ).toContainText('Llama-Local');
    });

    test('tier-mapping modal: "Done" closes it and focus returns to Tiers', async ({
      page,
    }) => {
      const modal = MODALS[1];
      const dialog = await open(page, modal);
      await dialog.locator('[data-testid="cli-tier-mapping-done"]').click();
      await expectClosedToOpener(page, modal);
    });

    test('edit modal (#50): a rename sends ptahCli:update with the new name only', async ({
      page,
    }) => {
      // TASK_2026_2256_159f: the wider content column no longer collapses the lane table at the
      // default viewport. These steps use the collapsed detail controls, as the More actions test does.
      await page.setViewportSize({ width: 1024, height: 768 });
      // Phase 3 (decision 23): Edit sits in the expanded detail footer; focus returns to it.
      await expandMatrixDetail(page, GLM_ID);
      const more = page.locator(
        `#lane-detail-${GLM_ID} [data-testid="cli-matrix-edit-${GLM_ID}"]`,
      );
      await more.click();
      const dialog = dialogOf(page, 'add-cli-instance-modal');
      await expect(dialog).toBeVisible();
      await expect(
        dialog.locator('[data-testid="add-cli-instance-provider-fixed"]'),
      ).toHaveText('Ollama Cloud');
      const before = getFixtureState(page).calls.length;
      await dialog
        .locator('[data-testid="add-cli-instance-name"]')
        .fill('Glm-Main');
      await dialog.locator('[data-testid="add-cli-instance-submit"]').click();
      await expectCall(page, before, 'ptahCli:update', {
        id: GLM_ID,
        name: 'Glm-Main',
      });
      await expect(dialog).toHaveCount(0);
      await expect(more).toBeFocused();
    });

    // ----- Batch 36 -----

    test('cell pick: the Codex model cell, then a model, sends one agent:setConfig; Undo writes the previous model back', async ({
      page,
    }) => {
      // TASK_2026_2256_159f: the wider content column no longer collapses the lane table at the
      // default viewport. These steps use the collapsed detail controls, as the More actions test does.
      await page.setViewportSize({ width: 1024, height: 768 });
      const state = getFixtureState(page);
      await expandMatrixDetail(page, 'codex');
      const cell = page.locator(
        '#lane-detail-codex [data-popover-kind="model"]',
      );
      await cell.click();
      const popover = page.locator('[data-testid="cli-matrix-popover"]');
      const search = popover.locator('input[role="combobox"]');
      await expect(search).toBeFocused();
      const listbox = page.locator(
        `[id="${await search.getAttribute('aria-controls')}"]`,
      );
      await expect(listbox).toBeVisible();
      const before = state.calls.length;
      await listbox.getByRole('option', { name: /^Provider default/ }).click();
      await expectCall(page, before, 'agent:setConfig', { codexModel: '' });
      // Two clicks: the cell, then the value. The popover closes on the save and focus returns to the cell.
      await expect(popover).toHaveCount(0);
      await expect(cell).toBeFocused();
      expect(
        state.calls
          .slice(before)
          .filter((call) => call.method === 'agent:setConfig'),
      ).toHaveLength(1);
      await expect(toastMessage(page)).toContainText('Saved');
      await toastUndo(page).click();
      await expectCall(page, before, 'agent:setConfig', {
        codexModel: 'gpt-5.5-codex',
      });
      await expect
        .poll(() => state.agentConfig.codexModel)
        .toBe('gpt-5.5-codex');
    });

    test('on/off: a system CLI writes disabledClis and disables model editing; an instance writes ptahCli:update', async ({
      page,
    }) => {
      // TASK_2026_2256_159f: the wider content column no longer collapses the lane table at the
      // default viewport. These steps use the collapsed detail controls, as the More actions test does.
      await page.setViewportSize({ width: 1024, height: 768 });
      const state = getFixtureState(page);
      const codexCard = page.locator('[data-testid="cli-provider-card-codex"]');
      await expandMatrixDetail(page, 'codex');
      const codexModel = page.locator('#lane-detail-codex');
      const codex = codexCard.getByRole('switch', { name: 'Codex enabled' });
      await expect(codex).toBeChecked();
      let before = state.calls.length;
      await codex.click();
      await expectCall(page, before, 'agent:setConfig', {
        disabledClis: expect.arrayContaining(['copilot', 'codex']),
      });
      await expect(codex).not.toBeChecked();
      // A turned-off card keeps its model visible but disables editing.
      await expect(
        codexModel.locator('[data-popover-kind="model"]'),
      ).toBeDisabled();
      await expect(
        codexModel.locator('[data-popover-kind="effort"]'),
      ).toBeDisabled();
      await toastUndo(page).click();
      await expectCall(page, before, 'agent:setConfig', {
        disabledClis: ['copilot'],
      });
      await expect(codex).toBeChecked();
      await visibleEnabled(codexModel.locator('[data-popover-kind="model"]'));
      // A Ptah CLI instance's on/off is its own `enabled` field.
      const glm = page.locator(`[data-testid="cli-matrix-toggle-${GLM_ID}"]`);
      before = state.calls.length;
      await glm.click();
      await expectCall(page, before, 'ptahCli:update', {
        id: GLM_ID,
        enabled: false,
      });
      await expect(glm).not.toBeChecked();
      await expect(toastMessage(page)).toContainText('Saved Glm off');
    });

    test('Tiers: a tier pick sends ptahCli:update with the full {sonnet, opus, haiku} object (D5)', async ({
      page,
    }) => {
      const dialog = await openGlmTiers(page);
      const before = getFixtureState(page).calls.length;
      const search = dialog.locator(
        '[data-tier="sonnet"] input[role="combobox"]',
      );
      await visibleEnabled(search);
      await search.click();
      const listbox = page.locator(
        `[id="${await search.getAttribute('aria-controls')}"]`,
      );
      // A compact field names each option by its ID, then its display name.
      await listbox.getByRole('option', { name: 'k3 K3', exact: true }).click();
      await expectCall(page, before, 'ptahCli:update', {
        id: GLM_ID,
        tierMappings: { ...GLM_TIERS, sonnet: 'k3' },
      });
      const updates = getFixtureState(page)
        .calls.slice(before)
        .filter((call) => call.method === 'ptahCli:update');
      expect(updates).toHaveLength(1);
    });

    test('Tiers: "Use inherited" sends the full object without that tier', async ({
      page,
    }) => {
      const dialog = await openGlmTiers(page);
      const before = getFixtureState(page).calls.length;
      await dialog.locator('[data-testid="cli-tier-inherit-haiku"]').click();
      await expectCall(page, before, 'ptahCli:update', {
        id: GLM_ID,
        tierMappings: { sonnet: GLM_TIERS.sonnet, opus: GLM_TIERS.opus },
      });
    });

    test('roles are visible by default and after returning to Providers', async ({
      page,
    }) => {
      await expect(
        page.locator('[data-testid="consumer-table"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="consumer-row-enhancement"]'),
      ).toBeVisible();
      await contextManagementTab(page);
      await agentsRoutingTab(page);
      await expect(
        page.locator('[data-testid="consumer-table"]'),
      ).toBeVisible();
    });

    test("More actions (visual re-check N1): the open menu's items sit inside the panel box and the viewport", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await expandMatrixDetail(page, GLM_ID);
      await page
        .locator(
          `[data-testid="cli-matrix-row-${GLM_ID}"] ptah-table-row-actions button[aria-haspopup="menu"]`,
        )
        .click();
      const menu = page.locator(
        `[data-testid="cli-matrix-row-${GLM_ID}"] [role="menu"]`,
      );
      await expect(menu).toBeVisible();
      const panel = await menu.boundingBox();
      if (!panel) throw new Error('No More actions panel box');
      // Phase 3 (decision 23): the kebab holds the quick actions only (Test; Sign in when a key is needed).
      const items = menu.locator('button:visible');
      await expect(items).toHaveCount(1);
      await expect(menu.getByRole('menuitem', { name: 'Test' })).toBeVisible();
      for (const item of await items.all()) {
        const box = await item.boundingBox();
        if (!box) throw new Error('No More actions item box');
        expect(box.x).toBeGreaterThanOrEqual(panel.x - 0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(
          panel.x + panel.width + 0.5,
        );
        expect(box.y).toBeGreaterThanOrEqual(panel.y - 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(
          panel.y + panel.height + 0.5,
        );
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1024);
        expect(box.y + box.height).toBeLessThanOrEqual(768);
      }
      await page.keyboard.press('Escape');
      // Edit tiers, Edit and Delete are in the detail footer, Delete after Edit.
      const footer = page.locator(
        `#lane-detail-${GLM_ID} [data-testid="lane-detail-footer"]`,
      );
      await expect(
        footer.locator(`[data-testid="cli-matrix-tiers-${GLM_ID}"]`),
      ).toBeVisible();
      const [edit, remove] = [
        await footer
          .locator(`[data-testid="cli-matrix-edit-${GLM_ID}"]`)
          .boundingBox(),
        await footer
          .locator(`[data-testid="cli-matrix-delete-${GLM_ID}"]`)
          .boundingBox(),
      ];
      expect(edit).not.toBeNull();
      expect(remove).not.toBeNull();
    });

    test('Reorder mode: a move writes the whole order, focus stays on the moved row, Done returns focus, Undo restores', async ({
      page,
    }) => {
      const bar = page.locator('[data-testid="orchestration-policy-bar"]');
      const reorder = page.getByTestId('lanes-order-edit');
      const chips = bar.locator('[data-testid^="policy-order-chip-"]');
      await expect(chips.first()).toHaveText('1. Codex');
      await reorder.click();
      await expect(reorder).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('lanes-group-cli')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Move Codex up' }),
      ).toHaveAttribute('aria-disabled', 'true');
      const before = getFixtureState(page).calls.length;
      const down = page.getByRole('button', { name: 'Move Codex down' });
      await down.click();
      await expectCall(page, before, 'agent:setConfig', {
        preferredAgentOrder: [
          'antigravity',
          'codex',
          'glm-instance-1',
          'copilot',
          'opencode',
          'grok',
        ],
      });
      // During the save the move buttons are aria-disabled, not disabled, so focus stays on the moved row's button.
      await expect(down).toBeFocused();
      await reorder.click();
      await expect(reorder).toHaveAttribute('aria-pressed', 'false');
      await expect(reorder).toBeFocused();
      await expect(chips.first()).toHaveText('1. Antigravity');
      await toastUndo(page).click();
      await expectCall(page, before, 'agent:setConfig', {
        preferredAgentOrder: [
          'codex',
          'antigravity',
          'glm-instance-1',
          'copilot',
        ],
      });
      await expect(chips.first()).toHaveText('1. Codex');
    });
  });

  test.describe(`webview > settings > orchestration scenes, changed reads (${host})`, () => {
    test('adding a Copilot-backed instance uses an existing GitHub sign-in', async ({
      page,
      fixtureServer,
    }) => {
      await bootOrchestration(page, fixtureServer.url, host, {
        'auth:getAuthStatus': { ...AUTH_STATUS_FIXTURE, copilotAuthenticated: true },
      });
      const modal = MODALS[0];
      const dialog = await open(page, modal);
      await dialog
        .locator('[data-testid="add-cli-instance-name"]')
        .fill('Copilot-agent');
      await choosePtahSelect(
        dialog.locator('[data-testid="add-cli-instance-provider"]'),
        'GitHub Copilot · OAuth',
      );
      const create = dialog.locator('[data-testid="add-cli-instance-submit"]');
      const signIn = dialog.locator(
        '[data-testid="add-cli-instance-copilot-state"]',
      );
      await expect(signIn).toHaveText('Signed in');
      await expect(create).toBeEnabled();
      const before = getFixtureState(page).calls.length;
      await create.click();
      await expectCall(
        page,
        before,
        'ptahCli:create',
        expect.objectContaining({
          name: 'Copilot-agent',
          providerId: 'github-copilot',
        }),
      );
      await expectClosedToOpener(page, modal);
    });

    test('Cursor key (Batch 36d.b): save, then remove; the row moves within the table, the detail and popover stay open, and Esc returns focus to the credentials trigger', async ({
      page,
      fixtureServer,
    }) => {
      await bootOrchestration(
        page,
        fixtureServer.url,
        host,
        cursorKeyStoreOverrides(page),
      );
      const expander = page.locator(
        '[data-testid="cli-provider-card-cursor"] button[aria-label="Details for Cursor"]',
      );
      const detail = page.locator('#lane-detail-cursor');
      const popover = page.locator('[data-testid="cursor-credential-popover"]');
      const key = popover.locator('[data-testid="cursor-credential-key"]');
      // Save moves Cursor above uninstalled rows while its detail stays open.
      await expandMatrixDetail(page, 'cursor');
      await detail.locator('[data-popover-kind="credentials"]').click();
      await expect(key).toBeFocused();
      await key.fill('crsr_e2e_secret_value');
      await popover.locator('[data-testid="cursor-credential-save"]').click();
      await expect(toastMessage(page)).toHaveText('Key stored, not verified.');
      const installedTrigger = page.locator(
        '#lane-detail-cursor [data-popover-kind="credentials"]',
      );
      await expect(installedTrigger).toBeVisible();
      await expect(expander).toHaveAttribute('aria-expanded', 'true');
      await expect(popover).toBeVisible();
      await expect
        .poll(() =>
          popover.evaluate((node) => node.contains(document.activeElement)),
        )
        .toBe(true);
      await expect(
        popover.locator('[data-testid="cursor-credential-status"]'),
      ).toHaveText('Set');
      await page.keyboard.press('Escape');
      await expect(popover).toHaveCount(0);
      await expect(installedTrigger).toBeFocused();
      // Remove moves Cursor back below installed rows while its detail stays open.
      await expect(expander).toHaveAttribute('aria-expanded', 'true');
      await installedTrigger.click();
      await popover.locator('[data-testid="cursor-credential-remove"]').click();
      await expect(
        popover.locator('[data-testid="cursor-credential-remove-cancel"]'),
      ).toBeFocused();
      await popover
        .locator('[data-testid="cursor-credential-remove-confirm-button"]')
        .click();
      await expect(toastMessage(page)).toHaveText('Stored key removed.');
      // The row now reports Not installed; the open popover keeps focus inside.
      await expect(popover).toBeVisible();
      await expect
        .poll(() =>
          popover.evaluate((node) => node.contains(document.activeElement)),
        )
        .toBe(true);
      // Esc closes the popover and restores focus to the credentials trigger.
      await page.keyboard.press('Escape');
      await expect(popover).toHaveCount(0);
      await expect(expander).toHaveAttribute('aria-expanded', 'true');
      await expect(
        page.locator('[data-testid="cli-provider-card-cursor"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="cli-provider-card-cursor"]'),
      ).toContainText('Needs API key');
      await expect(
        page.locator('[data-testid="cli-provider-card-cursor"]'),
      ).toHaveAttribute('data-state', 'muted');
      await expect(installedTrigger).toBeFocused();
      // A second Esc changes nothing: the table stays visible.
      await page.keyboard.press('Escape');
      await expect(installedTrigger).toBeFocused();
      await expect(page.locator('[data-testid="cli-matrix"]')).toBeVisible();
    });

    test('Cursor key (Batch 36d.a, N3): a failed save keeps focus in the popover; Esc closes it and returns focus to the trigger', async ({
      page,
      fixtureServer,
    }) => {
      await bootOrchestration(
        page,
        fixtureServer.url,
        host,
        cursorKeyStoreOverrides(page, { failCursorSave: true }),
      );
      await expandMatrixDetail(page, 'cursor');
      const trigger = page.locator(
        '#lane-detail-cursor [data-popover-kind="credentials"]',
      );
      await trigger.click();
      const popover = page.locator('[data-testid="cursor-credential-popover"]');
      const key = popover.locator('[data-testid="cursor-credential-key"]');
      // Batch 51.2: the empty-field Save is aria-disabled with daisyUI's disabled look (base-content at 20%, no
      // primary fill), and stays focusable.
      const save = popover.locator('[data-testid="cursor-credential-save"]');
      await expect(save).toHaveAttribute('aria-disabled', 'true');
      const look = await save.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          color: style.color,
          cursor: style.cursor,
          events: style.pointerEvents,
        };
      });
      expect(look.color).toMatch(/\/ 0\.2\)$|, 0\.2\)$/);
      expect(look.cursor).toBe('not-allowed');
      expect(look.events).not.toBe('none');
      await save.focus();
      await expect(save).toBeFocused();
      await key.fill('crsr_e2e_secret_value');
      await save.click();
      await expect(
        page.locator('[data-testid="settings-toast-message"]'),
      ).toContainText('The key was not saved.');
      await expect(key).toBeFocused();
      await expect(key).toHaveValue('crsr_e2e_secret_value');
      await page.keyboard.press('Escape');
      await expect(popover).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  });
}
