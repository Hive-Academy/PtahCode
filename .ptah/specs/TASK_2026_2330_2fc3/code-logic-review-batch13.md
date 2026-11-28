# Batch 13 code-logic review — TASK_2026_2330_2fc3

Review family: codex (implementer: ollama-cloud)

## Correction review 2

Review family: codex (correction author: claude)

**Score: 9/10 · Verdict: APPROVED.** The round-trip defect is fixed. No new implementation defect was found in the reviewed paths.

### Round-trip defect status

**Fixed.** The shell captures the last successful Angular navigation ID and compares it after a failed or rejected port call (`electron-shell.component.ts:903`, `:917–924`). The ID changes when a later navigation succeeds, even when the final URL and view equal the initial values. The existing shell-intent, in-flight navigation, and view checks still apply. The real-Router test at `electron-shell.setup-badge.spec.ts:436–459` goes from Settings to Machines and back without calling a shell handler. Under the previous URL guard the idle Router, URL, view stub and shell counter all match the initial state, so the late failure would land on `/onboarding` and fail the final assertion.

### Current failures and host fallback

- The concrete port reads the active record and issues one surface navigation, either to the run target or to Home (`setup-run-entry.service.ts:24–28`, `:51–55`). It cannot successfully navigate to an intermediate route and then independently report `failed`. A redirect inside that single Router request shares the request outcome. If a future port implementation commits an intermediate navigation and then fails, the shell will preserve the committed route because its ID advanced.
- The surface router builds one URL and awaits one `navigateByUrl`. A successful navigation returns `navigated`; a false result becomes `already-there` or `cancelled`; a URL construction or Router error becomes `failed` (`surface-router.service.ts:169–177`, `:305–337`). The installed Angular Router updates the last successful ID on its success path before emitting `NavigationEnd` and clears current navigation when the transition finalizes (`node_modules/@angular/router/fesm2022/_router-chunk.mjs:4043`, `:4062`). A normal failure or cancellation before route completion therefore leaves the successful ID unchanged. The shell returns immediately on `cancelled`. With no newer navigation, an ordinary current failure still reaches the guarded Home fallback. The failed-child test asserts the final URL is `/onboarding` (`electron-shell.setup-badge.spec.ts:478–494`). It supplies a synthetic `failed` from the port. The Router error lifecycle was checked in source, using `rg` after Ptah could not read the symlinked package outside the workspace.
- The token-absent shell returns through synchronous `setCurrentView('onboarding')` before reading any navigation state (`electron-shell.component.ts:899–904`, `electron-shell.setup-badge.spec.ts:401`). VS Code still mounts the shared app shell and its generation store's typed onboarding fallback is outside the change (`app.html:54–58`, `setup-status.store.ts:309–319`).

### Verification

All 76 tests passed across nine focused Electron shell suites, and the chat library TypeScript check passed. Logs are `.ptah/tmp/b13-corr2-review-jest.log` and `.ptah/tmp/b13-corr2-review-tsc.log`. The scoped tracked diff passed `git diff --check`. No source was edited and no host was launched. The remaining coverage limit is that the child-page test exercises the fallback with a simulated port failure, while the real navigation failure ordering was traced in the installed Router.

### Five logic questions

1. **Silent failure.** A round trip can no longer hide newer successful Router activity from the fallback guard.
2. **Unexpected action.** Returning to the initial route through the global navbar preserves that destination after a stale Setup failure.
3. **Wrong input result.** Equal URL and view values are no longer enough to give a stale request authority.
4. **Dependency failure.** Genuine current failure still reaches Home, and cancellation exits without issuing another request.
5. **Unspecified behaviour.** An alternate entry port that performs and commits multiple separate navigations would need an ownership contract for its intermediate commits. The current entry has no such path.

## Correction review

Review family: codex (correction author: claude)

**Score: 8/10 · Verdict: REVISE.** The correction fixes the reported single-navigation bypass. A later navigation that returns to the original URL and view can still be overwritten by a stale Setup fallback. One Minor defect remains.

### Round 2 defect status

**Partially fixed.** The shell skips the fallback when the shell intent changes, another router navigation is active at failure settlement, the URL differs, or the view differs (`electron-shell.component.ts:896–922`). The new Settings test bypasses the shell and changes the real URL. The host-view test changes only the app-state stub, isolating the view guard (`electron-shell.setup-badge.spec.ts:410`, `:436`). Removing the respective guard would make each test fail against the pre-correction path. The host test does not dispatch a real host message. Both tests leave a different destination in place through failure settlement.

### Defects

1. **Minor — Returning to the original URL restores a stale Setup request's authority.** `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:903–922`. Start on Settings with a workspace open, click Setup and leave its port pending, then visit Marketplace and return to Settings through the global navbar. Those controls use app state directly (`global-config-actions.component.ts:85–95`). Once Settings settles again, the Router is idle and the URL, view, and shell counter all match their click-time values. Rejecting the old Setup call or resolving it as `failed` then sends the user to Setup Home despite the later Settings click. **Fix:** also capture and compare the Angular Router's last successful navigation ID, `router.lastSuccessfulNavigation()?.id`, across the await. A failed Setup route does not advance that ID. Add a route-backed test that navigates away and back without a shell handler and asserts that the late failure leaves the last destination in place.

### Current failures and host fallback

- The concrete entry computes the active run target and returns the surface router's promise (`setup-run-entry.service.ts:24–28`, `:51–55`). A target lookup or URL construction failure happens before a route commits. Ordinary Router errors reject `navigateByUrl` and become `failed` (`surface-router.service.ts:169–177`, `:320–337`). The app's surface signal follows `NavigationEnd` (`surface-router.service.ts:88–99`). I checked the installed Angular Router's error path as well. It restores the prior URL and finalizes the failed transition, clearing current navigation before the awaiting continuation runs. For a current failure with no competing navigation, the correction therefore permits the guarded Home fallback. The source check used `rg` after Ptah could not read the external symlinked dependency.
- The child-page spec returns a synthetic `failed` from the port, then uses real Angular routing and confirms the final URL is `/onboarding` (`electron-shell.setup-badge.spec.ts:452–468`). The failure lifecycle of the real Setup entry and Router was checked in source.
- The token-absent branch returns through synchronous `setCurrentView('onboarding')` before the new checks (`electron-shell.component.ts:899–904`). The corresponding shell test passed (`electron-shell.setup-badge.spec.ts:401`). VS Code still mounts `ptah-app-shell` (`app.html:54–58`) and the shared store still sends token-absent generation to bare onboarding via the typed surface router (`setup-status.store.ts:309–319`).
- Independently ran all nine focused Electron shell suites. All 75 tests passed. The log is `.ptah/tmp/b13-corr-review-jest-chat.log`. Scoped `git diff --check` passed. Scoped Ptah diagnostics timed out. The native chat library TypeScript check passed (`.ptah/tmp/b13-corr-review-tsc-chat.log`). No source was changed and no host was launched.

### Five logic questions

1. **Silent failure.** A stale fallback succeeds after the user returns to Settings.
2. **Unexpected action.** A round trip through two global navbar routes bypasses the same check that protects a single changed destination.
3. **Wrong input result.** Equal URL and view snapshots hide a newer successful navigation.
4. **Dependency failure.** An ordinary current failure leaves the guard clear after Router teardown and can reach Home.
5. **Unspecified behaviour.** The ownership guard needs to preserve a later destination even when it matches the click-time destination.

## Re-review round 2

**Score: 8/10 · Verdict: REVISE.** The round 1 defect is fixed for navigation through the shell's own handlers. It remains reproducible when a newer navigation bypasses those handlers, including from controls in the same navbar. One Minor defect remains.

### Round 1 defect status

**Partially fixed.** The Setup click captures the monotonic ID and checks it after a delayed failure or rejection at `electron-shell.component.ts:895` and `:907`. Canvas, Command Center, Apps, Tasks, Machines, Reviews, Dashboard, Back, and every Setup click increment the ID before making their view request (`:838–896`). These are native button click bindings, so keyboard activation of those buttons reaches the same handlers. The notification fallback increments before switching to Chat (`:646–657`). When a bell is present, opening its panel does not change the route and leaves the current navigation owner in place.

The Back binding still has the same visibility condition, button type, label, icon and synchronous `setCurrentView('chat')` call as HEAD. The wrapper adds only the intent increment (`electron-shell.component.ts:447–463`, `:873–875`). The config-gate spec clicks the button and asserts the Chat request (`electron-shell.config-gate.spec.ts:327`).

### Defects

1. **Minor — Global navbar actions and other router-driven navigation bypass the Setup ownership check.** `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:466` and `:907`. With a workspace open, click Setup and leave its port promise pending. Click the Settings, Marketplace, or Thoth icon and let that route settle. Those icons remain visible alongside the Setup tab. Their handler calls `appState.setCurrentView(id)` directly (`libs/frontend/chat/src/lib/components/molecules/global-config-actions.component.ts:85–95`), so a late Setup rejection or `failed` still passes the ID and connection checks and routes to Setup Home. The same gap applies to a host `SWITCH_VIEW` that goes straight to app state (`libs/frontend/core/src/lib/services/app-state.service.ts:353–372`) or an independent router navigation. **Fix:** use shared navigation ownership so each newer navigation invalidates an older Setup fallback. Distinguish the Setup request's own route attempt from later starts so a current failure can still reach Home. Add a route-backed test that lets Settings settle without calling any shell tab handler, then rejects the Setup promise and asserts that Settings remains open.

### Verification

- The two new Machines tests click the actual tab before explicitly settling the Router. Removing the ID check would let the late failure or rejection reach `/onboarding` and fail both URL assertions (`electron-shell.setup-badge.spec.ts:343`, `:370`). The double-Setup test would fail its no-fallback assertion for the same reason (`:324`). These tests pin shell-handler ownership. The Machines tests always bump the counter before navigating and therefore leave the independent-router case uncovered. Regression sensitivity was verified against the pre-fix branches in source.
- No separate keyboard navigation handler was found in the shell. The Electron menu declares Cmd+, and Ctrl+, via `navigate:settings` (`apps/ptah-electron/src/menu/application-menu.ts:53`, `:92`), but the repository search surfaced no receiver for that message. The navbar and host-message examples provide concrete bypasses independently of that accelerator.
- `SetupStatusStore.launchGeneration` retains optional injection, a typed `/onboarding` fallback for the token-free VS Code webview, fixed error copy for failure or rejection, and the busy-state reset. Cancellation still leaves the error clear (`setup-status.store.ts:95`, `:300–319`).
- Independently ran all nine Electron shell suites (73/73) and the chat-ui store suite (24/24). Logs are `.ptah/tmp/b13-rr2-jest-chat.log` and `.ptah/tmp/b13-rr2-jest-chat-ui.log`. `git diff --check` passed for the scoped tracked files. Scoped Ptah diagnostics timed out twice. The native chat library TypeScript check passed (`.ptah/tmp/b13-rr2-tsc-chat.log`). Angular template verification remains with the coordinator. No host was launched and no source was changed during review.

### Five logic questions

1. **Silent failure.** A successful Settings navigation can be replaced by a stale fallback.
2. **Unexpected action.** Clicking Settings from the same navbar bypasses the protection that clicking Machines receives.
3. **Wrong input result.** A delayed `failed` outcome retains authority when the follow-up route entered outside a shell handler.
4. **Dependency failure.** The shell catches exceptions and uses its connection/loading gate before falling back. The store reports the fixed error and releases the busy state.
5. **Unspecified behaviour.** Navigation ownership needs to include host and router entry points as well as the local buttons.

## Re-review round 1

**Score: 8/10 · Verdict: REVISE.** All four original defects are fixed for their reported cases. The new rejection fallback introduces one Minor ordering defect.

| Original defect | Status | Evidence and regression check |
| --- | --- | --- |
| 1. Shell cancellation overrides the next navigation | Fixed | `electron-shell.component.ts:865` returns on `cancelled`, `navigated`, and `already-there`. The deferred-port test at `electron-shell.setup-badge.spec.ts:265` would catch the old extra `setCurrentView('onboarding')` call and also rejects a direct-router fallback. |
| 2. Generation CTA raises an error on cancellation | Fixed | `setup-status.store.ts:309` reserves the fixed copy for `failed` or an exception and releases `launching` in `finally`. The test at `setup-status.store.spec.ts:365` would observe a non-null error under the old code. The exact-copy and rejection tests at lines 381 and 399 protect existing behaviour. |
| 3. Failed run-step navigation leaves a Setup child on screen | Fixed | `electron-shell.component.ts:881` requests the bare root via the typed surface router. The route-backed test at `electron-shell.setup-badge.spec.ts:325` asserts the settled URL. Under the old app-state-stub path it would stay at the child URL. |
| 4. A thrown or rejected entry call skips fallback | Fixed | `electron-shell.component.ts:865` handles both forms. The tests at `electron-shell.setup-badge.spec.ts:295` and `:305` expect Home navigation where the old method would reject. They exercise immediate failure. |

### New defect

1. **Minor — A late port rejection can replace a newer destination.** `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:865` and `:881`. Call Setup, let the port promise stay pending, navigate to Machines, then reject the original Setup promise. The catch invokes the Home fallback and `canSwitchViews()` is still true on a connected, idle app. The same ordering applies to a delayed `failed` outcome. The port contract permits a delayed settlement (`libs/frontend/core/src/lib/routing/setup-run-entry.ts:25`). The ordinary router cancellation path is covered, so this finding is limited to stale failure. **Fix:** invalidate fallback ownership when a subsequent navigation or Setup intent starts, and check that ownership before issuing the Home route. Add a deferred-rejection test that lets Machines settle first and asserts the URL stays on Machines.

### Guard, hosts and verification

- The fallback checks the existing connection/loading gate at settlement. The shared surface router turns ordinary route exceptions into a typed result (`surface-router.service.ts:130`, `:169`), and app state observes the global configuration surface from the settled route (`app-state.service.ts:557`). The fallback therefore avoids the same-surface early return while keeping route state in sync. The shell fixture sets the guard to true in all these cases, so the false branch was checked in source.
- The token-free Electron shell still calls `setCurrentView('onboarding')` synchronously. The VS Code webview chooses `ptah-app-shell` (`app.html:55`), provides Angular routing (`app.config.ts:237`), and exposes the shared onboarding route (`app.routes.ts:103`). The store's optional injection and typed root fallback (`setup-status.store.ts:95`, `:311`) match that wiring. The token-free VS Code-configured spec would fail against the old boolean Router path because it expects the typed router call (`setup-status.store.spec.ts:354`). No host was launched.
- Independently ran the focused store, badge and shell configuration-gate suites. All 55 tests passed across three suites. Logs are `.ptah/tmp/b13-rr1-jest-chat-ui.log` and `.ptah/tmp/b13-rr1-jest-chat.log`. Regression sensitivity was assessed by tracing the old branches against the new assertions. `git diff --check` passed. Scoped Ptah TypeScript diagnostics returned zero diagnostics in the four requested files on retry and reported 390 errors in sibling files. Angular template verification remains the coordinator's gate.

### Five logic questions

1. **Silent failure.** The remaining stale fallback can land successfully on the wrong destination.
2. **Unexpected user action.** A navigation away while Setup is pending can be undone by a late failure. A typed cancellation now leaves the later destination alone.
3. **Wrong input result.** A stale `failed` result is still actionable. Current failures, cancellations and already-current results take the intended branches.
4. **Dependency failure.** A synchronous or asynchronous entry failure now uses the guarded Home route. The store catches the failure and clears the busy flag.
5. **Unspecified behaviour.** The fallback needs a navigation owner through failure settlement, including after a newer route has already landed.

## Original review

**Score: 6/10 · Verdict: REVISE.** Two Major defects and two Minor defects. Launcher removal, host fallback selection, and badge rendering are sound on the covered paths. A superseded Setup request can override the user's next click, and the store reports a cancellation as an error. These are gaps in navigation behaviour with local fixes.

## Defects

1. **Major — A cancelled Setup click can override a newer navigation.** `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:860`. Click Setup while its route is loading, then click Machines or Chat. The core router returns `cancelled` to the Setup request because the newer navigation took precedence (`libs/frontend/core/src/lib/routing/surface-router.service.ts:36`). The shell treats that result as a reason to invoke `setCurrentView('onboarding')`, which can supersede the new destination with Setup Home. Two rapid Setup clicks can cause the same interference with the second request. **Fix:** return on `cancelled`, `navigated`, and `already-there`. Use the Home fallback on `failed` or absent token. Add a deferred-port click test where Setup is superseded and assert no fallback occurs.
2. **Major — The generation CTA reports an error when navigation is superseded.** `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts:307`. The port's `cancelled` result sets `launchError`, which the chat readiness card renders as an alert (`libs/frontend/chat/src/lib/components/molecules/setup-plugins/chat-empty-state-screen.component.ts:125`). Before Batch 13 the store displayed the fixed copy only for `failed` or a thrown error (HEAD `setup-status.store.ts:323`). **Fix:** branch on `failed` for the typed port result. Preserve the catch and busy-state reset. For the absent-token route, use a typed surface navigation outcome as well if the fallback needs to distinguish a superseding click or an already-current URL from true failure. Test cancellation, exact failure copy, and the busy flag reset.
3. **Minor — Home fallback can leave the user on a Setup child page.** `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:862`. If the user is already on a Setup child page and the new run-step navigation fails, the settled surface remains `onboarding`. `setCurrentView('onboarding')` returns early for the current owned surface when no navigation is pending (`libs/frontend/core/src/lib/services/app-state.service.ts:998`). The requested bare Home fallback never runs. **Fix:** on failure from a Setup child, explicitly request the root onboarding URL through the surface router, preserving the app's view-switch guard. Keep the absent-token app-state fallback. Add a route-backed test starting at a child URL and assert the resulting URL.
4. **Minor — A thrown or rejected entry call bypasses the shell fallback.** `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:860`. The click binding discards the returned promise, and the consumer has no catch. The concrete surface router converts ordinary navigation exceptions into `failed`, but the port also resolves the run and its target before delegating (`libs/frontend/setup-wizard/src/lib/services/setup-run-entry.service.ts:23`, `:49`), and the interface does not promise fulfillment (`libs/frontend/core/src/lib/routing/setup-run-entry.ts:25`). **Fix:** handle a synchronous throw or rejection from `openSetup()` through the same failure fallback, and add a rejected-port test.

## Preserve list

Launcher line numbers refer to `git show HEAD:libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.ts`.

| Former launcher capability | Disposition and evidence |
| --- | --- |
| Public injectable, request type and result type (14–29) | Removed with the barrel exports. Both `git grep` and an on-disk `rg` scan of `libs/` and `apps/` found zero references to the launcher, either type, its module path or `consumeOrigin`. The deleted declaration no longer provides an LSP reference anchor. |
| Validate an explicit workspace, supported workflow and active tab partition (46–56, 102–109) | Explicit workspace and tab-partition inputs are retired. The typed port accepts the generation workflow and selects records from the active normalized workspace (`setup-run.store.ts:171`, `:251`). A missing workspace produces an empty run list. The remaining CTA passes a fixed supported workflow; this port is an internal typed boundary. |
| Reuse the existing workflow tab or create one with a workflow title and requested or last-tab anchor (57–71) | Reuse moves to existing non-terminal Setup records. An absent record opens the matching entry page (`setup-run-entry.service.ts:30`). Chat-tab creation, naming, positioning, and tab-creation failure are retired with the Setup-owned model. |
| Background reservation with `focus: false` and a returned tab id (72) | Removed as a launcher operation. The old API reserved a chat tab and did not start a backend run. Actual background operation belongs to the Setup run store. |
| Normalize origin, stash it by tab id, consume once, and clean up on failed or cancelled navigation (30–40, 73–78, 87–95) | The tab-local map and destructive read are explicitly retired by component 5. The CTA still forwards `independent-start` (`setup-status.store.ts:309`). The adapter accepts but does not consume origin (`setup-run-entry.service.ts:32`) because it only opens or attaches. Record creation can persist the origin supplied by its start caller (`setup-run.store.ts:316`). This establishes the forwarding boundary only. |
| Resolve the workflow target and navigate with its binding (79–86) | Moves to Setup's entry-route and run-target selection (`setup-run-entry.service.ts:35`, `:49`). The chat path no longer supplies a chat tab identity. |
| Distinguish failed/cancelled/landed, recheck active workspace after navigation, and focus the chat tab (87–109) | Typed router outcomes survive through the port. The store drops the cancelled/failed distinction and the shell adds a stale fallback (defects 1–2). Tab focus and its post-await tab-partition guard are removed with the final chat-tab mutation. The consumer specs do not exercise a workspace change during a pending run deep link. |

## Logic checks

1. **How does this fail silently?** A failed deep link can trigger a same-surface no-op and leave the old Setup child on screen (defect 3).
2. **What user action produces unexpected behaviour?** Clicking another tab while Setup loads can cause Setup Home to replace the later destination (defect 1). Repeated generation clicks are guarded by `launching()` at `setup-status.store.ts:300`.
3. **What input produces the wrong result?** A valid `cancelled` result raises a generation error (defect 2). A zero count renders no adornment and leaves the plain label. Positive counts come from workspace-scoped store signals, including the singular case (`electron-shell.component.ts:798`).
4. **What happens when a dependency fails?** The generation action catches thrown and rejected calls and always releases `launching` (`setup-status.store.ts:299`). The absent-token Angular Router fallback catches false and rejected results and uses the same fixed copy. The shell's resolved failure calls its fallback, with the limits in defects 3–4. A pending call leaves the store busy until navigation settles. Neither consumer adds a retry timer.
5. **What is missing from the stated requirements?** The acceptance language covers fallback but does not spell out which request owns it after a second click. The core router contract and the prior launcher behaviour establish that the latest navigation owns the outcome.

## Requirements and verification

- **Host behaviour.** Both consumers inject the port optionally (`setup-status.store.ts:94`, `electron-shell.component.ts:798`). The VS Code webview renders `ptah-app-shell`, and its shared route table exposes the lazy `/onboarding` route without an Electron-only guard (`app.html:55`, `app.routes.ts:103`). The VS Code-configured store spec omits the provider and asserts a request for that URL (`setup-status.store.spec.ts:349`). The Electron shell spec separately verifies the absent-token app-state call. There is no app-level token provider in the reviewed checkout. Electron provider registration and validator wiring belong to Batch 14 (`batches.md:533`).
- **Badge and dot.** The count is shown as an aria-hidden visual hint, and the button's accessible label includes the count (`electron-shell.component.ts:398`). The running dot reads a separate signal. There is no shell polling. CSS animates only opacity and transform and disables the animation under reduced motion (`electron-shell.component.ts:219`).
- **Spec strength.** The shell tests read the rendered button and badge, mutate real signals, verify the running dot disappears, and drive the actual click binding (`electron-shell.setup-badge.spec.ts:149`, `:196`). The store tests verify the workflow and origin arguments, an error on `failed`, and the absent-token route (`setup-status.store.spec.ts:329`). The shell spec mocks app state and the entry adapter, so it proves delegation and fallback calls. The dot test verifies DOM presence and class, while the CSS constraints were checked in source. Neither suite covers the defects above.
- **Checks.** Independently ran focused Jest for both specs. Store 21/21 and shell 8/8 passed. Logs are `.ptah/tmp/b13-review-jest-chat-ui.log` and `.ptah/tmp/b13-review-jest-chat.log`. `git diff --check` passed for the tracked batch diff. Scoped `ptah_get_diagnostics` timed out first, then returned zero diagnostics in the five requested files and 390 errors across sibling files. The sibling errors were outside this review. The implementer reported clean library `tsc` checks and zero ESLint errors. Angular template verification remains the coordinator's gate. No Electron or VS Code host was launched.
- **Review scope.** Read the task context, component 5 plan, Batch 13 acceptance and implementer report, the changed files and deleted launcher, and the relevant routing contracts. The task-folder Ptah file search returned zero hits, so a scoped `rg --files --hidden` identified the available task documents. No task-description file or Batch 13 style review surfaced. The lane exposed no skill-loading mechanism or matching assigned skill.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep the launcher deletion | Delete or retain a thin delegate | No consumers or imports survive, and component 5 explicitly permits deletion. Restore the outcome distinction at the consumers. | Yes |
| Treat cancellation as final for the superseded request | Return or attempt Home fallback | The core router explicitly reserves `cancelled` for a newer navigation. Batch 13 asks the shell to remain functional on failure and without a provider. | Yes |
| Accept the singular label | Grammatical singular or literal plural for all counts | The plan gives a plural example at two, and the neighbouring Machines tab already inflects by count. | Yes |
