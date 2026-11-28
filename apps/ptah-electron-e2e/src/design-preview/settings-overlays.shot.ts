import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type {
  AgentGetRoutingEvidenceResult,
  AgentRoutingEvidenceKey,
} from '@ptah-extension/shared';
import { test, expect } from '../support/fixtures';
import { dynamicMocks, staticMocks } from './settings-lanes.fixtures';

const out = resolve(
  __dirname,
  '../../../..',
  process.env['PTAH_SHOT_DIR'] ?? '.ptah/specs/TASK_2026_2329_dd39/screens',
);

async function openSection(page: Page, name: string, width = 1440): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name, exact: true })
    .click();
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(out, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({
    path: resolve(out, `${name}.png`),
    animations: 'disabled',
  });
}

test('captures the add provider subform', async ({ ui, mainWindow: page }) => {
  await ui.mockRpc({ ...staticMocks, ...dynamicMocks });
  await ui.prepare();
  await ui.goto('settings');
  await openSection(page, 'Providers');
  await page
    .getByRole('button', { name: 'Connect provider', exact: true })
    .click();
  await expect(page.getByTestId('wizard-title')).toBeVisible();
  await shot(page, 'add-provider');
  await page.getByTestId('wizard-provider-custom-option').click();
  await page.getByTestId('wizard-protocol-openai').scrollIntoViewIfNeeded();
  await shot(page, 'add-provider-custom');
});

test('captures the add instance subform and its modal dropdown', async ({
  ui,
  mainWindow: page,
}) => {
  await ui.mockRpc({ ...staticMocks, ...dynamicMocks });
  await ui.prepare();
  await ui.goto('settings');
  await openSection(page, 'Providers');
  await page.getByTestId('cli-matrix-add').click();
  const modal = page.getByRole('dialog', {
    name: 'Add Ptah CLI Agent Instance',
  });
  const provider = modal.getByRole('combobox', { name: 'Provider connection' });
  await expect(provider).toBeVisible();
  await shot(page, 'add-ptah-cli-instance');
  await provider.click();
  const options = page.getByRole('listbox').filter({ visible: true }).last();
  await expect(options).toBeVisible();
  await expect(options.getByRole('option', { name: /Requesty/i })).toHaveCount(0);
  await shot(page, 'add-ptah-cli-instance-provider-open');
  await options
    .getByRole('option', { name: /OpenRouter/i })
    .first()
    .click();
  await shot(page, 'add-ptah-cli-instance-openrouter');
});

const rowTolerance = 2;

test.describe('Ptah CLI instance header', () => {
  // A stalled Electron startup can time out before the scene reaches Settings.
  test.describe.configure({ retries: 1 });

  for (const width of [1280, 1440, 1824, 800]) {
    test(`captures the Ptah CLI instance header at ${width}`, async ({ ui, mainWindow: page }) => {
      await ui.mockRpc({ ...staticMocks, ...dynamicMocks });
      await ui.prepare();
      await ui.goto('settings');
      await openSection(page, 'Providers', width);
      const row = page.getByTestId('cli-matrix-row-preview-openrouter');
      await expect(row).toBeVisible();
      const expander = row.getByRole('button', { name: 'Details for OpenRouter team' });
      if (await expander.isVisible()) {
        await expander.click();
      } else {
        await row.getByRole('button', { name: 'More actions for OpenRouter team' }).click();
        await page.getByRole('menuitem', { name: 'Details for OpenRouter team' }).click();
      }
      const detail = page.locator('#lane-detail-preview-openrouter');
      const header = detail.getByTestId('lanes-instance-header');
      await expect(header).toBeVisible();
      await header.scrollIntoViewIfNeeded();
      const readOnlyFields = header.locator(':scope > div');
      await expect(readOnlyFields).toHaveCount(5);
      const readOnlyTops = await readOnlyFields.evaluateAll(
        (fields) => fields.map((field) => field.getBoundingClientRect().top),
      );
      const readOnlySpread = Math.max(...readOnlyTops) - Math.min(...readOnlyTops);
      if (width === 800) expect(readOnlySpread).toBeGreaterThan(rowTolerance);
      else expect(readOnlySpread).toBeLessThanOrEqual(rowTolerance);
      await shot(page, `ptah-cli-instance-header-${width}`);

      await detail.getByTestId('cli-matrix-edit-preview-openrouter').click();
      const dialog = page.getByRole('dialog', { name: 'Edit OpenRouter team' });
      const editHeader = dialog.getByTestId('cli-instance-edit-header');
      const modelEffort = editHeader.getByTestId('cli-instance-edit-model-effort');
      const effortChip = modelEffort.getByRole('button', { name: 'Effort default for OpenRouter team' });
      const controls = [
        editHeader.getByRole('textbox', { name: 'Instance name' }),
        editHeader.getByTestId('add-cli-instance-provider-fixed'),
        modelEffort.getByRole('button', { name: 'Model default for OpenRouter team' }),
        effortChip,
        editHeader.getByTestId('cli-instance-edit-permission'),
        editHeader.getByTestId('cli-instance-edit-network'),
      ];
      for (const control of controls) {
        await expect(control).toBeVisible();
      }
      await shot(page, `ptah-cli-instance-edit-${width}`);
      const [name, provider, model, effort, permission, network] = await Promise.all(
        controls.map((control) => control.evaluate((element) => element.getBoundingClientRect().top)),
      );
      if (width === 800) {
        expect(Math.abs(name - provider)).toBeLessThanOrEqual(rowTolerance);
        expect(Math.abs(model - effort)).toBeLessThanOrEqual(rowTolerance);
        expect(Math.abs(permission - network)).toBeLessThanOrEqual(rowTolerance);
        expect(model - name).toBeGreaterThan(rowTolerance);
        expect(permission - model).toBeGreaterThan(rowTolerance);
      } else {
        const tops = [name, provider, model, effort, permission, network];
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(rowTolerance);
        const modelText = modelEffort.getByTestId('cli-instance-edit-model-text');
        await expect(modelText).toBeVisible();
        const [modelRight, effortLeft] = await Promise.all([
          modelText.evaluate((element) => element.getBoundingClientRect().right),
          effortChip.evaluate((element) => element.getBoundingClientRect().left),
        ]);
        expect(modelRight).toBeLessThanOrEqual(effortLeft);
      }
    });
  }
});

const curatorModels = {
  'claude-cli': { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  openrouter: staticMocks['provider:listModels'].models[0],
  'openai-codex': { id: 'gpt-5.5-codex', name: 'GPT-5.5 Codex' },
  'github-copilot': { id: 'copilot-gpt-4o', name: 'GitHub Copilot GPT-4o' },
};

for (const [id, model] of Object.entries(curatorModels)) {
  test(`captures the Memory curator picker with ${id} saved`, async ({
    ui,
    mainWindow: page,
  }) => {
    const memory = staticMocks['memory:getTriggers'];
    await ui.mockRpc({
      ...staticMocks,
      ...dynamicMocks,
      ...(id === 'claude-cli'
        ? {
            'auth:getAuthStatus': {
              ...staticMocks['auth:getAuthStatus'],
              hasOpenRouterKey: false,
              hasAnyProviderKey: false,
            },
            'auth:getApiKeyStatus': { providers: [] },
          }
        : {}),
      'provider:listModels': {
        ...staticMocks['provider:listModels'],
        models: [{ ...staticMocks['provider:listModels'].models[0], ...model }],
        totalCount: 1,
      },
      'memory:getTriggers': {
        ...memory,
        triggers: {
          ...memory.triggers,
          curatorProvider: id,
          curatorModel: model.id,
        },
      },
    });
    await ui.prepare();
    await ui.goto('settings');
    await openSection(page, 'Providers');
    await page.getByTestId('consumer-edit-memory-curator').click();
    const picker = page.getByTestId('picker-memory-curator');
    const provider = picker
      .getByTestId('provider-model-picker-provider')
      .getByRole('combobox');
    await provider.click();
    await expect(
      page.getByRole('listbox').filter({ visible: true }).last(),
    ).toBeVisible();
    await shot(page, `memory-curator-${id}-provider-open`);
    await provider.click();
    const modelPicker = picker
      .getByTestId('provider-model-picker-model')
      .getByRole('combobox');
    if (await modelPicker.isEnabled()) {
      await modelPicker.click();
      await expect(
        page.getByRole('listbox').filter({ visible: true }).last(),
      ).toBeVisible();
      await shot(page, `memory-curator-${id}-model-open`);
    } else {
      await shot(page, `memory-curator-${id}-model-unavailable`);
    }
  });
}

function dashboardEvidence(): AgentGetRoutingEvidenceResult {
  const now = Date.now();
  const sample = (
    taskKind: AgentRoutingEvidenceKey['taskKind'],
    effort: string,
    score: number,
    approved: number,
    stale = false,
    effortBuckets = 1,
  ): AgentRoutingEvidenceKey => {
    const spawned = approved + 7 * effortBuckets;
    return {
      taskKind,
      effort,
      score,
      sampleCount: spawned - 4 * effortBuckets,
      asOf: new Date(stale ? now - 20 * 86_400_000 : now).toISOString(),
      stale,
      funnel: {
        spawned,
        completed: spawned - effortBuckets,
        delivered: spawned - 4 * effortBuckets,
        reviewed: spawned - 5 * effortBuckets,
        approved,
        capacityDropped: effortBuckets,
        unverified: effortBuckets,
        noDeliverable: effortBuckets,
        failed: effortBuckets,
        rejected: effortBuckets,
        unresolvedRevise: effortBuckets,
        reviseRounds: 3 * effortBuckets,
      },
      effortNotSent: effort === '*' ? 1 : 0,
      durationMs: { total: spawned * 50_000, count: spawned },
      inputTokens: { total: spawned * 10_000, count: spawned },
      outputTokens: { total: spawned * 1_200, count: spawned },
      costUsd: { total: 0, count: 0 },
    };
  };
  const lanes: AgentGetRoutingEvidenceResult['lanes'] = [
    {
      laneId: 'codex',
      family: 'codex',
      catalog: { status: 'ok', fetchedAt: now, lastOkAt: now, modelCount: 1 },
      models: [{
        model: staticMocks['agent:getConfig'].codexModel,
        inCatalog: true,
        efforts: { provenance: 'native', supported: ['medium', 'high'], default: 'medium' },
        keys: [
          sample('implement', '*', 85, 32, false, 2),
          sample('implement', 'high', 87, 21),
          sample('implement', 'medium', 83, 11),
          sample('review', 'high', 75, 7),
          sample('tests', 'medium', 80, 9),
        ],
      }],
    },
    {
      laneId: 'claude',
      family: 'claude',
      catalog: { status: 'ok', fetchedAt: now, lastOkAt: now, modelCount: 1 },
      models: [{
        model: 'claude-sonnet-4-6',
        inCatalog: true,
        efforts: { provenance: 'native', supported: ['medium', 'high'], default: 'high' },
        keys: [
          sample('plan', 'medium', 82, 8),
          sample('implement', 'high', 82, 16),
          sample('review', 'high', 89, 13),
          sample('research', 'medium', 77, 5),
        ],
      }],
    },
    {
      laneId: 'copilot',
      family: 'copilot',
      catalog: { status: 'timeout', fetchedAt: now - 10_800_000, lastOkAt: null, modelCount: 0 },
      models: [{
        model: 'gpt-5.2',
        inCatalog: false,
        efforts: { provenance: 'native', supported: ['medium'], default: 'medium' },
        keys: [
          sample('implement', 'medium', 66, 4, true),
          sample('tests', 'medium', 69, 5),
        ],
      }],
    },
  ];
  const laneFunnels = lanes.map(({ laneId, family, models }) => {
    // Each preview lane has one model. Use rollup keys where effort variants overlap.
    const keys = models.flatMap(({ keys }) => keys.filter((key) =>
      key.effort === '*' || !keys.some((other) => other.taskKind === key.taskKind && other.effort === '*'),
    ));
    const funnel = { ...sample('implement', '*', 0, 0, false, 0).funnel };
    for (const key of keys) {
      for (const field of Object.keys(funnel) as (keyof typeof funnel)[]) {
        funnel[field] += key.funnel[field];
      }
    }
    return { laneId, family, funnel };
  });
  return { windowDays: 30, performanceRouting: true, lanes, laneFunnels, decisionModels: [] };
}

async function setDashboardTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  const html = page.locator('html');
  const themeId = theme === 'dark' ? 'ptah-glass' : 'ptah-glass-light';
  if ((await html.getAttribute('data-theme')) !== themeId) {
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('tab', { name: 'Glass', exact: true }).click();
    await page.getByRole('button', {
      name: theme === 'dark' ? 'Ptah Glass' : 'Ptah Glass Light',
      exact: true,
    }).first().click();
    await page.keyboard.press('Escape');
  }
  await expect(html).toHaveAttribute('data-theme', themeId);
  await expect(html).toHaveAttribute('data-theme-mode', theme);
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [800, 1440, 1824]) {
    test(`captures the decision matrix dashboard at ${width} in ${theme} mode`, async ({
      ui,
      mainWindow: page,
    }) => {
      await ui.mockRpc({
        ...staticMocks,
        ...dynamicMocks,
        'agent:getConfig': {
          ...staticMocks['agent:getConfig'],
          decisionModel: {
            selection: {
              kind: 'structured',
              providerId: 'anthropic',
              model: 'claude-sonnet-4-6',
            },
            locality: 'remote',
            reportsConfidence: false,
            state: 'ready',
            detail: null,
          },
        },
        'agent:getCapabilityMatrix': {
          profiles: [{
            family: 'codex',
            model: staticMocks['agent:getConfig'].codexModel,
            cells: {
              implement: {
                kind: 'value',
                score: 90,
                source: 'local',
                sourceRef: 'design-preview',
                asOf: new Date().toISOString(),
                stale: false,
                sampleCount: 40,
              },
              plan: { kind: 'unknown' },
              review: { kind: 'unknown' },
              research: { kind: 'unknown' },
              tests: { kind: 'unknown' },
              docs: { kind: 'unknown' },
            },
          }],
          lastPicks: [
            { key: 'review|review', candidateId: 'claude' },
            { key: 'implement|implement', candidateId: 'codex' },
          ],
        },
        'agent:getRoutingEvidence': dashboardEvidence(),
      });
      await ui.prepare();
      await ui.goto('settings');
      await setDashboardTheme(page, theme);
      await openSection(page, 'Decision matrix', width);

      const dashboard = page.getByRole('region', { name: 'Decision matrix dashboard', exact: true });
      await expect(page.getByRole('heading', { name: 'Decision matrix', exact: true })).toHaveCount(1);
      await expect(dashboard.getByText('How Ptah picks a lane, model and effort for each task.')).toHaveCount(0);
      const toolbar = dashboard.locator('.dashboard-toolbar');
      const back = toolbar.getByRole('button', { name: 'Context management' });
      const refresh = toolbar.getByRole('button', { name: 'Refresh decision matrix' });
      await expect(toolbar.getByText('Routing model: On')).toBeVisible();
      await expect(toolbar.getByText(/^Updated /)).toBeVisible();
      await expect(back).toBeVisible();
      await expect(refresh).toBeVisible();
      await expect.poll(async () => {
        const backBox = await back.boundingBox();
        const refreshBox = await refresh.boundingBox();
        if (!backBox || !refreshBox || backBox.x + backBox.width > refreshBox.x) return Infinity;
        return Math.abs(backBox.y + backBox.height / 2 - refreshBox.y - refreshBox.height / 2);
      }).toBeLessThanOrEqual(rowTolerance);
      const rings = dashboard.locator('ptah-ring');
      await expect(rings).toHaveCount(4);
      for (const ring of await rings.all()) await expect(ring).toBeVisible();
      for (const name of ['Run pipeline', 'Outcome mix by lane', 'Who does the work']) {
        await expect(dashboard.getByRole('heading', { name, exact: true })).toBeVisible();
      }
      await expect(dashboard.locator('ptah-stacked-bar').first()).toBeVisible();
      await expect(dashboard.locator('ptah-donut')).toBeVisible();
      const controls = dashboard.getByRole('region', { name: 'Routing controls' });
      await expect(controls.getByRole('switch')).toHaveCount(3);
      for (const toggle of await controls.getByRole('switch').all()) {
        await expect.poll(() => toggle.evaluate((element) => {
          const row = element.closest('[data-testid="setting-row"]');
          const text = row?.firstElementChild?.getBoundingClientRect();
          const control = element.getBoundingClientRect();
          if (!row || !text || control.left < text.right) return Infinity;
          return Math.max(
            Math.abs(control.right - row.getBoundingClientRect().right),
            Math.abs(control.top + control.height / 2 - text.top - text.height / 2),
          );
        })).toBeLessThanOrEqual(rowTolerance);
      }

      if (width >= 1440) {
        const picks = dashboard.getByRole('region', { name: 'Current pick per task kind' });
        const scores = picks.locator('.pick-meter');
        await expect(scores).toHaveCount(5);
        for (const score of await scores.all()) {
          await expect.poll(() => score.evaluate((element) => {
            const pick = element.previousElementSibling?.getBoundingClientRect();
            const meter = element.getBoundingClientRect();
            if (!pick || meter.left < pick.right) return Infinity;
            return Math.abs(meter.top + meter.height / 2 - pick.top - pick.height / 2);
          })).toBeLessThanOrEqual(rowTolerance);
        }
      }

      const expectNoHorizontalOverflow = () =>
        expect.poll(() => dashboard.evaluate((element) => {
          const root = element.ownerDocument.documentElement;
          return Math.max(
            root.scrollWidth - root.clientWidth,
            element.scrollWidth - element.clientWidth,
          );
        })).toBeLessThanOrEqual(rowTolerance);

      await expectNoHorizontalOverflow();
      const suffix = theme === 'light' ? '-light' : '';
      await shot(page, `decision-matrix-dashboard-${width}${suffix}`);

      if (width === 1440) {
        const cell = dashboard.locator('table').getByRole('button', {
          name: /(?=.*codex)(?=.*gpt-5\.5-codex)(?=.*implement)/i,
        });
        await cell.click();
        await expect(cell).toHaveAttribute('aria-pressed', 'true');
        await expect(dashboard.getByRole('heading', { name: 'Effort split' })).toBeVisible();
        await expectNoHorizontalOverflow();
        await cell.scrollIntoViewIfNeeded();
        await shot(page, `decision-matrix-dashboard-detail${suffix}`);
      }
    });
  }
}
