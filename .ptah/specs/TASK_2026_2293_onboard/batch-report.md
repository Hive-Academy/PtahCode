# Batch report: TASK_2026_2293_onboard (frontend lane)

Nothing is staged or committed. All paths below are relative to the worktree
`D:/projects/PtahCode/.claude-worktrees/onboarding-connection-choice`.

## Changes

1. **"Main connection" is the page title.** The h1 of `ready-connection-step.page.ts` is now
   "Main connection". The intro paragraph now includes the old fieldset subtitle: "Ptah uses your main
   connection for chat and agents. Pick Claude Code or Codex, and make sure it is installed and
   signed in. The others are optional, and you can change this later in Providers. If you skip this
   step, you can fix it later." The option names in that sentence come from the option list. The
   fieldset `<legend>` stays as the radiogroup's accessible name, but is visually hidden (`sr-only`).
   The visible help line now appears only when a non-listed connection is saved (`kind: 'other'`).
2. **Each card has the same title and description.** A new `ConnectionOptionHeadingComponent` renders
   the icon tile, name, description and role badge. It shows "Main connection" or "Not your main
   connection", and no badge while no listed option is saved. The radio card and the detail card both
   use it, so the wording and badge placement match for every provider. The detail card's old line
   "The `claude` command on this computer" is replaced by the descriptor description. The command
   name still appears in the Installed row. In the detail card the name is exposed as
   `role="heading" aria-level="2"`. In the radio `<label>` it is plain text, because a label may
   contain only phrasing content.
3. **The install guide is now a modal.** A new `InstallGuideModalComponent` is built on the existing
   `NativeModalComponent` from `@ptah-extension/ui` (`libs/frontend/ui/src/lib/native/modal`).
   - That component is a native `<dialog>` opened with `showModal()`. It traps Tab, Esc closes it
     through `cancel`, a backdrop click closes it, and focus returns to the opener.
   - The dialog is labelled with `aria-labelledby` pointing to its h2.
   - It keeps the OS or method tabs (roving tabindex, ArrowLeft and ArrowRight wrap), the
     `ptah-command-copy-row` rows, the PATH and restart hint and the official docs link.
   - It adds Close and Re-check buttons. Re-check closes the dialog first, so focus returns to the
     trigger. The panel then emits `recheck`, and the page runs its usual `recheck()` (announcements,
     and focus moves to Continue when the chosen provider becomes ready).
   - The trigger is a "How to install" button in the card header, next to the "Not installed"
     status chip, with `aria-haspopup="dialog"`. It shows when `state === 'missing'` and the
     provider is not bundled, for every role.
   - The sign-in help and error help stay inline, unchanged.
4. **The page is wider on desktop.** The onboarding shell column is 1120px. It is now 1440px for a
   page route with `data: { layout: 'wide' }`, and only the Get ready connection route sets that.
   Both the radio-card grid and the detail-card grid use the same `CONNECTION_GRID_CLASS`:
   `grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]`. Three cards fit side by side at
   desktop width, and the cards wrap and then stack at narrower widths.
5. **The cards are built from a list.** The new `connection-options.ts` holds:
   - `CONNECTION_OPTIONS`, with one descriptor per provider: id, name, description, commandName,
     icon, panelTestId and install guide (title, intro, tablist label, tabs, commands with copy
     labels, docs URL and docs label);
   - the helpers `connectionOption()`, `isConnectionOptionId()` and `connectionRole()`.

   Both components iterate over this list:
   - The radio cards and their loading placeholders, one per option, in `connection-choice.component.ts`.
   - The detail cards, the announcements on Re-check and the mount "checking" check in
     `ready-connection-step.page.ts`.

   `ConnectionChoiceStore.name()` and `nameForPending()` now look up the descriptor. The saved-kind
   logic (`claude-cli` / `openai-codex` / `other` / `unreadable`) is unchanged.

   Adding a provider means adding one descriptor. The only other compile-time requirement is that
   the new id joins `ProviderKind` and gets an entry in the page's `readinessOf` record (a typed
   `Record<ProviderKind, …>`), which is the backend readiness signal P9 must supply anyway.
   Antigravity is **not** added.

## Files

- CREATED `libs/frontend/onboarding/src/lib/ready/connection-options.ts`: the descriptor list and helpers.
- CREATED `libs/frontend/onboarding/src/lib/ready/connection-option-heading.component.ts`: the shared card heading.
- CREATED `libs/frontend/onboarding/src/lib/ready/install-guide-modal.component.ts`: the "How to install" dialog.
- MODIFIED `libs/frontend/onboarding/src/lib/ready/ready-connection-step.page.ts`: the title, intro, wide grid and list-driven panels.
- MODIFIED `libs/frontend/onboarding/src/lib/ready/connection-choice.component.ts`: list-driven radio cards, the shared heading and the shared grid constant.
- MODIFIED `libs/frontend/onboarding/src/lib/ready/connection-choice.store.ts`: names come from the descriptors.
- MODIFIED `libs/frontend/onboarding/src/lib/ready/provider-panel.component.ts`: the `option` input, the shared heading, the How to install trigger, the modal, the `recheck` output, and the inline install blocks removed.
- MODIFIED `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts`: the `data.layout: 'wide'` column (1440px).
- MODIFIED `libs/frontend/onboarding/src/lib/onboarding.routes.ts`: the Get ready connection route sets `layout: 'wide'`.
- MODIFIED specs:
  - `ready/connection-choice.component.spec.ts`: radio counts come from the list. New tests cover list-order cards with name and description, role badges, no badge for `other`, and one loading placeholder per option.
  - `ready/provider-panel.component.spec.ts`: new tests cover the descriptor heading and badge, the trigger next to the status, no dialog for ready, signed-out or bundled providers, the labelled dialog content for each option, closing by Close, Escape (`cancel`) and backdrop, Re-check closing the dialog and emitting, and the tab-wrap parity row driven by the descriptor.
  - `ready/ready-connection-step.page.spec.ts`: the h1 is "Main connection", and new intro assertions check that the subtitle is folded in. Rows 27–31 open the dialog first. New tests cover Re-check inside the dialog, detail cards in list order, and matching radio and detail texts.
  - `shell/onboarding-shell.component.spec.ts`: a new test checks the wide column on `/onboarding/ready` only.
- The e2e scenario `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-ready-visual.e2e.spec.ts` has no assertion on the old title. Its `header > span` chip locator and its `toContainText('Main connection')` check still match, so it is unchanged.

## Decisions

- **Width control.** The 1120px cap belongs to the shell, so widening only the page section would
  mean escaping its parent. Options: widen every onboarding page, or add an opt-in route flag. I
  added the opt-in flag `data.layout: 'wide'`, read from the deepest active route, so no other page
  changes. This is reversible: drop the route data.
- **Dialog mount.** The dialog is mounted only while "How to install" applies. If the state leaves
  `missing` while the dialog is open, `NativeModalComponent.ngOnDestroy` closes it and emits
  `closed`. Re-check closes the dialog before re-reading, so focus restore and the page's
  focus-Continue never fight the dialog's inert backdrop.
- **Icons.** I kept the lucide `Terminal` and `Code` icons in the descriptor, as before. Brand marks
  would need `@defer` and `@ptah-extension/ui/brand-mark`. The `icon` field is the single place to
  swap them later.

## Checks (exact results)

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath` on these specs:
  - `ready/provider-panel.component.spec.ts`
  - `ready/connection-choice.component.spec.ts`
  - `ready/ready-connection-step.page.spec.ts`
  - `ready/connection-choice.store.spec.ts`
  - `shell/onboarding-shell.component.spec.ts`
  - `onboarding.routes.spec.ts`

  Result: `Test Suites: 6 passed, 6 total`, `Tests: 93 passed, 93 total`. After the last eslint fix
  in `install-guide-modal.component.ts`, `provider-panel.component.spec.ts` was re-run alone:
  `Test Suites: 1 passed`, `Tests: 16 passed`.
- `npx tsc --noEmit -p libs/frontend/onboarding/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit -p libs/frontend/onboarding/tsconfig.spec.json`: exit 2, with 12 errors, none
  in a changed file. All are in untouched files:
  - `ready/onboarding-ready-host.guard.spec.ts(14,5)` TS2554;
  - `shell/onboarding-workspace.store.spec.ts(87,12)` TS2349;
  - BigInt-target TS2737 in `libs/shared/.../capability-id-codec.ts`, `attention-identity.ts` and
    `libs/worker-protocol/.../pairing-code.ts`.

  I did not run them against main to prove it.
- `npx eslint <14 changed .ts files>`: exit 0, `29 problems (0 errors, 29 warnings)`.
  - 27 warnings are `explicit-member-accessibility` on `input()` / `output()` / method members.
    The lib's existing code does not use these modifiers either.
  - 2 warnings are `template/conditional-complexity` on the existing notice role bindings in
    `connection-choice.component.ts`, which I did not change.
  - The Nx boundary rule printed "No cached ProjectGraph is available. The rule will be skipped".
    The imports I added are `@ptah-extension/ui` (already used by this lib), `@ptah-extension/core`
    and `lucide-angular`.
- Not run, per the lane rules: `npm run verify`, `nx`, the build and e2e. The Angular template
  compile is left to the coordinator (`npm run verify -- -t typecheck-templates -p ptah-extension-webview`).

## Environment note

The worktree's `node_modules` junction was broken. It pointed to
`.../onboarding-connection-choice/projectsPtahCodenode_modules`, which does not exist (backslashes
were stripped when it was created), so every Jest suite failed on the `marked` moduleNameMapper.
I recreated it with `mklink /J node_modules D:\projects\PtahCode\node_modules`. This is git-ignored
and not part of the diff.

## Out-of-scope observations

- `apps/ptah-docs/src/content/docs/getting-started/first-launch.md:10` still says the step shows
  **Check Claude Code and Codex**. It needs a docs update to "Main connection".
- The visual captures for stage 1 will change: new title, wide column, and the install guide moved
  to a dialog. The baselines need a refresh in an Electron visual run.

## Fix round 1 (visual review REVISE)

Nothing is staged or committed.

### Fixes

- **F1 (install dialog tabs).** `install-guide-modal.component.ts` now renders only the active tab panel:
  `@if (activeTab() === tab.id)` inside the `@for`. The `[hidden]` binding is gone, because the
  Tailwind `.grid` class overrode it. Only the selected tab carries `aria-controls`, so the tab
  never points to a panel that is not rendered. The new spec "renders only the selected <provider>
  install tab panel" runs for each option. It clicks every tab and asserts that exactly one
  `role="tabpanel"` exists, that its `aria-labelledby` and `aria-controls` pairing is correct, and
  that it holds that tab's commands.
- **F2 (card header).** The detail card header is now `flex flex-col`.
  - The shared heading (icon, title, description, role badge) gets the full card width.
  - The status chip and "How to install" sit on their own wrapping row below the title
    (`data-testid="ready-panel-status-row"`), so they can no longer squeeze or overlap the title.
  - The radio card and the detail card use the same heading component, and the chip and button
    are no longer in the title's row. So the title and description wrap the same way for every
    provider at the same width.
  - New spec: the heading comes first in the header, and the chip and button are in the status row.
  - The e2e chip locator `header > span` became `getByTestId('ready-panel-status')` in
    `onboarding-ready-visual.e2e.spec.ts`.
- **F3 and F4 (grid).**
  - `connection-options.ts` now owns these:
    - `CONNECTION_GRID_CLASS` is `grid grid-cols-1 lg:grid-cols-[repeat(var(--connection-cols),minmax(0,1fr))]`.
    - `connectionColumns(count)` returns 1 to 3.
    - `CONNECTION_OPTION_LIST` is a root `InjectionToken` that defaults to `CONNECTION_OPTIONS`.
  - The radio grid, the loading grid and the detail grid all bind `[style.--connection-cols]`
    from the injected list length. From `lg` up there is one column per option, at most 3; below
    `lg` the cards stack.
  - The detail grid uses `items-stretch`. The `ptah-provider-panel` host and its `<section>` are
    `h-full`, so the cards are the same height.
  - New specs:
    - A test-only list of 3 descriptors, injected through the token with a fake `test-third` id,
      renders 3 radio cards with `--connection-cols: 3` and the `lg:` template class.
    - `connectionColumns` caps at 3 and never goes below 1.
    - The real list renders 2 columns.
    - The page detail grid has the column count, `items-stretch` and `h-full`.
  - Antigravity is not added.
- **Low.**
  - The heading input `role` is renamed `connectionRole`.
  - `roleOf()` is replaced by a `roles` computed record keyed by option id.
  - The "Not your main connection" badge border uses the existing token
    `border-[var(--ptah-border-color-strong)]`, the same one used elsewhere in the frontend.
  - The h1 focus outline is left as is: it comes from the shell's `focusHeading()`, not from this
    change.

### Files changed in this round

- `libs/frontend/onboarding/src/lib/ready/connection-options.ts`: adds the token, the grid class and `connectionColumns`.
- `libs/frontend/onboarding/src/lib/ready/connection-option-heading.component.ts`: the `connectionRole` input and the badge border.
- `libs/frontend/onboarding/src/lib/ready/install-guide-modal.component.ts`: only the active panel is rendered.
- `libs/frontend/onboarding/src/lib/ready/connection-choice.component.ts`: the injected list, `--connection-cols` and the `roles` computed. The grid constant moved out of this file.
- `libs/frontend/onboarding/src/lib/ready/provider-panel.component.ts`: the header status row, `h-full` and `connectionRole`.
- `libs/frontend/onboarding/src/lib/ready/ready-connection-step.page.ts`: the injected list, `--connection-cols` and `items-stretch`.
- Specs:
  - `ready/provider-panel.component.spec.ts`
  - `ready/connection-choice.component.spec.ts`
  - `ready/ready-connection-step.page.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-ready-visual.e2e.spec.ts`: the chip locator.

### Checks (exact results)

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath` on these specs:
  - `ready/provider-panel.component.spec.ts`
  - `ready/connection-choice.component.spec.ts`
  - `ready/ready-connection-step.page.spec.ts`
  - `ready/connection-choice.store.spec.ts`
  - `shell/onboarding-shell.component.spec.ts`
  - `onboarding.routes.spec.ts`

  Result: `Test Suites: 6 passed, 6 total`, `Tests: 100 passed, 100 total`.
- `npx tsc --noEmit -p libs/frontend/onboarding/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit -p libs/frontend/onboarding/tsconfig.spec.json`: exit 2, with the same 12 errors
  as before. None of them is in a changed file.
- `npx eslint <14 changed .ts files>`: exit 0, `29 problems (0 errors, 29 warnings)`.
  - 27 warnings are `explicit-member-accessibility`, which the lib's existing code also triggers.
  - 2 warnings are `template/conditional-complexity` on the existing notice bindings in
    `connection-choice.component.ts`.
- Not run, per the lane rules: the template compile and the visual run.
  - jsdom loads no Tailwind, so the F1 `[hidden]` versus `.grid` cascade and the F2 and F3 layout
    need a check in the next Electron visual pass.
  - The `lg:grid-cols-[repeat(var(--connection-cols),minmax(0,1fr))]` arbitrary class is a literal
    in `connection-options.ts`. The renderer's Tailwind content globs (`createGlobPatternsForDependencies`)
    should pick it up, but this needs to be confirmed in the build.
