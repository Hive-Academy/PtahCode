# Batch 13 implementation report — Chat-side entry: launcher, setup status, shell badge

Status: DONE, revise rounds 1 and 2 applied (all review defects fixed; focused checks pass; coordinator gate and `typecheck-templates` pending)

## Changed or deleted files

| File | Change |
| --- | --- |
| `libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.ts` | DELETED |
| `libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.spec.ts` | DELETED |
| `libs/frontend/chat-ui/src/index.ts` | Removed the launcher export block (service + both types) |
| `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts` | Injects `SETUP_RUN_ENTRY` (optional); `launchGeneration` delegates to `openWorkflow`; dropped `TabManagerService`/`isActiveWorkspaceTabSet` |
| `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.spec.ts` | Entry stub replaces the launcher stub; new token-absent fallback test |
| `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts` | Optional `SETUP_RUN_ENTRY` injection, badge + running dot in the Setup tab, `openSetupHub` delegation, dot styles |
| `libs/frontend/chat/src/lib/components/templates/electron-shell.setup-badge.spec.ts` | CREATED — badge label, hidden state at N=0, running dot, `openSetupHub` delegation and fallbacks (8 tests) |

The `libs/frontend/onboarding/**` and `webview-e2e-harness` modifications in `git status` belong to the
parallel Batch 8/9/10 lane. This lane did not touch them.

## Launcher decision: DELETED

Caller search (`ptah_grep` over the whole workspace for `GenerationWorkflowLauncherService`,
`generation-workflow-launcher`, `GenerationWorkflowOpenRequest`, `GenerationWorkflowOpenResult`,
`consumeOrigin`) found exactly 5 files, all inside this batch's write set:

- `libs/frontend/chat-ui/src/index.ts` (barrel export) — removed.
- `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts:26,97` — rewritten to the port.
- `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.spec.ts` — stub replaced.
- The launcher itself and its own spec — deleted.

No caller remains in onboarding, setup-wizard, chat, apps, or the e2e harness (Batch 7 removed the
`generation-handoff.store.ts` import, Batch 8 the onboarding ones; zero grep hits confirm).

`onboardingGenerationTarget`: the launcher never exported it — it imported it from
`@ptah-extension/core`. Its remaining callers are direct core imports outside this write set
(`libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts:212,236` and core's own
`onboarding-routes.ts`/spec). They do not call the launcher, so deletion is safe. Batch 14
(Task 14.2) deletes `onboardingGenerationTarget` itself.

## Acceptance items

| Acceptance | How it is met |
| --- | --- |
| Every remaining launcher caller found; delete when none remains outside launcher + spec | Deleted both files; grep shows zero references left (`git grep` for all five symbols returns only deleted paths). Caller list above. |
| `SetupStatusStore` injects `SETUP_RUN_ENTRY` with `{ optional: true }` | `setup-status.store.ts:94` |
| `launchError` text kept | `setup-status.store.ts:313,315` — `'Could not open generation. Please try again.'`, unchanged copy; spec still asserts it |
| `openSetupHub()` calls `openSetup()`; fallback `setCurrentView('onboarding')` when the token is absent | `electron-shell.component.ts:854-864` — absent token or non-landed outcome falls back to `setCurrentView('onboarding')` |
| Badge aria-label "Setup: N runs need attention" | `electron-shell.component.ts:398` binds `setupTabLabel()`; computed at `:807-811` returns `Setup: N runs need attention` (singular at 1); spec asserts both |
| Running dot animates only opacity/transform | `electron-shell.component.ts:219-236` — `@keyframes setup-run-pulse` touches `opacity` and `transform` only; `prefers-reduced-motion` turns it off; tokens `--ptah-state-info`, `--ptah-status-pulse-duration`, `--ptah-ease-standard` (same pulse as `ptah-status[data-ink='run']`) |
| No polling; badge reads signals | `electron-shell.component.ts:798-805` — `computed(() => this.setupEntry?.attentionCount() ?? 0)` and same for `runningCount`; no timers anywhere |
| Create `electron-shell.setup-badge.spec.ts` | Created — label at N=2 and N=1, hidden badge/dot at 0, dot presence while running, `openSetup` delegation, non-landed fallback, token-absent fallback |
| Template change minimal, existing styles/tokens | Setup tab button only: `[attr.aria-label]` binding plus two `@if` blocks reusing the Machines badge pattern (`ptahBadge tone="warn" size="xs" count`, `aria-hidden`, hint-not-button); dot styles appended to the component's existing `styles` block using `--ptah-*` tokens |

## Check results

All logs under `.ptah/tmp/`:

- `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath .../setup-status.store.spec.ts` — **21/21 passed** (`b13-jest-chat-ui.log`)
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath .../electron-shell.setup-badge.spec.ts` — **8/8 passed** (`b13-jest-chat.log`)
- Regression sweep of the shell template change: `--testPathPatterns='electron-shell'` — **9 suites, 65/65 passed** (`b13-jest-shell-all.log`), including `electron-shell.config-gate.spec.ts` which clicks the Setup tab with no token (still falls back synchronously)
- `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json` — **0 errors** (`b13-tsc-chat-ui.log`)
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — **0 errors** (`b13-tsc-chat.log`)
- `npx eslint <5 changed files>` — **0 errors, 11 warnings** (`b13-eslint.log`): pre-existing non-null-assertion style (`setup-status.store.ts:127` is untouched old code; the specs follow the `machines-tab.spec.ts` `!` pattern) and the shell's pre-existing `max-lines` warning (file was already over 700 lines before this batch)
- `ptah_get_diagnostics` scoped to the changed files stayed unavailable ("TypeScript check still running after 45s") in this environment; the two `tsc --noEmit` runs above are the fallback evidence.

## Template change

Yes — `electron-shell.component.ts` inline template only (single-file component; no separate
`.html`/`.css` exists). The Setup tab gained the `aria-label` binding, the attention badge and the
running dot. No other template region changed. The coordinator must run
`npm run verify -- -t typecheck-templates -p ptah-extension-webview` (lane is not allowed to).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Delete the launcher (not thin-rewrite) | delete vs thin delegate | Zero callers outside the write set after the store rewrite (grep evidence above); plan component 5: "If nothing else uses the launcher after this, delete it." | Yes |
| `SetupStatusStore.launchGeneration` falls back to `router.navigate(['/onboarding'])` when the token is absent (same path as `launchWizard`), instead of failing | fallback to bare surface vs set `launchError` | Plan failure behaviour: "Token absent (VS Code webview, or a test): fall back to bare /onboarding"; the old active-workspace-tab guard is void because `openWorkflow` attaches to a run, not a tab | Yes |
| `openSetupHub` falls back to `setCurrentView('onboarding')` also when `openSetup()` returns a non-landed outcome, not only when the token is absent | fallback on non-landed vs silently do nothing | Plan component 5 wording ("falling back to"); a `failed`/`cancelled` navigation would otherwise leave the user on a dead click; `config-gate.spec.ts` proves the absent-token path stays synchronous | Yes |
| Badge label uses singular at 1 (`Setup: 1 run needs attention`), plural from 2 (`Setup: 2 runs need attention`) | literal `N runs need attention` always vs singular/plural | Acceptance string matches at N>=2; the sibling `machinesTabLabel` (`electron-shell.component.ts:743-747`) already does singular/plural; "1 runs" is wrong user-facing English | Yes |
| Attention badge uses `ptahBadge tone="warn" size="xs" count`, aria-hidden, like the Machines approvals hint | warn badge vs accent badge vs custom span | Plan: "count badge from `attentionCount()`"; repo precedent `electron-shell.component.ts:319-326` (D11 hint pattern); `PtahBadgeDirective` already imported | Yes |
| Running dot reuses the `ptah-status` run pulse (opacity 0.45 at 50%, `transform: scale(0.75)`), `--ptah-state-info` ink | this pulse vs a spinner | `libs/frontend/ui/src/lib/badge/ptah-badge.css:113-135` defines the identical pulse for "run" status; acceptance allows opacity/transform only | Yes |

## Clarifications Needed

None. All acceptance items are met and every open point was settled from the plan, the batch rules
and the repo's own patterns. Outstanding for the coordinator (not blockers):
`npm run verify -- --related -p chat-ui,chat`, then `-t lint,typecheck -p chat-ui,chat`, and
`-t typecheck-templates -p ptah-extension-webview` because the shell template changed.

## Revise round 1

Review: `code-logic-review-batch13.md` (codex, 6/10 REVISE). All four defects fixed.

### Defect 1 (Major) — cancelled Setup click could override a newer navigation

- Fix: `electron-shell.component.ts:859-871` — `openSetupHub` now returns without any fallback
  when the port outcome is `navigated`, `already-there` or `cancelled`
  (`if ((await entry.openSetup()) !== 'failed') return;`). Only `failed` (or an absent token, which
  never reaches this branch) falls back. `surfaceNavigationLanded` is no longer used here; the
  import was removed.
- Test: `electron-shell.setup-badge.spec.ts:265` —
  `'does not fall back when a newer navigation supersedes the Setup click'`: a deferred port call
  stays pending, the Machines click runs `setCurrentView('machines')`, then the port resolves
  `cancelled`; asserts exactly one `setCurrentView` call (`'machines'`, never `'onboarding'`) and
  no `navigateToSurface` call.
- Extra: `:257` `'does not act on an already-there outcome'`.

### Defect 2 (Major) — a cancelled port result raised `launchError`

- Fix: `setup-status.store.ts:305-317` — `launchGeneration` branches on the typed outcome and
  sets `launchError` only when `outcome === 'failed'` (`:314`); the catch (thrown/rejected calls)
  and the `finally` busy-state reset are unchanged. `cancelled` no longer raises the alert the
  chat readiness card renders.
- Absent-token fallback now uses the typed surface router too:
  `setup-status.store.ts:88,311` — `SurfaceRouterService.navigateToSurface('onboarding')` instead
  of the boolean `Router.navigate`, so a superseded or already-current bare-Home request is not a
  false error either. `launchWizard()` still uses `Router.navigate` (out of the defect's scope).
- Tests: `setup-status.store.spec.ts:365`
  `'reports no error and releases the busy flag when a newer navigation supersedes the launch'`
  (deferred port, `launching()` true while pending, `cancelled` resolves to no error and
  `launching()` false); `:381`
  `'reports the exact failure copy when the port fails and releases the busy flag'`
  (asserts the literal `Could not open generation. Please try again.`); `:399`
  `'reports the failure copy when the port rejects'` (no thrown detail leaks);
  `:354` absent-token fallback updated to assert `navigateToSurface('onboarding')`.

### Defect 3 (Minor) — Home fallback was a no-op on a Setup child page

- Fix: `electron-shell.component.ts:874-883` — new `fallBackToSetupHome()`: gates on
  `appState.canSwitchViews()` (the same guard every app-state navigation entry point uses) and
  requests the bare onboarding root through `this.surfaceRouter.navigateToSurface('onboarding')`.
  `setCurrentView('onboarding')` alone would return early in the app-state stay branch
  (`app-state.service.ts:998-1007`) when the workspace already owns the surface. The absent-token
  path keeps the plain `setCurrentView('onboarding')` app-state fallback (`:863`).
- Test: `electron-shell.setup-badge.spec.ts:325`
  `'requests the onboarding root URL from a Setup child page when the port fails'` — route-backed:
  the real `SurfaceRouterService` over an `/onboarding` + `analyze/skills` child route table, the
  test navigates to `/onboarding/analyze/skills`, the port returns `failed`, and the settled URL
  is asserted to be exactly `/onboarding` (with no `setCurrentView` call).

### Defect 4 (Minor) — a thrown/rejected port call bypassed the fallback

- Fix: `electron-shell.component.ts:866-870` — the port call sits inside `try`/`catch`; a
  synchronous throw or a rejected promise from `openSetup()` routes through the same
  `fallBackToSetupHome()` instead of surfacing an unhandled rejection (the click binding discards
  the returned promise).
- Tests: `electron-shell.setup-badge.spec.ts:295`
  `'routes a rejected port call through the same failure fallback'`;
  `:305` `'routes a synchronous port throw through the same failure fallback'`.

### Revise-round checks (logs `.ptah/tmp/b13r1-*.log`)

- `npx jest --config libs/frontend/chat-ui/jest.config.ts ... --runTestsByPath setup-status.store.spec.ts` —
  **24/24 passed** (was 21; +3 new, +1 rewritten)
- `npx jest --config libs/frontend/chat/jest.config.ts ... --runTestsByPath electron-shell.setup-badge.spec.ts` —
  **13/13 passed** (was 8; +5 new, +1 rewritten)
- Regression `--testPathPatterns='electron-shell'` — **9 suites, 70/70 passed**, including
  `electron-shell.config-gate.spec.ts` (its no-token Setup click still hits the synchronous
  `setCurrentView('onboarding')` path)
- `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json` — **0 errors**
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — **0 errors**
- `npx eslint` over the four changed files — **0 errors, 16 warnings**: pre-existing
  non-null-assertion style (matches the `machines-tab.spec.ts` pattern; `:128` in the store is
  untouched old code) and the shell's pre-existing `max-lines` warning.

No template change in this round (the round-1 template markup from the first pass is untouched);
the coordinator still owes `typecheck-templates -p ptah-extension-webview` from round 1.

### Revise-round decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Failure fallback goes directly through `surfaceRouter.navigateToSurface('onboarding')`, gated on `appState.canSwitchViews()` | direct typed request vs a new app-state method | `canSwitchViews` is public (`app-state.service.ts:728`) and every gated app-state entry point uses the same pattern; no public app-state method addresses the bare onboarding root without the stay-branch no-op | Yes |
| Store absent-token fallback switched to `SurfaceRouterService.navigateToSurface` | typed surface router vs boolean `Router.navigate` | Review defect 2 fix note ("use a typed surface navigation outcome as well"); removes the same-URL/cancelled false error from the fallback too | Yes |
| `cancelled` and `already-there` act as terminal success for both consumers | no action vs error reporting | `surface-router.service.ts:33-38` reserves `cancelled` for the newer navigation; review defect 1 fix text | Yes |

Clarifications: none.

## Revise round 2

Re-review round 1 (codex, 8/10 REVISE): all four original defects confirmed fixed; one new Minor
defect fixed here.

### New defect — a late port rejection or delayed `failed` outcome could replace a newer destination

- Fix (ownership token, no timers, no polling):
  - `electron-shell.component.ts:806-813` — `shellNavigationId`, a monotonic counter, and
    `beginShellNavigation()`, which bumps it and returns the new id.
  - Every shell navigation entry point claims the navigation first:
    `onCanvasTab` (:839), `openDashboard` (:844), `openTasks` (:849), `openReviews` (:854),
    `openMachines` (:859), `openApps` (:863), `openCommandCenter` (:868), the notifications
    view-switch fallback (`:656`), the new `backToWelcome()` (:873-874) behind the template's
    back button, and `openSetupHub` itself (`:896`).
  - `openSetupHub` (`:896-908`) captures `const intent = this.beginShellNavigation()` and, after a
    `failed` outcome or a caught throw/rejection, checks `if (intent !== this.shellNavigationId)
    return;` (`:907`) before `fallBackToSetupHome()`. A Setup click that settles after a newer
    shell navigation started no longer falls back to Home over that destination.
- Template markup: one binding changed — the back button now calls the shell's
  `backToWelcome()` instead of `appState.setCurrentView('chat')` directly
  (`electron-shell.component.ts:456`), so that view switch claims the navigation too. The
  coordinator's `typecheck-templates -p ptah-extension-webview` gate covers it.
- Tests (`electron-shell.setup-badge.spec.ts`):
  - `:343` `'keeps the settled Machines destination when a pending Setup call rejects late'` —
    route-backed (real `SurfaceRouterService`): Setup click stays pending, the Machines tab click
    plus a settled `/machines` navigation supersede it, the Setup promise then rejects; asserts
    the URL stays `/machines` and no `'onboarding'` view switch runs.
  - `:370` `'keeps the settled Machines destination when a failed Setup outcome arrives late'` —
    the same ordering with a delayed `failed` outcome.
  - `:324` `'lets only the newest Setup click own the Home fallback'` — a second Setup click
    supersedes the first; the first click's late `failed` outcome must not reach Home.

### Revise-round 2 checks (logs `.ptah/tmp/b13r2-*.log`)

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --testPathPatterns='electron-shell'` —
  **9 suites, 73/73 passed** (badge spec grew 13 → 16; config-gate and the other shell suites
  unchanged and green, including the back-button spec which asserts
  `setCurrentView('chat')` through the new `backToWelcome()` wrapper)
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — **0 errors**
- `npx eslint` over both changed files — **0 errors, 21 warnings**: the shell's pre-existing
  `max-lines` warning and the specs' non-null-assertion style (same pattern as
  `electron-shell.machines-tab.spec.ts`)

### Revise-round 2 decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Monotonic shell intent id bumped by every shell navigation entry point, checked once before the Home fallback | intent id vs router-event subscription vs comparing the settled surface | Review fix text ("ownership token... use the shell's existing navigation entry points, do not add timers or polling"); no subscriptions, no teardown needed | Yes |
| Back button wrapped in `backToWelcome()` so its view switch claims the navigation | wrap vs leave the direct template call | The direct `appState.setCurrentView('chat')` binding is a shell view switch the counter could not see | Yes |
| `openNotifications` claims the navigation only on its view-switch branch, not when it just opens the bell panel | bump always vs only on the view switch | Opening the panel is not a navigation; a pending Setup click still owns the screen there | Yes |
| `ptah-global-config-actions` internals are not hooked | hook vs out of write set | That component lives outside this round's write set and shows its Setup entry only without workspace folders, while the badge tab (the fallback path under test) shows with folders | Yes |

Clarifications: none.


