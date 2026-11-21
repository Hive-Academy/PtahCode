# Phase 1 report: shared primitives

Worktree: `.claude-worktrees/settings-ui-polish` (branch `fix/settings-ui-polish`). No commit, push or `nx` run was done.
Path prefixes are the same as in `implementation-plan.md` (`UI/`, `CH/`, `PA/`, `PR/`, `WV/`).

## B1.1 Tokens and card inset rule — done

Files changed:
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`: 3 tokens after `--ptah-card-padding-lg` (`--ptah-popover-max-h`,
  `--ptah-modal-max-h`, `--ptah-lane-row-h`). `--ptah-surface-pad` and `--ptah-card-padding-lg` are unchanged.
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`: the 3 names in `TOKEN_NAMES`; values of the 3 new tokens and of
  `card-padding-lg` and `surface-pad` in `TOKEN_VALUES` (pins "unchanged").
- `apps/ptah-extension-webview/src/styles.css`: one rule after the `content` glass rule:
  `:root[data-glass='on'] .settings-page [data-glass-surface='content'] { padding: var(--ptah-card-padding-lg); }`.

Checks:
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts` — PASS (164 tests).
- `npx eslint libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts` — PASS (warning only: no cached Nx project graph, so
  `@nx/enforce-module-boundaries` was skipped).

Deviations: none.

## B1.2 Popover cap — done

Files changed:
- `UI/native/shared/floating-ui.service.ts`: NEW option `capHeight?: boolean` (default `false`). With `true` the middleware
  is `offset → flip({ boundary, fallbackStrategy: 'bestFit' }) → shift(...) → size({ boundary, padding: 8, apply })`.
  `apply` writes `min(var(--ptah-popover-max-h), Npx)` with `N = max(128, floor(availableHeight))`. Without the option the
  middleware is the same as before.
- `UI/native/popover/native-popover.component.ts`: NEW input `capToViewport` (default `true`), passed as `capHeight`.
  The panel gets `[class.ptah-popover-capped]`, with the component style `max-width: calc(100vw - 1rem); overflow-y: auto;
  overscroll-behavior: contain`. `revealUnpositioned()` sets `max-height: var(--ptah-popover-max-h)` when the cap is on.
  `.ptah-popover-layer` is unchanged. All other inputs, outputs and methods are unchanged.
- `UI/native/shared/floating-ui.service.spec.ts`: `flip` and `size` are wrapped in `jest.fn(actual.*)`. NEW tests: no
  `capHeight` (and `false`) keeps `offset, flip, shift` and `flip({ boundary })`, no `size()`; `capHeight: true` gives
  `offset, flip, shift, size` and `fallbackStrategy: 'bestFit'`; `apply` writes `...432px)` for 432.7 and `...128px)` for 40.
- `UI/native/popover/native-popover.component.spec.ts`: host binds `[capToViewport]`. NEW tests: `capHeight: true` and
  class on by default binding; `capHeight: false` and no class with `false`; bare component default is `true`; the
  unpositioned fallback sets the token max-height only when the cap is on.

Checks:
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/native/shared/floating-ui.service.spec.ts libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts` — PASS (2 suites, 71 tests).
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` — PASS.
- `npx eslint` on the 4 files — PASS (only the "no cached ProjectGraph" warning).

Deviations:
- `size()` also gets `boundary` (the plan lists only `padding: 8, apply`). Reason: flip and shift measure against the same
  `boundary`, so the height cap must measure the same space. With no `boundary` (all callers today) the result is the same.
- The plan said existing popover tests assert the exact `position` options with `toHaveBeenCalledWith`. No such test
  exists in the spec, so no existing test needed a change.

Not done (coordinator): the Electron visual clipping check of the B1.2 acceptance (New Session popover, canvas rail card
popovers, send-to-messaging picker), and the 800x600 rendered check. A lane cannot run the Electron app.

## B1.3 Modal shell and drawer icon — done

Files changed:
- `UI/native/modal/native-modal.component.ts`: NEW type `NativeModalLayout = 'plain' | 'shell'` and input `layout`
  (default `'plain'`). The 3 slots are in 3 wrapper `div`s (`data-ptah-modal-part="header|body|footer"`). `plain`: each
  wrapper has class `ptah-modal-part` (`display: contents`) and the box classes are the same as before (`modal-box max-w-lg`).
  `shell`: box `flex flex-col overflow-hidden p-0 max-h-[var(--ptah-modal-max-h)] max-w-[calc(100vw-2rem)]` plus the
  size class; header `shrink-0 border-b border-base-300 px-5 py-3 empty:hidden`; body `min-h-0 flex-1 overflow-y-auto
  overscroll-contain px-5 py-4` plus a CSS-only scroll shadow (`local` covers, `scroll` shadows); footer
  `shrink-0 border-t border-base-300 px-5 py-3 empty:hidden`. All other inputs, the output, Esc, Tab wrap, backdrop
  close, `ngOnDestroy` and the `dialog.modal:not([open])` rule are unchanged.
- `UI/native/modal/native-modal.component.spec.ts`: host binds `[layout]`. NEW tests: default `plain` (bare component
  default, wrapper class, unchanged box class, slots inside their wrappers); `shell` classes on box, body, header and
  footer; Tab and Shift+Tab wrap across header and footer in `shell`.
- `UI/native/drawer/native-drawer.component.ts`: the `×` glyph is now `<lucide-angular [img]="XIcon" class="size-4"
  aria-hidden="true" />`, with `ptahTooltip="Close panel"`. Imports `LucideAngularModule`, `X`, `PtahTooltipDirective`.
  Test id, `aria-label`, inputs and output are unchanged.
- `UI/native/drawer/native-drawer.component.spec.ts`: NEW test: the close button has an `svg` in `lucide-angular`, keeps
  `aria-label="Close panel"`, has no `×`, and a click emits `closed`.

Checks:
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts libs/frontend/ui/src/lib/native/drawer/native-drawer.component.spec.ts`
  — first run FAIL (2 tests, see below), after the fixes PASS (2 suites, 38 tests).
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` — PASS.
- `npx eslint` on the 4 files — PASS.

Deviations and decisions:
- Drawer tooltip: `[tooltipOnFocus]="false"`. Evidence: the first run failed the existing test "promotes the root to
  the top layer with showPopover before moving focus" because the drawer moves focus to the close button on open, and
  the tooltip then opened its own top-layer overlay. In the app that shows the tooltip at each keyboard open. The
  directive documents `tooltipOnFocus=false` for focus that is set programmatically. Hover still shows the tooltip; the
  `aria-label` gives the name to keyboard and screen reader users. Reversible: remove the binding.
- Modal default test: jsdom does not cascade component styles into `getComputedStyle` (it returned `block`), so the test
  asserts the `ptah-modal-part` class, as the plan allows ("computed style or class").
- Wrapper markers: the plan does not name a selector for the wrappers. I used `data-ptah-modal-part`, not a new
  `data-testid`, because the plan says "No test id changes in Phase 1".
- Scroll shadow with glass on: the `local` covers use `oklch(var(--b1))`. With glass on, the box fill is the blurred
  `::after` layer, so a solid cover would show as a band. The shadow is off there (`:host-context([data-glass='on'])`),
  and the header and footer borders mark the edges. The coordinator can confirm this in the Electron visual check.
- `NativeModalLayout` is not exported from `UI/native/modal/index.ts`: that barrel is not in the B1.3 write set. Callers
  can bind `layout="shell"` without the type. Add `export type { NativeModalLayout }` there if Phase 3 needs the type.

Not done (coordinator): the visual check of `task-create-dialog` in Electron.

## B1.4 Patterns: form-section, setting-row, settings-layout — done

Files changed:
- `UI/patterns/form-section/form-section.component.ts`: NEW input `icon` (`LucideIconData | null`, default `null`).
  A NEW `flex items-center gap-[var(--ptah-gap-inline)]` wrapper holds the icon (`data-testid="form-section-icon"`,
  `size-[var(--ptah-icon-md)] shrink-0 text-base-content-muted`, `aria-hidden`) and the `@switch (level())` heading.
- `UI/patterns/setting-row/setting-row.component.ts`: NEW `[action]` slot in a `inline-flex size-8 items-center
  justify-center empty:hidden` box (`data-ptah-setting-action`), after `[meta]` and before the default slot, inside
  `[data-ptah-setting-control]`. NEW inputs `controlAlign` (`'start'` default; `'end'` adds `justify-end`),
  `edgePadding` (`'all'` default; `'trim'` adds `first:[&>div]:pt-0` and `last:[&>div]:pb-0` to the host through a
  `[class]` host binding merged with the static class), `hintElementId` (`null` default; `hintId` uses it when set).
- `UI/patterns/settings-layout/settings-layout.component.ts`: NEW input `icon` before the `h1`/`h2`
  (`data-testid="settings-layout-icon"`, `size-[var(--ptah-icon-lg)] shrink-0 text-base-content-muted`, `aria-hidden`).
  The state mark gets `[attr.title]="mark.label"` (F40). F37: see the deviation below.
- The 3 specs: NEW tests for the form-section icon (only when set, placed before the heading); the setting-row action
  slot (before the control, fixed box, empty box hidden), `hintElementId`, default classes (exact host class list, no
  `justify-end`, no trim) and the opt-in classes; the settings-layout header icon and the mark `title`. The navigation
  frame test is updated for the F37 change.
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` and `.spec.ts` (B1.1 files): NEW token `--ptah-icon-lg: 1.25rem`.

Checks:
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/patterns/form-section/form-section.component.spec.ts libs/frontend/ui/src/lib/patterns/setting-row/setting-row.component.spec.ts libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`
  — PASS (4 suites, 222 tests).
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` — PASS.
- `npx eslint` on the 6 files and `ptah-tokens.spec.ts` — PASS.

Deviations and decisions:
- `--ptah-icon-lg` does not exist (the token file has `--ptah-icon-xs`, `-sm`, `-md` only). Plan 1.8 uses it. I added
  `--ptah-icon-lg: 1.25rem` (equal to `--ptah-text-page-title-size`) in `ptah-tokens.css`, a Phase 1 (B1.1) file
  outside the B1.4 write set, and pinned it in `ptah-tokens.spec.ts`. Reversible.
- F37 implementation. The plan says "move the frame padding below 640px to the main column". Code facts: the frame had
  `gap-[var(--ptah-gap-group)] p-[var(--ptah-page-gutter)]` at all widths, plus `[@container(min-width:640px)]:p-0
  gap-x-0` in navigation mode; the main column had `[@container(min-width:640px)]:p-[gutter]`. New code, in
  navigation mode with tabs (`navigationFrame()`): the frame has no padding and no gap; the main column has
  `p-[var(--ptah-page-gutter)]` at every width; below 640px the nav strip has its own
  `px-[gutter] pt-[gutter]`. Because `--ptah-gap-group` and `--ptah-page-gutter` are both `--ptah-space-6`, the
  distances below 640px are the same as before (nav inset, nav-to-content space, content inset). Tabs mode and the
  no-tabs case keep the frame padding. Side effect: navigation mode with no tabs at 640px and wider had a double gutter
  (frame plus main). It now has one (frame only). The nav strip inset is the nav's own inset, as the nav already has
  its own `px`/`py` at 640px and wider.
- The setting-row trim uses 2 class-map keys, not one key with a space: the code notes that Angular ignores class-map
  keys that contain a space (`settings-layout.component.ts`, comment above `frameToggles`).
- `[action]` is placed after `[meta]` and before the default slot ("before the default slot" in the plan).

## B1.5 Popover opt-outs (chat, git-ui) — done

Files changed (one attribute `[capToViewport]="false"` on the `<ptah-native-popover>` element, nothing else):
- `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts` (line ~139)
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html` (line 5 popover)
- `libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.html` (line ~41 popover)
- `libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.ts` (line ~54)

Checks:
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.spec.ts libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.spec.ts`
  — PASS (3 suites, 116 tests).
- `npx jest --config libs/frontend/git-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.spec.ts` — PASS (1 suite, 9 tests).
- `npx eslint libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.ts` — PASS.

Deviations: none.

## B1.6 Popover opt-out (marketplace) — done

Files changed: `libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.ts` (`[capToViewport]="false"`
on the popover at line ~76).

Checks:
- `npx jest --config libs/frontend/marketplace/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.spec.ts` — PASS (1 suite, 25 tests).
- `npx eslint libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.ts` — PASS.

Deviations: none.

## Extra check (not in the plan)

- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.spec.json` — exit 2 with 16 errors, all in code this phase did
  not change: `badge.a11y.spec.ts`, `icon-button.directive.spec.ts`, `list-detail.component.spec.ts`,
  `aurora-effect.component.spec.ts`, `surface-tile.component.spec.ts`, `libs/shared/.../capability-id-codec.ts`,
  `libs/shared/.../attention-identity.ts`, and `native-popover.component.spec.ts:588`. That last line is the existing
  `expect(layer?.contains(panel))` (line 528 on `main`, moved by the new tests). No error is in a line that this phase
  added.

## Open items for the coordinator

1. Run the Phase 1 gate: `npm run verify -- -p @ptah-extension/ui,@ptah-extension/chat,@ptah-extension/git-ui,@ptah-extension/marketplace,ptah-extension-webview`
   and `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. A lane did not run them (rule).
2. Electron visual checks: the B1.2 clipping check (New Session popover `app-shell.component.html:258-262`, canvas rail
   card popovers, send-to-messaging picker), and the B1.3 check of `task-create-dialog` (modal `plain` unchanged).
3. Decide if `NativeModalLayout` must be exported from `UI/native/modal/index.ts` (not in a write set).
4. Confirm the glass-on modal scroll shadow choice (off with glass on) in Electron when Phase 3 opts in to `shell`.

Nothing was committed, pushed or stashed.
