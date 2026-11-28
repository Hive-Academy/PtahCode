/**
 * The Setup entry port (TASK_2026_2330).
 *
 * Code that must not import `setup-wizard` (the chat shell, chat-ui launchers,
 * host open messages) opens Setup on the right run and reads its badge counts
 * through this token. `setup-wizard` provides the implementation; `core` only
 * declares the contract, so the library direction stays core <- setup-wizard
 * and core <- chat / chat-ui.
 *
 * The token is optional by design: a host that does not install it (the VS
 * Code webview, a unit test) falls back to the bare `/onboarding` surface.
 */

import { InjectionToken, type Signal } from '@angular/core';
import type { SetupGenerationWorkflow } from '@ptah-extension/shared';
import type { SurfaceNavigationResult } from './surface-router.service';

/** Opens Setup on a run and exposes the counts a navigation badge shows. */
export interface SetupRunEntry {
  /** Runs that need input, plus terminal runs the user has not opened yet. */
  readonly attentionCount: Signal<number>;
  /** Runs that are still running. */
  readonly runningCount: Signal<number>;
  /** Opens the active run's current step, or the Setup home when none is active. */
  openSetup(): Promise<SurfaceNavigationResult>;
  /**
   * Opens the run of `workflow`: attaches to an existing non-terminal run, or
   * opens its entry step when available. Agent generation currently supports
   * existing run re-entry only.
   *
   * `origin` names the caller that asked (for example a chat-side launcher).
   */
  openWorkflow(
    workflow: SetupGenerationWorkflow,
    origin: string,
  ): Promise<SurfaceNavigationResult>;
}

export const SETUP_RUN_ENTRY = new InjectionToken<SetupRunEntry>(
  'SETUP_RUN_ENTRY',
);
