/**
 * Onboarding Library - lazy entry point (TASK_2026_ONBOARDING).
 *
 * Reached only through the webview's `loadChildren`:
 *
 *   import('@ptah-extension/onboarding').then((m) => m.ONBOARDING_ROUTES);
 *
 * Eager code (the app's routes and config) imports the narrow
 * `@ptah-extension/onboarding/services` entry instead.
 */
export { ONBOARDING_ROUTES } from './lib/onboarding.routes';
export {
  HarnessChatLauncherService,
  type HarnessChatLaunchResult,
  type LauncherAttachmentSnapshot,
} from './lib/launcher/harness-chat-launcher.service';
export {
  EMPTY_NEW_PROJECT_INTAKE,
  NEW_PROJECT_AUDIENCE_OPTIONS,
  NEW_PROJECT_PLATFORM_OPTIONS,
  formatIntakeSummary,
  isNewProjectIntake,
  isNewProjectIntakeValid,
  platformLabel,
} from './lib/proposal/new-project-intake.model';
