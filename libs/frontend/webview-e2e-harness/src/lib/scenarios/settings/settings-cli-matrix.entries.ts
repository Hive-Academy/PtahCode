import { choosePtahSelect } from '../../choose-ptah-select';
/**
 * Gate G entries for the CLI matrix (Batch 30; on the Providers tab since the Context Management regroup): the restored #43, #44, #54, #70 and #71, and
 * the regressed-UX fixes RUX-8 and RUX-11. Batch 31 re-pointed #63 (Copilot auto-approve) and #64 (Cursor key) here;
 * Batch 32 added #47 and #53 (the add-instance and tier modals) and moved #49 here with its CLI-form half. Batch 34
 * retired the old Ptah CLI instance manager and re-pointed its entries here (#39, #42, #45, #46, #48, #50-#52, #55-#57,
 * and the delegated #59-#62, #65-#69). Kept apart from the table, which is over its `max-lines` budget (the
 * `settings-main-agent.entries.ts` precedent); `REACHABILITY_TABLE` spreads them in and `EXPECTED_CAPABILITY_COUNT`
 * counts them.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import type { ReachabilityEntry } from './settings-reachability.table';
import {
  bootVariant,
  closeConnectionDrawer,
  credentialsOf,
  expectCall,
  agentsRoutingTab,
  throughVariantBoot,
  visibleEnabled,
} from './settings-drawer.reach';
import {
  AGENT_CONFIG_FIXTURE,
  AUTH_STATUS_FIXTURE,
  getFixtureState,
  PROVIDER_MODELS_FIXTURE,
} from './settings.fixtures';
import { rpcError } from '../marketplace/marketplace.fixtures';

/** Opens a matrix modal (`NativeModalComponent`, a native `<dialog>`) from `opener`; returns its dialog. */
async function openMatrixModal(
  page: Page,
  opener: Locator,
  testid: string,
): Promise<Locator> {
  await visibleEnabled(opener);
  await opener.click();
  const dialog = page.locator(`dialog:has([data-testid="${testid}"])`);
  // daisyUI keeps a closed `.modal` laid out at opacity 0: the `open` attribute is the real state.
  await expect(dialog).toHaveAttribute('open', '');
  return dialog;
}

/** Closes a matrix modal with Esc; focus returns to `opener` (native `<dialog>`). */
async function closeMatrixModal(
  page: Page,
  dialog: Locator,
  opener: Locator,
): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open');
  await expect(opener).toBeFocused();
}

/** The fixture's one Ptah CLI instance, "Glm" (BRIEF:66-67). */
const GLM_ID = 'glm-instance-1';

/** Returns a provider card, or the existing Ptah CLI instance card. */
async function matrixCard(page: Page, id: string): Promise<Locator> {
  await agentsRoutingTab(page);
  const card = page.locator(
    `[data-testid="${id === GLM_ID ? 'cli-matrix-row' : 'cli-provider-card'}-${id}"]`,
  );
  await expect(card).toBeVisible();
  // The row expander is the one entry point of the table detail (the kebab has no Details item).
  const details = card.locator('ptah-table-row-expander button');
  await expect(details).toBeVisible();
  if ((await details.getAttribute('aria-expanded')) === 'false')
    await details.click();
  return card;
}

/** The visible value button of a row's Model or Effort cell. */
function providerField(card: Locator, field: 'Model' | 'Effort'): Locator {
  return card.locator(`[data-popover-kind="${field.toLowerCase()}"]`);
}

/** The expanded detail of a row (the next table row, `#lane-detail-<id>`). */
function laneDetail(page: Page, id: string): Locator {
  return page.locator(`[id="lane-detail-${id}"]`);
}

/**
 * Opens a matrix popover from `trigger`, runs `body` on it, then closes it: Esc when focus is still inside it, else
 * its own Close button (a body that clicked outside it, e.g. the toast's Undo, moved focus out, and the popover takes
 * Esc only from inside). Left open, its backdrop would block every later entry's clicks.
 */
async function throughMatrixPopover(
  page: Page,
  trigger: Locator,
  popover: string,
  body: (panel: Locator) => Promise<void>,
): Promise<void> {
  await visibleEnabled(trigger);
  await trigger.click();
  const panel = page.locator(`[data-testid="${popover}"]`);
  await expect(panel).toBeVisible();
  try {
    await body(panel);
  } finally {
    const focusInside = await panel
      .evaluate((node) => node.contains(document.activeElement))
      .catch(() => false);
    if (focusInside) await page.keyboard.press('Escape');
    else if (await panel.count())
      await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel).toHaveCount(0);
  }
}

/** Opens a matrix cell's popover from `trigger`, runs `body`, then closes it with its own Close button. */
async function throughCellPopover(
  page: Page,
  trigger: Locator,
  body: (panel: Locator) => Promise<void>,
): Promise<void> {
  await visibleEnabled(trigger);
  await trigger.click();
  const panel = page.locator('[data-testid="cli-matrix-popover"]');
  await expect(panel).toBeVisible();
  try {
    await body(panel);
  } finally {
    // Not Esc: the model search opens its list on focus, and its first Esc closes only the list.
    if (await panel.count())
      await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel).toHaveCount(0);
  }
}

/** Glm's Model cell: the per-instance model popover (the old manager's "Edit Glm model" picker, #39 and #45). */
async function throughInstanceModel(
  page: Page,
  body: (panel: Locator) => Promise<void>,
): Promise<void> {
  const glm = await matrixCard(page, GLM_ID);
  await throughCellPopover(
    page,
    glm.locator('[data-testid="cli-matrix-model"] [data-popover-kind="model"]'),
    body,
  );
}

/** System CLIs whose cells are live in the shared fixture (installed and on). */
const LIVE_IN_FIXTURE: ReadonlySet<string> = new Set([
  'codex',
  'antigravity',
  'opencode',
]);
/**
 * Every system CLI installed and none turned off. The shared fixture has Copilot off and Cursor and Pi not installed,
 * and the matrix shows those rows' cells as plain text (#71), so their delegated settings are reached on this variant.
 */
const ALL_CLIS_LIVE = {
  'agent:getConfig': {
    ...AGENT_CONFIG_FIXTURE,
    disabledClis: [],
    detectedClis: AGENT_CONFIG_FIXTURE.detectedClis.map((cli) => ({
      ...cli,
      installed: true,
    })),
  },
};

/**
 * One ALL_CLIS_LIVE page per shared session page, booted on first use and reused by every delegated entry that needs it
 * (one boot instead of five: each boot costs seconds of the 180 s budget). The browser context's teardown closes it.
 */
const liveVariants = new WeakMap<Page, Page>();
async function liveVariant(page: Page): Promise<Page> {
  const existing = liveVariants.get(page);
  if (existing && !existing.isClosed()) return existing;
  const variant = await bootVariant(page, ALL_CLIS_LIVE, 'Providers');
  liveVariants.set(page, variant);
  return variant;
}

/** #59-#69: one delegated CLI's Model or Effort cell opens its popover with a live control (Batch 34). */
async function throughDelegatedCell(
  page: Page,
  cli: string,
  field: 'model' | 'effort',
): Promise<void> {
  const target = LIVE_IN_FIXTURE.has(cli) ? page : await liveVariant(page);
  const row = await matrixCard(target, cli);
  await throughCellPopover(
    target,
    providerField(row, field === 'model' ? 'Model' : 'Effort'),
    async (panel) => {
      await expect(panel).toHaveAttribute('data-row', cli);
      await expect(panel).toHaveAttribute('data-field', field);
      await visibleEnabled(
        field === 'model'
          ? panel.locator('input[role="combobox"]')
          : panel.locator(
              '[data-testid="cli-matrix-effort-options"] [data-effort="default"]',
            ),
      );
    },
  );
}

/** Batch 34: the old manager's capabilities, re-pointed to the matrix, its modals and its popovers (D14). */
const INSTANCE_ENTRIES: readonly ReachabilityEntry[] = [
  {
    id: '#39',
    capability: 'Refresh the model list (Retry on error)',
    status: 'present',
    // Each Ptah CLI instance's own model picker (a distinct catalogue fetch from the main-agent one, #35), then its error
    // branch on a second page where `provider:listModels` answers `success:false` (the opt-in `rpcError` envelope) until
    // Retry: the picker shows its fixed error row, and Retry reloads the list and clears it.
    reach: async (page) => {
      await throughInstanceModel(page, async (panel) => {
        await expect(panel.locator('ptah-provider-model-picker')).toBeVisible();
      });
      let failing = true;
      await throughVariantBoot(
        page,
        {
          'provider:listModels': () =>
            failing
              ? rpcError('catalogue unavailable')
              : PROVIDER_MODELS_FIXTURE,
        },
        'Providers',
        (variant) =>
          throughInstanceModel(variant, async (panel) => {
            const error = panel.locator(
              '[data-testid="provider-model-picker-error"]',
            );
            await expect(error).toContainText(
              'Could not load provider models. Retry.',
            );
            await expect(error).not.toContainText('catalogue unavailable');
            failing = false;
            await panel
              .locator('[data-testid="provider-model-picker-retry"]')
              .click();
            await expect(error).toHaveCount(0);
          }),
      );
    },
  },
  {
    id: '#42',
    capability: 'List Ptah CLI agents with name and provider badge',
    status: 'present',
    reach: async (page) => {
      const glm = await matrixCard(page, GLM_ID);
      await expect(glm).toHaveAttribute('data-lane-kind', 'instance');
      // The instance is a row of the "Ptah CLI instances" group: the table body that starts with that group
      // header, with its name and its provider mark and label.
      const group = page.locator(
        'tbody:has(> [data-testid="lanes-group-ptah"])',
      );
      await expect(
        group.locator('[data-testid="lanes-group-ptah"] .lanes-group-name'),
      ).toHaveText('Ptah CLI instances');
      await expect(
        group.locator(`[data-testid="cli-matrix-row-${GLM_ID}"]`),
      ).toHaveCount(1);
      await expect(glm.getByText('Glm', { exact: true })).toBeVisible();
      await expect(
        glm.locator('[data-testid="provider-mark-box"]').first(),
      ).toBeVisible();
      await expect(
        glm
          .getByText('Ollama Cloud', { exact: true })
          .filter({ visible: true }),
      ).toHaveCount(1);
    },
  },
  {
    id: '#45',
    capability: 'Model count',
    status: 'present',
    reach: (page) =>
      throughInstanceModel(page, async (panel) => {
        await expect(
          panel.locator('[data-testid="cli-matrix-model-count"]'),
        ).toHaveText('12 models available from Ollama Cloud.');
      }),
  },
  {
    id: '#46',
    capability: 'Add agent: name, provider, key',
    status: 'present',
    reach: async (page) => {
      await agentsRoutingTab(page);
      const add = page.locator('[data-testid="cli-matrix-add"]');
      const dialog = await openMatrixModal(page, add, 'add-cli-instance-modal');
      try {
        await visibleEnabled(
          dialog.locator('[data-testid="add-cli-instance-name"]'),
        );
        await choosePtahSelect(
          dialog.locator('[data-testid="add-cli-instance-provider"]'),
          'Kimi Code · OAuth',
        );
        await visibleEnabled(
          dialog.locator('[data-testid="add-cli-instance-key"]'),
        );
        await expect(
          dialog.locator('[data-testid="add-cli-instance-submit"]'),
        ).toHaveText('Create Instance');
      } finally {
        await closeMatrixModal(page, dialog, add);
      }
    },
  },
  {
    id: '#48',
    capability: 'Keyless / optional-key hints',
    status: 'present',
    reach: async (page) => {
      await agentsRoutingTab(page);
      const add = page.locator('[data-testid="cli-matrix-add"]');
      const dialog = await openMatrixModal(page, add, 'add-cli-instance-modal');
      try {
        await choosePtahSelect(
          dialog.locator('[data-testid="add-cli-instance-provider"]'),
          'Ollama Cloud · Local server',
        );
        await expect(
          dialog.locator('[data-testid="add-cli-instance-key-help"]'),
        ).toContainText('run ollama signin');
      } finally {
        await closeMatrixModal(page, dialog, add);
      }
    },
  },
  {
    id: '#50',
    capability: 'Edit name / replace key inline',
    status: 'present',
    // Batch 32: Edit opens the add modal in edit mode (name and a replacement key; the provider is fixed).
    reach: async (page) => {
      // Phase 3 (decision 23): Edit is in the expanded detail footer; focus returns to it when the modal closes.
      await matrixCard(page, GLM_ID);
      const more = page.locator(
        `#lane-detail-${GLM_ID} [data-testid="cli-matrix-edit-${GLM_ID}"]`,
      );
      const dialog = await openMatrixModal(
        page,
        more,
        'add-cli-instance-modal',
      );
      try {
        await expect(
          dialog.locator('[data-testid="add-cli-instance-name"]'),
        ).toHaveValue('Glm');
        await visibleEnabled(
          dialog.locator('[data-testid="add-cli-instance-key"]'),
        );
        await expect(
          dialog.locator('[data-testid="add-cli-instance-submit"]'),
        ).toHaveText('Save changes');
      } finally {
        await closeMatrixModal(page, dialog, more);
      }
    },
  },
  {
    id: '#51',
    capability: 'Enable/disable agent toggle',
    status: 'present',
    reach: async (page) => {
      const glm = await matrixCard(page, GLM_ID);
      const toggle = glm.locator(`[data-testid="cli-matrix-toggle-${GLM_ID}"]`);
      await visibleEnabled(toggle);
      await expect(toggle).toBeChecked();
    },
  },
  {
    id: '#52',
    capability: 'Test connection',
    status: 'present',
    // RUX-11 clicks it and checks the inline result.
    reach: async (page) => {
      // Phase 3: Test is in the detail footer (and the kebab); its result is the footer status line.
      await matrixCard(page, GLM_ID);
      const footer = page.locator(
        `#lane-detail-${GLM_ID} [data-testid="lane-detail-footer"]`,
      );
      await visibleEnabled(
        footer.getByRole('button', { name: 'Test', exact: true }),
      );
      await expect(
        footer.locator('[data-testid="cli-matrix-test-result"]'),
      ).toBeVisible();
    },
  },
  {
    id: '#55',
    capability: 'Delete with confirmation',
    status: 'present',
    reach: async (page) => {
      // Phase 3 (decision 23): the detail footer Delete → the inline confirm (focus on its Cancel) → Cancel → focus
      // back on Delete.
      const glm = await matrixCard(page, GLM_ID);
      const remove = page.locator(
        `#lane-detail-${GLM_ID} [data-testid="cli-matrix-delete-${GLM_ID}"]`,
      );
      await visibleEnabled(remove);
      await remove.click();
      await visibleEnabled(
        glm.getByRole('button', { name: 'Confirm delete Glm', exact: true }),
      );
      const cancel = glm.getByRole('button', { name: 'Cancel', exact: true });
      await expect(cancel).toBeFocused();
      await cancel.click();
      await expect(remove).toBeFocused();
    },
  },
  {
    id: '#56',
    capability: 'Success/error commit feedback',
    status: 'present',
    // Glm's on/off (a real `ptahCli:update` write): the toast says it saved, and the read-back moves the checkbox. The
    // toggle is put back in `finally` (NW-2): through the UI first, and the `FixtureState` itself is restored whatever
    // happens, so later entries see Glm enabled even when an assertion or the UI restore fails. A UI restore failure
    // never replaces the failure of the body above it.
    reach: async (page) => {
      const glm = await matrixCard(page, GLM_ID);
      const state = getFixtureState(page);
      const toggle = glm.locator(`[data-testid="cli-matrix-toggle-${GLM_ID}"]`);
      const message = page.locator('[data-testid="settings-toast-message"]');
      const glmEnabled = (): boolean | undefined =>
        state.ptahCliAgents.find((agent) => agent.id === GLM_ID)?.enabled;
      let failed = false;
      let failure: unknown;
      try {
        await visibleEnabled(toggle);
        const before = state.calls.length;
        await toggle.click();
        await expectCall(page, before, 'ptahCli:update', {
          id: GLM_ID,
          enabled: false,
        });
        await expect(message).toContainText('Saved Glm off');
        await expect(toggle).not.toBeChecked();
        expect(glmEnabled()).toBe(false);
      } catch (error: unknown) {
        failed = true;
        failure = error;
      }
      try {
        if (glmEnabled() === false) {
          await visibleEnabled(toggle);
          await toggle.click();
          await expect(message).toContainText('Saved Glm on');
          await expect(toggle).toBeChecked();
        }
      } catch (restoreError: unknown) {
        if (!failed) {
          failed = true;
          failure = restoreError;
        }
      }
      // The fixture itself is put back whatever the UI did (NW-2).
      const agent = state.ptahCliAgents.find(
        (candidate) => candidate.id === GLM_ID,
      );
      if (agent && !agent.enabled) agent.enabled = true;
      if (failed) throw failure;
    },
  },
  {
    id: '#57',
    capability: 'Empty state with Add link',
    status: 'present',
    // A second page with no Ptah CLI instance: the Ptah CLI group's "No Ptah CLI instance yet." row carries its own Add.
    reach: (page) =>
      throughVariantBoot(
        page,
        { 'ptahCli:list': { agents: [] } },
        'Providers',
        async (variant) => {
          const empty = variant.locator(
            '[data-testid="cli-matrix-no-instances"]',
          );
          await expect(empty).toContainText('No Ptah CLI instance yet.');
          // Phase 3: the empty row of the Ptah CLI instances group carries the one Add (`cli-matrix-add`).
          await expect(
            variant.locator(
              '[data-testid="lanes-group-ptah"] ~ tr [data-testid="cli-matrix-no-instances"]',
            ),
          ).toHaveCount(1);
          await visibleEnabled(
            empty.getByRole('button', {
              name: 'Add Ptah CLI instance',
              exact: true,
            }),
          );
        },
      ),
  },
  {
    id: '#59',
    capability: 'Codex model (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'codex', 'model'),
  },
  {
    id: '#60',
    capability: 'Codex reasoning effort (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'codex', 'effort'),
  },
  {
    id: '#61',
    capability: 'Copilot model (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'copilot', 'model'),
  },
  {
    id: '#62',
    capability: 'Copilot reasoning effort (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'copilot', 'effort'),
  },
  {
    id: '#65',
    capability: 'Cursor model (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'cursor', 'model'),
  },
  {
    id: '#66',
    capability: 'Antigravity model (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'antigravity', 'model'),
  },
  {
    id: '#67',
    capability: 'opencode model (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'opencode', 'model'),
  },
  {
    id: '#68',
    capability: 'Pi model (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'pi', 'model'),
  },
  {
    id: '#69',
    capability: 'Pi reasoning effort (delegated)',
    status: 'present',
    reach: (page) => throughDelegatedCell(page, 'pi', 'effort'),
  },
];

export const CLI_MATRIX_ENTRIES: readonly ReachabilityEntry[] = [
  ...INSTANCE_ENTRIES,
  {
    id: '#47',
    capability: 'Inline GitHub login when adding a Copilot-backed CLI agent',
    status: 'restored',
    // Batch 32: Add → GitHub Copilot → "Login with GitHub" (`auth:copilotLogin`, then `auth:getAuthStatus`); Create stays
    // disabled until the sign-in is confirmed. The shared fixture answers no Copilot login, so a variant page does.
    reach: (page) =>
      throughVariantBoot(
        page,
        {
          'auth:copilotLogin': { success: true },
          'auth:getAuthStatus': {
            ...AUTH_STATUS_FIXTURE,
            copilotAuthenticated: true,
          },
        },
        'Providers',
        async (variant) => {
          const dialog = await openMatrixModal(
            variant,
            variant.locator('[data-testid="cli-matrix-add"]'),
            'add-cli-instance-modal',
          );
          await dialog
            .locator('[data-testid="add-cli-instance-name"]')
            .fill('Copilot-agent');
          // Gate V 36 M6: choosing Copilot re-reads the sign-in (this variant's host says signed in), never trusting an
          // earlier read; the inline login stays reachable (disabled once signed in).
          await choosePtahSelect(
            dialog.locator('[data-testid="add-cli-instance-provider"]'),
            'GitHub Copilot · OAuth',
          );
          const create = dialog.locator(
            '[data-testid="add-cli-instance-submit"]',
          );
          await expect(
            dialog.locator('[data-testid="add-cli-instance-copilot-state"]'),
          ).toHaveText('Signed in');
          await expect(
            dialog.locator('[data-testid="add-cli-instance-copilot-login"]'),
          ).toBeVisible();
          await expect(create).toBeEnabled();
        },
      ).then(() =>
        throughVariantBoot(
          page,
          {
            'auth:copilotLogin': { success: true },
            'auth:getAuthStatus': {
              ...AUTH_STATUS_FIXTURE,
              copilotAuthenticated: false,
            },
          },
          'Providers',
          async (variant) => {
            // Signed out: Create stays disabled; "Login with GitHub" runs the login and the re-read still says not signed in.
            const dialog = await openMatrixModal(
              variant,
              variant.locator('[data-testid="cli-matrix-add"]'),
              'add-cli-instance-modal',
            );
            await dialog
              .locator('[data-testid="add-cli-instance-name"]')
              .fill('Copilot-agent');
            await choosePtahSelect(
              dialog.locator('[data-testid="add-cli-instance-provider"]'),
              'GitHub Copilot · OAuth',
            );
            const create = dialog.locator(
              '[data-testid="add-cli-instance-submit"]',
            );
            await expect(
              dialog.locator('[data-testid="add-cli-instance-copilot-state"]'),
            ).toHaveText('Awaiting sign-in');
            await expect(create).toBeDisabled();
            const login = dialog.locator(
              '[data-testid="add-cli-instance-copilot-login"]',
            );
            await visibleEnabled(login);
            await login.click();
            await expect(
              dialog.locator(
                '[data-testid="add-cli-instance-copilot-message"]',
              ),
            ).toContainText('Login has not been confirmed');
            await expect(create).toBeDisabled();
          },
        ),
      ),
  },
  {
    id: '#49',
    capability: 'Show/hide API key in CLI agent add/edit forms',
    status: 'restored',
    // Batch 21 restored the drawer Credentials half (the Replace key field); Batch 32 adds the CLI-instance add form.
    reach: async (page) => {
      try {
        await credentialsOf(page, 'Kimi Code');
        await page.locator('[data-testid="credentials-replace"]').click();
        const key = page.locator('[data-testid="credentials-new-key"]');
        await expect(key).toHaveAttribute('type', 'password');
        await page
          .locator('[data-testid="credentials-toggle-visibility"]')
          .click();
        await expect(key).toHaveAttribute('type', 'text');
      } finally {
        await closeConnectionDrawer(page);
      }
      await agentsRoutingTab(page);
      const add = page.locator('[data-testid="cli-matrix-add"]');
      const dialog = await openMatrixModal(page, add, 'add-cli-instance-modal');
      try {
        await choosePtahSelect(
          dialog.locator('[data-testid="add-cli-instance-provider"]'),
          'Kimi Code · OAuth',
        );
        const key = dialog.locator('[data-testid="add-cli-instance-key"]');
        await key.fill('sk-e2e-reach-key');
        await expect(key).toHaveAttribute('type', 'password');
        await dialog
          .locator('[data-testid="add-cli-instance-toggle-visibility"]')
          .click();
        await expect(key).toHaveAttribute('type', 'text');
      } finally {
        await closeMatrixModal(page, dialog, add);
      }
    },
  },
  {
    id: '#53',
    capability: 'CLI-agent tier mapping (cliAgent scope)',
    status: 'restored',
    // Batch 32: Glm's Tiers → its own mapping; a pick sends `ptahCli:update` with the FULL tier object (D5). The
    // shared fixture's `settings:get` is static, so the read-back cannot confirm the write: the entry asserts the
    // write, and that the toast does not claim it was saved (D15).
    reach: async (page) => {
      await matrixCard(page, GLM_ID);
      // Tiers lives in the detail footer; the same locator opens the modal and receives focus back.
      const tiers = laneDetail(page, GLM_ID).locator(
        `[data-testid="cli-matrix-tiers-${GLM_ID}"]`,
      );
      await visibleEnabled(tiers);
      await tiers.click();
      const dialog = page.locator(
        'dialog:has([data-testid="cli-tier-mapping-modal"])',
      );
      await expect(dialog).toHaveAttribute('open', '');
      try {
        await expect(
          dialog.locator('[data-testid="cli-tier-source-opus"]'),
        ).toContainText('This instance: glm-5.3:cloud');
        const before = getFixtureState(page).calls.length;
        // The compact field's last row, "Enter a model ID…", swaps in a model-ID field.
        const search = dialog.locator(
          '[data-tier="opus"] input[role="combobox"]',
        );
        await visibleEnabled(search);
        await search.click();
        await page
          .locator(`[id="${await search.getAttribute('aria-controls')}"]`)
          .getByRole('option', { name: 'Enter a model ID…', exact: true })
          .click();
        const manual = dialog.locator('[data-testid="cli-tier-manual-opus"]');
        await expect(manual).toBeFocused();
        await manual.fill('glm-4.7');
        await dialog
          .locator('[data-testid="cli-tier-manual-apply-opus"]')
          .click();
        await expectCall(page, before, 'ptahCli:update', {
          id: GLM_ID,
          tierMappings: {
            sonnet: 'glm-5.3:cloud',
            opus: 'glm-4.7',
            haiku: 'glm-5.3:cloud',
          },
        });
        await expect(
          dialog.locator('[data-testid="settings-toast-message"]'),
        ).toBeVisible();
        await expect(
          dialog.locator('[data-testid="settings-toast-message"]'),
        ).not.toContainText('Saved Glm');
      } finally {
        await closeMatrixModal(page, dialog, tiers);
      }
    },
  },
  {
    id: '#63',
    capability: 'Copilot auto-approve toggle',
    status: 'present',
    // Phase 3 (decision 19): the expanded Copilot detail has the labelled "Auto-approve" switch row inline. A real
    // write through state.saveSettings (the fixture stores `copilotAutoApprove: false`), read back into the toggle,
    // then Undo writes the value back.
    reach: async (page) => {
      await matrixCard(page, 'copilot');
      const detail = laneDetail(page, 'copilot');
      await expect(
        detail.locator('[data-testid="cli-provider-popover-content"]'),
      ).toHaveCount(0);
      const toggle = detail.locator(
        '[data-testid="lane-detail-auto-approve"] [data-testid="copilot-auto-approve"]',
      );
      await visibleEnabled(toggle);
      await expect(toggle).not.toBeChecked();
      const before = getFixtureState(page).calls.length;
      await toggle.click();
      await expectCall(page, before, 'agent:setConfig', {
        copilotAutoApprove: true,
      });
      await expect(toggle).toBeChecked();
      const undo = page.locator('[data-testid="settings-toast-undo"]');
      await visibleEnabled(undo);
      await undo.click();
      await expectCall(page, before, 'agent:setConfig', {
        copilotAutoApprove: false,
      });
      await expect(toggle).not.toBeChecked();
    },
  },
  {
    id: '#64',
    capability: 'Cursor API key input + Save',
    status: 'present',
    // Batch 31: Cursor's Credentials (on its Uninstalled row: it installs once a key resolves). Masked key with
    // show/hide and the "Set" status; nothing is saved here (the fixture has no stored-key read-back).
    reach: async (page) => {
      await matrixCard(page, 'cursor');
      await throughMatrixPopover(
        page,
        page.locator('#lane-detail-cursor [data-popover-kind="credentials"]'),
        'cursor-credential-popover',
        async (panel) => {
          await expect(
            panel.locator('[data-testid="cursor-credential-status"]'),
          ).toHaveText('Not set');
          await expect(
            panel.locator('[data-testid="cursor-credential-help"]'),
          ).toContainText('cursor.com → Dashboard → Integrations');
          const key = panel.locator('[data-testid="cursor-credential-key"]');
          await expect(key).toBeFocused();
          await key.fill('crsr_e2e_reach_key');
          await expect(key).toHaveAttribute('type', 'password');
          await panel
            .locator('[data-testid="cursor-credential-toggle-visibility"]')
            .click();
          await expect(key).toHaveAttribute('type', 'text');
          await visibleEnabled(
            panel.locator('[data-testid="cursor-credential-save"]'),
          );
        },
      );
    },
  },
  {
    id: '#43',
    capability: 'Ptah CLI agent status (Ready/Error/Init/No Key)',
    status: 'restored',
    // The matrix Status column (`cliMatrixRows`; every status is pinned in `cli-matrix-rows.spec.ts`).
    reach: async (page) => {
      const row = await matrixCard(page, GLM_ID);
      await expect(
        row.locator('[data-testid="cli-matrix-status"]'),
      ).toContainText('Ready');
    },
  },
  {
    id: '#44',
    capability: 'Ptah CLI agent key status (Key set/No key/Cloud signin)',
    status: 'restored',
    reach: async (page) => {
      const row = await matrixCard(page, GLM_ID);
      await expect(
        row.locator(
          'xpath=following-sibling::tr[1]//*[@data-testid="cli-matrix-key-status"]',
        ),
      ).toHaveText('Key set');
    },
  },
  {
    id: '#54',
    capability: 'Tier-mapping badges on CLI agent cards',
    status: 'restored',
    reach: async (page) => {
      const row = await matrixCard(page, GLM_ID);
      // The instance card's tier mapping: each tier's label over its model.
      for (const tier of ['Sonnet', 'Opus', 'Haiku']) {
        const slot = row.locator(
          `xpath=following-sibling::tr[1]//*[@data-tier="${tier.toLowerCase()}"]`,
        );
        await expect(slot).toContainText(tier);
        await expect(slot).toContainText('glm-5.3:cloud');
      }
    },
  },
  {
    id: '#70',
    capability: 'Per-CLI permission and safety notes',
    status: 'restored',
    // Phase 3 (decisions 13, 20): the expanded detail shows the capability facts inline (icon, label, value; no
    // popover) and "All capabilities" as an inline disclosure. The row keeps the permission and network defaults.
    reach: async (page) => {
      const codex = await matrixCard(page, 'codex');
      const detail = laneDetail(page, 'codex');
      const permissionFact = detail.locator(
        '[data-testid="cli-capability-summary"] [data-capability="Permission"]',
      );
      await expect(permissionFact).toContainText('Permission modes');
      await expect(
        permissionFact.locator('xpath=following-sibling::dd[1]'),
      ).not.toBeEmpty();
      await expect(
        detail.locator('[data-testid="cli-provider-popover-content"]'),
      ).toHaveCount(0);
      const all = detail.locator('[data-lane-capabilities] button').first();
      await visibleEnabled(all);
      await all.click();
      await expect(detail.locator('ptah-cli-capability-detail')).toBeVisible();
      const permission = codex.getByRole('combobox', {
        name: 'Codex permission default',
      });
      await visibleEnabled(permission);
      await expect(
        codex.getByRole('combobox', { name: 'Codex network default' }),
      ).toBeVisible();
      await choosePtahSelect(permission, 'Yolo');
      const confirmation = codex.locator(
        'dialog:has-text("Confirm full access")',
      );
      await expect(confirmation).toHaveAttribute('open', '');
      await expect(
        confirmation.getByRole('button', { name: 'Confirm' }),
      ).toBeVisible();
      await confirmation.getByRole('button', { name: 'Cancel' }).click();
      await expect(confirmation).not.toHaveAttribute('open');
      await expect(permission).toBeFocused();
    },
  },
  {
    id: '#71',
    capability:
      'Per-CLI grouping of delegated settings, hidden when not installed',
    status: 'restored',
    // Phase 3 (decision 8): installed rows and the keyless Cursor recovery row stay in the table; a CLI that is not
    // installed (Pi) is a card of the "Add more CLI agents" strip with its install guide and a Details disclosure.
    reach: async (page) => {
      await agentsRoutingTab(page);
      const cursor = await matrixCard(page, 'cursor');
      await expect(cursor).toBeVisible();
      await expect(cursor).toContainText('Not installed');
      const strip = page.locator('[data-testid="lanes-strip"]');
      const pi = strip.locator('[data-testid="cli-provider-card-pi"]');
      await expect(pi).toBeVisible();
      await expect(pi).toContainText('Not installed');
      await expect(pi.locator('[data-popover-kind="model"]')).toHaveCount(0);
      await expect(pi.getByRole('switch')).toHaveCount(0);
      await expect(pi.getByRole('button', { name: /^Test/ })).toHaveCount(0);
      expect(
        await cursor.evaluate((node) => {
          const piCard = document.querySelector(
            '[data-testid="lanes-strip"] [data-testid="cli-provider-card-pi"]',
          );
          return (
            piCard !== null &&
            Boolean(
              node.compareDocumentPosition(piCard) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            )
          );
        }),
      ).toBe(true);
      await throughMatrixPopover(
        page,
        page.locator('[data-testid="lanes-strip-install-pi"]'),
        'cli-provider-popover-content',
        async (panel) => {
          await expect(panel).toContainText(
            'npm install -g @earendil-works/pi-coding-agent',
          );
          await visibleEnabled(
            panel.getByRole('button', { name: 'Re-detect' }),
          );
        },
      );
      const details = pi.locator('[data-strip-details="pi"] button').first();
      await visibleEnabled(details);
      await details.click();
      await expect(details).toHaveAttribute('aria-expanded', 'true');
      const shared = page.locator('[data-testid="lanes-ptah-defaults"]');
      await expect(shared).toBeVisible();
      await expect(
        shared.getByRole('combobox', { name: 'Ptah CLI permission default' }),
      ).toBeVisible();
      await expect(
        shared.getByRole('combobox', { name: 'Ptah CLI network default' }),
      ).toBeVisible();
    },
  },
  {
    id: 'RUX-8',
    capability:
      'Delegated CLI model/effort changed in place: 2 clicks (cell, value), saved on selection with Undo',
    status: 'restored',
    // The effort cell, then a value: one agent:setConfig. Undo is a second real write restoring the value.
    reach: async (page) => {
      const codex = await matrixCard(page, 'codex');
      const cell = providerField(codex, 'Effort');
      await expect(cell).toHaveText('medium');
      const before = getFixtureState(page).calls.length;
      await visibleEnabled(cell);
      await cell.click();
      await page
        .locator('[data-testid="cli-matrix-popover"] [data-effort="high"]')
        .click();
      await expectCall(page, before, 'agent:setConfig', {
        codexReasoningEffort: 'high',
      });
      await expect(
        page.locator('[data-testid="cli-matrix-popover"]'),
      ).toHaveCount(0);
      await expect(cell).toHaveText('high');
      const undo = page.locator('[data-testid="settings-toast-undo"]');
      await visibleEnabled(undo);
      await undo.click();
      await expectCall(page, before, 'agent:setConfig', {
        codexReasoningEffort: 'medium',
      });
      await expect(cell).toHaveText('medium');
    },
  },
  {
    id: 'RUX-11',
    capability:
      'CLI agent test result shown inline on its row (latency or failure reason)',
    status: 'restored',
    reach: async (page) => {
      const row = await matrixCard(page, GLM_ID);
      const before = getFixtureState(page).calls.length;
      const test = row.locator(`[data-testid="cli-matrix-test-${GLM_ID}"]`);
      if (await test.isVisible()) {
        await visibleEnabled(test);
        await test.click();
      } else {
        await page
          .locator(
            `[data-testid="cli-matrix-row-${GLM_ID}"] ptah-table-row-actions button[aria-haspopup="menu"]`,
          )
          .click();
        const menuTest = page.locator(
          `[data-testid="cli-matrix-row-${GLM_ID}"] [role="menuitem"]:text-is("Test")`,
        );
        await visibleEnabled(menuTest);
        await menuTest.click();
      }
      await expectCall(page, before, 'ptahCli:testConnection', { id: GLM_ID });
      await expect(
        page.locator('[data-testid="settings-toast-message"]'),
      ).toHaveText('Glm: Test passed.');
    },
  },
];
