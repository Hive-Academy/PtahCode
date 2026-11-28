import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { AgentGetRoutingEvidenceResult } from '@ptah-extension/shared';
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

for (const width of [1280, 1440, 1824, 800]) {
  test('captures the Ptah CLI instance header at ' + width, async ({ ui, mainWindow: page }) => {
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
    const header = page.getByTestId('lanes-instance-header');
    await expect(header).toBeVisible();
    await header.scrollIntoViewIfNeeded();
    await shot(page, 'ptah-cli-instance-header-' + width);
    const tops = await header.locator(':scope > div').evaluateAll(
      (fields) => fields.map((field) => Math.round(field.getBoundingClientRect().top)),
    );
    if (width === 800) expect(new Set(tops).size).toBeGreaterThan(1);
    else expect(new Set(tops).size).toBe(1);
    const heights = await header.locator('dd, dd button').evaluateAll(
      (values) => values.map((value) => value.getBoundingClientRect().height),
    );
    expect(new Set(heights).size).toBe(1);
    if (width === 1824) {
      await page.getByTestId('cli-matrix-edit-preview-openrouter').click();
      await expect(page.getByRole('dialog', { name: 'Edit OpenRouter team' })).toBeVisible();
      await shot(page, 'ptah-cli-instance-edit-1824');
    }
  });
}

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

test('captures the routing evidence summary', async ({
  ui,
  mainWindow: page,
}) => {
  const funnel = {
    spawned: 12,
    completed: 11,
    delivered: 10,
    reviewed: 9,
    approved: 8,
    capacityDropped: 0,
    unverified: 1,
    noDeliverable: 1,
    failed: 0,
    rejected: 0,
    unresolvedRevise: 1,
    reviseRounds: 3,
  };
  const emptyFunnel = {
    spawned: 0,
    completed: 0,
    delivered: 0,
    reviewed: 0,
    approved: 0,
    capacityDropped: 0,
    unverified: 0,
    noDeliverable: 0,
    failed: 0,
    rejected: 0,
    unresolvedRevise: 0,
    reviseRounds: 0,
  };
  const evidence: AgentGetRoutingEvidenceResult = {
    windowDays: 30,
    performanceRouting: true,
    lanes: [
      {
        laneId: 'codex',
        family: 'codex',
        catalog: {
          status: 'ok',
          fetchedAt: Date.now(),
          lastOkAt: Date.now(),
          modelCount: 1,
        },
        models: [
          {
            model: staticMocks['agent:getConfig'].codexModel,
            inCatalog: true,
            efforts: {
              provenance: 'native',
              supported: ['medium', 'high'],
              default: 'medium',
            },
            keys: [
              {
                taskKind: 'implement',
                effort: 'high',
                funnel,
                effortNotSent: 0,
                durationMs: { total: 500_000, count: 10 },
                inputTokens: { total: 100_000, count: 10 },
                outputTokens: { total: 12_000, count: 10 },
                costUsd: { total: 0, count: 0 },
                score: 74,
                sampleCount: 10,
                asOf: new Date().toISOString(),
                stale: false,
              },
              {
                taskKind: 'implement',
                effort: 'medium',
                funnel: emptyFunnel,
                effortNotSent: 0,
                durationMs: { total: 0, count: 0 },
                inputTokens: { total: 0, count: 0 },
                outputTokens: { total: 0, count: 0 },
                costUsd: { total: 0, count: 0 },
                score: null,
                sampleCount: 0,
                asOf: null,
                stale: false,
              },
            ],
          },
        ],
      },
    ],
    decisionModels: [
      {
        decisionModel: 'structured:anthropic/claude-sonnet-4-6',
        proposals: 10,
        accepted: 7,
        meanConfidence: 0.8,
        funnel,
      },
    ],
  };
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
      profiles: [],
      lastPicks: [],
      lastPicksUnavailable: false,
    },
    'agent:getRoutingEvidence': evidence,
  });
  await ui.prepare();
  await ui.goto('settings');
  await openSection(page, 'Decision matrix');
  await expect(page.getByText('No recent picks yet')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Routing suggestions' })).toBeChecked();
  const summary = page.getByText('Outcomes from the last 30 days', {
    exact: false,
  });
  await expect(summary).toBeVisible();
  await summary.scrollIntoViewIfNeeded();
  await shot(page, 'routing-evidence-summary');
});
