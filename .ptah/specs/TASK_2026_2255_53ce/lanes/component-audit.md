# Settings shared-component audit

Read-only source audit; only this report is written. No commit, push, verify, Nx, build, serve, test, e2e, or browser execution.

## Scope and interpretation

Inspected all 114 non-spec .ts/.html files under `libs/frontend/chat/src/lib/settings/**` (including stores, helpers and barrels); 83 files contain templates. Source and line evidence came from `rg -n`; file discovery used `rg --files`. The two larger files were read in numbered chunks to avoid output truncation.
Design inputs: `.ptah/specs/TASK_2026_2196_0f09/component-catalog.md`, `.ptah/specs/TASK_2026_2196_0f09/settings-design-spec.md`, `.ptah/specs/TASK_2026_2196_0f09/settings-apply-plan.md` from the supplied read-only design worktree. Their paths below are repository-relative; they need not exist in this checkout.
CLI-native skill invocation/discovery was unavailable in this lane; no SKILL.md was found under .codex/.agents. Used the explicitly requested ripgrep/file-read workflow. Ptah source/index/browser tools were not used because this lane restricts inspection to file reads.

Counts are source sites, not rendered instances or confirmed defects: one raw opening element; one native opening element; one DaisyUI class-bearing element/expression or supporting literal definition (13 definitions are counted once, not once per caller). Multiple classes on one element count once. Shared input directives and controls inside ptah-field are excluded from raw-control totals. Shared button/field/cell directives are excluded from raw-button totals.
Long layout candidates are div/section/header/label class strings with flex/grid and at least eight tokens; one icon-only wrapper was excluded. Their exact replacement suitability is UNVERIFIED; generic flex/grid is not itself a defect. This is a reproducible candidate count, not an exhaustive count of every possible pattern duplication.
DaisyUI totals include static classes and literal branches in class expressions plus verified supporting definitions. Arbitrary dynamic expressions and imported helper expansion are UNVERIFIED; totals are verified evidence sites, not a proof that no other runtime class can occur. Tailwind select-all/select-none/select-text are excluded. Native overlays are inventoried but expressly permitted by the corrected design.

## Summary counts

| Category | Total sites | Files |
|---|---:|---:|
| raw button | 64 | 25 |
| raw input/select/textarea | 22 | 13 |
| raw table | 0 | 0 |
| daisyUI class | 46 | 26 |
| ptah-native-* | 36 | 25 |
| one-off layout | 44 | 29 |

Adoption is substantial but incomplete: ptahButton appears in 62 template files, ptah-field in 24, ptahBadge in 24, ptah-form-section in 17, ptah-setting-row in 11, ptah-inline-confirm in 8, and ptah-table in 2. No raw table remains. No ptah-native-card remains. No ptah-select rich-select use was found in Settings templates; native select[ptahSelect] is used in 13 files.

## Verified shared selectors and exports

`libs/frontend/ui/src/index.ts:36-49` exports overlays, selection, native, surfaces, foundation, button, form-controls, badge, charts, card, patterns. Sub-barrels: surfaces/index.ts:1-9; form-controls/index.ts:1-9; patterns/index.ts:1-11. Table helpers are re-exported by patterns/table/table.component.ts:217-221. Paths and selector declaration lines below are relative to the repository.

| Selector | Declaration |
|---|---|
| `[ptahSurface]` | `libs/frontend/ui/src/lib/card/surface.directive.ts:24` |
| `ptah-form-section` | `libs/frontend/ui/src/lib/patterns/form-section/form-section.component.ts:41` |
| `button[ptahFieldTrigger]` | `libs/frontend/ui/src/lib/surfaces/field.component.ts:30` |
| `ptah-field` | `libs/frontend/ui/src/lib/surfaces/field.component.ts:61` |
| `ptah-section-header` | `libs/frontend/ui/src/lib/card/section-header.component.ts:24` |
| `ptah-form-actions` | `libs/frontend/ui/src/lib/patterns/form-actions/form-actions.component.ts:50` |
| `button[ptahInboxRow]` | `libs/frontend/ui/src/lib/surfaces/inbox-row.directive.ts:23` |
| `ng-template[ptahEditTemplate]` | `libs/frontend/ui/src/lib/patterns/editable-section/editable-section.component.ts:63` |
| `ptah-editable-section` | `libs/frontend/ui/src/lib/patterns/editable-section/editable-section.component.ts:87` |
| `ptah-surface-card` | `libs/frontend/ui/src/lib/surfaces/surface-card.component.ts:87` |
| `ptah-description-list` | `libs/frontend/ui/src/lib/patterns/description-list/description-list.component.ts:82` |
| `div[ptahDescriptionItem]` | `libs/frontend/ui/src/lib/patterns/description-list/description-list.component.ts:154` |
| `ptah-native-tab-group` | `libs/frontend/ui/src/lib/native/tab-group/native-tab-group.component.ts:73` |
| `ptah-toolbar` | `libs/frontend/ui/src/lib/foundation/toolbar.component.ts:5` |
| `input[type=checkbox][ptahToggle]` | `libs/frontend/ui/src/lib/form-controls/toggle.directive.ts:12` |
| `ptah-surface-tile` | `libs/frontend/ui/src/lib/surfaces/surface-tile.component.ts:9` |
| `textarea[ptahTextarea]` | `libs/frontend/ui/src/lib/form-controls/textarea.directive.ts:11` |
| `ptah-disclosure` | `libs/frontend/ui/src/lib/patterns/disclosure/disclosure.component.ts:20` |
| `ptah-state-panel` | `libs/frontend/ui/src/lib/foundation/state-panel.component.ts:7` |
| `[ptahTooltip]` | `libs/frontend/ui/src/lib/button/tooltip.directive.ts:11` |
| `select[ptahSelect]` | `libs/frontend/ui/src/lib/form-controls/select.directive.ts:12` |
| `ng-template[ptahDisclosureLazy]` | `libs/frontend/ui/src/lib/patterns/disclosure/disclosure-lazy.directive.ts:5` |
| `ptah-spinner` | `libs/frontend/ui/src/lib/foundation/spinner.component.ts:7` |
| `ptah-table` | `libs/frontend/ui/src/lib/patterns/table/table.component.ts:17` |
| `th[ptahNumeric], td[ptahNumeric]` | `libs/frontend/ui/src/lib/patterns/table/table.component.ts:211` |
| `ptah-settings-layout` | `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts:118` |
| `ptah-native-popover` | `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:77` |
| `button[ptahButton], a[ptahButton]` | `libs/frontend/ui/src/lib/button/button.directive.ts:19` |
| `ptah-setting-row` | `libs/frontend/ui/src/lib/patterns/setting-row/setting-row.component.ts:14` |
| `ptah-table-row-actions` | `libs/frontend/ui/src/lib/patterns/table/table-row-actions.component.ts:18` |
| `ptah-table-order-buttons` | `libs/frontend/ui/src/lib/patterns/table/table-order.ts:21` |
| `tr[ptahGroupRow]` | `libs/frontend/ui/src/lib/patterns/table/table-matrix.ts:29` |
| `th[ptahGroupHeader]` | `libs/frontend/ui/src/lib/patterns/table/table-matrix.ts:36` |
| `ptah-table-group-title` | `libs/frontend/ui/src/lib/patterns/table/table-matrix.ts:48` |
| `td[ptahBarCell]` | `libs/frontend/ui/src/lib/patterns/table/table-matrix.ts:63` |
| `ptah-table-score` | `libs/frontend/ui/src/lib/patterns/table/table-matrix.ts:79` |
| `th[ptahStickyHeader]` | `libs/frontend/ui/src/lib/patterns/table/table-matrix.ts:123` |
| `button[ptahCellButton]` | `libs/frontend/ui/src/lib/patterns/table/table-matrix.ts:134` |
| `td[ptahStatusCell]` | `libs/frontend/ui/src/lib/patterns/table/table-matrix.ts:159` |
| `ptah-instrument-band` | `libs/frontend/ui/src/lib/patterns/instrument-band/instrument-band.component.ts:29` |
| `button[ptahIconButton], a[ptahIconButton]` | `libs/frontend/ui/src/lib/button/icon-button.directive.ts:27` |
| `ptah-alert` | `libs/frontend/ui/src/lib/foundation/alert.component.ts:13` |
| `th[ptahCollapsible], td[ptahCollapsible]` | `libs/frontend/ui/src/lib/patterns/table/table-detail.ts:24` |
| `ptah-table-row-expander` | `libs/frontend/ui/src/lib/patterns/table/table-detail.ts:36` |
| `tr[ptahDetailRow]` | `libs/frontend/ui/src/lib/patterns/table/table-detail.ts:74` |
| `td[ptahDetailCell]` | `libs/frontend/ui/src/lib/patterns/table/table-detail.ts:95` |
| `ptah-table-row-title` | `libs/frontend/ui/src/lib/patterns/table/table-cells.ts:44` |
| `td[ptahControlCell]` | `libs/frontend/ui/src/lib/patterns/table/table-cells.ts:106` |
| `td[ptahActionsCell]` | `libs/frontend/ui/src/lib/patterns/table/table-cells.ts:113` |
| `tr[ptahRowState]` | `libs/frontend/ui/src/lib/patterns/table/table-cells.ts:120` |
| `td[ptahMessageCell]` | `libs/frontend/ui/src/lib/patterns/table/table-cells.ts:136` |
| `ptah-inline-confirm` | `libs/frontend/ui/src/lib/patterns/inline-confirm/inline-confirm.component.ts:18` |
| `ptah-popover` | `libs/frontend/ui/src/lib/overlays/popover/popover.component.ts:47` |
| `ptah-status` | `libs/frontend/ui/src/lib/badge/status.component.ts:24` |
| `input[type=checkbox][ptahCheckbox]` | `libs/frontend/ui/src/lib/form-controls/checkbox.directive.ts:9` |
| `span[ptahBadge]` | `libs/frontend/ui/src/lib/badge/badge.directive.ts:10` |
| `input[ptahInput]:not([type=checkbox]):not([type=radio])` | `libs/frontend/ui/src/lib/form-controls/input.directive.ts:13` |
| `ptah-select` | `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts:54` |
| `ptah-native-modal` | `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:68` |
| `ptah-native-card` | `libs/frontend/ui/src/lib/native/card/native-card.component.ts:104` |
| `ptah-dropdown` | `libs/frontend/ui/src/lib/overlays/dropdown/dropdown.component.ts:42` |
| `ptah-native-dropdown` | `libs/frontend/ui/src/lib/native/dropdown/native-dropdown.component.ts:64` |
| `ptah-native-drawer` | `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts:62` |
| `ptah-meter` | `libs/frontend/ui/src/lib/charts/meter.component.ts:29` |
| `ptah-ring` | `libs/frontend/ui/src/lib/charts/ring.component.ts:77` |
| `ptah-sparkline` | `libs/frontend/ui/src/lib/charts/sparkline.component.ts:17` |
| `ptah-stat` | `libs/frontend/ui/src/lib/charts/stat.component.ts:53` |

No literal ptah-button or ptah-card component exists: use button[ptahButton]/button[ptahIconButton] and ptah-surface-card/[ptahSurface]. There is no ptah-tabs, ptah-menu or ptah-dialog selector; tabs are ptah-native-tab-group or settings-layout navigation, menus use ptah-native-dropdown / ptah-table-row-actions, and dialogs use ptah-native-modal. These naming differences are not missing capabilities by themselves.

## Mapping evidence

Row mapping keys cite the design's named target. Quoted excerpts are deliberately short; spec overrides the catalog where it explicitly corrects it.

| Key | Source and quoted mapping |
|---|---|
| B | `.ptah/specs/TASK_2026_2196_0f09/component-catalog.md:16`: “PtahButtonDirective” / “button[ptahButton], a[ptahButton]”; :17 names button[ptahIconButton]. |
| F | `.ptah/specs/TASK_2026_2196_0f09/settings-design-spec.md:111`: “Text, number, secret, path input” → “ptah-field” + “input[ptahInput]”. Catalog :139: “The field owner of the form controls family”. |
| S | Spec :112: “select[ptahSelect] inside ptah-field for short static lists”; catalog :54: “Owner of the native <select> look”. |
| T | Spec :113: “input[ptahToggle]” in “ptah-setting-row”; catalog :56: “Owner of the on/off switch”. |
| C | Spec :120: “Choice among visual options” → “ptah-surface-tile”; :231: “grid of ptah-surface-tile” and “Keep the radiogroup semantics on the grid.” Radio replacement outside output styles is UNVERIFIED. |
| R | Spec :95: “A boolean or a short control with a label and hint is a ptah-setting-row”; :88: “A setting group is a ptah-form-section”; :92: “ptah-section-header plus ptah-toolbar”. |
| A | Spec :116: “ptah-alert compact”; catalog :62: “Shared layout or feedback primitive”. |
| I | Spec :100: “A destructive or irreversible write uses ptah-inline-confirm”; catalog :120 names ptah-editable-section and its Save/Cancel section behavior. |
| N | Spec :121: “ptah-native-drawer or ptah-native-popover”; :332-338 correct the catalog: “This design uses ptah-native-popover, ptah-native-dropdown, ptah-native-autocomplete and ptah-native-option.” |
| M | Spec :315: “One overflow menu per row”; table-row-actions.component.ts:25 projects [ptahInlineAction] and :26 uses ptah-native-dropdown. |
| P | Catalog :32: “PtahMeterComponent” / “ptah-meter”; spec :296: “Until it lands, use ptah-meter.” |
| L | Catalog :67: “PtahSpinnerComponent” / “ptah-spinner”; spec :98 names skeleton lines for block loading. |
| G | Catalog :9: “PtahBadgeDirective” / “span[ptahBadge]”. |
| K | No keyboard-shortcut primitive is named in the supplied mapping: replacement UNVERIFIED. |

## Per-file evidence

File cells use the repository-relative prefix `S = libs/frontend/chat/src/lib/settings/`. `Y` means the named shared target exists, not that this hit is necessarily a violation. `N` means that exact proposed primitive is absent. Snippets are at most 80 characters; line is the opening-element line or the literal-definition line from the numbered source read. Menu items projected into ptah-table-row-actions and retained native overlays can be compliant.

| File (S + suffix) | Category | Line | Snippet | Named shared target / mapping | Exists in ui? |
|---|---|---:|---|---|---|
| advanced/codex-sandbox-setting.component.ts | raw button | 237 | `<button type="button" [class]=" 'btn btn-outline btn-sm border-error text-base-c` | ptahButton / ptahIconButton; B | Y |
| feedback/settings-toast.component.ts | raw button | 142 | `<button type="button" class="btn btn-sm btn-warning font-bold" [ptahBusyDisabled` | ptahButton / ptahIconButton; B | Y |
| output-style/output-style-parity-section.component.ts | raw button | 147 | `<button type="button" class="btn btn-outline btn-xs border-error text-base-conte` | ptahButton / ptahIconButton; B | Y |
| providers/accounts/account-detail-view.component.ts | raw button | 200 | `<button type="button" [class]="'btn btn-outline btn-error btn-sm min-h-8 ' + foc` | ptahButton / ptahIconButton; B | Y |
| providers/accounts/account-detail-view.component.ts | raw button | 294 | `<button footer #removeButton type="button" [class]="'btn btn-outline btn-error b` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/advanced-tab.component.ts | raw button | 157 | `<button type="button" class="btn btn-outline btn-sm border-error text-base-conte` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/advanced-tab.component.ts | raw button | 165 | `<button type="button" class="btn btn-outline btn-sm border-error text-base-conte` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/codex-sign-in-block.component.ts | raw button | 93 | `<button type="button" [class]="connectionRole() === 'chosen' ? 'btn btn-primary ` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/codex-sign-in-block.component.ts | raw button | 98 | `<button type="button" [class]="connectionRole() === 'chosen' ? 'btn btn-primary ` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/credentials-tab.component.ts | raw button | 168 | `<button type="button" class="btn btn-outline btn-sm border-error text-base-conte` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/credentials-tab.component.ts | raw button | 176 | `<button type="button" class="btn btn-outline btn-sm border-error text-base-conte` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/credentials-tab.component.ts | raw button | 322 | `<button type="button" class="btn btn-outline btn-sm border-error text-base-conte` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/credentials-tab.component.ts | raw button | 384 | `<button type="button" class="btn btn-outline btn-sm border-error text-base-conte` | ptahButton / ptahIconButton; B | Y |
| ptah-ai/cli-lane-default-cell.component.ts | raw button | 376 | `<button type="button" class="btn btn-warning btn-sm" (click)="confirm()" >` | ptahButton / ptahIconButton; B | Y |
| ptah-ai/cursor-credential-popover.component.ts | raw button | 164 | `<button type="button" [class]="'btn btn-primary btn-xs min-h-7 ' + focusRing" [a` | ptahButton / ptahIconButton; B | Y |
| providers/add-cli-instance-modal.component.ts | raw button | 327 | `<button type="submit" class="hidden" tabindex="-1" aria-hidden="true" >` | ptahButton / ptahIconButton; B | Y |
| providers/agents-routing-settings.component.ts | raw button | 85 | `<button type="button" [class]="control" (click)="section.retry()">` | ptahButton / ptahIconButton; B | Y |
| providers/connection-drawer/overview-tab.component.ts | raw button | 228 | `<button type="button" class="link link-hover inline-flex shrink-0 items-center g` | ptahButton / ptahIconButton; B | Y |
| providers/decision-model-key-field.component.ts | raw button | 84 | `<button type="button" [class]="actionClass" [disabled]="disabled()" (click)="rem` | ptahButton / ptahIconButton; B | Y |
| providers/decision-model-row.component.ts | raw button | 159 | `<button #cell trigger type="button" [class]="cellClass" [attr.aria-disabled]="bu` | ptahButton / ptahIconButton; B | Y |
| providers/decision-model-row.component.ts | raw button | 252 | `<button type="button" [class]="action" (click)="setUpOllamaCloud()" data-testid=` | ptahButton / ptahIconButton; B | Y |
| providers/decision-model-row.component.ts | raw button | 418 | `<button type="button" [class]="action" [attr.aria-label]="'Set up ' + row().setu` | ptahButton / ptahIconButton; B | Y |
| providers/decision-model-row.component.ts | raw button | 429 | `<button type="button" [class]="action" aria-label="Retry reading the decision mo` | ptahButton / ptahIconButton; B | Y |
| providers/main-agent-reassign-popover.component.ts | raw button | 212 | `<button type="button" [class]="effortClass(level.value)" [attr.aria-pressed]="se` | ptahButton / ptahIconButton; B | Y |
| providers/main-agent-scope-badges.component.ts | raw button | 58 | `<button trigger type="button" [class]="look(group.scope).tone + ' whitespace-now` | ptahButton / ptahIconButton; B | Y |
| providers/provider-connection-card.component.ts | raw button | 72 | `<button type="button" class="absolute inset-0 z-0 w-full cursor-pointer rounded-` | ptahButton / ptahIconButton; B | Y |
| providers/provider-consumer-assignments.component.ts | raw button | 170 | `<button type="button" [class]="action" [attr.aria-label]="'Retry loading ' + row` | ptahButton / ptahIconButton; B | Y |
| providers/provider-consumer-assignments.component.ts | raw button | 192 | `<button trigger type="button" [class]="cell + (row.followsMain ? ' font-medium' ` | ptahButton / ptahIconButton; B | Y |
| providers/provider-consumer-assignments.component.ts | raw button | 285 | `<button type="button" [class]="action" [attr.aria-label]=" 'Set up ' + readiness` | ptahButton / ptahIconButton; B | Y |
| providers/provider-consumer-assignments.component.ts | raw button | 335 | `<button type="button" [class]="action" [attr.aria-label]="'Retry loading ' + row` | ptahButton / ptahIconButton; B | Y |
| providers/provider-consumer-assignments.component.ts | raw button | 372 | `<button type="button" [class]="action" (click)="retryEnhancementRequested.emit()` | ptahButton / ptahIconButton; B | Y |
| providers/provider-consumer-assignments.component.ts | raw button | 380 | `<button type="button" [class]="action" (click)="editTimeout()" data-testid="time` | ptahButton / ptahIconButton; B | Y |
| providers/provider-consumer-assignments.component.ts | raw button | 406 | `<button type="button" [class]="action" [disabled]="busy() \|\| disabled()" aria-` | ptahButton / ptahIconButton; B | Y |
| providers/provider-consumer-assignments.component.ts | raw button | 459 | `<button type="button" [class]="action" [disabled]="busy() \|\| disabled()" aria-` | ptahButton / ptahIconButton; B | Y |
| providers/provider-setup-wizard.component.ts | raw button | 330 | `<button type="button" class="min-h-9 text-xs text-base-content hover:underline f` | ptahButton / ptahIconButton; B | Y |
| providers/provider-setup-wizard.component.ts | raw button | 363 | `<button type="button" class="min-h-9 text-xs text-base-content hover:underline f` | ptahButton / ptahIconButton; B | Y |
| providers/providers-settings.component.ts | raw button | 174 | `<button type="button" [class]="retryControl" (click)="section.retry()" >` | ptahButton / ptahIconButton; B | Y |
| providers/providers-settings.component.ts | raw button | 214 | `<button type="button" [class]="control" (click)="clearOverride()" [ptahBusyDisab` | ptahButton / ptahIconButton; B | Y |
| providers/providers-settings.component.ts | raw button | 222 | `<button type="button" [class]="control" (click)="clearKey.set(null)" [disabled]=` | ptahButton / ptahIconButton; B | Y |
| providers/providers-settings.component.ts | raw button | 555 | `<button type="button" [class]="retryControl" (click)="closeWizard()" data-testid` | ptahButton / ptahIconButton; B | Y |
| **Remaining 24 raw button sites** | raw button | — | Counts per file below | Same category mapping above | — |
| providers/setting-scope-row.component.ts | raw button: 4 additional | — | — | B/M | Y |
| ptah-ai/claude-lane-account-cell.component.ts | raw button: 2 additional | — | — | B/M | Y |
| ptah-ai/cli-model-effort-popover.component.ts | raw button: 2 additional | — | — | B/M | Y |
| ptah-ai/lanes-table.component.ts | raw button: 10 additional | — | — | B/M | Y |
| ptah-ai/ptah-cli-instances.component.ts | raw button: 6 additional | — | — | B/M | Y |
| advanced/codex-sandbox-setting.component.ts | raw input/select/textarea | 176 | `<input #modeRadio type="radio" name="codex-sandbox-mode" [class]="'radio radio-x` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| output-style/output-style-editor.component.ts | raw input/select/textarea | 280 | `<input type="radio" name="output-style-tier" class="radio radio-xs mt-[var(--pta` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| output-style/output-style-list.component.ts | raw input/select/textarea | 150 | `<input type="radio" name="active-output-style" role="radio" class="cursor-pointe` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/add-cli-instance-modal.component.ts | raw input/select/textarea | 278 | `<input type="radio" name="claude-source" [checked]="claudeSource() === 'shared-c` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/add-cli-instance-modal.component.ts | raw input/select/textarea | 279 | `<input type="radio" name="claude-source" [checked]="claudeSource() === 'instance` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/decision-model-key-field.component.ts | raw input/select/textarea | 66 | `<input #field id="decision-model-api-key" type="password" [class]="inputClass" a` | ptah-field + ptahInput; F | Y |
| providers/decision-model-row.base-url-field.component.ts | raw input/select/textarea | 27 | `<input id="decision-model-base-url" type="text" inputmode="url" [class]="error()` | ptah-field + ptahInput; F | Y |
| providers/decision-model-row.component.ts | raw input/select/textarea | 222 | `<select id="decision-model-kind" [class]="selectClass" [disabled]="busy() \|\| d` | ptah-field + ptahSelect; S | Y |
| providers/decision-model-row.component.ts | raw input/select/textarea | 265 | `<select id="decision-model-provider" [class]="selectClass" [disabled]="busy() \|` | ptah-field + ptahSelect; S | Y |
| providers/decision-model-row.component.ts | raw input/select/textarea | 307 | `<input id="decision-model-model" type="text" list="decision-model-suggestions" [` | ptah-field + ptahInput; F | Y |
| providers/decision-model-row.timeout-field.component.ts | raw input/select/textarea | 83 | `<input id="decision-model-timeout" type="text" inputmode="numeric" [class]="erro` | ptah-field + ptahInput; F | Y |
| providers/provider-setup-wizard.component.ts | raw input/select/textarea | 454 | `<input type="radio" class="radio radio-sm mt-0.5" name="wizard-provider" [value]` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/provider-setup-wizard.component.ts | raw input/select/textarea | 491 | `<input type="radio" class="radio radio-sm mt-0.5" name="wizard-provider" [value]` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/provider-setup-wizard.component.ts | raw input/select/textarea | 542 | `<input type="radio" class="radio radio-sm mt-0.5" name="wizard-protocol" [checke` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/provider-setup-wizard.component.ts | raw input/select/textarea | 558 | `<input type="radio" class="radio radio-sm mt-0.5" name="wizard-protocol" [checke` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/provider-setup-wizard.component.ts | raw input/select/textarea | 1243 | `<input type="radio" class="radio radio-sm mt-0.5" name="wizard-activation" [chec` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/provider-setup-wizard.component.ts | raw input/select/textarea | 1263 | `<input type="radio" class="radio radio-sm mt-0.5" name="wizard-activation" [chec` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| providers/provider-setup-wizard.component.ts | raw input/select/textarea | 1294 | `<input type="radio" class="radio radio-sm mt-0.5" name="wizard-save-to" [checked` | ptah-surface-tile; C (outside output style UNVERIFIED) | Y |
| ptah-ai/copilot-auto-approve-toggle.component.ts | raw input/select/textarea | 42 | `<input type="checkbox" [class]="'toggle toggle-xs toggle-success ' + focusRing" ` | ptahToggle + ptah-setting-row; T | Y |
| ptah-ai/host-routing-setting.component.ts | raw input/select/textarea | 75 | `<input id="host-routing-toggle" type="checkbox" [class]="'toggle toggle-xs toggl` | ptahToggle + ptah-setting-row; T | Y |
| ptah-ai/lane-rotation-setting.component.ts | raw input/select/textarea | 65 | `<input id="lane-rotation-toggle" type="checkbox" [class]="'toggle toggle-xs togg` | ptahToggle + ptah-setting-row; T | Y |
| ptah-ai/web-search-config.component.ts | raw input/select/textarea | 195 | `<input id="web-search-max-results" type="range" min="1" max="20" [value]="maxRes` | ptah-field + ptahInput; F (slider styling UNVERIFIED) | Y |
| advanced/codex-sandbox-setting.component.ts | daisyUI class | 237 | `btn btn-outline btn-sm :: <button type="button" [class]=" 'btn btn-outline btn-s` | ptahButton; B | Y |
| feedback/settings-toast.component.ts | daisyUI class | 142 | `btn btn-sm btn-warning :: <button type="button" class="btn btn-sm btn-warning fo` | ptahButton; B | Y |
| output-style/output-style-parity-section.component.ts | daisyUI class | 147 | `btn btn-outline btn-xs :: <button type="button" class="btn btn-outline btn-xs bo` | ptahButton; B | Y |
| pro-features/system-prompt-drawer.component.ts | daisyUI class | 251 | `progress progress-primary :: <progress class="progress progress-primary w-full" ` | ptah-meter; P | Y |
| pro-features/system-prompt-drawer.component.ts | daisyUI class | 289 | `loading loading-spinner loading-xs :: <span class="loading loading-spinner loadi` | ptah-spinner / ptah-skeleton; L | Y |
| pro-features/system-prompt-drawer.component.ts | daisyUI class | 343 | `loading loading-spinner loading-xs :: <span class="loading loading-spinner loadi` | ptah-spinner / ptah-skeleton; L | Y |
| pro-features/system-prompt-drawer.component.ts | daisyUI class | 369 | `loading loading-spinner loading-xs :: <span class="loading loading-spinner loadi` | ptah-spinner / ptah-skeleton; L | Y |
| providers/accounts/account-detail-view.component.ts | daisyUI class | 158 | `loading loading-spinner :: <span class="inline-block h-3 w-3 shrink-0 loading lo` | ptah-spinner / ptah-skeleton; L | Y |
| providers/accounts/account-detail-view.component.ts | daisyUI class | 200 | `btn btn-outline btn-error btn-sm :: <button type="button" [class]="'btn btn-outl` | ptahButton; B | Y |
| providers/accounts/account-detail-view.component.ts | daisyUI class | 294 | `btn btn-outline btn-error btn-sm :: <button footer #removeButton type="button" [` | ptahButton; B | Y |
| providers/accounts/accounts-tab.component.ts | daisyUI class | 209 | `loading loading-spinner :: <span class="inline-block h-3 w-3 shrink-0 loading lo` | ptah-spinner / ptah-skeleton; L | Y |
| providers/accounts/accounts-tab.component.ts | daisyUI class | 270 | `loading loading-spinner :: <span class="inline-block h-3 w-3 shrink-0 loading lo` | ptah-spinner / ptah-skeleton; L | Y |
| providers/accounts/ambient-account-row.component.ts | daisyUI class | 64 | `loading loading-spinner :: <span class="inline-block h-3 w-3 shrink-0 loading lo` | ptah-spinner / ptah-skeleton; L | Y |
| providers/agents-routing-settings.component.ts | daisyUI class | 34 | `'btn btn-outline btn-sm border-base-content-muted bg-base-100 text-base-content ` | ptahButton; B | Y |
| providers/connection-drawer/advanced-tab.component.ts | daisyUI class | 157 | `btn btn-outline btn-sm :: <button type="button" class="btn btn-outline btn-sm bo` | ptahButton; B | Y |
| providers/connection-drawer/advanced-tab.component.ts | daisyUI class | 165 | `btn btn-outline btn-sm :: <button type="button" class="btn btn-outline btn-sm bo` | ptahButton; B | Y |
| providers/connection-drawer/codex-sign-in-block.component.ts | daisyUI class | 93 | `btn btn-primary btn-sm btn btn-outline btn-sm :: <button type="button" [class]="` | ptahButton; B | Y |
| providers/connection-drawer/codex-sign-in-block.component.ts | daisyUI class | 98 | `btn btn-primary btn-sm btn btn-outline btn-sm :: <button type="button" [class]="` | ptahButton; B | Y |
| providers/connection-drawer/credentials-tab.component.ts | daisyUI class | 168 | `btn btn-outline btn-sm :: <button type="button" class="btn btn-outline btn-sm bo` | ptahButton; B | Y |
| providers/connection-drawer/credentials-tab.component.ts | daisyUI class | 176 | `btn btn-outline btn-sm :: <button type="button" class="btn btn-outline btn-sm bo` | ptahButton; B | Y |
| providers/connection-drawer/credentials-tab.component.ts | daisyUI class | 322 | `btn btn-outline btn-sm :: <button type="button" class="btn btn-outline btn-sm bo` | ptahButton; B | Y |
| providers/connection-drawer/credentials-tab.component.ts | daisyUI class | 384 | `btn btn-outline btn-sm :: <button type="button" class="btn btn-outline btn-sm bo` | ptahButton; B | Y |
| providers/decision-model-key-field.component.ts | daisyUI class | 13 | `export const DECISION_ACTION = 'btn btn-ghost btn-sm px-2 text-xs font-medium te` | ptahButton; B | Y |
| providers/decision-model-key-field.component.ts | daisyUI class | 20 | `export const DECISION_SELECT = 'select select-bordered select-sm min-h-8 w-full ` | ptah-field + ptahSelect; S | Y |
| providers/decision-model-key-field.component.ts | daisyUI class | 21 | `const INPUT_BASE = 'input input-bordered input-sm min-h-8 w-full min-w-0 bg-base` | ptah-field + ptahInput; F | Y |
| providers/decision-model-key-field.component.ts | daisyUI class | 24 | `export const DECISION_INPUT_INVALID = '${INPUT_BASE} input-error !border-[color:` | ptah-field + ptahInput; F | Y |
| providers/main-agent-reassign-popover.component.ts | daisyUI class | 506 | `return 'btn btn-sm w-full px-1 text-xs font-medium ${selected ? 'btn-primary' : ` | ptah-field + ptahSelect; S | Y |
| providers/provider-catalog-modal.component.ts | daisyUI class | 39 | `kbd kbd-xs :: <kbd class="kbd kbd-xs" aria-hidden="true">` | UNVERIFIED (no mapped keyboard primitive); K | N |
| providers/provider-setup-wizard.component.ts | daisyUI class | 1031 | `loading loading-spinner :: <span class="loading loading-spinner inline-block h-3` | ptah-spinner / ptah-skeleton; L | Y |
| providers/providers-settings.component.ts | daisyUI class | 94 | `'btn btn-outline btn-sm border-base-content-muted bg-base-100 text-base-content ` | ptahButton; B | Y |
| providers/providers-settings.component.ts | daisyUI class | 991 | `'btn btn-outline btn-sm border-base-content-muted text-base-content focus-visibl` | ptahButton; B | Y |
| providers/setting-scope-row.component.ts | daisyUI class | 51 | `'badge badge-sm h-auto min-h-6 gap-1 px-2 py-0.5 text-xs font-semibold text-base` | span[ptahBadge]; G | Y |
| providers/setting-scope-row.component.ts | daisyUI class | 62 | `return { icon: null, iconTone: '', tone: '${BADGE_BASE} badge-outline border-bas` | span[ptahBadge]; G | Y |
| providers/setting-scope-row.component.ts | daisyUI class | 70 | `'btn btn-ghost btn-sm min-h-9 w-full justify-start text-base-content focus-visib` | ptahButton; B | Y |
| ptah-ai/agent-orchestration-config.component.ts | daisyUI class | 289 | `loading loading-spinner loading-xs :: <span class="loading loading-spinner loadi` | ptah-spinner / ptah-skeleton; L | Y |
| ptah-ai/cli-lane-default-cell.component.ts | daisyUI class | 353 | `modal :: <dialog #confirmation class="modal" (cancel)="cancel($e` | ptah-inline-confirm for destructive write; I | Y |
| ptah-ai/cli-lane-default-cell.component.ts | daisyUI class | 360 | `modal-box :: <div class="modal-box border border-base-content/60 bg-` | ptah-inline-confirm for destructive write; I | Y |
| ptah-ai/cli-lane-default-cell.component.ts | daisyUI class | 373 | `modal-action :: <div class="modal-action">` | ptah-inline-confirm for destructive write; I | Y |
| ptah-ai/cli-lane-default-cell.component.ts | daisyUI class | 376 | `btn btn-warning btn-sm :: <button type="button" class="btn btn-warning btn-sm" (` | ptahButton; B | Y |
| ptah-ai/cli-model-effort-popover.component.ts | daisyUI class | 469 | `return 'btn btn-xs min-h-7 font-medium ${selected ? 'btn-primary' : 'btn-outline` | ptah-field + ptahSelect; S | Y |
| **Remaining 6 daisyUI class sites** | daisyUI class | — | Counts per file below | Same category mapping above | — |
| ptah-ai/copilot-auto-approve-toggle.component.ts | daisyUI class: 1 additional | — | — | B/F/S/G | Y |
| ptah-ai/cursor-credential-popover.component.ts | daisyUI class: 1 additional | — | — | B/F/S/G | Y |
| ptah-ai/host-routing-setting.component.ts | daisyUI class: 1 additional | — | — | B/F/S/G | Y |
| ptah-ai/lane-rotation-setting.component.ts | daisyUI class: 1 additional | — | — | B/F/S/G | Y |
| ptah-ai/ptah-cli-instances.component.ts | daisyUI class: 1 additional | — | — | B/F/S/G | Y |
| ptah-ai/session-budget-settings.component.ts | daisyUI class: 1 additional | — | — | B/F/S/G | Y |
| license/license-status-card.component.ts | ptah-native-* | 138 | `<ptah-native-popover [isOpen]="keyPopoverOpen()" placement="bottom-end" [hasBack` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| output-style/output-style-editor.component.ts | ptah-native-* | 98 | `<ptah-native-drawer [isOpen]="isOpen()" widthClass="w-full max-w-lg" ariaLabel="` | ptah-native-drawer (keep; N; native tabs/modal: catalog) | Y |
| output-style/output-style-instructions-field.component.ts | ptah-native-* | 75 | `<ptah-native-tab-group [tabs]="editorTabs" [activeId]="activeTab()" (activeIdCha` | ptah-native-tab-group (keep; N; native tabs/modal: catalog) | Y |
| pro-features/agent-behaviour-section.component.ts | ptah-native-* | 204 | `<ptah-native-popover [isOpen]="effortPopoverOpen()" placement="bottom-start" bac` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| pro-features/system-prompt-drawer.component.ts | ptah-native-* | 90 | `<ptah-native-drawer [isOpen]="isOpen()" widthClass="w-full max-w-lg" ariaLabel="` | ptah-native-drawer (keep; N; native tabs/modal: catalog) | Y |
| providers/accounts/account-detail-view.component.ts | ptah-native-* | 310 | `<ptah-native-modal [isOpen]="confirmingRemove()" ariaLabelledby="account-detail-` | ptah-native-modal (keep; N; native tabs/modal: catalog) | Y |
| providers/add-cli-instance-modal.component.ts | ptah-native-* | 102 | `<ptah-native-modal [isOpen]="open()" ariaLabelledby="add-cli-instance-title" siz` | ptah-native-modal (keep; N; native tabs/modal: catalog) | Y |
| providers/cli-tier-mapping-modal.component.ts | ptah-native-* | 60 | `<ptah-native-modal [isOpen]="open()" ariaLabelledby="cli-tier-mapping-title" siz` | ptah-native-modal (keep; N; native tabs/modal: catalog) | Y |
| providers/connection-detail-drawer.component.ts | ptah-native-* | 67 | `<ptah-native-drawer [isOpen]="connection() !== null" widthClass="w-full max-w-lg` | ptah-native-drawer (keep; N; native tabs/modal: catalog) | Y |
| providers/connection-detail-drawer.component.ts | ptah-native-* | 82 | `<ptah-native-tab-group class="-mx-2 block [&_[role=tablist]]:flex-wrap" [tabs]="` | ptah-native-tab-group (keep; N; native tabs/modal: catalog) | Y |
| providers/decision-model-row.component.ts | ptah-native-* | 147 | `<ptah-native-popover #editorPopover class="consumer-cell-popover block w-full mi` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| providers/main-agent-reassign-popover.component.ts | ptah-native-* | 90 | `<ptah-native-popover [isOpen]="open()" placement="bottom-start" [hasBackdrop]="t` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| providers/main-agent-scope-badges.component.ts | ptah-native-* | 56 | `<ptah-native-popover [isOpen]="openLayer() === group.scope" placement="bottom-st` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| providers/provider-catalog-modal.component.ts | ptah-native-* | 29 | `<ptah-native-modal [isOpen]="open()" ariaLabelledby="provider-catalog-title" siz` | ptah-native-modal (keep; N; native tabs/modal: catalog) | Y |
| providers/provider-consumer-assignments.component.ts | ptah-native-* | 184 | `<ptah-native-popover class="consumer-cell-popover block w-full min-w-0" [isOpen]` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| providers/provider-setup-wizard.component.ts | ptah-native-* | 294 | `<ptah-native-drawer [isOpen]="open()" widthClass="w-full max-w-2xl" ariaLabel="C` | ptah-native-drawer (keep; N; native tabs/modal: catalog) | Y |
| providers/setting-scope-row.component.ts | ptah-native-* | 97 | `<ptah-native-popover [isOpen]="open()" placement="bottom-start" [hasBackdrop]="t` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/agent-orchestration-config.component.ts | ptah-native-* | 201 | `<ptah-native-popover class="shrink-0" [isOpen]="orderOpen()" placement="bottom-e` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/capability-matrix-setting.component.ts | ptah-native-* | 231 | `<ptah-native-popover [isOpen]=" openCell() === rowId(family, profile.model, kind` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/capability-matrix-setting.component.ts | ptah-native-* | 342 | `<ptah-native-popover [isOpen]=" openCell() === rowId(family, profile.model, kind` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/claude-lane-account-cell.component.ts | ptah-native-* | 71 | `<ptah-native-popover [isOpen]="open()" placement="bottom-start" [hasBackdrop]="t` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/cli-lane-default-cell.component.ts | ptah-native-* | 114 | `<ptah-native-popover class="defaults-reset" [isOpen]="resetOpen()" placement="bo` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/cli-lane-default-cell.component.ts | ptah-native-* | 246 | `<ptah-native-popover [isOpen]="resetOpen()" placement="bottom-start" [hasBackdro` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/lanes-table-detail.component.ts | ptah-native-* | 80 | `<ptah-native-popover [isOpen]="isOpen('permission')" [keepInViewport]="true" pla` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/lanes-table-detail.component.ts | ptah-native-* | 115 | `<ptah-native-popover [isOpen]="isOpen(kind)" [keepInViewport]="true" placement="` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/lanes-table-detail.component.ts | ptah-native-* | 157 | `<ptah-native-popover [isOpen]="isOpen('credentials')" [keepInViewport]="true" pl` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/lanes-table-detail.component.ts | ptah-native-* | 233 | `<ptah-native-popover [isOpen]="isOpen('capabilities')" [keepInViewport]="true" p` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/lanes-table.component.ts | ptah-native-* | 241 | `<ptah-native-popover [isOpen]="isOpen(row, 'model', place)" [keepInViewport]="tr` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/lanes-table.component.ts | ptah-native-* | 281 | `<ptah-native-popover [isOpen]="isOpen(row, 'effort', place)" [keepInViewport]="t` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/ptah-cli-instances.component.ts | ptah-native-* | 191 | `<ptah-native-popover [isOpen]="capabilitiesOpen() === row.id" placement="bottom-` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/ptah-cli-instances.component.ts | ptah-native-* | 256 | `<ptah-native-popover [isOpen]="isOpen(row.id, 'more')" placement="bottom-end" [h` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/ptah-cli-instances.component.ts | ptah-native-* | 339 | `<ptah-native-popover [isOpen]="isOpen(row.id, 'model')" placement="bottom-start"` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/ptah-cli-instances.component.ts | ptah-native-* | 375 | `<ptah-native-popover [isOpen]="isOpen(row.id, 'effort')" placement="bottom-start` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/voice-details-drawer.component.ts | ptah-native-* | 52 | `<ptah-native-drawer [isOpen]="direction() !== null" widthClass="w-full max-w-2xl` | ptah-native-drawer (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/voice-details-drawer.component.ts | ptah-native-* | 62 | `<ptah-native-tab-group class="-mx-2 block" [tabs]="tabs" [activeId]="direction()` | ptah-native-tab-group (keep; N; native tabs/modal: catalog) | Y |
| ptah-ai/web-search-key-editor.component.ts | ptah-native-* | 12 | `<ptah-native-popover [isOpen]="isOpen()" (closed)="editorClosed.emit()" >` | ptah-native-popover (keep; N; native tabs/modal: catalog) | Y |
| advanced/advanced-settings-group.component.ts | one-off layout | 95 | `flex flex-col gap-3 border-b border-base-content/10 pb-7 text-sm text-base-conte` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| advanced/advanced-settings-group.component.ts | one-off layout | 185 | `flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border border-base-` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| advanced/codex-sandbox-setting.component.ts | one-off layout | 173 | `flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-base-content tran` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| advanced/codex-sandbox-setting.component.ts | one-off layout | 221 | `flex max-w-xl flex-col gap-2 rounded border border-warning/40 bg-warning/10 p-2.` | ptah-alert / ptah-inline-confirm; A/I (UNVERIFIED fit) | Y |
| feedback/settings-toast.component.ts | one-off layout | 132 | `relative flex items-center gap-3 rounded-lg border bg-base-300 px-4 py-2.5 text-` | ptah-alert / ptah-inline-confirm; A/I (UNVERIFIED fit) | Y |
| output-style/output-style-editor.component.ts | one-off layout | 124 | `flex items-start gap-[var(--ptah-gap-controls)] rounded border border-warning/40` | ptah-alert / ptah-inline-confirm; A/I (UNVERIFIED fit) | Y |
| output-style/output-style-editor.component.ts | one-off layout | 277 | `flex items-start gap-[var(--ptah-gap-controls)] rounded px-[var(--ptah-gap-inlin` | ptah-surface-tile; C | Y |
| output-style/output-style-instructions-field.component.ts | one-off layout | 28 | `flex items-center justify-between py-1.5 px-2 rounded hover:bg-base-200/50 trans` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| output-style/output-style-list.component.ts | one-off layout | 261 | `flex flex-wrap items-center gap-[var(--ptah-gap-controls)] rounded border border` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| output-style/output-style-notices.component.ts | one-off layout | 134 | `flex flex-wrap items-center gap-[var(--ptah-gap-controls)] rounded border border` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| output-style/output-style-parity-section.component.ts | one-off layout | 130 | `mt-2 flex items-center gap-2 rounded border border-base-300 p-2 text-xs text-bas` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| output-style/output-style-parity-section.component.ts | one-off layout | 169 | `flex items-start gap-2 rounded border border-warning/40 bg-warning/10 p-2 mt-2 t` | ptah-alert / ptah-inline-confirm; A/I (UNVERIFIED fit) | Y |
| pro-features/claude-builtins-config.component.ts | one-off layout | 88 | `flex gap-[var(--ptah-gap-controls)] rounded border border-info/50 p-[var(--ptah-` | ptah-alert / ptah-inline-confirm; A/I (UNVERIFIED fit) | Y |
| pro-features/claude-builtins-config.component.ts | one-off layout | 98 | `flex items-center gap-[var(--ptah-gap-inline)] mb-[var(--ptah-gap-field)] rounde` | ptah-alert / ptah-inline-confirm; A/I (UNVERIFIED fit) | Y |
| pro-features/system-prompt-drawer.component.ts | one-off layout | 128 | `flex items-center gap-[var(--ptah-gap-label)] rounded border border-error/40 tex` | ptah-alert / ptah-inline-confirm; A/I (UNVERIFIED fit) | Y |
| pro-features/system-prompt-drawer.component.ts | one-off layout | 155 | `flex items-center gap-[var(--ptah-gap-label)] rounded border border-base-300 tex` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| providers/accounts/ambient-account-row.component.ts | one-off layout | 43 | `flex flex-wrap items-center gap-x-[var(--ptah-gap-heading)] gap-y-[var(--ptah-ga` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| providers/add-cli-instance-modal.component.ts | one-off layout | 108 | `surface-3 -mx-6 -mt-6 mb-4 flex items-center justify-between gap-2 border-b px-5` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/add-cli-instance-modal.component.ts | one-off layout | 335 | `surface-3 -mx-6 -mb-6 mt-5 flex items-center justify-between gap-2 border-t px-5` | ptah-form-actions; catalog :121 (UNVERIFIED fit) | Y |
| providers/cli-tier-mapping-modal.component.ts | one-off layout | 61 | `-mx-6 -mt-6 mb-4 flex items-center justify-between gap-2 border-b border-base-30` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/cli-tier-mapping-modal.component.ts | one-off layout | 135 | `-mx-6 -mb-6 mt-5 flex items-center justify-end gap-2 border-t border-base-300 bg` | ptah-form-actions; catalog :121 (UNVERIFIED fit) | Y |
| providers/connection-detail-drawer.component.ts | one-off layout | 134 | `flex items-center justify-between gap-2 border-t border-base-300 px-4 py-3` | ptah-form-actions; catalog :121 (UNVERIFIED fit) | Y |
| providers/connection-drawer/codex-sign-in-block.component.ts | one-off layout | 28 | `mt-2 flex items-center gap-2 rounded border border-base-300 p-2` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| providers/connection-drawer/credentials-tab.component.ts | one-off layout | 142 | `flex items-center justify-between gap-2 rounded border border-base-300 bg-base-1` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/connection-drawer/credentials-tab.component.ts | one-off layout | 231 | `flex items-center justify-between gap-2 rounded border border-base-300 bg-base-1` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/connection-drawer/credentials-tab.component.ts | one-off layout | 391 | `flex items-center justify-between gap-3 rounded border border-base-300 bg-base-2` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/connection-drawer/kimi-code-login-progress.component.ts | one-off layout | 51 | `flex items-center justify-between gap-2 rounded border border-base-300 bg-base-1` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/connection-drawer/kimi-code-login-progress.component.ts | one-off layout | 64 | `flex items-center justify-between gap-2 rounded border border-base-300 bg-base-1` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/decision-model-row.component.ts | one-off layout | 191 | `relative flex w-[27rem] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto ` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| providers/main-agent-reassign-popover.component.ts | one-off layout | 102 | `flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-2 border-b bo` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/provider-catalog-modal.component.ts | one-off layout | 30 | `-mx-6 -mt-6 flex items-center gap-2 border-b border-base-300 bg-base-200 px-3 py` | ptah-section-header / ptah-toolbar; R (UNVERIFIED fit) | Y |
| providers/provider-connection-card.component.ts | one-off layout | 86 | `flex min-w-0 flex-wrap items-center gap-x-ptah-inline text-xs leading-snug text-` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| providers/provider-consumer-assignments.component.ts | one-off layout | 267 | `flex flex-wrap items-center gap-1.5 rounded border border-base-content/10 p-2` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| providers/provider-setup-wizard.component.ts | one-off layout | 450 | `flex items-start gap-2 rounded-md border border-base-300 bg-base-100 p-2` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| providers/provider-setup-wizard.component.ts | one-off layout | 487 | `flex items-start gap-2 rounded-md border border-base-300 bg-base-100 p-2` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| providers/provider-setup-wizard.component.ts | one-off layout | 1349 | `flex flex-wrap items-center justify-between gap-2 border-t border-base-300 bg-ba` | ptah-form-actions; catalog :121 (UNVERIFIED fit) | Y |
| ptah-ai/agent-orchestration-config.component.ts | one-off layout | 229 | `flex w-[16rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh_-_var(--ptah-space-8))` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| ptah-ai/cli-lane-default-cell.component.ts | one-off layout | 228 | `flex min-w-0 max-w-full flex-col gap-[var(--ptah-gap-controls)] text-xs text-bas` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| ptah-ai/local-tts-panel.component.ts | one-off layout | 104 | `mb-3 flex items-center gap-1.5 rounded border border-error/40 p-2 text-xs text-b` | ptah-alert / ptah-inline-confirm; A/I (UNVERIFIED fit) | Y |
| ptah-ai/ptah-cli-instances.component.ts | one-off layout | 107 | `flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-base-co` | ptah-setting-row / ptah-form-section; R (UNVERIFIED fit) | Y |
| **Remaining 4 one-off layout sites** | one-off layout | — | Counts per file below | Same category mapping above | — |
| ptah-ai/ptah-cli-instances.component.ts | one-off layout: 1 additional | — | — | R/A/I (UNVERIFIED fit) | Y |
| ptah-ai/voice-config.component.ts | one-off layout: 2 additional | — | — | R/A/I (UNVERIFIED fit) | Y |
| settings.component.html | one-off layout: 1 additional | — | — | R/A/I (UNVERIFIED fit) | Y |

## Missing in libs/frontend/ui

- **Column-definition API / per-column priority.** Design-spec :309 requires “Column definitions with id, header text, alignment ... width hint ... numeric”; :313 says “Column priority is a column input.” The complete input list in `libs/frontend/ui/src/lib/patterns/table/table.component.ts:178-181` is label, size, density and collapseBelow. There is no columns input or priority input. `table-detail.ts:24-32` gives all marked cells the same collapsed signal.
- **Cell templates indexed by column id.** Design-spec :310 says “ng-template per column id”; table.component.ts:41 only projects `<ng-content />`. Rich content and controls work, but consumers must declare native cells and reuse their own templates. Control support itself is not missing.
- **Automatic detail relocation and enforced no-sideways-scroll.** The table hides marked cells but consumers author a second detail layout. table.component.ts:34 is `<div class="overflow-x-auto">`; it allows scrolling rather than preventing overflow. Actual overflow at 1168/784 is UNVERIFIED.
- **Default density differs.** Spec :318 says “default about 52 px”; table.component.ts:78 sets `height: 3rem` (48 px at a 16 px root). Compact :84 is `2.75rem` (44 px), meeting the compact requirement. Cell heights do not cap rows containing tall content.
- **Dedicated progress selector.** No ptah-progress selector exists; design-spec :296 explicitly permits ptah-meter until progress lands. This has an approved replacement and is not a blocker.
- **Radio/range/key primitives.** No ptahRadio/ptahSlider or keyboard-key selector appeared in the shared selector inventory. Catalog :51 excludes radios from ptahInput. Spec :231 maps output-style choices to ptah-surface-tile with radiogroup semantics; universal replacements for other radio/range/kbd uses are UNVERIFIED.
- **Literal names vs capabilities.** Selector search `rg -n 'selector:.*(ptah-card|ptah-button|ptah-tabs|ptah-menu|ptah-dialog|ptah-progress|ptahRadio|ptahSlider)' libs/frontend/ui/src/lib -g '*.ts' -g '!*.spec.ts'` returned no matches. The catalog names the actual alternatives in the inventory; absent aliases do not imply absent capabilities.

The following v2 features exist and should not be called missing:

| Feature | Shared evidence under libs/frontend/ui/src/lib/patterns/table/ |
|---|---|
| Arbitrary controls | table.component.ts:41 ng-content; table-cells.ts:106 td[ptahControlCell]. |
| Mark/name/kind/secondary/info header | table-cells.ts:48-63 projects ptahRowMark and ptahRowInfo; :99-102 inputs name, kind, secondary, mono. |
| Muted/disabled/selected state | table-cells.ts:120-133 ptahRowState accepts default, muted, disabled, selected. |
| Overflow plus inline action | table-row-actions.component.ts:25 projects [ptahInlineAction]; :26 uses native dropdown; :31-42 supplies accessible icon trigger. |
| Order controls/focus/live region | table-order.ts:70-74 rowLabel/index/count and outputs; :91-92 announces position; :104 restores focus. |
| Compact density | table.component.ts:82-84 sets compact cell height 2.75rem. |
| Detail helpers | table-detail.ts:24 collapsible cells, :36 row expander, :74 detail row, :95 detail cell. |
| Matrix helpers | table-matrix.ts supplies group rows/header, score/bar cells, sticky header, cell button and status cell; exported through table.component.ts:217-221. |

## Detailed Lanes and table comparison

Apply-plan `settings-apply-plan.md:70` lists “cell templates with form controls ... expandable detail row with column priority ... compact density 44-48 px, no sideways scroll at 1168/784”. Its :66 identifies these as the v2 blockers; design-spec :309-322 supplies the full contract.

### lanes-table.component.ts

Path: `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts`. Columns are handwritten th/td, not a TypeScript definition array. Exact header declaration :93-101:

```html
<th scope="col">Order</th>
<th scope="col">Lane</th>
<th scope="col">Status</th>
<th scope="col" ptahCollapsible>Permission</th>
<th scope="col" ptahCollapsible>Network</th>
<th scope="col" ptahCollapsible>Model</th>
<th scope="col" ptahCollapsible>Actions</th>
<th scope="col">Enabled</th>
<th scope="col" class="sr-only">Details</th>
```

:84-89 uses `<ptah-table ... density="compact" [collapseBelow]="900">`. Permission, Network, Model and Actions hide together below **900 CSS px of the table host content box**, not viewport width. Order, Lane, Status, Enabled and the expander cell stay. There are no intermediate priorities or per-column breakpoints.
:150-175 uses native th scope=row containing ptah-table-row-title: name is row.name, kind is CLI agent/Ptah CLI, secondary is versionLabel/provider, mono is system-only, and ptah-provider-mark projects via ptahRowMark. This largely meets the v2 row-header requirement.
:123-126 uses `[ptahRowState]="row.kind === 'system' && !row.installed ? 'muted' : 'default'"`. The toggle remains rendered but disabled at :390-398 for uninstalled rows. Spec :314 says muted rows have “controls not rendered”; this is a consumer difference, not a missing state primitive.

Detail row, exact excerpts :416-421 and :428-430:

```html
<tr class="ptah-table-detail-row"
  [hidden]="detailRowId() !== row.id"
  [id]="'lane-detail-' + row.id">
  <td ptahDetailCell [colspan]="table.collapsed() ? 5 : 9">
    @if (detailRowId() === row.id) {
      <ptah-lanes-table-detail [row]="row"
```

```html
@if (table.collapsed()) {
  <dl>
    <dt>Permission</dt>
```

The remaining dl terms are Network (:452), Model (:474), Actions (:484), Capabilities (:498). Permission/Network duplicate the shared lane-default control into dd elements (:433-469); Model reuses `[ngTemplateOutlet]="modelEffort"` at :477. Actions uses ptah-table-row-actions (:486) and ptah-inline-confirm (:495); Capabilities uses ptah-cli-capability-cells (:499).
The raw tr uses the shared class and a hidden binding rather than tr[ptahDetailRow], allowing wide-mode details too. Narrow colspan is five, wide colspan nine. No local max-width or column width hints occur in this component; it inherits the shell's width.

### lanes-table-detail.component.ts

Path: `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts`. It declares **no columns or responsive column-hiding rules**; it is supplemental content in the parent detail cell.
System detail :52-55 quotes `<ptah-description-list [ariaLabel]="system.name + ' details'" data-testid="cli-provider-facts">`. :57 supplies Version, :64-74 Executable/Provider, :75-110 Native CLI behavior with a native popover. :112 adds capability cells; :113-195 append Info/Install guide/All capabilities and credential/Codex actions.
Instance detail :197-223 uses `<ptah-description-list [ariaLabel]="instance.name + ' details'">`, with Provider, optional Key, and Tier models. Exact tier template :214-222:

```html
<div ptahDescriptionItem term="Tier models">
  @for (tier of instance.tiers ?? []; track tier.tier) {
    <span [attr.data-tier]="tier.tier"
      >{{ tier.label }}: {{ tier.model }}</span
    >
  } @empty {
    No tier models
  }
</div>
```

:255 applies `class="max-h-72 w-72 overflow-auto text-xs"` only to the capabilities popover. No overall max-width applies locally. The description-list component owns its term/value layout, while the containing table supplies the separate narrow dl grid.

### cli-orchestration-matrix.component.ts

Path: `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts`. It declares **no table columns or column breakpoints**. :165-184 passes rows/state/actions to ptah-cli-provider-grid. `cli-provider-grid.component.ts:8-19` forwards these directly to ptah-lanes-table.
:152 has header helper text with class cli-wide-only, not a table column. No rule for that class appears in this component; external visibility behavior is UNVERIFIED.
:227 quotes the host rule: `styles: ` followed by `:host { display: block; min-width: 0; max-width: 100%; }`. :228 applies `padding: 1.25rem` to the matrix region under `[data-glass='on']`. It does not raise the Settings shell cap.

**Confirmed at the frontend save boundary:** moveLane saves only installed-group ids. Exact source :293-300:

```ts
protected async moveLane(row: LaneTableRow, direction: -1 | 1): Promise<void> {
  if (!this.state.reviewContext() || this.busy()) return;
  const installed = this.rows().installed.map(item => item.id);
  const index = installed.indexOf(row.id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= installed.length) return;
  [installed[index], installed[next]] = [installed[next], installed[index]];
  await savePreferredAgentOrder(this.state, this.feedback, installed);
}
```

`cli-matrix-rows.ts:491-495` builds installed from `...system.filter((row) => row.installed), ...instances`, ranked by preferredAgentOrder, and uninstalled from `system.filter((row) => !row.installed)`. Instances are included in the installed group; uninstalled system CLIs are excluded.
`preferred-agent-order-save.ts:12` captures previous order only for Undo. Exact :16 is `write: () => state.saveSettings({ orchestration: { preferredAgentOrder: [...order] } }, context),`; :17 restores previous on Undo. No merge preserves omitted ids. Therefore the frontend's next write drops an uninstalled CLI's saved rank. Backend normalization/persistence and the eventual installed-again runtime rank are UNVERIFIED.

### Shared patterns/table component

Path: `libs/frontend/ui/src/lib/patterns/table/table.component.ts`. :34-42 wraps a native table in overflow-x-auto and projects ng-content, without a column registry. Exact API :178-185:

```ts
readonly label = input.required<string>();
readonly size = input<'xs' | 'sm'>('xs');
readonly density = input<'default' | 'compact'>();
readonly collapseBelow = input(0);
readonly announcement = signal('');
private readonly width = signal(Number.POSITIVE_INFINITY);
readonly collapsed = computed(
  () => this.collapseBelow() > 0 && this.width() < this.collapseBelow(),
);
```

:194-198 measures `entry.contentRect.width` with ResizeObserver on the host. `table-detail.ts:27-28` assigns `class: 'ptah-table-collapsible'` and `'[hidden]': 'context?.collapsed() ?? false'` to marked cells. No per-column hiding thresholds exist. Without ResizeObserver, :191-192 leaves the initial infinite width; actual host behavior in such an environment is UNVERIFIED.
Exact shared detail-cell layout, :59-64:

```css
.ptah-table-detail-cell dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--ptah-gap-inline) var(--ptah-gap-controls);
  margin: 0;
}
```

:65-69 styles muted terms and zero-margin definitions. :50-52 sets width:100% and border-collapse; the shared table sets **no max-width**. :34 permits sideways scrolling. `table-detail.ts:90-92` warns that an oversized colspan “adds phantom columns and can cause sideways scroll”; Lanes correctly uses five/nine.

## Settings content max-width

Complete repository search before report creation: `rg -n --hidden -g '!.git' -g '!node_modules' -g '!package-lock.json' -- '--ptah-settings-content-max-w' .` found five source/documentation matches:

| Role | Location | Exact source |
|---|---|---|
| Definition | `libs/frontend/ui/src/lib/tokens/ptah-tokens.css:482` | `--ptah-settings-content-max-w: 52rem;` |
| Only runtime consumption | `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts:230` | `class="flex w-full min-w-0 max-w-[var(--ptah-settings-content-max-w)] flex-col gap-[var(--ptah-gap-section)] scroll-pb-[calc(var(--ptah-control-h-md)+2*var(--ptah-surface-pad))]"` |
| Documentation | `.ptah/specs/TASK_2026_1177_9109/pattern-spec.md:56` | `--ptah-settings-content-max-w` / `52rem` / Max width of the content column |
| Documentation diagram | `.ptah/specs/TASK_2026_1177_9109/pattern-spec.md:480` | `(max width --ptah-settings-content-max-w)` |
| Documentation mapping | `.ptah/specs/TASK_2026_1177_9109/pattern-spec.md:509` | Content / max width / `--ptah-settings-content-max-w` |

At a 16 px root font, 52rem = 832 CSS px, below the 900 CSS px collapse threshold. The shell cap therefore implies a collapsed Lanes table even in a sufficiently wide viewport at that root size. This is a source-derived inference. Actual root font, available width, computed dimensions, overflow and screenshot parity are UNVERIFIED; no browser or tests were run.

## Baseline context and remaining limits

`tools/ui-class-audit/check-ui-classes.ts:32-45` documents class/binding/expression inspection and dynamic expressions; :49-57 says baselines ratchet counts. :59-76 scopes spacing to Settings templates and excludes converted accounts from initial spacing seeding.
`tools/ui-class-audit/baseline.json:331-466` contains existing Settings allowances, including decision-model fields, scope rows and popovers. `baseline-spacing.json:2-29` records legacy gap/padding/space utilities in Advanced. These were read, not executed or changed. The audit tool counts tokens/expressions, while this report counts evidence sites; the counts are not interchangeable.
Native totals: 24 popovers, five drawers, four modals, three tab groups across 25 files. These are existing shared components; spec :332-338 expressly corrects the catalog's OLD markers on native overlays. No ptah-native-card remains.
All 114 source files were read, including files without template hits. Runtime dynamic class expansion, exhaustive semantic layout equivalence, visual parity, accessibility behavior and host-side ordering persistence remain UNVERIFIED.
