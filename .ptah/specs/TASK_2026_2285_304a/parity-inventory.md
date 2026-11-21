# Parity inventory - TASK_2026_2285_304a

Status: COMPLETE WITH LIMITS (coordinator, 2026-11-20). Providers: V rows checked in the rows; the R rows are corrected in `## Providers recheck addendum` at the end of the file (P-64, P-65 still not checked). Advanced: A-1..A-31 checked; A-32 (Setup card) and A-33 (shell navigation) are not checked and the redesign keeps them unchanged (`keep`, `same`). The notes below describe the first pass:

- Providers page: the rows marked **V** were checked against the source in this worktree (line numbers are current).
  The rows marked **R** come from `ui-review-providers.md` and were not checked again.
- Advanced page: every row is **R** (from `ui-review-advanced.md` "Capabilities to preserve"). They were not checked again.
- Test column: no spec test name was opened. A spec file is named only where it exists in the folder listing.
  "spec exists (name not verified)" does not prove that a test covers the capability. The `## Gaps` section lists what a
  follow-up pass must confirm.

Path prefixes: `PA/` = `libs/frontend/chat/src/lib/settings/ptah-ai/`, `PR/` = `libs/frontend/chat/src/lib/settings/providers/`,
`CH/` = `libs/frontend/chat/src/lib/settings/`, `CORE/` = `libs/frontend/core/src/lib/services/`.
Write path for the Lanes page (V): every write calls `ProvidersSettingsStateService.saveSettings` (`CORE/providers-settings-state.service.ts:906`)
through `SettingsSaveFeedbackService.save` (Undo + toast). That call becomes one of these RPCs: `ptahCli:create|update|delete`
(`CORE/providers-commit.service.ts:230,239,242`), `agent:setConfig` (`CORE/providers-commit.service.ts:190`; lane defaults
`CORE/providers-lane-default-operations.ts:48`), `provider:setModelTier` / `clearModelTier` (`CORE/providers-commit.service.ts:263,271`).

## Providers page

### Section header and policy bar

| # | Capability | Where today | Backing RPC / store | Decision | New location | Test | Src |
|---|---|---|---|---|---|---|---|
| P-1 | "Lanes" heading + count badge (`total` = installed + uninstalled rows) | `PA/lanes-section-header.component.ts:21-26`; total from `PA/cli-orchestration-matrix.component.ts:207-210` (`laneCounts`) | none (derived from `tableRows`) | keep | same header. **Note:** after decision 8 the count must state what it counts: table rows only, or all lanes. The implementer picks one and keeps the ring consistent | none today (not verified) | V |
| P-2 | Description "Ptah tries enabled lanes from the top..." | `PA/lanes-section-header.component.ts:27-29` | none | keep | same | none today | V |
| P-3 | Enabled ring "enabled/total" (`data-testid=lanes-enabled-count`) | `PA/lanes-section-header.component.ts:34-44` | derived `laneCounts` | keep | same | none today (not verified) | V |
| P-4 | Edit order toggle ("Edit order" / "Done editing order", `aria-pressed`) | `PA/lanes-section-header.component.ts:45-55` -> `orderMode.set(!orderMode())` in the matrix template | none (UI mode) | keep (merged, see M-1) | header, icon + label `ArrowUpDown` "Reorder" / `Check` "Done" | spec exists (name not verified): `PA/cli-orchestration-matrix.component.spec.ts` | V |
| P-5 | "New Ptah CLI instance" header button (disabled while busy / no write) | `PA/lanes-section-header.component.ts:56-66` -> `openAdd('header')` `PA/cli-orchestration-matrix.component.ts:412` | opens the Add modal; create = `ptahCli:create` | move (merged, see M-2) | Ptah CLI group header, `Plus` "Add Ptah CLI instance" | none today (not verified) | V |
| P-6 | Max concurrent agents field | `PA/agent-orchestration-config.component.html:13-30` | `agent:setConfig` via saveSettings (assumption: same path) | move | header actions, `input-sm w-20` | not verified | R |
| P-7 | Order chips with "+N" overflow | `PA/agent-orchestration-config.component.html:43-81` | derived from `preferredAgentOrder` | keep | header order line | not verified | R |
| P-8 | Reorder popover (pencil) with up/down list | `PA/agent-orchestration-config.component.html:109-160` | `savePreferredAgentOrder` `PA/preferred-agent-order-save.ts:5` -> `agent:setConfig` | remove-proposed as a separate control (merged into P-4, see M-1). The capability "change order" stays | header Reorder mode | not verified | R |
| P-9 | Re-detect CLIs button with busy spinner | `PA/agent-orchestration-config.component.html:172-200` | `state.redetectClis()` `CORE/providers-settings-state.service.ts:830` -> `agent:detectClis` (`:834`) | move | CLI agents group header (`RefreshCw` icon button) and the "Add more" strip | not verified | R |

### Table states

| # | Capability | Where today | Backing | Decision | New location | Test | Src |
|---|---|---|---|---|---|---|---|
| P-10 | Partial read error row with Retry (rows exist) | `PA/lanes-table.component.html:49-63` | `retryLanes()` `PA/cli-orchestration-matrix.component.ts:308` -> `refreshOrchestration` `CORE/...state.service.ts:804` + `refreshCliAgents` `:727` (`agent:getConfig`, `ptahCli:list`) | keep | same, add `TriangleAlert` icon | not verified | V |
| P-11 | Error text "Could not load lanes." / "Some lane data could not be loaded..." | `PA/cli-orchestration-matrix.component.ts:300-307` | derived | keep | same | not verified | V |
| P-12 | Empty row: "Loading lanes…" / error + Retry / "No lanes available." | `PA/lanes-table.component.html:554-575` | as P-10 | keep | same, icons `Loader2` / `Inbox` | not verified | V |
| P-13 | "No CLI agent is installed. Install one from the list below, then Re-detect." | `PA/cli-orchestration-matrix.component.ts:183-188` | derived | keep; the text must point to the "Add more" strip | under table / in strip | not verified | V |
| P-14 | "Loading CLI agents…" when no host read states | `PA/cli-orchestration-matrix.component.ts:189-191` | derived | keep | same | not verified | V |
| P-15 | Host read states slot (per-source loading/retry) inside the card, outside `aria-busy` | `PA/cli-orchestration-matrix.component.ts:193-195` | host projection | keep | same card | not verified | V |
| P-16 | `aria-busy` on the matrix while loading | `PA/cli-orchestration-matrix.component.ts:151-156` | derived | keep | same | not verified | V |
| P-17 | Collapsed layout under 950px (fewer columns, Permission/Network/Model move into the detail) | `PA/lanes-table.component.html:7,11-21,428-481` | none | keep | same | not verified | V |
| P-18 | Model column in collapsed mode when pane >= 640px (ResizeObserver) | `PA/lanes-table.component.ts:216-224` | none | keep | same | not verified | V |
| P-19 | Live announcement of the test result through the table | `PA/lanes-table.component.ts` constructor `effect(testAnnouncement)` (216-263) | none | keep | same | not verified | V |

### Lane row (installed CLI agent and Ptah CLI instance)

| # | Capability | Where today | Backing | Decision | New location | Test | Src |
|---|---|---|---|---|---|---|---|
| P-20 | Order number (`row.order`, global over both kinds) | `PA/lanes-table.component.html:90-92`; numbering `PA/cli-orchestration-matrix.component.ts:199-206` | derived | keep (decision 6: global numbers across two groups) | same column | not verified | V |
| P-21 | Order mode up/down buttons per row (disabled while busy / no write), focus kept after move | `PA/lanes-table.component.html:80-89`; `moveRow` `PA/lanes-table.component.ts:270-275`; focus guard `:227-235` | `moveLane` `PA/cli-orchestration-matrix.component.ts:335-349` -> `savePreferredAgentOrder` -> `agent:setConfig` | keep. Moving inside a group must still produce a global order. Check how moves cross the group boundary | same column | spec exists (name not verified): `PA/cli-orchestration-matrix.writes.spec.ts` | V |
| P-22 | Identity cell (name, kind badge, version or provider line, unsupported mark) | `PA/lanes-table.component.html:94-100` (`ptah-lane-row-identity`) | none | keep; decision 7: two lines for each row | same | not verified | V/R |
| P-23 | Identity install-guide link (`installGuideRequested` -> `recover`), the copy that CSS hides | `PA/lanes-table.component.html:99`; `PA/lane-row-identity.component.ts:179-190` | `recover` `PA/lanes-table.component.ts:91-99` | remove-proposed as a duplicate (see M-4); the action stays in the Status cell / Add more card | — | not verified | V/R |
| P-24 | Status cell (installed / not installed / needs key / testing / test result) | `PA/lanes-table.component.html:108-114` (`ptah-lanes-table-status`) | derived; test text `PA/cli-orchestration-matrix.component.ts:180-192,232-245` | keep, add icons | same | not verified | V |
| P-25 | Unsupported-combination mark (glyph + title, tabindex 0) | `PA/lanes-table-status.component.ts:85-97` | derived | keep, make it focusable `Info` icon button | same | not verified | R |
| P-26 | "Sign in" recovery button (needs-key rows, e.g. Cursor) -> opens detail with the Credentials popover | `PA/lanes-table.component.html:116-140`; `recover` `PA/lanes-table.component.ts:91-99` -> `signIn` -> `signInLane` `PA/cli-orchestration-matrix.component.ts:368` | Cursor key: `agent:setConfig {cursorApiKey}` `CORE/...state.service.ts:403` | keep | Status cell, `LogIn` "Sign in" | not verified | V |
| P-27 | Kebab: Details (opens the detail row) | `PA/lanes-table.component.html:142-149` | `showDetail` `PA/lanes-table.component.ts:195-201` | remove-proposed as a duplicate of the expander (P-35), see M-5 | expander | not verified | V |
| P-28 | Kebab: Test (disabled while busy/testing/not installed; testid `cli-matrix-test-<id>` for instances) | `PA/lanes-table.component.html:150-164` | `test` `PA/cli-orchestration-matrix.component.ts:554` -> `state.testSystemLane` `CORE/...state.service.ts:335` (`agent:detectClis`, `provider:getAccountStatus`, `provider:getAmbientClaudeStatus`, `ptahCli:testConnection` in `CORE/providers-system-lane-test.ts:24,31,43,75`) or `state.testCliConnection` `:353` | keep | kebab, `Play` icon | spec exists (name not verified): `PA/cli-orchestration-matrix.component.spec.ts` | V |
| P-29 | Kebab: All capabilities (opens detail with the capabilities popover) | `PA/lanes-table.component.html:165-173`; `showCapabilities` `PA/cli-orchestration-matrix.component.ts:358` | none | keep (kebab is the one home, see M-6) | kebab, `ListChecks` | not verified | V |
| P-30 | Kebab (instance): Tiers (testid `cli-matrix-tiers-<id>`) | `PA/lanes-table.component.html:174-182` -> `editTiers` `PA/cli-orchestration-matrix.component.ts:373` -> `openTiers` `:459` | tier modal; save `ptahCli:update {tierMappings}` `CORE/providers-commit.service.ts:300` | keep | kebab, `Layers` | not verified | V |
| P-31 | Kebab (instance): Edit (disabled busy/no write; testid `cli-matrix-edit-<id>`) | `PA/lanes-table.component.html:183-191` -> `editLane` `PA/cli-orchestration-matrix.component.ts:351` -> `openEdit` `:418` | Add/Edit modal; `ptahCli:update` | keep | kebab, `Pencil` | not verified | V |
| P-32 | Kebab (instance): Delete -> inline confirm "Delete <name>?" (danger), focus return | `PA/lanes-table.component.html:192-200,204-211`; `requestDelete/confirmDelete/cancelDelete` `PA/lanes-table.component.ts:288-301`; `LanesTableDeleteFocus` | `remove` `PA/cli-orchestration-matrix.component.ts:647-660` -> `ptahCli:delete`, no Undo | keep | kebab, `Trash2` danger | not verified | V |
| P-33 | Permission lane default select per CLI (disabled when not installed/busy/no write) + reset request | `PA/lanes-table.component.html:213-225` (`ptah-cli-lane-default-cell field=permission`) | `selectTableDefault` / `resetTableDefault` `PA/cli-orchestration-matrix.component.ts:376,382` -> `CliLaneDefaultsStore.save/reset` `PA/cli-lane-defaults.store.ts:13,24` -> `agent:setConfig` `CORE/providers-lane-default-operations.ts:48` | keep | same column | spec exists (name not verified): `PA/cli-lane-default-cell.component.spec.ts` | V |
| P-34 | Network lane default select per CLI + reset | `PA/lanes-table.component.html:234-246` | as P-33 | keep | same | as P-33 | V |
| P-35 | Instance Permission/Network cells show "Unavailable" (title "Managed by connection") | `PA/lanes-table.component.html:226-232,247-253` | none | keep the information; restyle per P20 of the review ("From Ptah CLI defaults") | same column | not verified | V |
| P-36 | Model popover trigger (model id split with `<wbr>`, disabled when not interactive / no write, busy attrs) | `PA/lanes-table.component.html:270-317` | `CliModelEffortPopoverComponent field=model`; save via saveSettings (assumption: `settings:set` or `ptahCli:update`; check `PA/cli-model-effort-popover.component.ts`) | keep | same column | spec exists (name not verified): `PA/cli-model-effort-popover.component.spec.ts` | V |
| P-37 | Instance with no selected model: plain label | `PA/lanes-table.component.html:265-268` | derived `modelOf` `PA/lanes-table.component.ts:372-382` | keep | same | not verified | V |
| P-38 | Effort popover trigger ("·" separator; "Effort: x" in the detail) | `PA/lanes-table.component.html:319-364` | `CliModelEffortPopoverComponent field=effort` | keep | same | as P-36 | V |
| P-39 | One popover open at a time; closes when the row changes or the detail closes | `PA/lanes-table.component.ts:302-348` and the `openCell` effect | none | keep | same | not verified | V |
| P-40 | Enabled toggle (system -> `disabledClis`; instance -> `ptahCli:update.enabled`), Undo, value rolled back when blocked | `PA/lanes-table.component.html:375-390`; `toggleRow` `PA/lanes-table.component.ts:276-287`; `toggle` `PA/cli-orchestration-matrix.component.ts:586-625` | `agent:setConfig` / `ptahCli:update` | keep | same | spec exists (name not verified): `PA/cli-orchestration-matrix.writes.spec.ts` | V |
| P-41 | Row expander (`aria-controls lane-detail-<id>`), closes popovers | `PA/lanes-table.component.html:392-400`; `detailExpanded` `PA/lanes-table.component.ts:191-194` | none | keep | last column; kebab gets its own column (review D6) | not verified | V |

### Row of a CLI agent that is NOT installed (decision 8: leaves the table, goes to the "Add more" strip)

Each control of the row today. The row comes from `rows().uninstalled` (`PA/cli-orchestration-matrix.component.ts:199-206`) and is styled `muted` (`PA/lanes-table.component.html:68-70`).

| # | Control today | Where today | State today | Decision | New location | Test | Src |
|---|---|---|---|---|---|---|---|
| U-1 | Order cell "—" | `PA/lanes-table.component.html:78-79` | no number | remove-proposed (no order without install; nothing is lost) | — | none | V |
| U-2 | Name + kind + provider mark | `PA/lanes-table.component.html:94-100` | shown | move | Add more card title + mark | none | V |
| U-3 | Identity install-guide link (hidden copy) | `PA/lane-row-identity.component.ts:179-190` | hidden by CSS | remove-proposed (duplicate of U-5) | — | none | R |
| U-4 | Status "Not installed" | `PA/lanes-table.component.html:108-114` | shown | move | card status line (`CircleDashed` + text) | none | V |
| U-5 | "Install guide" / "Install" (collapsed) button -> `recover` -> opens the detail with the install popover + `installGuide` output | `PA/lanes-table.component.html:116-140`; `PA/lanes-table.component.ts:91-95`; `showInstallGuide` `PA/cli-orchestration-matrix.component.ts:363` | enabled | move | card `BookOpen` "Install", opens the same install-guide popover anchored to the card | none | V |
| U-6 | Install-guide popover: command (copy), note, Re-detect | `PA/cli-provider-card-popovers.component.ts` (kind `install`); guides `PA/cli-orchestration-matrix.component.ts:51-89`; Re-detect -> `redetectFromGuide` `:496-513` -> `agent:detectClis`; messages "Detection failed. Try again." / "Still not found. Check the step above, then try again." | enabled | move | popover from the card | not verified | V |
| U-7 | After a successful re-detect the guide closes and focus follows the row (`closeGuide` `PA/lanes-table.component.ts:183-190`) | as U-6 | — | keep; the new focus target is the new table row (the card is gone) | — | not verified | V |
| U-8 | Kebab: Details | `PA/lanes-table.component.html:142-149` | enabled | move: card Install opens the guide; Info and capabilities are reachable from the card (see U-12, U-13) | card | none | V |
| U-9 | Kebab: Test | `PA/lanes-table.component.html:150-164` | **disabled** (`!row.installed`) | remove-proposed for the card (it cannot run before install); Test comes back in the table row after re-detect | — | none | V |
| U-10 | Kebab: All capabilities | `PA/lanes-table.component.html:165-173` | enabled | move | card, icon button `ListChecks` or `Info` menu (manifest known before install) | none | V |
| U-11 | Permission / Network selects | `PA/lanes-table.component.html:213-246` | **disabled** (`!row.installed`) | remove-proposed for the card (not editable today) | — | none | V |
| U-12 | Model / effort trigger | `PA/lanes-table.component.html:270-364` | disabled when not interactive (assumption: not interactive when not installed; check `cliMatrixRows` `PA/cli-matrix-rows.ts`) | remove-proposed for the card | — | none | V |
| U-13 | Enabled toggle | `PA/lanes-table.component.html:375-390` | **disabled** and shown off (`enabledShown` `PA/lanes-table.component.ts:267-269`) | remove-proposed for the card; the saved `disabledClis` entry is kept and applies after install | — | none | V |
| U-14 | Expander -> detail: Provider, Native CLI behavior popover, capability chips, Test (disabled), Info / All capabilities / Install guide popovers (`kind !== 'install' \|\| !installed`), Credentials / Codex settings | `PA/lanes-table-detail.component.html:11-58,98-137,139-243` | enabled | move: Install guide, Info and All capabilities to the card. Native CLI behavior, Provider, chips: keep only if the card shows a details popover (implementer choice; capability must stay reachable) | card | none | V |

### Expanded detail (installed rows)

| # | Capability | Where today | Backing | Decision | New location | Test | Src |
|---|---|---|---|---|---|---|---|
| P-42 | Facts: Version (title = full version), Executable (codex status line), Provider ("CLI default") | `PA/lanes-table-detail.component.html:11-23` | derived | keep | detail left `dl` | not verified | V |
| P-43 | Native CLI behavior: "Permission" button -> popover with permission detail | `PA/lanes-table-detail.component.html:24-58` | none | keep (value as text + `Info` icon button) | detail left `dl` | not verified | V |
| P-44 | Account (Claude, installed): `ptah-claude-lane-account-cell`, hidden when not visible | `PA/lanes-table-detail.component.html:60-67` | `claude-lane-account-cell` (RPC not verified) | keep | detail left `dl` | spec exists (name not verified): `PA/claude-lane-account-cell.component.spec.ts` | V |
| P-45 | Instance facts: Provider, Key status (testid `cli-matrix-key-status`), Tier models "n of 3 set" / "loading" + one line per tier | `PA/lanes-table-detail.component.html:68-96` | derived | keep | detail left `dl` | not verified | V |
| P-46 | Collapsed only: Permission, Network in the detail | `PA/lanes-table.component.html:428-481` | as P-33 | keep | same | not verified | V |
| P-47 | Model / Effort in the detail | `PA/lanes-table.component.html:482-491` | as P-36 | keep | detail left `dl` | not verified | V |
| P-48 | Capability chips (Messaging, Permission, Network, MCP, Limit), each opens a one-line popover | `PA/lanes-table-detail.component.html:98-137`; `toggleChip` `PA/lanes-table-detail.component.ts:105-108` | `cliCapabilityView(manifest)` | keep the values; the popovers become a read-only `dl` (review P12) | detail right `dl` | not verified | V |
| P-49 | Test button + result text (`role=status`, testid `cli-matrix-test-result`, "Running…" / "Not run yet") | `PA/lanes-table-detail.component.html:139-157` | as P-28 | keep (merged with kebab Test? No: both stay, kebab is a shortcut; see M-7) | detail footer, `Play` "Test" | not verified | V |
| P-50 | Popovers All capabilities / Info / Install guide (Install only when not installed) | `PA/lanes-table-detail.component.html:158-202`; kinds `PA/lanes-table-detail.component.ts:97-101` | Re-detect in Install -> `agent:detectClis` | keep; All capabilities merges with kebab (M-6) | detail footer `Info` icon; others kebab | not verified | V |
| P-51 | Cursor Credentials popover (focus to key field on open) | `PA/lanes-table-detail.component.html:203-231` | `agent:setConfig {cursorApiKey}` `CORE/...state.service.ts:403` | keep | detail footer `KeyRound` "Credentials" | not verified | V |
| P-52 | Codex settings button | `PA/lanes-table-detail.component.html:232-241` -> `codexSettingsRequested` | host navigation (Advanced codex sandbox, assumption) | keep | detail footer `Settings2` | not verified | V |
| P-53 | Instance All capabilities popover (groups, lines, reasons) | `PA/lanes-table-detail.component.html:243-296` | derived | keep | kebab or footer | not verified | V |
| P-54 | Instance Edit tiers button | `PA/lanes-table-detail.component.html:297-305` | tier modal | keep (merged with kebab Tiers is optional; both open one modal) | detail footer `Layers` | not verified | V |
| P-55 | Reset to default (<permission>) for a CLI with a saved default; testid `lanes-detail-reset-default` | `PA/lanes-table.component.html:494-517`; label `PA/lanes-table.component.ts:100-109` | `CliLaneDefaultsStore.reset` -> `agent:setConfig` | keep | `RotateCcw` icon button, label in tooltip | not verified | V |
| P-56 | Instance Edit / Delete in the detail footer | `PA/lanes-table.component.html:518-541` | as P-31, P-32 | keep | footer icon buttons | not verified | V |
| P-57 | Inline delete confirm in the detail | `PA/lanes-table.component.html:542-549` | as P-32 | keep | same | not verified | V |

### Ptah CLI defaults and instances cards, modals

| # | Capability | Where today | Backing | Decision | New location | Test | Src |
|---|---|---|---|---|---|---|---|
| P-58 | Ptah CLI shared defaults (Permission, Network) shown only when a Ptah CLI manifest is detected | `PA/cli-orchestration-matrix.component.ts:198-206`; manifest `:385-390` | `savePtahDefault` / `resetPtahDefault` `:633-644` -> `CliLaneDefaultsStore` -> `agent:setConfig` | move | Ptah CLI group header (decision 6) | not verified | V |
| P-59 | "More default actions" / reset in the defaults card (`wide` layout) | `PA/cli-lane-default-cell.component.ts:214-249` | as P-58 reset | keep, `RotateCcw` icon button | group header | spec exists (name not verified): `PA/cli-lane-default-cell.component.spec.ts` | R |
| P-60 | Ptah CLI instances card: empty state + "Add Ptah CLI instance" (`addRequested` origin `empty`) | `PA/cli-orchestration-matrix.component.ts:209-217`; `PA/ptah-cli-instances.component.html:21-31,50-58` | `openAdd('empty')` `:412` | move (merged, M-2); the empty state stays inside the Ptah CLI group | Ptah CLI group | not verified | V/R |
| P-61 | Instance card list (never shown: `[rows]="[]"`) | `PA/ptah-cli-instances.component.html:64-500` | — | remove-proposed (dead UI today; no capability is lost) | — | — | R |
| P-62 | Add / Edit Ptah CLI instance modal; after create, Test of the new instance runs and the result is announced | `PA/cli-orchestration-matrix.component.ts:221-226`; `onCreated` `:438-456`; `closeAdd` `:428` (focus return to origin) | `ptahCli:create` / `ptahCli:update` | keep (layout fix in shared modal) | same | not verified | V |
| P-63 | CLI tier mapping modal; focus returns to Tiers or the expander | `PA/cli-orchestration-matrix.component.ts:227-231`; `closeTiers` `:471-483` | `ptahCli:update {tierMappings}` | keep | same | not verified | V |
| P-64 | Provider catalog modal (search + list) | `PR/provider-catalog-modal.component.ts:29-42` | not verified | keep | same | not verified | R |
| P-65 | Catalog hint popover | `PR/providers-settings.component.ts:278-306` | not verified | keep | same | not verified | R |

## Advanced page

Rows marked **V** were checked against the source in this worktree (line numbers are current). Test names were found by
`grep` on `it(` / `describe(` lines; a named test is evidence that the capability has a test, not that every branch is covered.
Spec prefixes: `ADV.spec` = `CH/advanced-settings.component.spec.ts`, `LIC.spec` = `CH/license/license-status-card.component.spec.ts`,
`AB.spec` = `CH/pro-features/agent-behaviour-section.component.spec.ts`, `SPD.spec` = `CH/pro-features/system-prompt-drawer.component.spec.ts`,
`OSL.spec` / `OSC.spec` / `OSE.spec` / `OSS.spec` = `CH/output-style/output-style-list.component.spec.ts` / `-config.component.spec.ts` /
`-editor.component.spec.ts` / `output-style.store.spec.ts`, `MCP.spec` = `CH/pro-features/mcp-port-config.component.spec.ts`,
`CB.spec` = `CH/pro-features/claude-builtins-config.component.spec.ts`, `VLM.spec` = `CH/pro-features/vscode-lm-config.component.spec.ts`.
Not verified in this pass (budget stop): A-32, A-33 (Settings shell), the RPC of A-30, the write RPC and mount point of A-31.

| # | Capability | Where today | Backing RPC / store | Decision | New location | Test |
|---|---|---|---|---|---|---|
| A-1 | **V** Overview instrument band (section summaries; Setup segment from the Claude Code install check) | `CH/advanced-settings.component.ts:102-107` (band), `:248-266` (Setup segment effect) | `AdvancedOverviewStore.segments` / `report` / `clear` (`CH/advanced/advanced-overview.store.ts:58,73,86`), page-scoped provider `CH/advanced-settings.component.ts:80`; Setup from `AuthStateService.claudeCliInstalled` | keep | same | `ADV.spec:260` "starts with the overview band: one idle segment per section until the section reports"; `:279` "reports the Setup segment from the Claude Code install check once auth status loads" |
| A-2 | **V** Export settings (busy + disabled while exporting) | `CH/advanced-settings.component.ts:132-142` (button), `:271-285` (`exportSettings`) | Electron `settings:export` (`:276`); VS Code `command:execute` `ptah.exportSettings` (`:278`) | keep | `Download` + label | `ADV.spec:296` "keeps the Export settings aria-label and calls ptah.exportSettings in VS Code"; `:550` "uses settings:export/settings:import in Electron"; `:579` "disables the export button while exporting" |
| A-3 | **V** Import settings: inline confirm in the header action row, busy, Esc/Cancel focus return, result toasts (whole-file reject vs per-key failure) | `CH/advanced-settings.component.ts:113-131` (confirm), `:143-154` (button), `:288-302` (`requestImport` / `cancelImport`), `:310-357` (`importSettings`) | Electron `settings:import` (`:316`); VS Code `command:execute` `ptah.importSettings`; toasts via `SettingsSaveFeedbackService.announce` | keep | `Upload` + label | `ADV.spec:311`, `:330` "does not call the import RPC when the confirm is cancelled", `:347` (Esc + focus), `:382` (M5 header row), `:401` (focus after import), `:446` (N4 partial failure), `:469`, `:491`, `:506` (dialog cancelled silent), `:513`, `:526`, `:539` (no host error text leak) |
| A-4 | **V** Membership plan and state badges (Builder / Community, Active / Needs Attention) | `CH/license/license-status-card.component.ts:112-134` | `ChatStore.licenseStatus` (`libs/frontend/chat/src/lib/services/chat.store.ts:128`) <- `ChatLifecycleService` `license:getStatus` (`libs/frontend/chat/src/lib/services/chat-store/chat-lifecycle.service.ts:101`); reports the `membership` overview segment (`CH/license/license-status-card.component.ts:486-488`) | keep (merged with A-5, M-8) | aside | `LIC.spec:146` (community badges), `:165` (Builder badge), `:182` "shows the Needs Attention badge when a member key has a reason", `:293`, `:304` (overview report) |
| A-5 | **V** Plan description / Account rows (name, email) | `CH/license/license-status-card.component.ts:135-157` | as A-4 (`licenseStatus().plan`, `.user`) | keep Account; Plan/State merged with A-4 (M-8) | fields | `LIC.spec:165`, `:284` "shows account facts without an avatar row" |
| A-6 | **V** Manage Membership (premium) | `CH/license/license-status-card.component.ts:160-168` | `command:execute` `ptah.openPricing` (`:607-610`) | keep | same | none today (no test names `openPricing`) |
| A-7 | **V** Enter Membership Key popover (`role="dialog"`): show/hide, format check `^ptah_lic_[a-f0-9]{64}$`, Enter submits, verify/activate, error, drafts dropped on close | `CH/license/license-status-card.component.ts:170-300`; handlers `:505-524` (open/close), `:526-560` (`submitLicenseKey`) | `license:setKey` (`:540`) | keep as popover with viewport height cap (decision 10) | same | `LIC.spec:124` (F3 floating label), `:347` (malformed key, no RPC), `:358` (license:setKey), `:380` (never persists key), `:399` (visibility toggle) |
| A-8 | **V** Explore Ptah Builders, Create Account (non-premium) | `CH/license/license-status-card.component.ts:301-316` | `command:execute` `ptah.openPricing` (`:607`) and `ptah.openSignup` (`:498-502`) | keep | same row, one primary | `LIC.spec:146` "... one primary action" (count only; commands not asserted) |
| A-9 | **V** Log out with inline confirm (Esc / Cancel return focus; Esc ignored while in flight) | `CH/license/license-status-card.component.ts:318-336,374-389`; handlers `:562-600` | `license:clearKey` (`:589`) | keep | same | `LIC.spec:203`, `:218` (Esc + focus, FM-2), `:244`, `:260`, `:311` "calls license:clearKey on confirmed log out ..." |
| A-10 | **V** "Membership Key Not Active" alert with "Re-enter Membership Key" | `CH/license/license-status-card.component.ts:343-371` | opens A-7 (`openKeyPopover`, `:360`) | keep (merged with A-7 button, M-9) | alert action | `LIC.spec:190` "shows the key-not-active alert with verbatim copy and opens the popover from it" |
| A-11 | **V** Agent behaviour load error with Retry (fixed copy, no host detail) | `CH/pro-features/agent-behaviour-section.component.ts:140-157` | Retry re-runs the failed load: `enhancedPrompts:getStatus` (`:503`) or `agent:getConfig` (`:523`) | keep | same | `AB.spec:313`, `:327` (inline alert, fixed copy), `:342` (status error = load failure with Retry), `:135` "keeps the overview idle when a status load fails" |
| A-12 | **V** System prompt mode toggle, note, sr-only status | `CH/pro-features/agent-behaviour-section.component.ts:160-211`; `onPromptModeChange` `:445` | `enhancedPrompts:setEnabled` (`:544`, workspace-root scoped via `WorkspaceScopeService`); re-read `enhancedPrompts:getStatus`; Undo toast via `SettingsSaveFeedbackService` | keep | same row, toggle right-most | `AB.spec:208`, `:220` "saves on selection, re-reads the status and toasts with Undo", `:252`, `:262`, `:276`, `:298`, `:380`, `:402` |
| A-13 | **V** System prompt Details -> drawer | `CH/pro-features/agent-behaviour-section.component.ts:194-208` (`drawerOpen.set(true)`, `:200`) | none (local signal) | keep | icon button "System prompt details" | `AB.spec:653` "opens drawer when Details button is clicked"; `:667` "reloads prompt status when drawer emits changed" |
| A-14 | **V** Ultracode toggle, info popover, X-High pin | `CH/pro-features/agent-behaviour-section.component.ts:212-252`; `onUltracodeChange` `:485`, `writeUltracode` `:590` | `UltracodeStateService.toggle` (`libs/frontend/chat/src/lib/services/ultracode-state.service.ts:75`) | keep | same | `AB.spec:614`, `:629`, `:643` (Ultracode A29); info popover (`ultracodeInfoOpen`, `:246`): none today |
| A-15 | **V** Dynamic workflows toggle (inverted `workflowsDisabled`) | `CH/pro-features/agent-behaviour-section.component.ts:253-285`; `onWorkflowsChange` `:473`, `writeWorkflowsDisabled` `:572` | read `agent:getConfig` (`:523`); write `agent:setConfig { workflowsDisabled }` (`:576`) | keep | same | `AB.spec:501` "hydrates from agent:getConfig", `:513`, `:533`, `:550`, `:565`, `:595` |
| A-16 | **V** Chat reasoning effort select (disabled while Ultracode is on) | `CH/pro-features/agent-behaviour-section.component.ts:286-326` (`[disabled]="saving() \|\| ultracode.enabled()"`, `:312`); `selectEffort` `:458`, `writeEffort` `:563` | `EffortStateService.setEffort` (`libs/frontend/core/src/lib/services/effort-state.service.ts:45`) | keep | same | `AB.spec:143`, `:179`, `:438`, `:446`, `:461`, `:468`, `:480`, `:487` "is pinned while Ultracode is on ..." |
| A-17 | **V** System prompt drawer: status/metadata, error + Retry, regenerate with inline confirm (Esc returns focus), host progress + coarse reconciliation, check again, download, preview, empty state, close | `CH/pro-features/system-prompt-drawer.component.ts:127-393`; handlers `:515` `loadStatus`, `:537-571` regenerate, `:573` `checkRegenerate`, `:598` download, `:619` preview | `enhancedPrompts:getStatus` (`:519`), `enhancedPrompts:regenerate` (`:560`), `enhancedPrompts:download` (`:602`), `enhancedPrompts:getPromptContent` (`:628`) | keep | same drawer | `SPD.spec:116`, `:134` (A14), `:145` (empty A18), `:172`, `:201` (preview A17), `:228`, `:255`, `:290` (regenerate A15), `:323-404` (download A16), `:417` "emits closed when Close button is clicked", `:503` (confirm focus + Esc), `:537-594` (host regeneration status) |
| A-18 | **V** Output style list: loading skeleton, activate (radiogroup, same-selection guard, shadowed rows disabled with reason), preview built-ins (popover), edit, delete with inline confirm (Esc returns focus), built-in note, help popover, invalid files + "rewrite" (opens repair editor) | `CH/output-style/output-style-list.component.ts:113` (skeleton), `:123-305` (matrix; `onSelectStyle` `:152`, preview `:215-216`, edit `:233`, delete + confirm `:252-294`), `:308` (built-in note), `:312-313` (help popover), `:329-361` (invalid section) | `OutputStyleStore` (`CH/output-style/output-style.store.ts`): `refresh` `:173` (`outputStyle:list` + `outputStyle:diagnose`, `:178-179`), `activate` `:210` (`outputStyle:activate`, `:222`), `remove` `:256` (`outputStyle:delete`, `:261`); wired by `OutputStyleConfigComponent` `:153,170,228` | keep | same; Preview/Edit/Delete as icon buttons | `OSL.spec:126` (radiogroup), `:134` (preview), `:227-256` (delete confirm + Esc), `:330` (failed list read alert), `:348-372` (same-selection guard), `:387`, `:553-568` (confirm shape, built-in note), `:588-697` (shadowed rows); `OSS.spec:127-263`, `:583-603` (refresh / activate / remove); invalid-file rewrite button and help popover: none today |
| A-19 | **V** New style (disabled while saving) | `CH/output-style/output-style-config.component.ts:76-81` (`onCreate`) | opens the editor drawer (`@defer (when view() === 'editor')`, `:105-108`) | keep | header action, secondary | `OSC.spec:283` "after a save with no editable row of that name, focuses \"New style\"" (focus return only; the click itself: none today) |
| A-20 | **V** Output style editor drawer: name (required, validated), description, tier, instructions + keep-coding-instructions toggle, Edit / Preview tabs (markdown, placeholder), replace-file conflict, stale-file dialog (Reload / Overwrite), dirty-draft discard confirm (Esc local), repair mode for an unreadable file, save, cancel | `CH/output-style/output-style-editor.component.ts:105-352` (template; discard `:146-153`, conflict `:158-165`, stale `:170-204`, save `:335`, cancel `:347`); handlers `:505-603`; `CH/output-style/output-style-instructions-field.component.ts:37-53` (toggle + hints), `:83-95` (preview) | `OutputStyleStore.save` (`CH/output-style/output-style.store.ts:249`, via `writeFile` `:366` -> `outputStyle:save` `:374`), `OutputStyleStore.load` (`:279`, `outputStyle:get` `:284`) | keep | same drawer | `OSE.spec:146-231` (structure, tabs, D15), `:249-283` (name validation), `:299-356` (keep-coding toggle), `:364-419` (edit existing, overwrite), `:429-530` (stale conflict), `:541-578` (focus, Esc, dirty guard), `:632-663` (instructions field, markdown preview), `:705-734` (repair mode); `OSS.spec:477-542` (save) |
| A-21 | **V** MCP & Browser card: load error + Retry, port input (integer range, Save when dirty+valid, restart info, Undo), external MCP caller access + info popover, tool namespaces matrix (5), Allow localhost with danger inline confirm (Esc returns focus) + info popover | `CH/pro-features/mcp-port-config.component.ts:89-262` (template: error `:109-118`, port `:146-169`, caller access `:184-194`, namespaces `:205-208`, localhost `:223-250`); handlers `:358` `loadConfig`, `:399` `savePort`, `:451` `onExternalCallerAccessChange`, `:512` `toggleNamespace`, `:560` `onAllowLocalhostToggle`, `:593` `confirmEnableLocalhost` | read `agent:getConfig` (`:361`); write `agent:setConfig` with `mcpPort` (`:419-420`), `mcpExternalCallerAccess` (`:463-464`), `disabledMcpNamespaces` (`:528-529`), `browserAllowLocalhost` (`:601,628,644`) | keep | same | `MCP.spec:105-224` (loading, Serious 3, Retry), `:252` (external callers), `:314-449` (port A30/R4/R5), `:474-521` (namespaces A31), `:536-682` (localhost A32/R3, Esc focus), `:695` (overview report); info popovers: none today |
| A-22 | **V** Claude Code tools: toggle each tool, token cost, skeleton while loading | `CH/pro-features/claude-builtins-config.component.ts:134-151`; `toggle` `:376` | read `agent:getClaudeBuiltins` (`:427`); write `agent:setClaudeBuiltin { kind, id, enabled }` (`:410`), serialised by `saving()` | keep; switches instead of checkboxes | collapsible group "Built-in tools" | `CB.spec:156`, `:184`, `:194` (Load), `:366-438` (toggle, save, Undo, busy) |
| A-23 | **V** Terminal skills: description, dependency note, dependency-blocked state | `CH/pro-features/claude-builtins-config.component.ts:172-210`; `isDependencyBlocked` `:371` | as A-22 | keep | group "Terminal-only skills" | `CB.spec:459-492` (Dependency blocked) |
| A-24 | **V** Synced skills (qualified id, plain-name toast) and their empty state | `CH/pro-features/claude-builtins-config.component.ts:230-267`; `skillName` `:366` | as A-22 | keep | group "Synced from claude.ai" | `CB.spec:252-354` (Group 3) |
| A-25 | **V** "Saved per turn" token summary (`aria-live`, testid `claude-tools-savings`) | `CH/pro-features/claude-builtins-config.component.ts:93-96`; `cost` `:353` | derived from the stored lists | keep | sticky summary bar | `CB.spec:184` (rounds live savings), `:142` (`formatApproxTokens`), `:492`, `:623` (overview report) |
| A-26 | **V** Applies-to-new-sessions note; load / unverified-policy error with Retry (fails closed) | `CH/pro-features/claude-builtins-config.component.ts:100-121`; `load` `:348` | `agent:getClaudeBuiltins` (`:427`) | keep | one-line alert | `CB.spec:156` (applies note), `:232`, `:354` (fails closed), `:580` (Retry focused) |
| A-27 | **V** Undo and focus keeping on toggle failure (failed write re-reads, not a local revert) | `CH/pro-features/claude-builtins-config.component.ts:376-427,454-464` | as A-22 | keep; a group switch (decision 9) runs the per-id RPC in sequence with one summary toast, and must keep Undo/focus behaviour for a failed item | same | `CB.spec:400`, `:509-596` (atomic per-item write, serialised toggles), `:311` |
| A-28 | NEW (decision 9): group All on / All off, filter, per-group count and token subtotal | — | existing per-id RPC in sequence | new | group headers | none (new) |
| A-29 | **V** VS Code LM section (renders only when the `vscode-lm` provider exists): badges, capabilities, Set as Default (Undo), model select (emits `modelChanged`, Undo) | `CH/pro-features/vscode-lm-config.component.ts:40-130`; handlers `:191` `onVsCodeModelSelect`, `:237` `onSetDefault`; parent forwards `modelChanged` `CH/advanced-settings.component.ts:163` | `LlmProviderStateService` (`libs/frontend/core/src/lib/services/llm-provider-state.service.ts`): `setDefaultModel` `:295` (`llm:setDefaultModel` `:302`), `setDefaultProvider` `:339` (`llm:setDefaultProvider` `:343`) | keep | same | `VLM.spec:125-154` (A33/A35), `:164`, `:184` (A36), `:209-345` (A34/A37, D15, N5); `ADV.spec:569` "forwards the VS Code LM modelChanged event" |
| A-30 | **V** (location) Fine-tuning disclosures (one closed `ptah-disclosure` per upkeep group with "N settings" meta, body `@defer (on viewport)` with placeholder); per-group load error + Retry, switch rows (`toggle`), number rows (`commit` on change), per-setting error / stored note, help popover | `CH/advanced-settings.component.ts:165-209` (`fineTuningGroups` `:236-241`); `CH/advanced/advanced-settings-group.component.ts:119-156` (rows, help popover `:144-156`), `:204-219` (loading / error / Retry), `:230-285` (switches), `:303-329` (numbers); handlers `:442` `reload`, `:560` `toggle` | RPC not verified (budget stop before the group's `reload` / `toggle` / `commit` bodies were opened) | keep | same | `ADV.spec:216` "ends with a Fine-tuning section of closed rows whose deferred groups render the upkeep groups"; `CH/advanced/advanced-settings-group.component.spec.ts` exists (test names not read) |
| A-31 | **V** (location) Codex sandbox setting: scope label, loading, load error + Retry, radio choices with warning + Windows note, full-access inline confirm (`keydown.escape` -> `cancelFullAccess`), effective policy + "Reload effective policy", precedence and approval notes | `CH/advanced/codex-sandbox-setting.component.ts:120-291` (template: scope `:132`, loading `:144`, error/Retry `:151-159`, choices `:169-212`, confirm `:226-256`, effective/reload `:267-278`, precedence `:283`, approval `:291`); RPC calls `:451`, `:473` | read `agent:getConfig` (`:473`); the write call at `:451` was not opened (budget stop). Where the component is mounted was not verified | keep | same | `CH/advanced/codex-sandbox-setting.component.spec.ts` exists (test names not read) |
| A-32 | Setup: Run onboarding again, Check Claude Code | `CH/settings.component.html:156-161` | not verified | keep | same | not verified |
| A-33 | Shell: back to chat (nav + narrow strip), tabs with deep links, custom-endpoint warning, security note, workspace context | `CH/settings.component.html:13-54` | not verified | keep | same | not verified |
| A-34 | **V** NEW: Output style notices: fixed error + dismiss, missing-style banner (help popover, "clear selection"), name-collision banner (help popover), fallback-injection banner (help popover), copy-to-project with replace confirm | `CH/output-style/output-style-notices.component.ts:32-47` (error), `:55-83` (missing), `:97-105` (collision), `:120-128` (fallback), `:139-169` (copy + confirm); inputs `:183-192`; mounted `CH/output-style/output-style-list.component.ts:373-386` | `OutputStyleStore` computed `activeMissing` `:128`, `hasCollision` `:134`, `collidingNames` `:139`, `usingFallbackInjection` `:152`, `dismissError` `:328`; copy `copyToProjectTier` `:300` (via `writeFile` -> `outputStyle:save`), failure toast `CH/output-style/output-style-config.component.ts:234-236` | keep | same | copy: `OSL.spec:397-453`, `OSC.spec:220`, `:243`, `OSS.spec:621-633`; collision / missing flags: `OSS.spec:170`, `:182`; banner rendering, dismiss, clear selection, help popovers: none today (no spec for `output-style-notices`) |
| A-35 | **V** NEW: Output style command-line parity section: collapsible details, opt-in checkbox, help popover, tier select with named file, confirm (Cancel focused, Esc), parity warning + dismiss | `CH/output-style/output-style-parity-section.component.ts:68-189` (details `:68-73`, checkbox `:85-86`, help `:98`, select `:118`, confirm `:134-161`, warning `:172-189`); mounted `CH/output-style/output-style-list.component.ts:389-400` | `OutputStyleStore.activate(name, parity)` (`CH/output-style/output-style.store.ts:210-222`), `parityOutcome` `:116`, `parityWrittenPath` `:157`, `parityWarning` `:167`, `dismissParityOutcome` `:336` | keep | same | `OSL.spec:89-323` (CLI parity control), `:474-543` (section visibility, Esc); `OSC.spec:167-204`; `OSS.spec:283-455` |
| A-36 | NEW: Keyboard handling across the page (Esc stays local to each inline confirm and returns focus to its trigger; Enter submits the key) | import confirm `CH/advanced-settings.component.ts:296-302`; logout confirm `CH/license/license-status-card.component.ts:571`; key input `(keydown.enter)` `:246`; delete confirm `CH/output-style/output-style-list.component.ts:274`; editor dialogs `CH/output-style/output-style-editor.component.ts:147,159,171`; codex full-access confirm `CH/advanced/codex-sandbox-setting.component.ts:227`; MCP localhost confirm `CH/pro-features/mcp-port-config.component.ts:250` | none (UI only) | keep: each redesigned confirm keeps local Esc + focus return | same | `ADV.spec:347`; `LIC.spec:218`, `:260`; `OSL.spec:236`, `:453`, `:515`; `OSE.spec:545`, `:578`; `SPD.spec:503`; `MCP.spec:592`; codex: not read |

## Merged controls

| # | Control A today | Control B today | One control after | Action kept |
|---|---|---|---|---|
| M-1 | Header "Edit order" toggle `PA/lanes-section-header.component.ts:45-55` (V) | Policy-bar pencil reorder popover `PA/agent-orchestration-config.component.html:109-160` (R) | Header `ArrowUpDown` "Reorder" / "Done" mode toggle (review P9, decision 12) | change preferred order -> `savePreferredAgentOrder` with Undo |
| M-2 | Header "New Ptah CLI instance" `PA/lanes-section-header.component.ts:56-66` (V) | Instances card "+ Add Ptah CLI instance" `PA/ptah-cli-instances.component.html:21-31,50-58` (R) | `Plus` "Add Ptah CLI instance" in the Ptah CLI group header (P10) | `openAdd` -> Add modal -> `ptahCli:create` + first Test. Keep both focus-return origins (`addOrigin` `PA/cli-orchestration-matrix.component.ts:410`), or reduce to one origin |
| M-3 | Re-detect in the policy bar `PA/agent-orchestration-config.component.html:172-200` (R) | Re-detect inside the install-guide popover (`redetectFromGuide` `PA/cli-orchestration-matrix.component.ts:496`) (V) | Not merged: both stay (different context: whole list vs one CLI). The policy-bar button moves to the CLI group header | `agent:detectClis` |
| M-4 | Status cell "Install guide" / "Sign in" `PA/lanes-table.component.html:116-140` (V) | Identity cell hidden copy `PA/lane-row-identity.component.ts:179-190` (R) | Status cell "Sign in" (installed rows); "Install" on the Add more card | `recover(row)` |
| M-5 | Kebab "Details" `PA/lanes-table.component.html:142-149` (V) | Row expander `PA/lanes-table.component.html:392-400` (V) | Expander (review P33) | open the detail row |
| M-6 | Kebab "All capabilities" `PA/lanes-table.component.html:165-173` (V) | Detail "All capabilities" popover button `PA/lanes-table-detail.component.html:158-202` (V) | Kebab item that opens the detail with the popover (P14) | capabilities popover |
| M-7 | Kebab "Test" `PA/lanes-table.component.html:150-164` (V) | Detail "Test" `PA/lanes-table-detail.component.html:141-150` (V) | Not merged: the detail keeps the primary Test with its result text; the kebab keeps a shortcut (review P14/P33 keep both) | `test(id)` |
| M-8 | Membership aside badges `CH/license/license-status-card.component.ts:112-134` (R) | Plan / State rows `:135-157` (R) | One status display (review F5; implementer picks badge pair or rows) | display only |
| M-9 | "Enter Membership Key" button `CH/license/license-status-card.component.ts:170-192` (R) | Alert "Re-enter Membership Key" `:343-371` (R) | One "Enter membership key" action; the toolbar button hides while the alert shows (review F6) | open key popover |
| M-10 | Kebab "Tiers" `PA/lanes-table.component.html:174-182` (V) | Detail "Edit tiers" `PA/lanes-table-detail.component.html:297-305` (V) | Optional merge; both open the tier modal. Keep at least one | tier modal |

## Proposed Removals

Decision 12 says no capability is removed. Each item below removes a control, not a capability. The user must confirm each one.

| # | Control | Where | Reason |
|---|---|---|---|
| R-1 | Order "—" cell, Permission/Network selects, model/effort trigger, enabled toggle and kebab Test of a not-installed CLI (U-1, U-9, U-11, U-12, U-13) | `PA/lanes-table.component.html:78-79,150-164,213-246,270-364,375-390` | Decision 8 moves the row out of the table. These controls are disabled today for a not-installed CLI, so no usable action is lost. A saved `disabledClis` entry or lane default stays stored and applies after install |
| R-2 | Never-shown instance card list in `ptah-cli-instances` (P-61) | `PA/ptah-cli-instances.component.html:64-500` | Dead UI: the matrix passes `[rows]="[]"` (`PA/cli-orchestration-matrix.component.ts:210`) |
| R-3 | Pencil reorder popover (M-1), kebab "Details" (M-5), hidden identity install link (M-4) | as listed | Duplicates. Each action stays through the merged control |

## Gaps

- Not checked again in this pass (budget): every **R** row, all Advanced rows, `PA/agent-orchestration-config.component.html`,
  `PA/cli-shared-defaults.component.ts`, `PA/cli-provider-card-popovers.component.ts`, `PA/cursor-credential-popover.component.html`,
  `PA/lane-row-identity.component.ts`, `PA/lanes-table-status.component.ts`, `PA/cli-model-effort-popover.component.ts`
  (model save RPC), both modals, and `PR/providers-settings.component.ts`.
- No spec test name was opened. Before implementation, for each row map the spec file and test name, or mark `none today`. Start with:
  `PA/cli-orchestration-matrix.component.spec.ts`, `PA/cli-orchestration-matrix.writes.spec.ts`, `PA/cli-matrix-rows.spec.ts`,
  `PA/cli-lane-default-cell.component.spec.ts`, `PA/cli-model-effort-popover.component.spec.ts`,
  `PA/claude-lane-account-cell.component.spec.ts`, and a possible `PA/lanes-table.component.spec.ts`
  (not seen in the listing). Advanced: `CH/advanced-settings.component.spec.ts`, `CH/license/license-status-card.component.spec.ts`,
  `CH/pro-features/agent-behaviour-section.component.spec.ts`, `CH/pro-features/claude-builtins-config.component.spec.ts`,
  `CH/pro-features/system-prompt-drawer.component.spec.ts`, `CH/output-style/output-style.store.spec.ts`,
  `CH/advanced/advanced-settings-group.component.spec.ts`.
- Probably untested (to confirm): the not-installed row controls (U-*), the redetect focus handoff (U-7), the
  header ring/count (P-1, P-3), the collapsed-layout detail facts (P-17, P-46), the cross-group order move (P-21).
- Tests for the new behaviour: the "Add more" strip (filter `kind === 'system' && status.kind === 'not-installed'`), global order
  over two row groups, and the group switch of Claude tools (A-28: sequence, one summary toast, partial failure).

## Providers recheck addendum (verified against source; supersedes the R rows above)

The second budget stop came before these corrections were merged into the rows. They are appended as written by the verifying agent.


- P-6 Max concurrent: `PA/agent-orchestration-config.component.html:12-30` (`ptah-field` "Max Concurrent", input
  testid `policy-max-concurrent-input`, 1-100). Handler `saveMaxConcurrent` `PA/agent-orchestration-config.component.ts:296-327`
  -> `state.saveSettings({orchestration:{maxConcurrentAgents}})` with Undo -> `agent:setConfig` `CORE/providers-commit.service.ts:181,190`.
  Test: `PA/agent-orchestration-config.component.spec.ts` "is a labelled 1-100 integer number input showing the saved value" (:292),
  "saves on commit through the state, with a toast and an Undo that writes the previous value" (:311), "D15: a failed save..." (:358).
- P-7 Order chips + "+N": `PA/agent-orchestration-config.component.html:41-98` (strip `policy-order`, chips `policy-order-chip-<id>`,
  `+{{hiddenCount()}}` :75, measuring copy :79-95); `chips`/`shownChips`/`hiddenCount` `.ts:144,184,188`. Empty text
  "No CLI agent installed yet." / "Loading…" html:166-170 (testid `policy-order-empty`). Backing: derived from
  `state.orchestration()` + `state.cliAgents()`. Test: spec :877 'a narrow strip shows the whole chips that fit and "+N"...', :918,
  :254, :753 'says so when no agent is installed'.
- P-8 Pencil popover: `PA/agent-orchestration-config.component.html:100-164` (trigger testid `policy-order-edit` :107-123, dialog
  `policy-order-popover`, title "Preferred order", `ptah-lane-order-list` :156-160 with `(reorder)="savePreferredOrder($event)"`).
  Handler `.ts:350-360` -> `savePreferredAgentOrder` `PA/preferred-agent-order-save.ts:5` -> `agent:setConfig`. Drag + up/down
  live in `PA/lane-order-list.component.ts` (has its own spec `lane-order-list.component.spec.ts`). Test: spec :407, :443 'moves an
  agent down, then up, writing the whole order each time, with Undo', :532 drag, :679 Escape focus return.
  NOTE: drag reorder exists here (lane-order-list) and NOT in the table order mode -> capability "drag reorder" must be kept
  in M-1 merged control or recorded as removed control.
- P-9 Re-detect: `PA/agent-orchestration-config.component.html:175-200` (testid `policy-redetect`, label "Re-detect CLIs" /
  "Detecting…"); `redetectClis` `.ts:329-345` -> `state.redetectClis()` `CORE/providers-settings-state.service.ts:830` ->
  `agent:detectClis` (:834); announces 'CLI agents re-detected.' or DETECT_FAILED alert. Test: spec :767 're-detects through the
  state and announces completion', :779 'is disabled with a spinner while detection runs'.
- Whole policy bar is rendered by the matrix at `PA/cli-orchestration-matrix.component.ts:149` (`<ptah-agent-orchestration-config />`).
- P-22 Identity: `PA/lane-row-identity.component.ts:145-176` (`ptah-table-row-title`, kind 'CLI agent'/'Ptah CLI', secondary =
  versionLabel or provider, hidden when collapsed; `ptah-provider-mark`; `ptah-lane-default-warning`). V. Test:
  `PA/lanes-table.visual.component.spec.ts` :199 'hides compact row subtitles...', :375, :519; lanes-table.component.spec :807.
- P-23 / U-3 hidden install link: `PA/lane-row-identity.component.ts:177-190` (only when collapsed && not-installed), hidden by
  `PA/lanes-table.component.css:165-170` (`display:none` inside ptah-lanes-table). V. Test: lanes-table.visual spec :569
  'keeps recovery actions beside status and tier counts in details' (asserts the guide element exists in the row header).
- P-25 Unsupported mark: it is `LaneDefaultWarningComponent` `PA/lanes-table-status.component.ts:84-107` (selector
  `ptah-lane-default-warning`, tabindex 0, glyph &#9432;, sr-only "Unsupported combination: <reason>",
  `resolveCliLaneDefaultPair`), rendered in identity `PA/lane-row-identity.component.ts:173-177`. V. Test: none found by name
  (cli-lane-default-cell spec :431 covers the resolver for the cell only) -> "none today for the row mark".
- P-24 status cell extra facts: `PA/lanes-table-status.component.ts:14-82`; collapsed label "Missing" for not-installed (:62-67);
  sr-only test text, runtime status `cli-matrix-runtime-status`, key status `cli-matrix-key-status`. Outputs installGuide/signIn
  declared (:69-70) but not used in its template. Test: lanes-table.component spec :839 'shows Sign in for needs-key...',
  :857 'shows the runtime status and a missing key'.
- P-36 / P-38 Model/effort save (assumption resolved): `PA/cli-model-effort-popover.component.ts` saveSystemModel :481,
  saveEffort :494, private saveSetting :556 -> `state.saveSettings({orchestration:{<cli model/effort key>}})` -> `agent:setConfig`;
  instance: saveInstanceModel :505 / saveInstanceEffort :527 -> `saveSettings({cli:[{action:'update',params:{id,selectedModel|reasoningEffort}}]})`
  -> `ptahCli:update` `CORE/providers-commit.service.ts:239`. System model list from `agent:listCliModels` (doc :87; state spec
  `CORE/providers-settings-state.service.spec.ts:601`). Undo via feedback.save. Test: `PA/cli-model-effort-popover.component.spec.ts`
  (25 tests; names not listed yet - grep `^\s*it(` there), lanes-table.component spec :261,:348,:389,:428,:456.
- U-6 correction: install command is a `select-all` `<code>` block, NOT a copy button: `PA/cli-provider-card-popovers.component.ts:28-32`;
  Re-detect button emits `redetectRequested(row.id)` (:31). Test: lanes-table-detail spec :265 'emits Re-detect from the install
  guide'; matrix spec :531 'opens the install guide and invokes Re-detect'; writes spec :603.
- P-43 Permission popover ALSO hosts the Copilot auto-approve toggle (`PA/cli-provider-card-popovers.component.ts:24-27`,
  `ptah-copilot-auto-approve-toggle`, `PA/copilot-auto-approve-toggle.component.ts:64-110` ->
  `saveSettings({orchestration:{copilotAutoApprove}})` -> `agent:setConfig`, Undo, "Check saved setting again" ->
  `refreshOrchestration`). MISSING from the inventory: add new row P-66 "Copilot auto-approve toggle (inside Native CLI
  behavior / Permission popover of the Copilot row)", decision keep. Test: `PA/copilot-auto-approve-toggle.component.spec.ts:71`
  'binds the toggle to the saved value and writes the flipped value through saveSettings, with Undo', :86, :99.
- P-51 Cursor credentials: [redacted] `PA/cursor-credential-popover.component.html` (status :33-50, env note :52-60, masked key +
  show/hide :83-95, Save :112, Remove two-step :121-170); `save`/`remove` `.ts:134,184` -> `state.saveCursorCredential`
  `CORE/providers-settings-state.service.ts:393` -> `agent:setConfig {cursorApiKey}` (:403). Test:
  `PA/cursor-credential-popover.component.spec.ts:107` 'saves the key through saveCursorCredential...', :140 removal, :81 env note;
  lanes-table-detail spec :216 'focuses the Cursor key when Credentials opens'.
- P-58 confirmed: `PA/cli-orchestration-matrix.component.ts:198-206` -> `PA/cli-shared-defaults.component.ts:20-72` (card "Ptah CLI
  defaults", `ptah-cli-lane-default-cell cli="ptah-cli" layout="wide" [showCaption]="false"`). Test:
  `PA/cli-shared-defaults.component.spec.ts:26` 'shows inherited scope and wide controls and forwards a safe selection'.
- P-59 reset in wide layout: `PA/cli-lane-default-cell.component.ts:230-261` (ghost "More default actions" popover -> "Reset to
  default (<desc>)"), `requestReset` :612-622 (yolo default needs the confirm dialog, `confirm` :638-646), layout input :428.
  Backing `resetPtahDefault` matrix :633-644 -> `CliLaneDefaultsStore.reset` -> `agent:setConfig`. V. Test:
  cli-lane-default-cell spec :387 'resets to the built-in plan default without confirmation', :368 confirmation; :140 layout attr.
- P-60 instances card: `PA/ptah-cli-instances.component.html:1-18` (heading "Ptah CLI instances" + description), header Add
  button :19-34 (only when not empty, emits 'header'), empty state :37-61 (emits 'empty'); outputs `.ts:129-140`; matrix
  `PA/cli-orchestration-matrix.component.ts:209-217`, `openAdd` :412, `addOrigin` :410, focus return :451. V. NOTE: there are
  THREE Add entry points today (section header, instances-card header when not empty, empty state). Test:
  `PA/ptah-cli-instances.component.spec.ts` (13 tests, names not listed yet); matrix spec :458 'exposes instance tiers, editor and add modal'.
- P-61 dead list: `PA/ptah-cli-instances.component.html:62-523` (`} @else {` list), fed `[rows]="[]"` at matrix `.ts:210`. V.
- P-62 Add/Edit modal: `PR/add-cli-instance-modal.component.ts:70-84` contract (create: unique name, provider connection except
  Claude API / OpenAI Codex, masked key, Copilot inline sign-in gating Create; edit: name + replacement key as two
  `ptahCli:update` writes), `submit` :358, saveSettings :385,:426 -> `ptahCli:create`/`ptahCli:update`
  (`CORE/providers-commit.service.ts:230,239`). Test: `PR/add-cli-instance-modal.component.spec.ts` (26 tests, names not listed).
- P-63 Tier modal: `PR/cli-tier-mapping-modal.component.ts:70-80` contract; `loadModels` :215 (PROVIDER_MODELS_LOADER
  `listModels`), inherited from `provider:getModelTiers {scope:'cliAgent'}`; `onPick` :233, `applyManual` :243, `retryMappings` :250,
  `useInherited` :264, `saveTier` :269 -> `state.setCliInstanceTiers` :285 -> `ptahCli:update {tierMappings}`
  `CORE/providers-commit.service.ts:300`. Test: `PR/cli-tier-mapping-modal.component.spec.ts` (17 tests, names not listed).

## Not done
- P-64 catalog modal (`PR/provider-catalog-modal.component.ts`, 143 lines; spec 9 tests) and P-65 catalog hint
  (`PR/providers-settings.component.ts` 1564 lines: `grep -n -i "catalog\|hint" `) not checked. Keep R.
- Test column for P-10..P-21, P-26..P-57: use test list already collected in
  /home/amun/ptah-extension/.claude-worktrees/settings-ui-polish/.ptah/tmp/provider-tests.txt (format `<spec>:<line>:'name'`).
  Key mappings found: P-1/P-3/P-4/P-5 -> lanes-section-header spec :18, :30; P-10/P-12 -> lanes-table.visual :227, :245, :220;
  P-11 -> matrix spec :477; P-14 -> matrix :496; P-15 -> matrix :510; P-17 -> lanes-table spec :229; P-18 -> visual :495;
  P-19 -> visual :286; P-20 -> lanes-table :760; P-21 -> lanes-table :673, :703, :727 + writes :469, :508; P-28 -> matrix :340,
  :359; P-30/P-31 -> writes :577, detail :277; P-32 -> lanes-table :501, :543, :573, writes :594; P-33/P-34 -> writes :381,
  :405, :430; P-39 -> lanes-table :348, detail :333; P-40 -> writes :366, :452, visual :314; P-41 -> visual :360; P-42 ->
  detail :72; P-44 -> matrix :434 + claude-lane-account-cell spec; P-48 -> detail :145; P-49 -> detail :84, visual :330;
  P-50 -> detail :254; P-52 -> detail :195; P-53 -> detail :307; P-55 -> lanes-table :181, :200; P-56 -> detail :175, visual :126;
  U-1/U-13 -> lanes-table :774 'is muted, shows a dash, no order buttons and a disabled toggle'; U-9 -> visual :330.
- `## Proposed Removals` R-1..R-3 against decisions.md rows 6-12 (`.ptah/specs/TASK_2026_2285_304a/decisions.md`): not read yet.
  Draft verdicts from code: R-1 controls are all disabled for not-installed rows (lanes-table spec :774, visual :314, :330) ->
  safe as control removal; Install guide + capabilities move to the "Add more" card. R-2 dead list -> remove, no capability.
  R-3: pencil popover holds DRAG reorder (lane-order-list) and the read-only order chips summary, which table Reorder mode lacks ->
  keep drag in the merged Reorder mode or keep the chips line; kebab Details and hidden identity link are pure duplicates.
- Update `## Gaps` Providers lines: remove the "not checked" list items covered above; add the Copilot toggle omission,
  the three Add entry points, drag-reorder loss risk, P-25 row-mark untested, P-64/P-65 still R.
