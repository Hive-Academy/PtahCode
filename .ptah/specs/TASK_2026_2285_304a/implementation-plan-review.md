# Implementation plan review (TASK_2026_2285_304a)

Reviewer note: the review stopped early on a session budget limit. Phase 1 and the Phase 3 batch table were checked
against the code. Sections 2.6-2.8, the plan's Risks / Out of scope / Decisions / Clarifications sections and the e2e
harness files were not read. See `## Not checked`.

Path prefixes as in the plan: `UI/` = `libs/frontend/ui/src/lib/`, `CH/` = `libs/frontend/chat/src/lib/settings/`,
`PA/` = `CH/ptah-ai/`, `PR/` = `CH/providers/`.

## Verdict

REVISE: 3 Serious items (the plan does not follow decision 26 and spec line 90; the setting-row blast radius omits 8
callers; B3.6 has an undeclared dependency on B3.7). No Blocking item. Phase 1 primitives match the code.

## Blocking

None found in the parts that were checked.

## Serious

1. **Plan 3.5 (line 608-609), 3.7 "Group gap", Risks (line 855), header line 3: the plan does not follow decision 26
   and the spec.**
   - Evidence: the plan header cites "`decisions.md` rows 6-25". Rows 26-28 exist (`decisions.md` rows 26, 27, 28).
   - Kind badges: `design-spec.md:90` and decision 26 require COLOURED TEXT (`kind-cli` text `info`, border `info/50`;
     `kind-ptah` text in the warm gold accent, border 55%; a per-theme shade with contrast >= 4.5:1; "do not fall back
     to one colour"). Plan 3.5 says: border `info/50`, fill `info/10` / border `accent/50`, fill `accent/10`, "text
     `base-content`". Plan line 855 repeats "text stays `base-content`". This contradicts a user instruction
     (decision 16) as fixed by decision 26.
   - Group gap: `design-spec.md:90` and decision 26 require `padding-top: 1.75rem` on the second group header. Plan
     3.7 uses a spacer `<tr aria-hidden="true">` of height `--ptah-gap-field` (= `--ptah-space-4`,
     `UI/tokens/ptah-tokens.css:23`, about 1rem).
   - Reorder mode: decision 26 says an expanded detail closes in Reorder mode and lanes that are not enabled stay in
     the list. A search of the plan for "kind-cli", "1.75rem" and "decision 26" found only lines 608 and 855, so no
     text for these two rules was found (the search for the Reorder wording itself did not finish: see Not checked).
   - Change required: update the header to rows 6-28. Rewrite the 3.5 badge bullet and the line 855 risk to the
     coloured-text rule of spec line 90. Change the 3.7 gap to `padding-top: 1.75rem` on the second group header (and
     drop or justify the `lanes-group-gap` test id). Add to 3.7 Reorder mode: "an expanded detail closes; lanes that
     are not enabled stay in the flat list", with one test each in `lanes-table.component.spec.ts`.

2. **Plan "Blast radius" (Phase 1), row `PtahSettingRowComponent`: the caller list is not complete for a change that
   alters every caller.**
   - Evidence: 1.7 changes the default rendering of every row (`justify-end` on `[data-ptah-setting-control]`,
     `first:[&>div]:pt-0 last:[&>div]:pb-0`). The table lists 2 callers (`cron-job-form`, gallery) under the heading
     "Callers outside `CH/`". There are 11 more callers inside `CH/`. Three are edited in Phase 2
     (`advanced/advanced-settings-group`, `pro-features/agent-behaviour-section`, `pro-features/claude-builtins-config`).
     Eight are on Settings pages that no phase touches: `PA/go-vet-consent-config.component.ts`,
     `PA/host-routing-setting.component.ts`, `PA/lane-rotation-setting.component.ts`, `PA/local-stt-panel.component.ts`,
     `PA/local-tts-panel.component.ts`, `PA/session-budget-settings.component.ts`, `PA/voice-config.component.ts`,
     `PA/web-search-config.component.ts` (grep `<ptah-setting-row` over `libs` and `apps`). A row that is alone in its
     parent is both first and last child, so it loses its top and bottom padding (today `py-ptah-field` /
     `py-ptah-controls`, `UI/patterns/setting-row/setting-row.component.ts:25-26`).
   - Change required: list the 8 files in the blast-radius row. Either (a) make the first/last padding rule and
     `justify-end` opt-in (an input, default = today's rendering) and set it in the Phase 2 callers, or (b) keep the
     default-on change and add an Electron visual check of Voice, Web search, Session budget, Host routing, Lane
     rotation and Go vet consent to the B1.4 acceptance.

3. **Plan Phase 3 batch table, B3.6 "Depends on: none": B3.6 removes API that `lanes-table` still uses until B3.7.**
   - Evidence: 3.6 deletes the detail output `redetect`, narrows `openKind` / `kindToggled`, deletes the
     info / capabilities / permission popovers, and narrows `CliProviderInfoKind` to `'install'`
     (`PA/cli-provider-card-popovers.component.ts:9` is `'info' | 'capabilities' | 'permission' | 'install'` today).
     The consumers are not in the B3.6 write set: `PA/lanes-table.component.html:169` calls
     `showDetail(row, 'capabilities')`, `:413-422` binds `[openKind]`, `(kindToggled)` and `(redetect)`;
     `PA/lanes-table.component.ts:182,198,205,211` use the type. `PA/ptah-cli-instances.component.html` (4 popovers,
     rendered by `cli-orchestration-matrix.component.ts:209` until B3.9) was not checked for
     `ptah-cli-provider-card-popovers` kinds. The plan's own Phase 3 blast radius says the detail change is handled by
     "B3.7". So after B3.6 and before B3.7, `lanes-table.component.spec.ts` / `lanes-table.visual.component.spec.ts`
     tests of the detail popovers and the `typecheck-templates` target are expected to fail. The same applies to B3.5
     (status and identity markup change; the table specs `:807,:839,:857` are updated only in B3.7). The coordinator's
     inner loop (`npm run verify -- --related`) after B3.5 or B3.6 will then report failures that the plan does not
     predict.
   - Change required: choose one. (a) Fold the removal of `redetect`, the `openKind` narrowing and the
     `CliProviderInfoKind` narrowing into B3.7 (B3.6 only adds the inline facts, the disclosure, the Copilot row and
     the `[footer-actions]` slot, and keeps the old inputs/outputs as unused). (b) Keep B3.6 as it is, set
     "B3.7 must follow B3.5 and B3.6 before any coordinator check of `@ptah-extension/chat`", and list the table specs
     that are expected red in that window.

## Minor

1. **1.5 Drawer** names the input `showClose` (line ~213). The real input is `showCloseButton`
   (`UI/native/drawer/native-drawer.component.ts:213`). Fix the name.
2. **1.9 opt-out table, `chat-input.component.ts`**: the "own cap" `max-h-[calc(8lh+1rem)]` is on the composer textarea
   (`chat-input.component.ts:298`), not on the popover. The popover (`:353-381`) is a `w-44 p-1` attach menu with no
   own cap. The opt-out is harmless but its reason is false. Remove this row (5 opt-outs) or state the real reason.
3. **Blast radius, `FloatingUIService.position()`**: the caller list (dropdown, autocomplete, popover) is not complete.
   Other users of the service: `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-tabs.component.ts`,
   `libs/frontend/chat/src/lib/components/file-suggestions/unified-suggestions-dropdown.component.ts`,
   `libs/frontend/command-center/src/lib/components/command-overlay.component.ts` and `command-overlay-positioner.ts`,
   `UI/form-controls/rich-select/rich-select.component.ts`. No effect (the option is absent), but list them.
4. **Blast radius, `NativePopoverComponent`**: `UI/overlays/popover/popover.component.ts` is a CDK overlay
   (`selector: 'ptah-popover'`, `cdkConnectedOverlay`); it only names the native popover in text. It is not a caller.
   `UI/surfaces/field.component.ts:114` is a real caller (the field info popover), so every `ptah-field` with `info`
   gets the cap: harmless (short text).
5. **Blast radius, `NativeModalComponent`**: one more caller inside `CH/` is not named anywhere in the plan:
   `PR/accounts/account-detail-view.component.ts`. It stays `plain`, so nothing breaks; state that it stays `plain`.
6. **1.3 `.ptah-popover-capped { overflow-y: auto }`**: with `overflow-y: auto` the used value of `overflow-x` is also
   `auto`, so content that paints outside the panel box is clipped (for example `shadow-lg` on the projected card in
   `chat/.../app-shell.component.html:258-262`; the panel padding is `p-2`). Nested dropdown / autocomplete panels are
   safe: they render in the top layer (`native-dropdown.component.ts:77`, `native-autocomplete.component.ts:97`). Add
   to B1.2 acceptance: an Electron check of the New Session popover, the canvas rail card popovers and the
   send-to-messaging picker (callers that keep the default cap).
7. **Phase 1 Tests**: the plan says tests that query `.modal-box > [modal-header]` break. No such query exists in
   `native-modal.component.spec.ts` (grep for `modal-box >` and `:scope >` returns nothing). No action; the text is a
   guess.
8. **2.5 / B2.4**: 2.5 says Notices and the parity section "get `TriangleAlert`", but
   `CH/output-style/output-style-notices.component.ts` and `output-style-parity-section.component.ts` are in no batch
   write set. Add them to B2.4 (6 files) or delete the sentence.
9. **B3.4 to B3.10 window**: `ptah-lanes-redetect-button` renders `policy-redetect` in the CLI group header (B3.7)
   while `agent-orchestration-config` still renders its own `policy-redetect` until B3.10. Two elements with one test
   id exist in the matrix for B3.7-B3.9. State it, or use a temporary id until B3.10.
10. **B3.10 / B3.11 checks**: the text says "run the whole `PA/` spec folder" but the command lists 3 specs. Either list
    all `PA/` specs or change the text.
11. **B3.10 / B3.11 and decision 28**: the zero-reference grep is written as an acceptance check after the delete
    (`grep -rn "LaneOrderListComponent" libs`, `grep -rn "PtahCliInstancesComponent\|CliSharedDefaultsComponent" libs apps`).
    Decision 28 says the check comes first. Write it as step 1 of each batch, add `apps` to the B3.10 grep, and also
    grep the selectors (`ptah-lane-order-list`, `ptah-cli-instances`, `ptah-cli-shared-defaults`) in `.html` and the
    e2e harness.
12. **Batch size**: no batch has more than 6 write files. B3.7 writes `lanes-table.component.spec.ts` (895 lines) and
    `lanes-table.visual.component.spec.ts` (712 lines) plus the 577-line template in one batch; B3.10 writes
    `agent-orchestration-config.component.spec.ts` (931 lines). Consider moving the visual spec rewrite of B3.7 to its
    own batch after B3.7.

## Claims checked

| # | Claim (plan section) | True/False | Evidence |
|---|---|---|---|
| 1 | `--ptah-surface-pad` at line 28, `--ptah-card-padding-lg: 1.25rem` at line 420 (1.1) | True | `UI/tokens/ptah-tokens.css:28`, `:420` |
| 2 | `content` glass rule at about line 3238 of `styles.css` (1.2) | True | `apps/ptah-extension-webview/src/styles.css:3238` |
| 3 | `.settings-page` is the settings scroll container at `settings.component.html:1` (scope note 2) | True | `CH/settings.component.html:1` |
| 4 | Copies with `padding: 0 1.25rem` at `voice-config:169`, `go-vet-consent-config:264`, `voice-elevenlabs-summary:42` (1.2) | True | rule bodies at `:170`, `:265`, `:43` |
| 5 | "14 Settings components already set 1.25rem" (blast radius) | Mostly true | 14 files have a `[data-glass-surface='content']` padding rule; 11 use `1.25rem`, 3 use `0 1.25rem`. Others pad by test id with the same value (`cli-orchestration-matrix.component.ts:239-241`, `ptah-cli-instances.component.ts:77-79`, `providers-settings.component.ts:641-644`) |
| 6 | `position()` middleware is `offset → flip({boundary}) → shift(...)`; `FloatingUIOptions` has no height option (1.3) | True | `UI/native/shared/floating-ui.service.ts:41-80,163-175` |
| 7 | Popover inputs/outputs to keep: `isOpen`, `placement`, `anchor`, `offset`, `hasBackdrop`, `backdropClass`, `keepInViewport`, `opened`, `closed`, `backdropClicked`, `reposition()` (1.3) | True | `UI/native/popover/native-popover.component.ts:160-215,417` |
| 8 | `.ptah-popover-layer` has `max-height: none` at about line 131 and is the top-layer shell, not the panel (1.3) | True | `native-popover.component.ts:124-131`; panel is `#floatingRef` `:105-112` |
| 9 | `positionPanel()` calls `floatingUI.position` and `revealUnpositioned()` exists (1.3) | True | `native-popover.component.ts:358,376-396` |
| 10 | Modal has `size` map `sm/md/lg` = `max-w-sm/lg/2xl`, three `ng-content` slots in `.modal-box`, `FOCUSABLE` query on `.modal-box` (1.4) | True | `UI/native/modal/native-modal.component.ts:59-65,82-86,190-191` |
| 11 | Drawer close is a `×` text glyph at about line 105 with `data-testid="native-drawer-close"`, `aria-label="Close panel"` (1.5) | True | `UI/native/drawer/native-drawer.component.ts:101-105` |
| 12 | Drawer input is named `showClose` (1.5) | False | `native-drawer.component.ts:213` `showCloseButton` |
| 13 | `form-section` has `wide` and `WIDE_CLASS`; no `icon` input today (1.6, scope note 4) | True | `UI/patterns/form-section/form-section.component.ts:18,109-124` |
| 14 | `settings-layout.component.ts:15` imports `LucideAngularModule, type LucideIconData` (1.6) | True | `settings-layout.component.ts:15` |
| 15 | `stateMark` exists at `:63-67` and renders at `:195-200`; main column at about `:214` (1.8, scope note 5) | True | `settings-layout.component.ts:63-67,195-199,212-214` |
| 16 | Setting row: `[data-ptah-setting-control]` wrapper, `hintId` computed, slots `[status]`, `[meta]`, default; no `[action]` slot today (1.7) | True | `UI/patterns/setting-row/setting-row.component.ts:23-55,58-70` |
| 17 | 15 popover caller files outside Settings (blast radius) | True in count; 1 of the 15 is not a caller | grep `<ptah-native-popover` over `libs`, `apps`: 15 files outside `CH/`; see Minor 4 |
| 18 | The 6 opt-out callers have an own height cap (1.9) | 5 true, 1 false | `session-filter-bar:171`, `draft-comments-bar:74`, `harness-health-badge:107`, `capPopoverHeight` in `PR/main-agent-reassign-popover.component.ts:680` and `PR/decision-model-row.popover.ts:30`; `chat-input` false (Minor 2) |
| 19 | Default-on cap is safe for unlisted callers | True with one visual risk | No unlisted caller outside Settings has an own `max-h` on its popover content (`canvas-rail-card`, `orchestra-canvas`, `mcp-status-chip`, `send-to-messaging`, `app-shell.html`, `deny-message-popover`, `provider-limit-card`, `comparison-bar`, `removal-lock-badge`). Inside Settings, `PA/lanes-table-detail.component.html:269` (`max-h-72`), `PR/providers-settings.component.ts:308` (`max-h-64`) and `PA/agent-orchestration-config.component.html:129` have inner caps and keep the default: a nested scroll is possible only in a very short window. Clipping risk: Minor 6 |
| 20 | Modal callers outside `CH/`: `task-create-dialog`, `quarantined-agents-panel`, `reconcile-guard`, `stack-skill-consent`, `editable-section` (blast radius) | True | grep `<ptah-native-modal\|NativeModalComponent`; in `CH/` there is a 4th caller (Minor 5) |
| 21 | Drawer callers outside `CH/`: 8 files (blast radius) | True | grep `<ptah-native-drawer`: marketplace 3, skill-synthesis-ui 2, tasks-ui 1, cron-scheduler-ui 2 |
| 22 | `FloatingUIService.position()` callers are only dropdown, autocomplete, popover (blast radius) | False | Minor 3 |
| 23 | `PtahFormSectionComponent` callers outside `CH/`: `settings-layout`, gallery (blast radius) | True | grep `<ptah-form-section` |
| 24 | `PtahSettingRowComponent` callers: `cron-job-form`, gallery (blast radius) | Incomplete | Serious 2 |
| 25 | `PtahSettingsLayoutComponent` callers: gallery (+ `CH/settings.component.html`) | True | grep `<ptah-settings-layout` |
| 26 | Spec sizes: `floating-ui.service.spec.ts` 465, `native-popover.component.spec.ts` 711, `native-modal.component.spec.ts` 357 lines (Tests) | True | `wc -l` |
| 27 | Phase 3 file sizes: `lanes-table.component.spec.ts` 895, visual spec 712, `agent-orchestration-config.component.spec.ts` 931, `lane-order-list.component.ts` 263, `cli-orchestration-matrix.component.ts` 684 | True | `wc -l` |
| 28 | `CliProviderInfoKind` is used by `lanes-table.component.ts:50` and `lanes-table-detail.component.ts` (Phase 3 blast radius) | True | import at `lanes-table.component.ts:49`; uses `:182-211`; detail `:30,77,91,97,102` |
| 29 | `ptah-cli-instances` is rendered only by the matrix | True | `PA/cli-orchestration-matrix.component.ts:209` (only `<ptah-cli-instances` element) |
| 30 | Batches of one phase are file-disjoint or ordered | True for files | Phase 1: B1.1-B1.6 disjoint. Phase 2: B2.1-B2.8 disjoint; B2.2 → B2.1 and B2.8 → B2.1, B2.7 stated. Phase 3: `lanes-table.{html,ts,css}` in B3.2 and B3.7 (B3.7 depends on B3.2); `lane-order-list.component.ts` in B3.3 and B3.10 (ordered through B3.7, B3.9); `cli-provider-card-popovers` written in B3.6, read in B3.8 (ordered). Not true for API consumers: Serious 3 |
| 31 | Each batch names its Nx project and focused check commands | True | Phase 1 per batch; Phase 2 and 3 one command template per phase with the jest config and tsconfig paths. B1.5 runs jest for chat and git-ui; B3.12 runs `tsc` and `eslint` only (e2e not run) |
| 32 | Lanes do not run `npm run verify` or `nx` (rule 6) | True | plan lines 195, 503-504, "Focused checks per batch (lanes run only these)"; `npm run verify` appears only as "Coordinator gate" |
| 33 | No backend RPC change (decision 9) | True in the parts read | 2.9 `toggleGroup` reuses `agent:setClaudeBuiltin` per id; Phase 3 header lists existing RPCs, "No new RPC" |
| 34 | No VS Code / TUI feature work | True | plan line 184-185 and Phase 3 "Not affected" |
| 35 | Phase order: 2 and 3 depend only on Phase 1 | True | Phase table lines 24-26; Phase 2 "Depends on Phase 1"; Phase 3 "Depends on Phase 1". No reference from Phase 1 or 2 to a later phase was found. Phase 1 alone leaves the 14+ Settings padding copies in place (same value), so it ships alone |
| 36 | Removals stay inside R-1..R-3 | True in the parts read | `design-spec.md:222-227`. Plan removals: not-installed row controls (R-1, 3.7/3.8), `ptah-cli-instances` card list (R-2, 3.11), pencil popover, kebab Details, hidden install link (R-3, 3.2/3.5/3.7/3.10). `cli-shared-defaults` and `lane-order-list` are deleted after their controls move (decision 28). Kebab "All capabilities" and Tiers/Edit/Delete move, they are not removed (decisions 20, 23) |

Parity sample (decision keep / move → place in the plan):

| Row | Capability | Place in the plan | OK |
|---|---|---|---|
| P-8 | Drag reorder + up/down | 3.3 `LaneOrderDrag`, 3.7 Reorder mode (grip + up/down), tests "decisions 14, 18 Reorder" | Yes |
| P-21 | Order buttons per row, focus kept, cross-group move | 3.7 Reorder mode; test "P-21 cross-group move" | Yes |
| P-66 | Copilot auto-approve switch with Undo | 3.6 left column; test "P-66 Copilot switch" | Yes |
| P-50 / P-53 | All capabilities (system and instance) | 3.6 `ptah-disclosure` "All capabilities"; 3.8 strip "Details"; test "decision 20" | Yes |
| A-26 | Applies note, load / unverified-policy error + Retry | 2.9 States; ids `claude-tools-applies-note`, `claude-tools-load-error`, `claude-tools-load-retry` kept | Yes |
| A-27 | Undo and focus keeping on toggle failure | 2.9 "Keep: `toggle` :376-401 unchanged ... `keepFocus` :454-464"; group `saveGeneric({ write, undo })` | Yes |
| A-9 | Log out with inline confirm | 2.3 premium state, handlers `:562-600` kept | Yes |
| A-3 | Import settings with inline confirm | 2.2 keep; 2.3 "Settings backup" row | Yes |
| A-10 | Key-not-active alert action | 2.3 M-9: copy moves to the row hint, same trigger; `LIC.spec:190` rewritten | Yes |
| P-32 | Instance Delete with inline confirm, focus return | 3.7 detail footer (`pendingDelete`, `LanesTableDeleteFocus`) | Yes |
| P-55 | Reset to default | 3.7 `[footer-actions]` Reset, id `lanes-detail-reset-default` | Yes |
| U-6 | Install guide popover with Re-detect | 3.8 strip Install popover, `redetect` output | Yes |
| P-65 | Catalog hint popover | 3.1 "gets the Phase 1 cap with no edit" | Yes |
| P-61 | Never-shown instance card list | deleted, R-2 (3.11) | Yes (approved removal) |

Tests: the plan lists the existing specs that break per phase with line numbers (Phase 1 lines 189-203, Phase 2 table,
Phase 3 table), the test ids that change per phase, new tests for moved capabilities (strip, Reorder, group defaults,
Copilot switch, detail footer) and the e2e harness ids (3.12, B3.12). The line numbers inside the specs were not opened.

## Not checked

- Plan sections 2.6, 2.7, 2.8 (output style editor, system prompt drawer, other sections) and the plan sections
  `## Risks`, `## Out of scope`, `## Decisions`, `## Clarifications Needed` (lines 844-900): not read.
- Reorder-mode rules of decision 26 in the plan (detail closes; not-enabled lanes stay): the last search did not run.
  Serious 1 asks for them; if the plan already has them under other words, drop that part of the item.
- Spec "Expanded detail" table (`design-spec.md:100-122`) against plan 3.6, including whether "Provider" in the detail
  repeats the Ptah row's line 2 (decision 13).
- B3.12: existence of the 4 harness files and `workspace-settings.shot.ts`, and the ids they use
  (`policy-order-edit`, `policy-order-popover`, `cli-provider-card-*`).
- Zero-reference state of `LaneOrderListComponent`, `PtahCliInstancesComponent`, `CliSharedDefaultsComponent`, and the
  claim that no external caller uses `AgentOrchestrationConfigComponent.redetectClis()`.
- Line numbers cited for Phase 2 and Phase 3 source files and spec files (`LIC.spec:190`, `AB.spec:653`, matrix
  `:335-349` and others): not opened.
- Parity rows A-17, A-21, P-62..P-64 and the Merged controls / Gaps / recheck addendum sections of
  `parity-inventory.md`.
- `ptahTooltip` rendering (top layer or in-flow) inside a capped popover; `UI/button/tooltip.directive.ts` path.
- Whether `size` is importable from the installed `@floating-ui/dom` version.
- No test, build, `nx` or `npm run verify` command was run (by rule).
