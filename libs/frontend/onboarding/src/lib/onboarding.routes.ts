import { inject } from '@angular/core';
import { Router, type RedirectFunction, type Routes } from '@angular/router';
import { AnalyzeWorkspacePage } from './analyze/analyze-workspace.page';
import { ChooseAgentsPage } from './analyze/choose-agents.page';
import { GenerateAgentsPage } from './analyze/generate-agents.page';
import { ProjectGuidancePage } from './analyze/project-guidance.page';
import { AnalyzeDonePage } from './analyze/analyze-done.page';
import { OnboardingHomeComponent } from './home/onboarding-home.component';
import { onboardingReadyHostGuard } from './ready/onboarding-ready-host.guard';
import { ReadyConnectionStepPage } from './ready/ready-connection-step.page';
import {
  READY_SETTINGS_PROVIDERS,
  ReadySettingsStepPage,
} from './ready/ready-settings-step.page';
import { OnboardingShellComponent } from './shell/onboarding-shell.component';
import { NewProjectIntakePage } from './proposal/new-project-intake.page';
import { TeamBuilderStartPage } from './proposal/team-builder-start.page';

/**
 * Unknown sub-paths (including removed `/workspace` and `/review` proposal
 * routes) redirect to bare `/onboarding`, dropping any stale query string or
 * fragment so old bookmarks and restored URLs land on a clean Home URL.
 */
const onboardingHomeRedirect: RedirectFunction = () =>
  inject(Router).createUrlTree(['/onboarding']);

/**
 * The onboarding surface's route tree, loaded by the webview's `onboarding`
 * route through `loadChildren`. Every page renders inside the shell and ships
 * in this one lazy chunk.
 *
 * Flow routes are added before the `**` fallback, which keeps it last.
 */
export const ONBOARDING_ROUTES: Routes = [
  {
    path: '',
    component: OnboardingShellComponent,
    children: [
      { path: '', pathMatch: 'full', component: OnboardingHomeComponent },
      {
        // Get ready pre-steps (Electron only; elsewhere they land on Home).
        path: 'ready',
        canMatch: [onboardingReadyHostGuard],
        data: { crumb: 'Get ready' },
        children: [
          { path: '', pathMatch: 'full', component: ReadyConnectionStepPage },
          {
            path: 'settings',
            component: ReadySettingsStepPage,
            providers: READY_SETTINGS_PROVIDERS,
          },
        ],
      },
      {
        path: 'analyze',
        component: AnalyzeWorkspacePage,
        data: { crumb: 'Analyze workspace' },
      },
      {
        path: 'analyze/agents',
        component: ChooseAgentsPage,
        data: { crumb: 'Choose agents' },
      },
      {
        path: 'analyze/generate',
        component: GenerateAgentsPage,
        data: { crumb: 'Generate agents' },
      },
      {
        path: 'analyze/guidance',
        component: ProjectGuidancePage,
        data: { crumb: 'Project guidance' },
      },
      {
        path: 'analyze/done',
        component: AnalyzeDonePage,
        data: { crumb: 'Done' },
      },
      {
        path: 'guidance',
        component: ProjectGuidancePage,
        data: { crumb: 'Project guidance', standalone: true },
      },
      {
        path: 'new-project',
        component: NewProjectIntakePage,
        data: { crumb: 'New project' },
      },
      {
        path: 'team-builder',
        component: TeamBuilderStartPage,
        data: { crumb: 'AI team builder' },
      },
      { path: '**', redirectTo: onboardingHomeRedirect },
    ],
  },
];
