/**
 * B3b Electron visual gate for project guidance and Done.
 * Mirrors B3a's four themes, 1280/464 px viewports, screenshot and axe capture.
 * Run after the coordinator builds the webview with grep: onboarding-generate-visual.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../../test-fixtures';
import type { PostMessageBridge } from '../../postmessage-bridge';
import {
  ONBOARDING_ANALYZE_CAPTURE_DIR,
  captureOnboarding,
  type OnboardingCaptureOptions,
} from './onboarding-ready-capture';
import {
  ONBOARDING_CAPTURE_THEMES,
  type OnboardingTheme,
} from './onboarding-ready.fixtures';
import {
  AGENT_TAB,
  GUIDANCE_BINDING,
  GUIDANCE_CONTENT,
  GUIDANCE_RUN_ID,
  GUIDANCE_STATUS,
  GUIDANCE_TAB,
  doneAgentRun,
  bootOnboardingGenerate,
  guidanceRun,
  rpcError,
} from './onboarding-generate.fixtures';

test.use({ useAppBuild: true });

const WIDE = { width: 1280, height: 800 } as const;
const NARROW = { width: 464, height: 800 } as const;
type Size = typeof WIDE | typeof NARROW;
const SIZES: readonly { viewport: Size; prefix: string }[] = [
  { viewport: WIDE, prefix: '' },
  { viewport: NARROW, prefix: 'narrow-' },
];
const CAPTURE_DIR = resolve(ONBOARDING_ANALYZE_CAPTURE_DIR, '../generate');
const GUIDANCE = '[data-testid="project-guidance-page"]';
const DONE = '[data-testid="analyze-done-page"]';
const GUIDANCE_ROUTE = `/onboarding/analyze/guidance?tab=${GUIDANCE_TAB}&run=${GUIDANCE_RUN_ID}`;
const GUIDANCE_IDLE_ROUTE = `/onboarding/guidance?tab=${GUIDANCE_TAB}`;
const DONE_ROUTE = `/onboarding/analyze/done?gen=${AGENT_TAB}&tab=${GUIDANCE_TAB}`;

async function shoot(
  page: Page,
  options: OnboardingCaptureOptions,
): Promise<void> {
  const result = await captureOnboarding(page, {
    ...options,
    outputDir: CAPTURE_DIR,
    busyExempt: `${GUIDANCE}, [data-testid="details-log"]`,
  });
  test.info().annotations.push({
    type: 'axe',
    description: `${options.view} ${options.theme}: ${result.violations} violation(s) → ${result.axePath}`,
  });
}

async function boot(
  page: Page,
  url: string,
  theme: OnboardingTheme,
  viewport: Size,
  route: string,
  rpc: Record<string, unknown> = {},
): Promise<PostMessageBridge> {
  await page.setViewportSize(viewport);
  return bootOnboardingGenerate(page, url, { theme, route, rpc });
}

async function expectState(
  page: Page,
  area: 'generate' | 'guidance',
  state: string,
): Promise<void> {
  await expect(
    page.locator(`[data-testid="${area}-state-chip"]`),
  ).toHaveAttribute('data-state', state);
}

for (const theme of ONBOARDING_CAPTURE_THEMES) {
  test.describe(`onboarding-generate-visual (${theme})`, () => {
    for (const size of SIZES) {
      test(`${size.prefix}guidance-idle`, async ({ page, fixtureServer }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          GUIDANCE_IDLE_ROUTE,
        );
        await expect(page.locator(GUIDANCE)).toBeVisible();
        await expectState(page, 'guidance', 'idle');
        await expect(
          page.locator('[data-testid="guidance-start"]'),
        ).toBeVisible();
        await shoot(page, { view: `${size.prefix}guidance-idle`, theme });
      });

      test(`${size.prefix}guidance-running`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          GUIDANCE_ROUTE,
          {
            'enhancedPrompts:getRunState': { run: guidanceRun('running') },
            'enhancedPrompts:getStatus': GUIDANCE_STATUS,
          },
        );
        await expect(page.locator(GUIDANCE)).toBeVisible();
        await expectState(page, 'guidance', 'running');
        await expect(
          page.locator('[data-testid="guidance-detected-stack"]'),
        ).toContainText('NestJS API');
        await shoot(page, { view: `${size.prefix}guidance-running`, theme });
      });

      test(`${size.prefix}guidance-completed`, async ({
        page,
        fixtureServer,
      }) => {
        let completed = false;
        const bridge = await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          GUIDANCE_ROUTE,
          {
            'enhancedPrompts:getRunState': () => ({
              run: guidanceRun(completed ? 'completed' : 'running'),
            }),
            'enhancedPrompts:getStatus': GUIDANCE_STATUS,
            'enhancedPrompts:getPromptContent': { content: GUIDANCE_CONTENT },
          },
        );
        await expect(page.locator(GUIDANCE)).toBeVisible();
        await expectState(page, 'guidance', 'running');
        completed = true;
        await bridge.inject({
          type: 'setup-wizard:generation-complete',
          payload: {
            tabBinding: GUIDANCE_BINDING,
            terminalStatus: 'completed',
          },
        });
        await expectState(page, 'guidance', 'completed');
        await expect(
          page.locator('[data-testid="guidance-summary-card"]'),
        ).toBeVisible();
        await expect(
          page.locator('[data-testid="guidance-summary-row"]'),
        ).toHaveCount(4);
        await shoot(page, { view: `${size.prefix}guidance-completed`, theme });
        await page.screenshot({
          path: resolve(
            CAPTURE_DIR,
            `${size.prefix}guidance-completed-${theme}-${size.viewport.width}x${size.viewport.height}.png`,
          ),
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`${size.prefix}guidance-lookup-error`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          GUIDANCE_IDLE_ROUTE,
          {
            'enhancedPrompts:getRunState': () =>
              rpcError('Guidance state unavailable'),
          },
        );
        await expect(page.locator(GUIDANCE)).toBeVisible();
        await expect(
          page.locator('[data-testid="guidance-lookup-error"]'),
        ).toBeVisible();
        await expect(
          page
            .locator('[data-testid="guidance-lookup-error"]')
            .getByRole('button', { name: 'Retry' }),
        ).toBeVisible();
        await shoot(page, {
          view: `${size.prefix}guidance-lookup-error`,
          theme,
        });
      });

      test(`${size.prefix}guidance-owner-conflict`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          GUIDANCE_IDLE_ROUTE,
          {
            'enhancedPrompts:runWizard': {
              success: false,
              rejection: {
                reason: 'blocked',
                ownerTabId: 'other-guidance-tab',
              },
            },
          },
        );
        await expect(page.locator(GUIDANCE)).toBeVisible();
        await expect(
          page.locator('[data-testid="guidance-start"]'),
        ).toBeVisible();
        await page.locator('[data-testid="guidance-start"]').click();
        await expect(
          page.locator('[data-testid="guidance-owner-conflict"]'),
        ).toBeVisible();
        await shoot(page, {
          view: `${size.prefix}guidance-owner-conflict`,
          theme,
        });
      });

      test(`${size.prefix}done-facts`, async ({ page, fixtureServer }) => {
        await boot(page, fixtureServer.url, theme, size.viewport, DONE_ROUTE, {
          'wizard:get-generation-run-state': { run: doneAgentRun() },
          'enhancedPrompts:getRunState': { run: guidanceRun('completed') },
          'enhancedPrompts:getStatus': GUIDANCE_STATUS,
        });
        await expect(page.locator(DONE)).toBeVisible();
        await expect(
          page.locator('[data-testid="analyze-done-facts"]'),
        ).toContainText(/Written\s*1/);
        await expect(
          page.locator('[data-testid="analyze-done-facts"]'),
        ).toContainText('Project guidance: on');
        await expect(
          page.locator('[data-testid="done-agent-outcomes"]'),
        ).toContainText('Kept (your file)');
        // An opened-folder target outside the harness root never reaches the
        // Library, so its stale notice stays hidden.
        await expect(page.locator(DONE)).toContainText(
          'will not appear in the Library',
        );
        await expect(
          page.locator('[data-testid="library-stale-notice"]'),
        ).toHaveCount(0);
        await expect(
          page.locator('[data-testid="outcome-failure"]'),
        ).not.toContainText('EACCES');
        await expect(
          page.locator('[data-testid="done-agent-outcomes"]'),
        ).toContainText('Changed since preview (kept)');
        for (const id of [
          'done-open-chat',
          'done-command-center',
          'done-tribunal',
          'done-run-again',
        ]) {
          await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
        }
        await page
          .locator('[data-testid="done-agent-outcomes"]')
          .scrollIntoViewIfNeeded();
        await shoot(page, { view: `${size.prefix}done-facts`, theme });
      });
    }
  });
}
