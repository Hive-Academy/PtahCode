import { test, expect } from '../../support/fixtures';
import type { UiDriver } from '../../support/ui-driver';

/**
 * R4 gate (TASK_2026_187 Batch 4) — sibling to
 * `specs/thoth/message-handlers-eager.spec.ts` (Batch 3), same pattern,
 * for the `TasksStore` `MESSAGE_HANDLERS` path (reached through the eager
 * `TasksChangedFeed` since TASK_2026_871). It must stay constructed and
 * receiving at bootstrap now that `TasksViewComponent` is behind a lazy
 * `loadComponent` route instead of a static import (TASK_2026_524 batch 1;
 * previously behind `LazyViewService.resolveWhen` loaders).
 *
 * `apps/ptah-extension-webview/src/app/unit5-message-routing.spec.ts`
 * (Jest, developer's own artifact — batch-4-report.md §8) proves this at the
 * `MessageRouterService` unit level. This file proves the same property
 * against the real Electron renderer, with the tasks board never having been
 * opened for the negative gate check.
 *
 * `TasksStore` used to be proved by pushing with nothing mounted and
 * watching a `tasks:board` RPC fire. It no longer can be, and the reason is a
 * deliberate product change rather than a regression: `TasksStore` is now
 * SURFACE-GATED (tasks-ui guideline 9). A push that arrives with no Tasks
 * surface mounted is dropped on purpose, because a full `.ptah/specs` scan
 * to repaint a board nobody is looking at is pure waste and the surface
 * re-fetches on mount anyway. So the two tests below split that proof in
 * half: the gate itself, and the registration behind it.
 *
 * The registration half survives the board being open, because opening the
 * board cannot supply the registration. `MESSAGE_HANDLERS` is a root
 * multi-provider read once by `MessageRouterService`'s constructor at
 * bootstrap, and the lazy chunk cannot add one to an injector that is already
 * built. Since TASK_2026_871 the registered handler is the eager
 * `TasksChangedFeed` (`@ptah-extension/tasks-ui/presentation`), not
 * `TasksStore`: the store lives in the lazy board chunk and subscribes to the
 * feed's raw relay when it is constructed, which keeps it out of the initial
 * bundle. If `app.config.ts` dropped the feed, no amount of opening the board
 * would route a `tasks:changed` push to the store.
 */

/** How many `tasks:board` round trips the renderer has made so far. */
async function boardCallCount(ui: UiDriver): Promise<number> {
  return (await ui.getObservedCalls('tasks:board')).length;
}

test.describe('Tasks MESSAGE_HANDLERS — eager while unopened (R4, TASK_2026_187)', () => {
  test('TasksStore: a tasks:changed push buys no board scan while the board has never been opened', async ({
    ui,
  }) => {
    // No ui.goto('tasks') anywhere in this test — 'chat' is the default view
    // for the whole test; TasksViewComponent is never created, so nothing
    // could render a board this push refreshed.
    const before = await boardCallCount(ui);

    await ui.pushEvent({ type: 'tasks:changed', payload: {} });

    // A negative held over a window rather than checked once: the dropped
    // path is synchronous, so a scan that was going to happen would already
    // be on the wire well inside this.
    await ui.page.waitForTimeout(1_500);
    expect(await boardCallCount(ui)).toBe(before);
  });

  test('TasksStore: tasks:changed refreshes the open board, through a registration the lazy chunk never supplies', async ({
    ui,
  }) => {
    await ui.goto('tasks');
    await expect(ui.page.locator('ptah-tasks-view')).toBeVisible();

    // The surface's own mount fetch. Waited out first so the assertion below
    // is about the PUSH and not about this.
    await ui.waitForObservedCall('tasks:board');
    const afterMount = await boardCallCount(ui);

    await ui.pushEvent({
      type: 'tasks:changed',
      // No workspaceRoot — takes the unconditional "refresh active,
      // best-effort" branch of `handleMessage`, asserting message delivery
      // itself rather than incidentally asserting workspace-matching logic.
      payload: {},
    });

    // handleMessage -> refreshActiveFromPush() -> a second, distinct
    // `tasks:board` round trip. Only the bootstrap `MESSAGE_HANDLERS`
    // registration can produce it — see the header.
    await expect
      .poll(() => boardCallCount(ui), { timeout: 10_000 })
      .toBeGreaterThan(afterMount);
  });
});
