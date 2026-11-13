/**
 * Electron onboarding launcher captures and chat-handoff verification.
 * Each launcher state is captured in four themes at 1280 and 464 px, and
 * submitting either form transitions out of onboarding into chat.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../../test-fixtures';
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
  TAB,
  bootOnboardingProposal,
  type ProposalScene,
} from './onboarding-proposal.fixtures';

test.use({ useAppBuild: true });

const WIDE = { width: 1280, height: 800 } as const;
const NARROW = { width: 464, height: 800 } as const;
type Size = typeof WIDE | typeof NARROW;
const SIZES: readonly { viewport: Size; prefix: string }[] = [
  { viewport: WIDE, prefix: '' },
  { viewport: NARROW, prefix: 'narrow-' },
];
const CAPTURE_DIR = resolve(ONBOARDING_ANALYZE_CAPTURE_DIR, '../proposal');
const INTAKE_ROUTE = '/onboarding/new-project';
const TEAM_ROUTE = '/onboarding/team-builder';
const LEGACY_WORKSPACE_ROUTE = `/onboarding/new-project/workspace?tab=${TAB}`;

async function shoot(
  page: Page,
  options: OnboardingCaptureOptions,
): Promise<void> {
  const result = await captureOnboarding(page, {
    ...options,
    outputDir: CAPTURE_DIR,
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
  scene: ProposalScene,
): Promise<void> {
  await page.setViewportSize(viewport);
  await bootOnboardingProposal(page, url, { theme, route, scene });
}

for (const theme of ONBOARDING_CAPTURE_THEMES) {
  test.describe(`onboarding-proposal-visual (${theme})`, () => {
    for (const size of SIZES) {
      test(`${size.prefix}new-project-intake`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          INTAKE_ROUTE,
          'empty',
        );
        await expect(page.getByTestId('new-project-intake')).toBeVisible();
        await expect(
          page.getByRole('textbox', { name: 'What are you building?' }),
        ).toBeVisible();
        await expect(page.locator('[aria-label="Progress"]')).toHaveCount(0);
        await shoot(page, { view: `${size.prefix}new-project-intake`, theme });
      });

      test(`${size.prefix}new-project-intake-errors`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          INTAKE_ROUTE,
          'empty',
        );
        await page
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
        await expect(
          page.getByRole('alert').filter({ hasText: 'Check your answers:' }),
        ).toBeVisible();
        await expect(page.locator('#project-what-error')).toBeVisible();
        await shoot(page, {
          view: `${size.prefix}new-project-intake-errors`,
          theme,
        });
      });

      test(`${size.prefix}team-builder-start`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          TEAM_ROUTE,
          'empty',
        );
        await expect(page.getByTestId('team-builder-start')).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Review skills' }),
        ).toBeVisible();
        await expect(page.locator('[aria-label="Progress"]')).toHaveCount(0);
        await shoot(page, { view: `${size.prefix}team-builder-start`, theme });
      });

      test(`${size.prefix}team-builder-skill-review`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          TEAM_ROUTE,
          'empty',
        );
        await page
          .getByRole('textbox', { name: 'What should the team do?' })
          .fill('Create a backend TypeScript review and release team.');
        await page.getByRole('button', { name: 'Review skills' }).click();
        await expect(
          page.getByRole('heading', { name: 'Skills and project guidance' }),
        ).toBeVisible();
        await expect(
          page.getByRole('checkbox', { name: 'Select TypeScript review' }),
        ).toBeVisible();
        await expect(
          page.getByRole('checkbox', { name: 'Select Release checks' }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Project guidance', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Skip skills' }),
        ).toBeEnabled();
        await shoot(page, {
          view: `${size.prefix}team-builder-skill-review`,
          theme,
        });
      });

      test(`${size.prefix}new-project-launches-chat`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          INTAKE_ROUTE,
          'empty',
        );
        await page
          .getByRole('textbox', { name: 'What are you building?' })
          .fill('Build an internal incident response workspace.');
        await page
          .getByRole('button', { name: 'Continue', exact: true })
          .click();

        await expect(page.getByTestId('onboarding-shell')).toHaveCount(0);
        await expect(
          page.getByText('Build an internal incident response workspace.'),
        ).toBeVisible();
      });

      test(`${size.prefix}team-builder-launches-chat`, async ({
        page,
        fixtureServer,
      }) => {
        await boot(
          page,
          fixtureServer.url,
          theme,
          size.viewport,
          TEAM_ROUTE,
          'empty',
        );
        await page
          .getByRole('textbox', { name: 'What should the team do?' })
          .fill('Create a backend TypeScript review and release team.');
        await page.getByRole('button', { name: 'Review skills' }).click();
        await expect(
          page.getByRole('heading', { name: 'Skills and project guidance' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Skip skills' }).click();

        await expect(page.getByTestId('onboarding-shell')).toHaveCount(0);
        await expect(
          page.getByText(
            /^Create a backend TypeScript review and release team\./,
          ),
        ).toBeVisible();
      });
    }

    test('legacy-workspace-route-redirects-home', async ({
      page,
      fixtureServer,
    }) => {
      await boot(
        page,
        fixtureServer.url,
        theme,
        WIDE,
        LEGACY_WORKSPACE_ROUTE,
        'empty',
      );
      await expect(page.getByTestId('onboarding-home')).toBeVisible();
    });
  });
}
