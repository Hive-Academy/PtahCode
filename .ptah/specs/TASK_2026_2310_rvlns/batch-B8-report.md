## Frontend implementation — `TASK_2026_2310_rvlns`, batch B8

**Tasks completed**: B8 / component C13 — the Reviews settings drawer is rebuilt on `ptah-native-drawer`, the confirm dialogs move to the top layer, the Repositories and Bot identity sections are restyled, and the page wires the lanes data in.

**Files** (all under `D:\projects\PtahCode\.claude-worktrees\review-lane-pool\libs\frontend\review-runs-ui\src\lib\components\`):

- MODIFIED `review-settings-drawer.component.ts` — rewritten.
  - Removed: `AfterViewInit`/`OnDestroy`, `returnFocus`, `onKeydown` (the drawer's own Tab trap and Escape), and the inputs `repository`, `settings` and `minimumSeverity`.
  - Added: `focusTitle()`, which runs on the native drawer's `opened` output.
  - New inputs: `lanes` (required), `laneListing`, `laneListState` and `lanesSaveError`. New outputs: `lanesChanged` and `retryLanes`.
  - The repository, token, pause and confirmation logic is unchanged.
- MODIFIED `review-settings-drawer.component.html` — rewritten.
  - Shell: `<ptah-native-drawer [isOpen]="true" widthClass="w-full max-w-xl" ariaLabel="Review settings" [showCloseButton]="false" [closeOnBackdrop]="false" (opened)="focusTitle()">`.
  - Header (`drawer-header`): `GitPullRequest` icon, `h2#review-settings-title` with `tabindex="-1"`, the subtitle, and a Lucide `X` `ptahIconButton` labelled "Close review settings".
  - Body: the loading and error state panels, then six sections in order: Repositories, Maintainers, Review thresholds (the severity note), Review lanes (`ptah-review-lanes-section`), GitHub bot identity, Publication (with the `Pause` icon and the hint).
  - Every section except the first carries its own `mt-5 border-t border-base-300 pt-5`. No sibling selector is used.
  - Footer (`drawer-footer`): the save error sits in `@if (saveError())` as `ptah-alert tone="error" compact live="assertive"`. The primary Save button carries the `Save` icon. Save is disabled while saving or loading. The footer is hidden in the error state.
  - The four confirm dialogs are siblings after `ptah-native-drawer`, so they sit outside its panel.
  - The "Effective repository configuration" section is removed (D10).
- MODIFIED `review-confirm-dialog.component.ts` — the root is now `#layer popover="manual"`. `showPopover()` runs in `ngAfterViewInit`, guarded the same way as `native-drawer.component.ts:293-302` (typeof check, `:popover-open`, try/catch).
  - The UA popover reset is copied from `native-drawer.component.ts:137-152`.
  - The panel is now `bg-base-100 border border-base-300 rounded-box shadow-2xl` instead of `.surface-1`. The backdrop stays `bg-black/60`.
  - Unchanged: `dialogId` and `-description`, h2 focus, Escape `stopPropagation`, the Tab cycle and focus return.
- MODIFIED `review-confirm-dialog.component.spec.ts` — added "popover shown + opaque panel + description id" and "Escape stops propagation". The existing trap/Escape/restore test is kept.
- MODIFIED `review-repositories-editor.component.ts` — design 3.1:
  - `GitBranch` header and the Fork PR text moved into the section description.
  - Cards are `rounded-box border border-base-300 bg-base-200 p-3`.
  - Remove is an icon-only `Trash2` `ptahIconButton` xs with `label="Remove {owner}/{name}"`.
  - "Add repository" is a ghost button with a `Plus` icon.
  - The error line is `role="alert"` with a `bg-state-err` square and text in `text-base-content`.
  - Ids, copy and outputs are unchanged.
- MODIFIED `review-repositories-editor.component.spec.ts` — added one test for the Remove name, the error alert, the id and the card class.
- MODIFIED `review-bot-identity.component.ts` — design 3.4:
  - `Bot` header and description.
  - Plaintext warning, identity error and credential error are now `ptah-alert live="assertive"`, so they keep `role="alert"`.
  - Three status states use `ptah-status` online / warning / offline, with the copy verbatim.
  - The field label is "Connect bot token" / "Replace bot token".
  - Save token is `outline` + `KeyRound` and disabled while saving. Verify connection is `outline` + `ShieldCheck` and always shown. Remove connection is `ghost` + `Unplug` and shown only with a token.
- MODIFIED `review-runs-page.component.ts` — dropped `[repository]` and `[settings]`.
  - Added `[lanes]="store.draftLanes()"`, `[laneListing]`, `[laneListState]` and `[lanesSaveError]="store.lanesSaveError()"`.
  - Added `(lanesChanged)="store.updateDraftLanes($event)"` and `(retryLanes)="store.loadLanes()"`.
  - `openSettings()` now also calls `store.loadLanes()`.
- MODIFIED `review-runs-page.component.spec.ts` — the `getSettings` mocks gain `lanes`. A new test covers open: `review:listLanes` is called, the drawer receives `draftLanes`, `laneListing` and `laneListState`, `lanesChanged` goes to `draftLanes`, `retryLanes` calls `listLanes` again, and after X the drawer is gone and focus is back on the "Review settings" header button.
- MODIFIED `review-settings-drawer.component.spec.ts` — rewritten, 21 tests:
  - Shell: dialog named "Review settings" inside `ptah-native-drawer`, `popover="manual"`, no native close button, title focused after `opened`; X and Escape close and a backdrop click does not; native Tab wraps last→first and Shift+Tab first→last; focus returns to the opener when a host `@if` destroys the drawer.
  - Load states: loading panel with Save disabled; error panel whose Retry emits `retry`, with the footer hidden.
  - Sections: order of the six headings; the severity note replaces the old "Minor" assertion (D12); the placeholder is absent; every parity id and `Remove {repo}` aria-label is present; no `.surface-1/2` class.
  - Field wiring: the attestor field writes `store.attestorLogin`; maintainer logins, the four number fields and the polling checkbox emit `changed`.
  - Lanes section wiring: Retry emits `retryLanes`; the lanes save error is shown.
  - Footer save error is `@if` plus an assertive alert, with "Saving…" disabled.
  - Bot identity: the three states, the Connect/Replace label, Remove only with a token, Remove confirmation calls `clearBotToken`, Verify calls `loadBotIdentity`, the plaintext/identity/credential alerts, and Save token disabled while saving.
  - Confirm flows: password cleared and resume confirmation; immediate global pause; confirm dialogs outside the panel inside a `popover="manual"` root, where Escape cancels the dialog and does not close the drawer; replace-token re-attests live; replace-token asks for confirmation first.
  - Repositories: add validation and duplicate check, the disabled dry-run, Remove via the icon button, and the immediate per-repository pause RPC.

**Stack observed**:
- Angular standalone + OnPush + `input()`/`output()`/`signal()` (siblings in the same folder).
- `ptah-native-drawer` from `@ptah-extension/ui` (`libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts`).
- `PtahAlertComponent`, `PtahStatusComponent`, `PtahIconButtonDirective`, `PtahButtonDirective` (`outline` exists in `button.types.ts:2`), `PtahFieldComponent` (`appearance` input) and `PtahStatePanelComponent` from `@ptah-extension/ui`.
- Lucide icons via `LucideAngularModule` + `[img]`. Every icon name was checked in `node_modules/lucide-angular/icons/lucide-icons.d.ts`.
- Lane types from `@ptah-extension/review-contracts`. `ReviewLaneListState` comes from B6 `review-lane-options.ts`.

**Design fidelity**: `design-spec.md` revision 3, sections 1, 2, 3 and 8, checked against `screenshots/proto-ptah-glass-pins-top.png` / `-pins-bot.png`. Deviations:
- All drawer `ptah-field`s use `appearance="stacked"`. The threshold fields were `floating` before. The prototype shows labels above the boxes in every section.
- The section descriptions ("Who may attest live publication.", "The bot that posts review comments.") and the Publication hint "Turning pause off asks for confirmation." are new copy taken from design 3.2, 3.4 and 3.5.
- The confirm dialog title keeps the old `text-xl`, because the design names no size.

**States covered**:
- Loading: state panel, Save disabled.
- Error: state panel with Retry, footer hidden.
- Ready: six sections.
- Repositories: empty text, the error line, the disabled dry-run.
- Bot identity: three states, the plaintext warning, identity and credential errors, saving.
- Footer: save error and saving.
- Lanes: all lane states come from B6, through its inputs.
- Accessibility:
  - The dialog name is "Review settings" (`aria-label`).
  - Initial focus is on the title.
  - The native drawer owns the Tab trap, Escape and focus restore.
  - Escape inside a `ptah-select` list (`rich-select.component.ts:248-251`) or a confirm dialog stops propagation. Confirm dialogs are outside the panel, so their keydown never reaches the drawer handler.
  - Every icon is `aria-hidden`. Icon-only buttons are `ptahIconButton` with a required `label`.
  - Alerts use `live="assertive"`.

**Verification**:
- `node scripts/verify.mjs --exec --task b8-jest -- npx jest --config libs/frontend/review-runs-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath <drawer, confirm, repositories-editor, page specs>`: **Test Suites: 4 passed; Tests: 34 passed**. No console error and no NG0 output (`.ptah/tmp/b8-jest.log`).
- After the non-null-assertion fix, the drawer spec was re-run: 21/21 passed (`.ptah/tmp/b8-jest2.log`).
- `node scripts/verify.mjs --exec --task b8-tsc -- npx tsc --noEmit --project libs/frontend/review-runs-ui/tsconfig.lib.json`: exit 0 (`.ptah/tmp/b8-tsc.log`).
- `node scripts/verify.mjs --exec --task b8-ngc -- npx ngc --noEmit --project libs/frontend/review-runs-ui/tsconfig.lib.json` (strict templates of the lib): exit 0 (`.ptah/tmp/b8-ngc.log`).
- `npx eslint <10 changed files>`: 0 errors, 77 `explicit-member-accessibility` warnings, the same style as the siblings (`.ptah/tmp/b8-eslint.log`).
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0, 0 counts over baseline (`.ptah/tmp/b8-uiclass.log`). `review-bot-identity.component.ts` dropped to 0 tokens, so its baseline entry can be pruned.
- Not run, because nx is not allowed for this lane:
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. The coordinator should run it, since the renderer now compiles these templates.
  - The full `review-runs-ui` test target.
- Not run: the e2e baseline `review-settings-before-*` regeneration, the park-point check and the Electron visual review. These belong to the visual-review phase (plan C13).

**Plan deviations**:
- The drawer also takes `lanesSaveError`, which goes to the section `saveError`. The plan's input list omitted it, but B5 and B6 "For B8" require `store.lanesSaveError()`. The section `saving` input is bound to the drawer's `saving()`.
- The drawer's own `retry` output and `loadState` are unchanged. Lane retry is a separate `retryLanes` (design 9.7).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Stacked labels for all drawer fields | keep floating on thresholds / stacked | Prototype screenshots show labels above every box | yes |
| Footer hidden in the load-error state, Save disabled while loading | always show footer | design-spec section 1 "Load error … footer hidden", "Loading … Save disabled" | yes |
| `lanes` is `input.required` | default to empty lanes | The page always binds `store.draftLanes()`; a missing binding is a compile error, not silent empty lanes | yes |
| Host elements of the section components get `class="block"` | inline custom-element hosts | Keeps the `mt-5` and the divider layout predictable | yes |

**Out-of-scope observations**:
- `tools/ui-class-audit/baseline.json` has a stale entry for `review-bot-identity.component.ts`, which now has 0 tokens. Pruning it needs `--update-baseline`, and that file is outside the B8 write set.
- `review-runs-page.component.ts` still renders the page-level pause error as raw `alert alert-error` (baselined, not part of the drawer). It could become `ptah-alert` in a later change.
