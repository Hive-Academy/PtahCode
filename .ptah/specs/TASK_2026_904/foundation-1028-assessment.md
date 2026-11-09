# PR #1028 foundation assessment

## Top-down re-assessment (current)

**Decision, 2026-11-09.** Merged #1028 is the baseline. Chat, canvas, voice, and setup are the visual source of truth. Extract their components as-is, check each source page with an Electron screenshot diff, then apply the extraction to machines and reviews first. A generic primitive exists only after an extraction is shared by at least two pages.

**Old recommendation B and its five changes: SUPERSEDED (bottom-up, rejected by user 2026-11-09).** Retained below for history. Its chat badge rename and generic button, field, state-panel, and audit edits are not a checklist.

### What #1028 changes

Line references are to the saved `pr-1028.diff`, not source-file lines. The saved `pr-1028-files.txt` agrees with the diff's file list. Classification describes how to use the merged code under the top-down direction, not code quality. New files in `libs/frontend/ui` are not automatically an extraction from a polished page.

| File or area in #1028 | Class | Reason |
| --- | --- | --- |
| `package.json`, `package-lock.json` | **NEEDED by top-down** | Adds `@angular/aria` 22.2.6 and aligns CDK to 22.2.6. Headless listbox behavior can support an extracted dropdown or list pattern without dictating its look. Keep the dependency pair alone; the gallery is its only new use in this diff. `pr-1028.diff:1403-1457`, `:610`, `:648-652`. |
| `.ptah/specs/TASK_2026_UI_FOUNDATION/{context,implementation-plan,batch-1-3-report,batch-4-report,batch-5-report,code-review,review-fixes,visual-fixes}.md` | **NEUTRAL** | Historical planning and review records. They do not change runtime UI. Their foundation-first direction is superseded and must not guide adoption. `pr-1028.diff:1-526`. |
| `libs/frontend/ui/src/lib/foundation/meter.component.ts` and spec | **NEUTRAL** | A self-contained, accessible meter with bounded width and reduced-motion styling. No polished page uses it in this diff. It may be useful on machines or reviews after matching a source-page pattern, but is not a reason to merge the generic foundation. `pr-1028.diff:940-1000`. |
| `libs/frontend/ui/src/lib/foundation/list-detail.component.ts` and spec | **CONFLICTS** | Starts with a new generic layout and imports `ptahButton`. Even its back button is prescribed before extraction from a polished page. `pr-1028.diff:794-887`, especially `:841-856`. |
| `libs/frontend/ui/src/lib/foundation/list-row.component.ts` and spec | **CONFLICTS** | New fixed grid, selected-state styling, and `ngOption` host API come from the foundation gallery, not a polished list. Reuse its headless behavior only if an actual extraction needs it. `pr-1028.diff:888-939`. |
| `libs/frontend/ui/src/lib/foundation/page-header.component.ts` and spec | **CONFLICTS** | Introduces a generic bar, title scale, back button, and action slots before preserving an existing polished header. `pr-1028.diff:1001-1050`. |
| `libs/frontend/ui/src/lib/foundation/state-panel.component.ts` and spec | **CONFLICTS** | Prescribes one generic loading, empty, error, partial, and permission treatment, with generic buttons and skeletons. Existing page states must be extracted from the best page first. `pr-1028.diff:1051-1126`, especially `:1103-1118`. |
| `libs/frontend/ui/src/lib/foundation/status-badge.component.ts` and spec | **CONFLICTS** | Adds another `ptah-status-badge` selector. The existing chat badge uses that selector, so the old option B proposed renaming the chat component. That would touch a polished page contract. Keep the chat selector and visuals. `pr-1028.diff:1127-1180`, especially `:1162-1165`; gallery also uses the new selector at `:598`, `:630`, `:660`. |
| `libs/frontend/ui/src/lib/foundation/toolbar.component.ts` and spec | **CONFLICTS** | Fixes search, filter, sort, and count layout around `ptahFieldControl` instead of extracting the polished toolbar. `pr-1028.diff:1181-1244`, especially `:1224-1234`. |
| `libs/frontend/ui/src/lib/foundation/index.ts`, `libs/frontend/ui/src/index.ts` | **CONFLICTS** | Export the new generic foundation as a public shared API. Keep no empty barrel when those components are excluded. `pr-1028.diff:772-793`. |
| `libs/frontend/ui/src/lib/surfaces/button.directive.ts` and spec, `surfaces/index.ts` export | **CONFLICTS** | Adds `button[ptahButton]` with a default secondary look, fixed variant and size set, and an exported generic API. It is not extracted as-is from chat, canvas, voice, or setup. `pr-1028.diff:1245-1321`, `:1355-1363`, especially `:1286-1309`. |
| `libs/frontend/ui/src/lib/surfaces/field-control.directive.ts` and spec | **CONFLICTS** | Adds `input`/`select`/`textarea` root classes and fixed border/text utilities to every decorated control. This can shift the appearance of existing consumers and starts with a generic field. `pr-1028.diff:1322-1354`, especially `:1346-1353`. |
| `libs/frontend/ui/src/lib/surfaces/stat-card.component.ts` and spec | **NEUTRAL** | Adds an opt-in `dense` size to an existing shared stat card; the default stays `default`. No polished page file adopts it here. Keep only if an extracted or poor-page call site needs that exact size. `pr-1028.diff:1364-1402`. |
| `apps/ptah-extension-webview/src/app/ui-gallery.component.ts` and spec | **CONFLICTS** | The gallery showcases the generic-first set and wires `@angular/aria` to those designs. It is a demo, not evidence of a polished-page extraction. `pr-1028.diff:585-677`, especially `:623-663`. |
| `apps/ptah-extension-webview/src/app/app.routes.ts`, `app.routes.spec.ts`, `webview-routing.spec.ts` | **CONFLICTS** | Add and test the gallery route and its standalone metadata. These are unnecessary without the gallery, although they do not directly restyle a page. `pr-1028.diff:527-584`, `:678-709`. |
| `libs/frontend/chat/src/lib/components/templates/app-shell.component.ts`, `app-shell.outlet-wrapper.spec.ts` | **CONFLICTS** | **Yes, #1028 changes a polished-page file:** the chat app shell. It adds Router event state and changes `isStandaloneView` so the gallery can bypass the chat shell. This is a runtime shell behavior change, even if the diff does not directly change chat CSS. Remove it with the gallery. `pr-1028.diff:710-771`, especially `:718-752`. |
| `tools/ui-class-audit/check-ui-classes.ts`, its spec, `baseline.json`, `jest.config.ts`, `project.json`, `tsconfig.json` | **CONFLICTS** | The audit blocks raw `btn`, `input`, `select`, `textarea`, `card`, `badge`, `alert`, and `skeleton` use outside `libs/frontend/ui`. Failure hints send pages to `ptahButton`, `ptahFieldControl`, `ptah-state-panel`, and other new foundation pieces. That pressures polished pages to migrate onto generic primitives. Its baseline and project wiring serve that policy. `pr-1028.diff:1461-6407`, especially `:5514-5536`, `:6230-6240`, `:6342-6407`. |

**Polished-page impact.** The saved diff edits the chat app shell and its spec; it edits no canvas, voice, or setup page file (`pr-1028.diff:710-771`; `pr-1028-files.txt`). The route affects chat-shell behavior. The shared field-control change may affect consumers, but the diff cannot prove a visual change. The new badge selector collides with chat's. Visual parity needs Electron screenshot diffs.

### #1028 is merged: what the top-down plan does with it

#1028 merged into `main` at 19:36Z on 2026-11-09 (head `555409ea3`, merge commit `bcd76af07`). The pre-merge options no longer apply.

**Keep available:** `@angular/aria` 22.2.6 and matching CDK lock update for headless behavior inside a polished-page extraction (`pr-1028.diff:1403-1457`). Keep the opt-in `ptah-stat-card` size and `ptah-meter` as available helpers (on `bcd76af07` only marketplace, a semi page, uses `ptah-stat-card`, in 3 files) and do not put them on a polished page until a source-page pattern calls for them (`:940-1000`, `:1364-1402`). Keep the gallery as a dev reference, not a design target (`:527-677`).

**Do not push onto chat, canvas, voice, or setup:** generic `ptahButton`, `ptahFieldControl`, `ptah-state-panel`, page header, list/detail, list row, toolbar, or status badge adoption (`pr-1028.diff:772-1354`). Machines and reviews should receive components extracted unchanged from polished pages. The merged gallery also changed the chat app shell; check its current behavior before extraction (`:710-771`).

**Follow-up: audit hints.** `tools/ui-class-audit/check-ui-classes.ts` ratchets raw DaisyUI class counts and tells authors to replace them with generic foundation pieces (`pr-1028.diff:5582-5591`, `:5623-5648`, `:6230-6240`). Keep the counts as an inventory, but change the replacement hints to direct authors to an as-is extraction from the relevant polished page. Do not name generic replacements or add blocked roots. Update matching assertions in `tools/ui-class-audit/check-ui-classes.spec.ts`; the `lint` target in `tools/ui-class-audit/project.json` can retain the ratchet (`:4897-5507`, `:6342-6370`). Existing polished-page counts are baselined, and moving markup into `libs/frontend/ui` lowers them; do not lower their baseline by hand.

**Follow-up: badge selector.** The merged foundation component and chat's existing badge both claim `ptah-status-badge` (`pr-1028.diff:1152-1180`; `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts:18`). Rename the *foundation* selector to a distinct name in `libs/frontend/ui/src/lib/foundation/status-badge.component.ts`, then update its spec and gallery usages (`pr-1028.diff:598`, `:630`, `:660`). Leave chat's selector and visuals intact. No merged field-control or other generic primitive needs expansion for this plan.

**Recommendation:** Keep the merged neutral pieces, correct those two pressure points, then extract from polished pages and apply to machines and reviews. Preserve each polished page's appearance with an Electron screenshot diff.

### Scope of this assessment

This is a design and diff review. The gallery and pages were not rendered, so it makes no visual-quality claim. The previous sections below are historical and superseded wherever they advocate foundation-first migration or the five changes of option B.

Read-only. No code, commit, push, or GitHub comment on PR #1028. Sources: `pr-1028.diff` (line numbers below are lines in that diff), `pr-1028-files.txt`, `inventory-part-a.md`, `inventory-part-b.md`, and the worktree copies of components the PR collides with. Direction is context.md “Direction change 2”: one layered system, native elements then composites, glass applied once inside the primitives.

The previous edition of this file recommended (A) merge as-is and paint glass in a follow-up. That frame is withdrawn. Glass-on-each-composite (`data-glass-surface` on the stat card, the list frame, and the state section) would add a second surface path beside `ptah-surface-section` / `ptah-surface-card` / `ptah-surface-tile`. This pass asks whether each #1028 API can be the one primitive or composite for its role.

## Tools and skills

- No Ptah MCP tools are connected. Tool search for `ptah_` returned no tools (the connected server is `tasks`). Fallback: ripgrep and file reads of the diff and the worktree.
- This session’s skill list has no `impeccable`, `ui-ux-designer`, or `angular-frontend-patterns` skill and no skill-discovery tool that can load them. None was applied.
- No tests, serve, or browser. The gallery was not rendered.

## What the inventories are measuring

| Family | Part A (chat-side libs) | Part B (page libs) | Together |
| --- | --- | --- | --- |
| Button | 461 attrs / 45 variants. Top: `btn btn-ghost btn-xs` 122, `btn btn-ghost btn-sm` 82, `btn btn-outline btn-sm` 48. Section “Pattern inventory”. | `class="btn"` 553 across 16 libs. `btn-ghost` 341, `btn-xs` 300, `btn-sm` 275, `btn-primary` 128, `btn-outline` 82, `btn-square` 28, `btn-error` 14, `btn-warning` 9, `btn-circle` 6, `btn-secondary` 1, `btn-link` 1. `btn-md` / `btn-lg`: 0. Section “Button”. | About 1,000 raw `btn` usages. Ghost is the usual action, primary the commit, outline the third style. |
| Badge | 134 / 32. Section “Pattern inventory”. | 112 across 11 libs. `badge-sm` 72, `badge-ghost` 55, `badge-xs` 44, `badge-outline` 31, plus solid tones. 8 local chips. Section “Badge and chip” and “Local components”. | 246 raw badges plus domain chips. |
| Empty / loading / error | 82 / 6 (spinner 44, skeleton 29). | 74 `loading-spinner` + 106 `skeleton` = 180. Section “Empty, loading, and error”. | 262. Inline spinners and skeletons, not one panel. |
| Alert | 12 / 7, mostly `alert-error`. | 66 `class="alert"` across 11 libs. `alert-error` 42, `alert-warning` 23, `alert-info` 11, `alert-success` 2, `alert-sm` 11. | Separate from the state block. |
| Confirm | Dialog/modal/drawer 23 / 5, and shared native modal already exists. | 7 local confirm/alert shells, three behavior models. Section “Local components”. | `ptah-native-modal` is the shell. The PR does not add another. |
| Stat tile | 13 / 6, and `ptah-stat-card` already exists. | Four implementations, including a second `ptah-stat-card` in marketplace. Section “Stat tile”. | Selector collision is already on main. |
| Field controls | Input 47/9, select 16/4, textarea 3/2, checkbox/toggle 27/10. | Input 62 (xs 17, sm 37), select 19 (sm 14, xs 5), textarea 14, checkbox 37, toggle 11. `ptah-field` has 0 uses in part B. | Text controls are one family. Checkbox and toggle are another. |

`libs/frontend/ui` already exports `ptah-field`, `ptah-surface-card`, `ptah-surface-section`, `ptah-surface-tile`, `ptah-stat-card`, `ptah-native-modal`, `ptah-native-drawer`, `ptah-native-tab-group`, `ptah-native-dropdown`, `ptah-dropdown`, `ptah-popover`, `ptah-file-status-badge` (inventory-part-a.md “Existing `libs/frontend/ui` layer”; inventory-part-b.md “Primitives already in `libs/frontend/ui`”). Part B pages do not use field, surface section/tile, or the UI stat card. The PR adds the missing button and several composites. It does not replace those existing primitives, and it must not grow a second modal, tab group, or card shell.

## Fit of each #1028 piece

Marks: **keep as-is**, **keep + extend after merge** (additive, existing call sites stay valid), **change before merge** (the shipped contract would break or force a second migration).

| Piece | Role it can own | Mark |
| --- | --- | --- |
| `ptahButton` | The button primitive, after the pre-merge edits below. | change before merge |
| `ptahFieldControl` + existing `ptah-field` | The input/select/textarea skin and the field composite. Checkbox and toggle stay out. | change before merge (directive only; `ptah-field` stays) |
| `ptah-status-badge` | The lifecycle status chip, not the general badge. | change before merge (selector only) |
| `ptah-state-panel` | The empty / loading / error / partial / no-permission **block**. | keep + extend after merge |
| `ptah-list-row` | The selectable listbox row (`div` + `ngOption`). | keep as-is |
| `ptah-list-detail` | The list/detail/empty/meta shell. | keep + extend after merge |
| `ptah-page-header` | The page title row. | keep + extend after merge |
| `ptah-toolbar` | The search/filter bar. | keep + extend after merge |
| `ptah-meter` | The limit meter. Not an inventory extraction target. | keep as-is |
| `ptah-stat-card` `size` | The UI stat tile. Marketplace’s same selector is a pre-existing duplicate. | keep + extend after merge |
| `ui-class-audit` | The ratchet that names the replacements. | change before merge |
| `ptah-ui-gallery` | Dev preview. Not a primitive. | keep as-is |

### `ptahButton` — change before merge

API today (`pr-1028.diff:1287-1309`): selector `button[ptahButton]` only. `variant` `'primary' \| 'secondary' \| 'ghost' \| 'danger'`, default `'secondary'`. `size` `'xs' \| 'sm'`, default `'sm'`. `iconOnly` adds `btn-square`. `busy` sets `aria-busy`, `aria-disabled`, `opacity-60`, and swallows click while leaving the button enabled (`:1258-1276`). `danger` maps to `btn-error`.

What the inventory needs (part B “Button”, part A button row):

| Needed | Covered now |
| --- | --- |
| ghost / primary / outline / error | ghost, primary, and error (under the name `danger`). No `btn-outline` (82 + the part A outline row of 48). |
| xs / sm | Yes. `md` is unused (0). Default `sm` matches the plan; xs is slightly more common (300 vs 275) and stays an explicit input. |
| square / circle | Square via `iconOnly`. Circle is 6. Add a `shape` input later; do not change `iconOnly`. |
| Link-styled buttons | Selector ignores `<a class="btn">` (part B “Link”: cron and marketplace anchors wearing `btn`; `btn-link` 1, part A links 11). Add `a[ptahButton]` later. |
| Loading | `busy` is the loading contract. Keep it. It does not use `.btn:disabled`, so glass disabled paint (`styles.css:3346`) does not apply. That is a stylesheet follow-up, not an API change. |
| Default tone | Default `secondary` adds `btn-secondary`. Part B counts `btn-secondary` **once**. Ghost is the default action (341). |

Changing the default after people omit `variant` is a behavior break. The PR already omits it on the state-panel actions (`pr-1028.diff:1110`, `:1116`) and on the gallery’s icon, busy, and disabled samples (`:636`). The variant list in the gallery (`:668`) passes `secondary` explicitly, so those swatches stay.

Pre-merge edits:

- `libs/frontend/ui/src/lib/surfaces/button.directive.ts`: add `'outline'` to the variant union and `'[class.btn-outline]': "variant() === 'outline'"`. Change the default from `'secondary'` to `'ghost'`.
- `libs/frontend/ui/src/lib/foundation/state-panel.component.ts`: set `variant="primary"` on both action buttons so the retry action does not follow the default. Primary is the commit action in part B “Button”.
- Leave `danger` as the name for `btn-error`. Renaming it would churn the gallery variant array (`:668`). An `error` alias can be added later without removing `danger`.

Follow-ups, additive: `shape: 'circle'`, selector `a[ptahButton]`, `warning` / `success` (9 and 2). Do these before a migration sweep, after the outline variant exists so outline buttons are not rewritten onto ghost and rewritten again.

### `ptahFieldControl` — change before merge

`ptah-field` is already the field composite (`libs/frontend/ui/src/lib/surfaces/field.component.ts:13-21`): label, projected `input` / `select` / `textarea[ptahFieldControl]`, hint/error, `aria-describedby`, `aria-invalid`. The PR does not change that template. Keep it. Pages should adopt it instead of a second field wrapper (part B “Field”: 0 uses; part A field row).

The directive today (`pr-1028.diff:1348-1352`) selects `input`, `select`, and `textarea` and, in the constructor, adds the tag class, `` `${tag}-sm` ``, `border-surface-border`, and `text-sm`. There is no size input. The spec only locks `input-sm` (`:1339`).

Gaps against part B “Input”, “Select”, “Textarea”:

- Sizes in use are `sm` and `xs` (input-xs 17, select-xs 5, textarea-xs 2). A control that always applies `-sm` cannot be the one skin for those xs fields. Adding `size = input<'xs' \| 'sm'>('sm')` later is source-compatible, but the audit (below) will reject new `input-xs` / `select-xs` on merge and point them at this directive. Ship the input now, default `sm`, so the spec stays green.
- `text-sm` fights the toolbar search, which also sets `text-xs` (`pr-1028.diff:1231`, spec asserts `text-xs` at `:1203`). Both classes stick; which one wins is stylesheet order.
- `border-surface-border` is a utility. Glass paints `.input` / `.select` / `.textarea` with `border-color: var(--glass-input-edge)` inside the component layer (`styles.css:3349-3352`). The utility wins, so the one control skin cannot take the glass edge.
- Checkbox and toggle are not this directive. Part B “Checkbox and toggle”: 37 checkboxes, 11 toggles, and two copied pause switches. A later directive with selector `input[type=checkbox][ptahCheckbox]` / `[ptahToggle]` is a new primitive. Widening this selector onto them would apply `input` / `checkbox` classes to the wrong Daisy component.

Pre-merge edits in `libs/frontend/ui/src/lib/surfaces/field-control.directive.ts`:

- Add `size = input<'xs' | 'sm'>('sm')`.
- Bind the tag class and `` `${tag}-${size()}` `` from the host. Default `sm` keeps `field-control.directive.spec.ts` green.
- Stop adding `border-surface-border` and `text-sm`.

`ptah-field` itself: no edit.

### `ptah-status-badge` — change before merge (selector)

API (`pr-1028.diff:1160-1179`): selector `ptah-status-badge`, required `status` of nine values (`running`, `queued`, `pending`, `needs-review`, `warning`, `failed`, `offline`, `completed`, `online`), optional `label`, fixed `badge badge-sm` plus a state dot. No size, no ghost/outline, no Daisy tone class.

That is a lifecycle chip. It is not the general badge (part A 32 variants; part B modifiers `badge-ghost` / `badge-outline` / `badge-xs` / solid tones).

The eight local chips (part B “Local components”):

| Chip | Fits this enum? |
| --- | --- |
| `ptah-run-status-chip` (`idle \| running \| cancelling \| failed \| resumable \| done`) | Partial. `running` and `failed` match. `cancelling`, `resumable`, `idle`, and `done` do not. Adding union members later is safe. |
| `ptah-session-sync-chip` | Own session-sync enum, outline badge. Needs a later member or a domain wrapper. |
| `ptah-harness-health-badge` | Health summary plus repair UI. Domain wrapper, not this chip. |
| `ptah-removal-lock-badge` | Lock reason and fix command. Domain wrapper. |
| `ptah-scorecard-badge` | Grade text. Does not fit. |
| `ptah-provenance-badge` | Provenance word. Does not fit. |
| `ptah-status-pill` | Provider status (`connected`, `needs-auth`, `expired`, …) with its own tone map. Domain wrapper over a future general badge. |
| `ptah-dashboard-badge` | Tone `neutral \| primary \| info \| success \| warning \| error`, selectable. This is the general badge, not the lifecycle chip. |

Chat-ui already owns the selector. `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts:18` is `selector: 'ptah-status-badge'` with `status: ExecutionStatus` (`pending`, `streaming`, `complete`, `interrupted`, `resumed`, `error`) and Daisy `badge-ghost` / `badge-info` / `badge-success` / `badge-warning` / `badge-error`. It is exported from `@ptah-extension/chat-ui` and re-exported from chat’s component index. No template in this worktree uses the tag. The two `status` types are not assignable to each other. Importing both components into one standalone component is an Angular duplicate-selector error. Shipping both freezes two public elements with the same name.

`ptah-file-status-badge` (`libs/frontend/ui/src/lib/native/file-status-badge/file-status-badge.component.ts:77`) is a different selector. Keep that domain chip.

Pre-merge edit: in `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts`, change the selector from `ptah-status-badge` to `ptah-execution-status`. Leave the class name `StatusBadgeComponent` so existing imports keep compiling. The spec queries `span.badge`, not the selector. Add that file to the PR. The foundation component keeps `ptah-status-badge` and the nine-value union.

Do not widen this component into the tone/size badge before merge. A general `ptah-badge` (`tone`, `size: xs|sm`, `variant: solid|ghost|outline`, text) is a new composite. Status chips and `ptah-dashboard-badge` should sit on it later. Adding that component is additive; pretending the lifecycle chip is already that badge is how the audit (next section) creates a second badge system.

### `ptah-state-panel` — keep + extend

`PtahPanelState` is `'loading' \| 'empty' \| 'error' \| 'partial' \| 'no-permission'` (`pr-1028.diff:1101`). Empty, error, and no-permission render a centered `section.surface-1` (`min-h-32`, `max-w-sm`). Loading is three `.skeleton` bars and `aria-busy` (`:1114`). Partial is `alert alert-warning` with `role="status"` above projected content (`:1106-1112`). Error sets `role="alert"` on the section, not `alert alert-error`.

That covers the block the foundation plan describes (`pr-1028.diff:396`). It does not cover:

- Inline spinners (`loading-spinner` 74 in part B, 44 in part A) or inline skeletons (106 in part B, catalog skeleton already in UI).
- The alert line (66 + 12), including `alert-info` / `alert-success` / `alert-sm` and `ptah-dashboard-alert`, which paints tone as a border.

Keep the public inputs. Later, an optional icon slot is additive. When `ptah-alert` exists, point the partial branch at it. That is an internal template change. Do not add an `inline` mode that turns this panel into the alert.

### `ptah-list-row` — keep as-is

`div[ptahListRow]`, required `title`, optional `meta`, `current`, slots `[leading]` and `[trailing]` (`pr-1028.diff:929-938`). Selection is `ngOption` on the same host inside `ngListbox`. The plan says not to nest action buttons in the option, and link rows stay anchors (`pr-1028.diff:394`).

Part B “List row” is a different shape: feature rows whose trailing cluster is `btn-ghost btn-xs` (marketplace external rows, task card). Those rows should not be forced through a listbox option. This component is the one selectable row. Action rows and link rows are a later composite, not a breaking edit to this API. Making `title` optional later is also safe; it is not required to merge.

### `ptah-list-detail` — keep + extend

Inputs `selectedId`, `backLabel`, output `back`, slots `list` / `detail` / `empty` / `meta` (`pr-1028.diff:849-862`). Narrow widths hide the list and move focus. That is the one list-detail shell. The frame is a raw `div.surface-1` (`:849`) instead of `ptah-surface-section` or `ptah-surface-card`. Swap that element for the surface primitive in a follow-up so the reading plane gets glass from one place. The public inputs do not change. The spec does not lock `surface-1` (`:804-833`).

### `ptah-page-header` — keep + extend

`title`, `description`, `backLabel`, `back`, slots `[status]` and `[actions]` (`pr-1028.diff:1038-1049`). Back is ghost xs `ptahButton`. The bar sets `data-glass-surface="bar"` on the header itself, which is the right layer: one header primitive, not a per-page class string. Heading scale `text-lg font-semibold tracking-tight` is the choice the foundation plan already recorded (`pr-1028.diff:327`, `:442`). Part B’s repeated row is `h1` + `text-xl` + muted line + actions, often with an icon tile (cron, skills, review runs). Add a `[leading]` slot later for that icon. Do not change the heading scale in this PR.

### `ptah-toolbar` — keep + extend

Search input, `[filters]`, `[sort]`, `query`, `count` (`pr-1028.diff:1230-1240`). The search field is always in the template. Part B “Toolbar” is action clusters (bulk bar, clone bulk toolbar, hunk toolbar, task board header) that have no search box. A later `search` input defaulting to true, plus an `[actions]` slot, covers those without breaking this template. Ship this as the search/filter bar. Do not rename it; the extra inputs are enough.

### `ptah-meter` — keep as-is

`value`, `max`, `label`, `unit` (`pr-1028.diff:984-999`). Clamps the bar, hides the meter when max is invalid. Not in the extraction ranking. No existing meter primitive to collide with. Glass can style `ptah-meter [role="meter"]` from the stylesheet later; the fill class names are locked by the spec (`:949`).

### `ptah-stat-card` — keep + extend

The PR adds `size: 'default' | 'dense'` (default keeps `text-2xl`, dense uses `text-xl`) on the existing `label` / `value` / `trend` / `[actions]` API (`pr-1028.diff:1393-1401`). That default is source-compatible. Keep it.

Marketplace already registers the same selector with a different API: `subLine`, `icon`, `tone`, `state: loading|error|ready`, `retryRequested` (`libs/frontend/marketplace/src/lib/ui/stat-card.component.ts:52-66` and the template at `:71`). Part B “Stat tile” lists four tiles: this UI card (0 part B imports), the marketplace card, the Daisy `stat` strip (13 identical blocks in memory, messaging, cron), and `ptah-dashboard-stat`. The collision is on main; this PR does not create it. Do not rename the UI selector. Follow-up adds optional `icon`, `tone`, `state`, and treats `subLine` as an alias of `trend`, then deletes the marketplace component. Renaming `trend` now would break current UI callers for a duplicate that should be removed instead.

The article stays `surface-2` (`stat-card.component.ts` in the worktree, class locked at `pr-1028.diff:1380`). Follow-up should render it through `ptah-surface-tile` / `ptah-surface-card` so the tile role and the glass fill live in the surface primitive. Adding `data-glass-surface` on this article as well would be a second glass owner.

### Audit — change before merge

`BLOCKED_ROOTS` is `alert`, `badge`, `btn`, `card`, `input`, `select`, `skeleton`, `textarea` (`pr-1028.diff:5582-5591`). Increases fail. The hint (`:5623-5648`) sends:

- `btn` → `ptahButton` (no outline until the edit above)
- `input` / `select` / `textarea` → `ptah-field` + `ptahFieldControl` (no xs until the edit above)
- `card` → the three surface primitives (this one matches the existing system)
- `badge` → `ptah-status-badge` (the lifecycle chip)
- `alert` and `skeleton` → `ptah-state-panel`

Existing files keep their baseline counts (`baseline.json` starts at `pr-1028.diff:1467`). The ratchet bites the next edit. A new `badge-outline`, `alert-error`, or `skeleton` must become the lifecycle chip or the full block panel, which cannot render them. Those call sites would be the next duplication, which Direction change 2 is trying to stop. Removing the roots later is possible, but every file written against the wrong hint has to move again.

Pre-merge edits:

- `tools/ui-class-audit/check-ui-classes.ts`: remove `'alert'`, `'badge'`, and `'skeleton'` from `BLOCKED_ROOTS`. Delete the `badge`, `alert`, and `skeleton` arms of `replacementHint`. Keep `btn`, `input`, `select`, `textarea`, and `card`.
- `tools/ui-class-audit/baseline.json`: drop keys for those three roots and their modifiers (`alert-error`, `badge-sm`, `skeleton`, and the rest). Leave `btn*`, `input*`, `select*`, `textarea*`, and `card*` counts.
- Update the hint prose in `.ptah/specs/TASK_2026_UI_FOUNDATION/` only if a spec snapshot asserts the old hint string. The gallery badge count (`pr-1028.diff:598`) does not depend on the audit roots.

`card` stays blocked because `ptah-surface-card`, `ptah-surface-section`, and `ptah-surface-tile` already exist (part A surface row; part B “Card and section”, `surface-*` 160 hits and unused section/tile).

## Missing pieces #1028 does not provide

These are new primitives and composites. They are not pre-merge edits. Build them after the base merges, and put glass inside them once.

| Layer | Piece | Why it is still missing | Build on |
| --- | --- | --- | --- |
| L1 | Link | Part A 11 `link` attrs, part B 18, plus anchors that wear `btn`. | `a[ptahButton]` for button-shaped links, and a `ptahLink` directive for `link` / `link-hover` / `link-primary`. |
| L1 | Checkbox and toggle | Part A 27/10, part B 37 checkboxes and 11 toggles. Two pause switches share one template (part B “Checkbox and toggle”). | New directives. Do not fold them into `ptahFieldControl`. |
| L2 | General badge | Tone × `xs`/`sm` × ghost/outline/solid. Dashboard badge is the tone map. 8 chips are domain presets on top. | New `ptah-badge`. Lifecycle chip stays `ptah-status-badge`. |
| L2 | Alert | 66 + 12 alerts, four tones, `alert-sm`. State-panel’s partial branch is one warning. | New `ptah-alert`. Then the partial panel uses it. |
| L2 | Confirm dialog | 7 local copies, three focus models (part B “Dialog” and “Local components”). | `ptah-native-modal` already (`native-modal.component.ts:68-89`, sizes `sm`/`md`/`lg` → `max-w-sm` / `max-w-lg` / `max-w-2xl`). Add a confirm preset there. Do not add a second dialog in #1028. `max-w-xl` is the one width the size map does not name. |
| L2 | Toast | Part B “Toast”: 0 `toast` classes. Banners are per feature. | New toast when a real call site needs one. Do not block the PR on it. |
| L2 | Tabs / segmented | Part B: `role="tab"` 27, `join-item` 22, Daisy `tabs` only in memory, `ptah-native-tab-group` at 3 call sites. | Extend `ptah-native-tab-group` with a segmented look. Do not add a second tab component in #1028. |
| L2 | Card / surface shell | Part B rank 4: `surface-0..3` hand-rolled, section and tile unused, glass attrs only in onboarding (33 of 39). Three surface components plus `ptah-native-card` plus stat-card. | One surface primitive owns `data-glass-surface`. Stat card, list-detail, and the state-panel section render through it. `ptah-surface-section` already applies the role (`surface-section.component.ts:23-30`, glass `content` or `chrome`). Header and toolbar keep their own `bar` role. |

Menu/dropdown is the same story as tabs: `ptah-dropdown` and `ptah-native-dropdown` exist; tasks reimplemented Daisy `dropdown` + `menu` (part B “Menu and dropdown”). No new menu in this PR.

## Recommendation

**SUPERSEDED (bottom-up, rejected by user 2026-11-09): recommendation B and all five changes below.**

**(B) Change #1028 before merge, then use it as the base.**

The components are the right layer. Merging the current selector, the button default, the field-control class list, and the audit roots would freeze contracts that later extraction has to break or route around. The edits are local. They do not redesign the gallery.

1. `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts` — selector `ptah-status-badge` → `ptah-execution-status`. Class name stays `StatusBadgeComponent`.
2. `libs/frontend/ui/src/lib/surfaces/button.directive.ts` — default variant `'ghost'`; add `'outline'` → `btn-outline`.
3. `libs/frontend/ui/src/lib/foundation/state-panel.component.ts` — `variant="primary"` on both `ptahButton` actions (`pr-1028.diff:1110`, `:1116`).
4. `libs/frontend/ui/src/lib/surfaces/field-control.directive.ts` — `size: 'xs' | 'sm'` default `'sm'`; drop `border-surface-border` and `text-sm`.
5. `tools/ui-class-audit/check-ui-classes.ts` and `tools/ui-class-audit/baseline.json` — stop blocking `alert`, `badge`, and `skeleton` until `ptah-alert`, `ptah-badge`, and an inline skeleton/spinner exist.

After those five, merge. Follow-up order, all additive:

1. `a[ptahButton]`, circle shape, warning/success.
2. Checkbox and toggle directives, then the shared pause switch.
3. `ptah-badge` and `ptah-alert`. Re-enable those audit roots only when the hint names the real component. Domain chips become presets.
4. Confirm preset on `ptah-native-modal`. Segmented variant on `ptah-native-tab-group`.
5. Route stat-card, list-detail, and the state-panel section through the existing surface primitives so glass is implemented once. Extend stat-card with icon, tone, and state; remove the marketplace `ptah-stat-card`.
6. Toolbar `search` flag and `[actions]` slot. Page-header `[leading]` slot.
7. Toast only when a call site needs it.

Do not add a `glass` input on these components. `ptah-surface-section` and the glass stylesheet already own the roles (`content`, `chrome`, and the header/toolbar `bar`). Button and field pick up glass from `.btn` and `.input` once the border utility is gone.

## Unmet

- Ptah MCP tools and the named UI skills were not available. Counts and APIs were checked from the diff and the worktree, not from a Ptah index.
- The gallery was not opened. This assessment is an API fit review, not a visual review.
- `ptah_agent_report` was not on the connected tool list.
