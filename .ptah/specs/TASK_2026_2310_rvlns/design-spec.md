# Design spec: Reviews settings drawer, with Review lanes (TASK_2026_2310_rvlns)

Scope (widened by the user, decisions.md D9-D11): redesign the whole Reviews settings drawer (shell,
section structure, icons, controls) and add the "Review lanes" section; add lane/model/fallback
lines to the run detail cards. Nothing in `parity-inventory.md` is dropped except the "Effective
repository configuration" placeholder (D10, user-approved).

Prototype: `prototype/index.html` (state switcher, light and dark, 576 px and 400 px drawers, run
detail with and without new data). `prototype/README.md` says how to open it.

Design system: the app's own. Tokens: `apps/ptah-extension-webview/tailwind.config.js` (`anubis`,
`anubis-light`) and `styles.css` (`--bcm`, `surface-*`). Controls: `@ptah-extension/ui`. Icons:
`lucide-angular` (a workspace dependency, `package.json:131`; `review-runs-ui` imports none today).
No new token, class or component is introduced.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Shell is `ptah-native-drawer` (popover top layer, opaque `bg-base-100` panel, pinned header and footer) | keep in-DOM `fixed` overlay + z-index lift / native drawer | Root causes 1 and 2 in `parity-inventory.md` (glass pane isolation traps z-50; `.surface-1` turns translucent). Connection drawer already does this | yes |
| The native close button is turned off (`[showCloseButton]="false"`). The header holds its own Lucide `X` `ptahIconButton` with `label="Close review settings"` | native "Close panel" / keep the old name | `aria-label` "Close review settings" is in the parity identifier list | yes |
| `closeOnBackdrop="false"`, `closeOnEscape="true"` | backdrop closes (connection drawer) / not | The drawer is a long form with unsaved edits; a stray click on the dim area would close it. X, Escape and the footer are the exits. The draft is held in the store, as today | yes |
| Initial focus goes to `h2#review-settings-title` (`tabindex="-1"`), not the first control. Set from the drawer's `opened` output | native default (first focusable = the X button) | Parity: "Initial focus to title" (`drawer.ts:218-228`) | yes |
| Confirm dialogs become top-layer too (`popover="manual"`, `showPopover()` on init, popover reset, opaque `bg-base-100` panel) and stay siblings of `ptah-native-drawer`, not inside its panel | render inside the panel / top layer sibling | A later top-layer element paints above an earlier one; a sibling avoids the drawer's focus trap and keydown handler. Their Escape already stops propagation | yes |
| Cards inside the drawer use `bg-base-200 border border-base-300 rounded-box`, never `.surface-1` / `.surface-2` | surface classes | Glass turns `.surface-1/2` translucent (`styles.css:3733-3737`) | yes |
| Minimum severity is a read-only note: label "Minimum severity" and the text "Set in the repository review config." No value, no select (D12) | unbound "Minor" text / new operator setting / honest note | `minimumSeverity` lives in `RepoReviewConfigV1`, not in the strict `OperatorSettingsSchema` (`review-config.schema.ts:60,83-113`); a new setting would widen scope (schema, storage, policy) | yes |
| Dropdowns are `ptah-select` without `ptah-field` in compact rows; text and number inputs stay `ptah-field` | native select | `docs/design-system/settings/README.md`, user decision 2026-11-17 | yes |
| Reorder by Up / Down / Remove `ptahIconButton`s, no drag | drag / buttons | Keyboard-only requirement | yes |
| Pins: fixed list of 6 roles, "Follow the pool" is the no-pin value | per-role add/remove | Closed role set | yes |
| One Save button for the whole drawer, in the pinned footer | per-section save | One `save` output | yes |
| Unavailable entries keep full controls and show a reason | read-only | Req 5.4 | yes |
| Unavailable / At limit use `ptah-status status="warning"` (neutral word, coloured diamond glyph) | `ptahBadge tone="warn"` | `status.component.ts`; tuned `--state-ink-need` | yes |
| Run detail shows raw lane ids in mono | resolve label | Deleted `ptah-cli:<id>` has no label | yes |

## 1. Shell

```
ptah-native-drawer  [isOpen]="true"  widthClass="w-full max-w-xl"  ariaLabel="Review settings"
                    [showCloseButton]="false"  [closeOnBackdrop]="false"  (opened)=focusTitle  (closed)="closed.emit()"
  [drawer-header]  icon + h2#review-settings-title + subtitle + X button
  body             sections (scrolls)
  [drawer-footer]  save error + Save button (pinned)
```

The page keeps `@if (settingsOpen())` as today, so the drawer's `closed` output and the page wiring
do not change.

| Part | Spec |
| --- | --- |
| Backdrop | Native: full-viewport `bg-black/60 backdrop-blur-[2px]`, in the top layer, so it dims the navbar and rails too |
| Panel | Native: opaque `bg-base-100`, `border-l border-base-300`, `shadow-2xl`, full height. Width `w-full max-w-xl` (576 px). Below 576 px of viewport the panel is full width |
| Header | `flex items-start gap-2 border-b border-base-300 px-4 py-3` (native). Left: Lucide `GitPullRequest` (16 px, `text-base-content-muted`, `aria-hidden`) + a block with `h2#review-settings-title.text-sm.font-semibold` "Review settings" (`tabindex="-1"`) and `p.text-xs.text-base-content-muted` "Settings apply to the next run.". Right: `button[ptahIconButton] variant="ghost" size="sm" label="Close review settings"` with Lucide `X` |
| Body | Native: `min-h-0 flex-1 overflow-y-auto px-4 py-3`. Inside: sections spaced `mt-5`; every section element (or the `fieldset` that wraps one, for Review lanes) except the first carries its own `border-t border-base-300 pt-5`. Never use a sibling selector: the `fieldset` around Review lanes would break it |
| Footer | `[drawer-footer]`: `flex items-center justify-between gap-3 border-t border-base-300 bg-base-100 px-4 py-3`. Left: `@if (saveError()) { <ptah-alert tone="error" compact live="assertive">{{ saveError() }}</ptah-alert> }` (an always-rendered alert would show an empty box; `empty:hidden` does not hide it). Right: `button[ptahButton] variant="primary" size="md"` with Lucide `Save` + "Save review settings" / "Saving…" |
| Loading | `ptah-state-panel state="loading" title="Loading review settings"` in the body; footer Save disabled |
| Load error | `ptah-state-panel state="error" title="Review settings are unavailable." actionLabel="Retry"` in the body; footer hidden |

Behaviour:

- On open: focus moves to `h2#review-settings-title`. On close: focus returns to the "Review settings" header button (native restore).
- Escape: closes the drawer unless a `ptah-select` list or a confirm dialog is open; those handle Escape first and stop propagation.
- Backdrop click: does nothing. Tab and Shift+Tab cycle inside the panel (native trap).
- Focus trap, Escape, and focus restore belong to `ptah-native-drawer`. The drawer component drops its own `returnFocus`, Tab trap and Escape handler (`review-settings-drawer.component.ts:218-257`); only the focus-the-title call on `opened` remains.
- Confirm dialogs (resume, live-enable, remove-token, replace-token): rendered as siblings of `ptah-native-drawer` and shown with `popover="manual"` so they sit above the drawer. Their overlay root gets the user-agent popover reset that `native-drawer.component.ts:137-152` uses (width and height 100 %, margin, border, padding 0, background transparent, overflow visible), so it is not a centred fit-content box. Their panel is opaque: `bg-base-100 border border-base-300 rounded-box shadow-2xl`, not `.surface-1` (glass would make it translucent, `styles.css:3733-3737`). The backdrop stays `bg-black/60`. Their ids (`review-resume-confirm`, `review-live-enable-confirm`, `review-remove-token-confirm`, `review-replace-token-confirm`) and `<id>-description` stay. Focus goes into the dialog on open and returns to the control that opened it.
- Dialog role `dialog`, `aria-modal="true"`, accessible name "Review settings" (the e2e finds it by name).

## 2. Section pattern and icon rules

Each section: `<section aria-labelledby="{id}-h">` with a header row `flex items-center gap-2`: a Lucide icon (`size-4`, `text-base-content-muted`, `aria-hidden`), then `h3.text-sm.font-semibold`; optional `p.text-xs.text-base-content-muted` under it. Icons from `lucide-angular` through `LucideAngularModule` and `[img]`, as `native-drawer.component.ts` does.

Icon use: one icon per section header; icons on actions only where the verb is an action on a thing (add, remove, move, verify, save, pause). Every icon-only button is a `ptahIconButton` with a required `label` (accessible name and tooltip). Text buttons keep their text; their icon is `aria-hidden`.

| Section | Header icon | Action icons |
| --- | --- | --- |
| Repositories | `GitBranch` | `Plus` (Add repository), `Trash2` (Remove, icon-only) |
| Maintainers | `Users` | none |
| Review thresholds | `SlidersHorizontal` | none |
| Review lanes | `Route` | `ArrowUp`, `ArrowDown`, `X` (Remove entry), `Plus` (Add lane via the select), `Info` (about) |
| GitHub bot identity | `Bot` | `KeyRound` (Save token, outline), `ShieldCheck` (Verify connection), `Unplug` (Remove connection) |
| Publication | `Send` | `Pause` shown beside the switch label |

Alerts and warnings use `ptah-alert` with `live="assertive"` where they were `role="alert"` (plaintext warning, identity and credential errors, lane-list error, footer save error).

Section order and headings (1 to 6): Repositories, Maintainers, Review thresholds, Review lanes,
GitHub bot identity, Publication. The old "Effective repository configuration" section is removed (D10).

## 3. Sections other than Review lanes

All existing behaviour, copy, ids and aria-labels stay (`parity-inventory.md`). Only layout, icons and the severity control change.

### 3.1 Repositories

- Intro hint under the header: "Fork PRs are always excluded. CodeRabbit remains enabled alongside Ptah review." (moved from the footnote to the section description; same text).
- Each repository is a card `bg-base-200 border border-base-300 rounded-box p-3`. Row 1: repo name `font-medium break-all`; trailing `ptahIconButton` ghost xs, Lucide `Trash2`, `label="Remove {owner}/{name}"` (keeps the aria-label).
- Under the name, three checkboxes (`ptahCheckbox`) with their existing labels: Enable review polling; Keep this repository in dry-run (disabled rule unchanged); Pause publication for this repository. Hint "Connect a bot token to enable live publication." (`text-xs muted`) when no token or bot.
- Empty: "No repositories added." (`text-sm muted`).
- Add row: `ptah-field` "Add repository (owner/name)" (`id="review-add-repository"`) + `button[ptahButton] variant="ghost"` with `Plus` and text "Add repository". The repository error is an error line under the field: `text-xs`, `role="alert"`, a leading `bg-state-err` square, text in `base-content` (not `text-error`, which is 3.19:1 on light).

### 3.2 Maintainers

Two `ptah-field`s as today: attestor login (`id="review-attestor"`, stacked) and "GitHub logins, comma separated" (`id="review-maintainers"`, stacked). Section description: "Who may attest live publication."

### 3.3 Review thresholds

- Minimum severity first, full width above the grid: `p.text-sm.font-medium` "Minimum severity" and `p.text-xs.text-base-content-muted` "Set in the repository review config." No value, no control (D12). The unused `minimumSeverity` input of the drawer goes.
- Grid `grid-cols-1 min-[520px]:grid-cols-2 gap-3` for the four number fields.
- Number `ptah-field`s: Poll interval (minutes) 1-1440, Max inline comments 0-100, Confidence floor 0-1 step 0.01, Lane cap per PR 1-6. Labels, ranges and bindings unchanged.

### 3.4 GitHub bot identity

Copy and rules stay exactly as in `review-bot-identity.component.ts:19-36`. Layout:

- Section description: "The bot that posts review comments."
- Plain-text storage warning (only when `tokenStorage` is `plaintext`): `ptah-alert tone="warning" compact live="assertive"` with the existing text ("This bot token is stored as plaintext because system encryption is unavailable.").
- Status block, three states, text verbatim:
  - Identity loaded: `ptah-status status="online" label="Connected"`, then `p.text-sm` "Connected as {login}", then `p.text-xs.text-base-content-muted` "Reported scopes: {scopes} | Connected {connectedAt} | Verified {verifiedAt}" (scopes and verified parts only when present).
  - Token saved, no identity: `ptah-status status="warning" label="Unverified"`, then `p.text-sm.text-base-content-muted` "Bot identity unavailable. Verify connection."
  - No token: `ptah-status status="offline" label="Not connected"`, then `p.text-sm.text-base-content-muted` "No bot connected. Live publication is unavailable."
  (`ptah-status` text is nowrap, so it holds only the short word; the sentence is a separate line.)
- Token field: `ptah-field` password, `id="review-bot-token"`, label "Replace bot token" when a token exists, else "Connect bot token". Cleared after submit.
- Actions row (wraps): Save token (`button[ptahButton] variant="outline"`, Lucide `KeyRound`, disabled while saving); Verify connection (`variant="outline"`, `ShieldCheck`); Remove connection (`variant="ghost"`, `Unplug`) shown only when a token exists.
- Identity and credential errors: `ptah-alert tone="error" compact live="assertive"` (keeps `role="alert"`).

### 3.5 Publication

Row: `Pause` icon + label "Pause all publication" + `input[ptahToggle]` (role switch). Hint "Turning pause off asks for confirmation." Pause on is immediate; pause off opens the resume confirm dialog (unchanged).

## 4. Review lanes section (new)

Placed after Review thresholds. Header icon `Route`, heading "Review lanes", an info button (`ptahIconButton` `Info`, `label="About review lanes"`, `aria-expanded`) that opens `ptah-native-popover` (same trigger and `role="dialog"` panel markup as `ptah-field` `info`, `field.component.ts:113-138`). Info text: "Choose which lanes review a pull request. Lenses spread across lane families when the pool has more than one. The verifier avoids the families that wrote its candidates. A lane turned off in global settings stays off."

### 4.1 Components and tokens

| Need | Component / class |
| --- | --- |
| Entry list | `<ol class="bg-base-200 border border-base-300 rounded-box">`; rows `border-t border-base-300` after the first. Unavailable row tint: static class `bg-warning/10` via `[class.bg-warning/10]` (precedent `canvas-lane-view.component.ts:166`) |
| Dropdowns | `ptah-select size="xs"` with `[label]`, no `ptah-field` |
| Up / Down / Remove | `button[ptahIconButton] variant="ghost" size="xs"`, `label`, Lucide `ArrowUp`, `ArrowDown`, `X` |
| Family chip | `span[ptahBadge] appearance="outline" size="xs" tone="neutral"` |
| At limit, Unavailable | `ptah-status status="warning" label="..."` (diamond glyph in `--state-ink-need`, neutral word) |
| Limit unknown, Status unknown | `ptah-status status="pending" label="..."` (idle ring) |
| Lane-list error | `ptah-alert tone="error" compact live="assertive"` with a Retry `button[ptahButton] variant="ghost"` in `[alertAction]` |
| Loading | `ptah-skeleton` line in `div role="status" aria-label="Loading review lanes"` |
| Hints | `text-xs text-base-content-muted` |
| Error line | `text-xs` `role="alert"`, leading `bg-state-err` square, text `base-content` |

No raw `alert` / `skeleton` class (blocked by `ui-class-audit`).

### 4.2 Layout

1. Header row (above).
2. Status area, only when needed: lane-list error; or the model-list note (only when every lane's model read failed); or the empty note.
3. "Lane pool" `h4` (`text-xs font-semibold`), hint "Used in order. Add lanes to limit reviews to them.", the list, the Add control.
4. "Pins" `h4`, hint "Force one lane for a role. Roles without a pin follow the pool, or the global agent order when the pool is empty.", a `bg-base-200` card with 6 rows: Triage, correctness-lifecycle, contracts-callers, security-privacy, host-di-config, Verifier (lens names are the `LensSchema` ids in `font-mono`).
5. Section save error line.

Pool row (grid `24px 1fr auto`, `px-2 py-2`): position number (`text-xs muted`, `aria-hidden`); line 1: lane label `font-semibold`, family chip, `ptah-status` marks (`At limit`, `Unavailable`, `Limit unknown`); right: Up, Down, Remove; line 2: model `ptah-select`, then reason or row hint. Unchanged at 400 px.

Pin row (grid `1fr 1.2fr 1.2fr`, `px-2 py-1.5`): role, lane select, model select. Below 520 px of viewport: role on its own line, two selects side by side. The model select is disabled until a lane is chosen.

Add control: one `ptah-select`, max-width 260 px, trigger "Add a lane…", label "Add lane to pool". Choosing a lane appends `{lane, model: null}` and resets. It lists every lane the gateway can run, with family and limit state in the description: `room available`, `at limit`, `limit unknown`. The same lane may be added again (the duplicate check is lane + model).

### 4.3 Copy

| Where | Text |
| --- | --- |
| Empty | No lanes chosen. Reviews follow the global agent order. |
| Lane no-pin option | Follow the pool (description: No pin) |
| Model default option | Lane default (description: No model is sent) |
| Catalog empty for a lane | Hint: This lane lists no models. |
| One lane's model read failed | Row hint: Models for this lane could not be read. The saved model is kept. |
| All model reads failed | Model list unreadable. Saved models are kept and sent as they are. You can still choose Lane default. |
| Lane list unreadable | Lanes could not be read. Saved entries are shown as they are. [Retry] |
| Reason, lane missing | Lane not listed. It may be uninstalled or disabled in global settings. Reviews skip it and say so. |
| Reason, at limit | At its usage limit. Reviews skip it and say so. |
| Reason, model | Model not offered by this lane. Reviews skip it and say so. |
| Pin reason | same reasons, ending "Reviews use the pool order and say so." |
| Stale model option | `<model> (not offered)`, description "Kept until you change it." |
| Pool full | Trigger "Pool is full"; hint "The pool holds up to 12 entries." (read the bound from the schema) |
| Duplicate | Already in the pool with this model. |
| Section save error | Review lanes were not saved: the pool has a duplicate entry. Remove it and save again. |

### 4.4 States

| State | What shows |
| --- | --- |
| Empty | Empty note, empty pool, Add control, six pin rows at "Follow the pool", model selects disabled |
| Pool with entries | Numbered rows. Up disabled on row 1, Down disabled on the last. Limit state: `confirmed-room` shows nothing extra, `at-limit` shows `At limit`, `unknown` shows `Limit unknown` (no tint, lane usable) |
| Pins set | Pin row shows lane and model. Clearing = "Follow the pool"; model resets to Lane default |
| Unavailable entry | Row tint `bg-warning/10`, `ptah-status` Unavailable (or At limit), reason line, controls active. A missing lane shows its id. A pin to a missing lane stays in the select as `<id> (unavailable)`. Saving keeps it |
| Model catalog unreadable | Per lane: a lane whose read failed shows Lane default plus the saved model ("Saved. Not checked."), the row hint, and its saved model is never marked unavailable. Lanes whose read worked keep the "not offered" check. The section note shows only when every lane failed |
| Lane list unreadable | `ptah-alert` with Retry. Add control disabled. Saved entries show `Status unknown` (idle glyph). Move and remove still work |
| Loading | Skeleton line in a status wrapper |
| Saving | Section wrapped in `<fieldset [disabled]="saving()">`; footer shows "Saving…" |
| Save / validation error | The duplicate row shows the error line under its model select; section error line; the footer `ptah-alert` shows `saveError()`. Entries are not reset |

### 4.5 Keyboard and ARIA

Tab order across the drawer: header X button, Repositories (each repo: checkboxes, Remove; then the add field, Add button), Maintainers, Review thresholds, Review lanes (info, pool rows: model select, Up, Down, Remove; Add control; pin rows: lane select, model select), bot identity, Publication, footer Save. Header focus starts on the title (not in the tab order, `tabindex="-1"`).

`ptah-select` keys are built in (Enter, Space, Arrows, Home, End, type-ahead, Escape closes the list and returns focus to the trigger).

| Control | Accessible name |
| --- | --- |
| Drawer | dialog "Review settings" |
| Close | "Close review settings" |
| Section | `aria-labelledby` its heading |
| Info | "About review lanes" (`aria-expanded`) |
| Pool list | "Review lane pool, in order of use" |
| Model select | "Model for {lane label}, position {n}" |
| Up / Down / Remove | "Move {lane} up, position {n} of {total}", "Move {lane} down, …", "Remove {lane}, position {n} of {total}" |
| Pin group | `role="group"` "{Role} pin"; selects "{Role} lane", "{Role} model" |
| Add control | "Add lane to pool" |
| Remove repository | "Remove {owner}/{name}" |

A visually hidden `role="status" aria-live="polite"` announces: "{lane} moved up to position {n} of {total}", "{lane} removed. {n} in pool", "{lane} added at position {n}", "{Role} pinned to {lane}", "{Role} pin cleared".

Focus rules: after Up or Down, focus stays on the same button of the moved row; if the row reached an edge, that button becomes disabled, so focus goes to the other move button. After Remove, focus goes to the Remove button of the row now at that position (the previous row if the last was removed), or to the Add control if the pool is empty. After Add, focus returns to the Add control. Never disable a button that holds focus without moving focus first.

## 5. Contrast (measured)

Criterion: WCAG 2.2 AA, text 4.5:1, non-text 3:1. Computed (OKLCH or hex to sRGB, relative luminance), not rendered; the visual review confirms. The panel is `base-100`; cards are `base-200`. State inks: `--state-ink-*` per theme in `tailwind.config.js` (`ptah-glass` `:335-339`, `ptah-glass-light` `:380-384`, `anubis` and `anubis-light` blocks). `ptah-glass` is the user's theme and the e2e capture theme; it is the prototype default.

| Pair | glass b1 | glass b2 | glass-light b1 | glass-light b2 | anubis b1 | anubis b2 | anubis-light b1 | anubis-light b2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| base-content | 15.71 | 14.05 | 15.39 | 14.05 | 14.86 | 13.89 | 15.91 | 14.21 |
| base-content-muted (`--bcm`) | 13.07 | 11.70 | 6.49 | 5.93 | 6.06 | 5.66 | 6.03 | 5.39 |
| state-ink-need (warning glyph) | 9.77 | 8.74 | 5.69 | 5.20 | 6.61 | 6.18 | 5.83 | 5.21 |
| state-ink-err (error square) | 8.43 | 7.54 | 6.90 | 6.30 | 4.92 | 4.60 | 6.12 | 5.47 |
| state-ink-done (connected glyph) | 10.61 | 9.49 | 6.63 | 6.06 | 5.62 | n/a | 5.71 | n/a |
| state-ink-idle (idle glyph) | 13.07 | 11.70 | 6.09 | 5.56 | 7.30 | 6.82 | 5.29 | 4.73 |

Primary button text on primary: `ptah-glass` `#1b1403` on `#e4b94a` 9.88; `ptah-glass-light` `#fff8e6` on `#7c5700` 6.16.

All pass 4.5:1. Words stay `base-content` or `--bcm`; glyph shape (diamond, ring, square) means colour is never the only signal. Reference only, not used: daisyUI `text-warning` / `text-error` on `anubis-light` base-200 measure 2.19 and 3.19. Focus ring: the app's global `:focus-visible`.

## 6. Run detail additions (`review-run-detail.component.ts`)

Unchanged by the drawer redesign. Applies to pipeline stage cards and lens cards; no layout change; each adds up to three `text-xs` lines. One rule per stage record:

| Stage record | Card shows |
| --- | --- |
| `lane` not null | Lane line `text-xs text-base-content-muted`: `<span class="font-mono">{lane}</span> · <span class="font-mono">{model}</span>` or `{lane} · lane default`. On triage and verification cards, ` · family {family}` is appended (the triage card shows its real family on a new run). Lens cards keep "Family: x · Verifier family: y" below it and do not repeat the family |
| `lane` null, `family` not null | `Family: {family}` only (older runs; lens cards as today) |
| `lane` null and `family` null | Nothing added. Stages that run no lane (discovery, context, checks, identity, publication) are always this case |
| `fallback` not null | Fallback note |

Fallback note: `p.text-xs` with `border-l-2 border-state-need pl-2 mt-1`, text `base-content`:
- Pin: "Fallback: pinned {lane}{ / model} was unavailable ({reason}). Ran on {lane}."
- Pool: "Fallback: pool entry {lane} skipped ({reason}). Ran on {lane}."

Reasons: "lane not listed", "at limit", "model not offered", "pinned lane disabled". Several skipped entries: one sentence each. Plain text, no tooltip, no new role. A pre-change run has null lane, model and fallback everywhere and renders without error. The same-family badge logic is unchanged.

## 7. Responsive and themes

| Viewport | Behaviour |
| --- | --- |
| 1440 px | Panel 576 px at the right edge, full height, opaque; the backdrop dims navbar, side rails and page. Number fields in two columns |
| 400 px (narrow Electron window) | Panel full width; header, footer pinned; number fields one column; pin rows two-line; pool unchanged. Selects truncate with ellipsis; list panels are as wide as their trigger |
| Themes: `ptah-glass` (default, gold primary `#e4b94a`), `ptah-glass-light` (primary `#7c5700`), `anubis` (primary `#2563eb`), `anubis-light` | Same layout in all four. Opaque `base-100` panel; no translucency, so glass on or off looks the same. The prototype colours follow `tailwind.config.js` per theme and defaults to `ptah-glass` |

Select list panels render through Floating UI (fixed position), so the body's `overflow-y-auto` does not clip them.

## 8. Visible changes (for the Gate 1.7 before/after)

1. Shell: in-DOM overlay becomes the top-layer native drawer; opaque panel; header and footer pinned.
2. Close: text "Close" button becomes a Lucide `X` icon button (same accessible name).
3. Save token: `primary` becomes `outline`. One primary button (Save review settings) per view.
4. Icons on section headers and actions (section 2).
5. Sections get headers, descriptions and dividers; the Fork PR footnote moves to the Repositories description.
6. Minimum severity: unbound "Minor" text becomes the note "Set in the repository review config.".
7. "Effective repository configuration" placeholder removed (D10).
8. New "Review lanes" section.
9. Verify connection: `ghost` becomes `outline`; it stays visible in every bot state, as today.

## 9. Handoff (for the architect)

1. Drawer shell is `ptah-native-drawer` with the options in section 1; the page keeps its `@if`. The drawer drops its own trap, Escape and focus restore. The 4 confirm dialogs move to the top layer with the popover reset and an opaque panel.
2. Gateway lane list for the UI: `id`, label, `family`, `limitState` (`confirmed-room`, `at-limit`, `unknown`). `ReviewLaneCapability` has no label today; labels come from system CLI rows and Ptah CLI agent names.
3. Per-lane model lists from live catalogs (`agent:listCliModels`, `LaneModelListing`) with a per-lane read-failed flag. No static fallback.
4. Pool and pins in the drawer draft; the draft type must carry data stored outside `settings_json`.
5. Duplicate error: a client check before save, or a server code mapped to this section.
6. Pool maximum comes from the schema (12 provisional).
7. Lane-list and model-list loading and retry have their own state, separate from the drawer `loadState`.
8. `review-settings-drawer.component.spec.ts:50` expects the text "Minor" and must change with D12. The unused `minimumSeverity` input goes.
9. The e2e pixel baseline `review-settings-before-{dark,light}-glass.png` (`wave1.spec.ts:36-39`, `maxDiffPixels: 0`) must be regenerated, and the pointer park point (x=300, `:33`) must still land on the backdrop. If the drawer falls under the Settings gate, store the prototype screens under `docs/design-system/settings/prototype/screens/` (visual-gate rule 4).
10. Visual review applies `docs/design-system/settings/visual-gate.md` rules 7 and 9, glass on and off, in `ptah-glass`, `ptah-glass-light`, `anubis` and `anubis-light`, at 1440 and narrow.
11. Add `lucide-angular` imports to `review-runs-ui` (already a workspace dependency); confirm each icon name against the installed version with a typecheck.
12. Initial focus: the native drawer focuses the X button, then `opened` moves focus to the title. A screen reader may announce the button first; acceptable.

## Revision 1

Response to `design-spec-review.md` (F1-F9). F1: `ptah-alert` / `ptah-skeleton`, static tint class. F2: `ptah-status` for At limit / Unavailable and the contrast table measures the tuned state inks. F3: 200 px panel rule removed. F4: per-stage-record run-detail rule incl. stages with no lane and triage family. F5: per-lane model-read failure. F6: three limit states. F7: `ptahIconButton`. F8: pin hint names the global agent order. F9: `ptah-native-popover` for the info panel. All kept in this revision.

## Revision 2

Scope widened (D9-D11): whole-drawer redesign.

- Shell moved to `ptah-native-drawer` (section 1): top layer, opaque panel, Lucide `X` close with the kept name "Close review settings", pinned header and footer, Save always visible. Accessible name "Review settings"; initial focus on the title; Escape and backdrop rules; confirm dialogs in the top layer above the drawer.
- Sections restructured with headers and Lucide icons: Repositories, Maintainers, Review thresholds, Review lanes, GitHub bot identity, Publication (sections 2 and 3). Icon rules and the full icon table added.
- "Effective repository configuration" placeholder removed (D10).
- Minimum severity is now a `ptah-select`; the schema gap is recorded as an open item with a read-only fallback.
- Cards use `bg-base-200`, not `.surface-*`, so glass cannot make them translucent. Run detail cards keep their current classes.
- Contrast table extended to `base-100` (the new panel) and the connected glyph. Handoff updated.

## Revision 3

Response to `design-spec-review.md` round 1 (R2-R11) and D12.

- R2: Minimum severity is a read-only note with no value and no select (D12); open item removed; architect note for `review-settings-drawer.component.spec.ts:50`.
- R3: bot identity copy and rules restored verbatim (three states, Connect/Replace label, Remove only with a token, Save token disabled while saving).
- R4: confirm dialogs get an opaque `bg-base-100` panel and the popover reset.
- R5: `ptah-glass` (prototype default, gold primary) and `ptah-glass-light` added to section 5, section 7 and the prototype theme switcher; contrast re-measured for all four themes. Save token `primary` to `outline` is listed under "Visible changes" (section 8).
- R6: `live="assertive"` on warning and error alerts; footer error behind `@if (saveError())`.
- R7: divider on each section or fieldset, no sibling selector.
- R8: repository error uses the base-content text with an error square.
- R9: e2e baseline regeneration and park point noted.
- R10: README no longer claims there are no screenshots.
- R11: the drawer drops its own focus trap, Escape and focus restore.
