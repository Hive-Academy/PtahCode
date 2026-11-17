# Gap analysis: merged Settings redesign against the agreed prototype

Task: TASK_2026_2255_53ce. Epic: TASK_2026_1177_9109. Base: `main` at `7adadbf49`.
Scope: read-only. This document makes no production code change.

## How to read this document

- All paths are relative to the repository root.
- `D/<file>` is `.ptah/specs/TASK_2026_2196_0f09/<file>` in the design worktree
  `.claude-worktrees/feat-settings-redesign-e2e2d736dbc2` (branch `feat/settings-redesign`).
  These design files are **not tracked in git** (see root cause R7).
- `P/<file>` is `D/prototype/<file>`. The prototype HTML is `P/settings-prototype.html`.
- `S/<file>` is `screens/<file>` in this task folder (Electron captures).
- Appendix A: `lanes/pr-survey.md` (PR and process survey, CLI lane, checked by the coordinator).
- Appendix B: `lanes/component-audit.md` (shared-component audit, CLI lane, checked by the coordinator).
- **UNVERIFIED** marks every claim that this analysis did not confirm.

### Capture method and its limits

- Electron only. Playwright design-preview with an isolated user-data directory, under the
  verify lock (`node scripts/verify.mjs --exec --task settings-shots -- ...`). The capture
  script was an untracked copy of the design child's `settings-wide.shot.ts`. It is not
  committed.
- Widths come from the CDP call `Emulation.setDeviceMetricsOverride`: 1024, 1440, 1920 and
  2560 px, height 1100 px. Dark theme. Light theme at 1440 px.
- Layout numbers: `S/metrics.json` and `S/probe.json`.
- **Limit 1.** The isolated e2e profile has no providers, no CLI agents and no saved settings.
  Many cards show "could not be read" or "could not load". These messages come from the
  empty profile. They are **not** design findings and this document does not count them.
- **Limit 2.** The renderer threw `e.detectedClis is not iterable` on the Providers page
  (`.ptah/tmp/settings-shots.log:799`, not committed). The probable source is
  `libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.ts:343-348`, which iterates
  `orchestration.detectedClis` with no guard. After this error the lanes table rendered its
  header but **no rows**, and the `ptah-table` host bindings (`data-density`,
  `data-collapsed`) did not apply (`S/probe.json`: no such attributes, 0 rows).
- **Consequence.** No lane row and no expanded lane row was captured. The
  `S/lanes-*-expanded.jpg` files are identical to the collapsed files. All findings about
  lane rows and the expanded row come from **code and the prototype**, not from a screenshot.

---

## 1. The agreed prototype revision

**Agreed revision: rev 2 (review A3, "Flight deck", Direction B), artifact
`a5daf8a0-8052-4553-b521-8ee35c232c95`.** Rev 1 (artifact `891e3f63-…`) is superseded for
Providers and Context.

| Evidence | What it says |
|---|---|
| `D/settings-design-spec.md:15` | The design spec names rev 2 as the current revision. |
| `D/settings-design-spec.md:17` | Rev 1 screens (`prototype/screens/<tab>-<theme>-<width>.jpg`): "Providers and Context are superseded". |
| `D/settings-design-spec.md:21` | "the prototype wins for layout, spacing, copy and states". |
| `D/status.md:5-6`, `:12-13` | The user approved Direction B / rev 2. |
| `D/settings-apply-plan.md:3-8` | The apply plan names rev 2 (`rev2-*`, `rev2b-*`) as the target and requires each tab PR to compare Electron screenshots with prototype screens (`:8`). |
| `D/settings-apply-plan.md:66`, `:70` | Rev 2 work units for Providers and lanes. |

Reference screens for this analysis (`P/screens/`):

- `rev2b-providers-lanes-dark-1168.jpg`, `rev2b-providers-lanes-light-1168.jpg`
- `rev2b-providers-lanes-dark-784-expanded.jpg`, `rev2b-providers-lanes-light-784.jpg`
- `lane2b-providers-dark-1168.jpg`, `lane2b-providers-light-784.jpg`,
  `lane2b-connections-dark-784.jpg`, `lane2b-detail-light-784.jpg`
- `review-a3-providers-lanes-dark-1440.jpg`, `review-a3-matrix-dark-1440.jpg`,
  `review-a3-providers-lanes-light-784.jpg`
- Rev 1 (still current for Advanced and Search & Voice):
  `{advanced,search}-{dark,light}-{784,1168}.jpg`

Prototype layout facts (`P/settings-prototype.html`):

| Line | Fact |
|---|---|
| 106 | The prototype frame is 1168 px wide with `margin: 0 auto`. |
| 640 | Width options are 1168, 784, 390 and **Fluid**. |
| 140 | `.main` has **no** max width. |
| 146-151 | An instrument band of 4 cards at the top of Providers. |
| 177 | Field sections (`.fs`) use `15rem + minmax(0, 36rem)`: a label column and a control column. |
| 191-193 | Card grids use `auto-fill`, so cards flow into more columns on wide screens. |
| 438-451 | Lane column widths: order 6 %, name 20 %, status 12 %, permission 14 %, network 11 %, model 17 %, actions 13 %, enabled 7 %. |
| 462 | `.lane-detail` is hidden in wide mode: every lane field is visible in its own column. |
| 471-472 | Ptah CLI defaults use 2 columns. |
| 573-592 | Below 950 px the lanes table collapses. The detail `dl` uses `7rem 1fr`. |
| 593-602 | Below 639 px the nav becomes a top bar. |

`P/screens/rev2b-providers-lanes-dark-1168.jpg` shows:

- 8 lane columns with select controls, "model · effort", a ⋮ menu with "Sign in", and a toggle.
- A section header with a 5/6 ring, "Edit order" and "New Ptah CLI instance".
- Ptah CLI defaults with 2 selects, and Background models with a label column.
- A band of 4 instrument cards.

`P/screens/rev2b-providers-lanes-dark-784-expanded.jpg` shows the collapsed table: Order,
Lane, Status, Enabled and a chevron. The expanded row is a 2-column grid (label column about
7rem, control column) with Permission and Network selects, Model text and Test / All
capabilities actions.

---

## 2. Per-page comparison

Severity: **major** = the user sees a wrong layout or a missing function. **minor** = a
visible difference with small effect.

### 2.1 Shell (all pages)

Measured widths in px (`S/metrics.json`):

| Viewport | Nav | Main | Content panel | Lanes table host | Panel left edge |
|---|---|---|---|---|---|
| 1024 | 232 | 606 | 606 | 566 | — (34 px overflow) |
| 1440 | 232 | 1022 | 832 | 792 | 336 |
| 1920 | 232 | 1502 | 832 | 792 | 336 |
| 2560 | 232 | 2142 | 832 | 792 | 336 |

| # | Finding | Severity | Evidence |
|---|---|---|---|
| SH-1 | The content panel stops at 832 px (52rem) and is left-aligned. At 1920 px about 670 px of the main area is empty on the right. At 2560 px about 1300 px is empty. The prototype has no max width on `.main` and uses `auto-fill` grids. | **major** | `libs/frontend/ui/src/lib/foundation/ptah-tokens.css:482` (`--ptah-settings-content-max-w: 52rem`, commit `e0413f599`), `settings-layout.component.ts:230`, `S/page-providers-1920-dark.jpg`, `S/page-search-voice-1920-dark.jpg`, `P/settings-prototype.html:140,191-193` |
| SH-2 | No layout changes at 1440 px or wider. All cards stay in one column. The prototype puts cards in grids and keeps the field sections in a label column plus a control column. | **major** | `S/page-*-1920-dark.jpg`, `P/settings-prototype.html:177,191-193` |
| SH-3 | At 1024 px the content overflows the main area by 34 px. | minor | `S/metrics.json` (`lanes-1024-collapsed`) |
| SH-4 | The nav footer shows an "App / Desktop" label pair and "Runs 100% locally". The prototype footer text was not compared line by line. **UNVERIFIED**. | minor | `S/page-providers-1440-dark.jpg` |

### 2.2 Providers: header, Main agent and Connections

| # | Finding | Severity | Evidence |
|---|---|---|---|
| PR-1 | The band of 4 instrument cards at the top of Providers is not visible. | **major** | `S/page-providers-1440-dark.jpg`, `S/page-providers-1920-dark.jpg`, `P/settings-prototype.html:146-151`, `P/screens/rev2b-providers-lanes-dark-1168.jpg` |
| PR-2 | The Main agent card shows "Not set" and "Route unavailable". This text comes from the empty profile. The card layout itself agrees with the prototype in general. | minor (data) | `S/page-providers-1440-dark.jpg` |
| PR-3 | Connections shows a filter field and "Connect provider". The prototype (`lane2b-connections-dark-784.jpg`) shows connection cards in a grid. The empty profile has no connections, so the card grid could not be compared. **UNVERIFIED** at runtime. | minor | `S/page-providers-connections-1440-dark.jpg`, `P/screens/lane2b-connections-dark-784.jpg` |
| PR-4 | `S/page-providers-connections-*-dark.jpg` is identical to `S/page-providers-*-dark.jpg`, because Connections is near the top of the page. | info | file sizes in `screens/` |

### 2.3 Providers: "CLI Agents & Custom Instances Matrix" (lanes)

| # | Finding | Severity | Evidence |
|---|---|---|---|
| LN-1 | The table host is 792 px at every viewport of 1440 px or more. `collapseBelow` is 900. Thus by code the table is **always collapsed** on a 1440, 1920 or 2560 px screen: only Order, Lane, Status, Enabled and the expander show. Permission, Network, Model and Actions move into the detail row. The prototype shows all 8 columns at 1168 px. | **major** | `lanes-table.component.ts:84-90` (`[collapseBelow]="900"`), `:96-99`, `table.component.ts:181-186`, `S/metrics.json` (`tableHost: 792`), `P/settings-prototype.html:438-451,573` |
| LN-2 | The runtime screenshot shows 8 headers and no rows. This contradicts LN-1. Cause: the `detectedClis` exception stopped change detection before the host bindings applied (`S/probe.json`: no `data-collapsed`, 0 rows). In a real profile LN-1 applies. **UNVERIFIED** with real data. | info | `S/lanes-1440-dark.jpg`, `S/probe.json` |
| LN-3 | A missing `detectedClis` array stops the matrix view. The user then sees a header with no rows and no error. Seen only in the e2e profile. | **major** (robustness) | `cli-matrix-rows.ts:343-348`, `.ptah/tmp/settings-shots.log:799` |
| LN-4 | The matrix card contains the legacy "Max Concurrent / Order" form (two empty inputs). The prototype has no such form. | **major** | `agent-orchestration-config.component.ts:115`, `S/page-providers-1440-dark.jpg` |
| LN-5 | The section header has a full-width "Edit lane order" button. The prototype has a 5/6 ring, "Edit order" and "New Ptah CLI instance" in one row. | **major** | `S/page-providers-1440-dark.jpg`, `P/screens/rev2b-providers-lanes-dark-1168.jpg` |
| LN-6 | "Loading CLI agents…", "Loading instance models…" and "Loading delegated CLI models…" show as loose text below the cards, not inside a card. | minor | `S/page-providers-1920-dark.jpg` |
| LN-7 | The "Ptah CLI instances" card shows only a description. The prototype shows Ptah CLI defaults in 2 columns (Default model, Default effort) and Background models with a label column. | **major** | `S/page-providers-1920-dark.jpg`, `P/settings-prototype.html:471-472`, `P/screens/rev2b-providers-lanes-dark-784-expanded.jpg` |
| LN-8 | Uninstalled system rows use `[ptahRowState]="'muted'"` but still render a disabled toggle. The spec says that muted rows render no controls. The prototype shows "Not installed" and "Install guide" with no toggle. | minor | `lanes-table.component.ts:123-126,389-404`, `D/settings-design-spec.md:314`, `P/screens/rev2b-providers-lanes-dark-784-expanded.jpg` (Lumen CLI row) |
| LN-9 | The prototype column widths (`P/settings-prototype.html:438-451`) are not applied. The runtime header widths are content-driven: Order 86, Lane 80, Status 92, Permission 129, Network 109, Model 90, Actions 102, Enabled 105 px. The Lane column (the widest content) is the narrowest. | minor | `S/metrics.json` (`page-providers-1440.columns`) |
| LN-10 | `moveLane` saves only the installed ids. `savePreferredAgentOrder` overwrites `preferredAgentOrder` and does not merge. Thus one "move up" or "move down" drops the saved rank of every uninstalled CLI. Whether the backend restores it is **UNVERIFIED**. | **major** (data) | `cli-orchestration-matrix.component.ts:293-300`, `preferred-agent-order-save.ts:16`, `cli-matrix-rows.ts:491-495` |

### 2.4 The expanded lane row ("child form")

This section is from code and the prototype only. No expanded row was captured.

How the row works today (`libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts`):

- The lanes table does **not** use the shared `tr[ptahDetailRow]`. It uses a raw
  `<tr class="ptah-table-detail-row" [hidden]="detailRowId() !== row.id">` (`:416-418`) with
  `td ptahDetailCell [colspan]="table.collapsed() ? 5 : 9"` (`:419`).
- The shared `tr[ptahDetailRow]` never shows in wide mode
  (`libs/frontend/ui/src/lib/patterns/table/table-detail.ts:78`). The lanes table works
  around this with the raw row.
- The shared row expander is hidden in wide mode (`table-detail.ts:42`). The lanes expander
  (`lanes-table.component.ts:406-413`) uses it. Thus in wide mode the only way to open the
  detail row is the "Details for …" item of the overflow menu (`:332`).
- In collapsed mode the detail adds a `<dl>` with Permission, Network, Model, Actions and
  Capabilities (`:428-430+`). In wide mode it shows only `ptah-lanes-table-detail`.

What `ptah-lanes-table-detail` renders (`lanes-table-detail.component.ts`):

- `ptah-description-list` `cli-provider-facts` (`:52-55`): Version (`:57`),
  Executable / Provider (`:64-74`), Native CLI behavior with a popover (`:75-110`).
- Capability cells (`:112`), guide and credential actions (`:113-195`).
- The instance list (`:197-223`) with tier models (`:214-222`).
- Popover classes and inline style (`:255-259`), `cli-matrix-test-result` (`:266`).
- **No grid, no columns and no wide layout.** All items stack vertically.

| # | Finding | Severity | Evidence |
|---|---|---|---|
| EX-1 | In wide mode the detail cell spans all 9 columns (about 790 px today, more after SH-1 is fixed) but holds one vertical description list. The left `max-content` label column and long values give one narrow column of text and a large empty area. This is the "no real layout" that the user reports. | **major** | `lanes-table.component.ts:419`, `table.component.ts:59-64`, `lanes-table-detail.component.ts:52-223` |
| EX-2 | The expander is hidden in wide mode, so the user can open the detail only from the ⋮ menu. The prototype shows a chevron on every row. | **major** | `table-detail.ts:42`, `lanes-table.component.ts:332,406-413`, `P/screens/rev2b-providers-lanes-dark-784-expanded.jpg` |
| EX-3 | In collapsed mode the detail mixes two lists: the `<dl>` of row controls and the facts list of `ptah-lanes-table-detail`. The prototype shows one 2-column grid (`7rem 1fr`) with the controls only. | minor | `lanes-table.component.ts:428-430+`, `P/settings-prototype.html:573-592` |
| EX-4 | The detail uses popovers with inline style and one-off classes, not shared overlay components. | minor | `lanes-table-detail.component.ts:255-259` |

### 2.5 Context Management

| # | Finding | Severity | Evidence |
|---|---|---|---|
| CM-1 | One column of cards at 832 px. About 670 px is empty at 1920 px (same cause as SH-1). | **major** | `S/page-context-management-1920-dark.jpg` |
| CM-2 | "session budget settings could not be read" and "Routing suggestions: The setting could not be read" come from the empty profile. Not a design finding. | info | `S/page-context-management-1920-dark.jpg` |
| CM-3 | The rev-2 Context screens (`P/screens/rev2*-context*`) were not in the screen folder. The comparison used the rev-1 Context screen, which the design spec marks as superseded. **UNVERIFIED** against rev 2. | info | `D/settings-design-spec.md:17` |

### 2.6 Decision matrix

| # | Finding | Severity | Evidence |
|---|---|---|---|
| DM-1 | The band of 4 tiles is present and agrees with `P/screens/review-a3-matrix-dark-1440.jpg`. | — (match) | `S/page-decision-matrix-1440-dark.jpg` |
| DM-2 | "The capability matrix could not be read" and "Families 0" come from the empty profile. The matrix grid could not be compared. **UNVERIFIED**. | info | `S/page-decision-matrix-1440-dark.jpg` |
| DM-3 | Same max width as SH-1. A capability matrix has the most need for width. | **major** | `S/page-decision-matrix-1920-dark.jpg` |

### 2.7 Advanced

| # | Finding | Severity | Evidence |
|---|---|---|---|
| AD-1 | The page uses label/control cards, Membership buttons, a "Default" chip for System prompt and "0 available" for Output Style. The structure agrees with the rev-1 prototype in general. | — (match) | `S/page-advanced-1440-dark.jpg`, `P/screens/advanced-dark-1168.jpg` |
| AD-2 | Same max width as SH-1. | **major** | `S/page-advanced-1920-dark.jpg` |
| AD-3 | Raw buttons and daisyUI classes remain in this area (see section 3). | minor | Appendix B |

### 2.8 Search & Voice

| # | Finding | Severity | Evidence |
|---|---|---|---|
| SV-1 | About 750 px is empty on the right at 1920 px. | **major** | `S/page-search-voice-1920-dark.jpg` |
| SV-2 | Web search and voice "could not load" errors come from the empty profile. | info | `S/page-search-voice-1920-dark.jpg` |
| SV-3 | A "go vet" card shows on this page. **UNVERIFIED** whether the prototype places it here. | minor | `S/page-search-voice-1920-dark.jpg` |

### 2.9 Light theme

`S/page-*-1440-light.jpg` and `S/lanes-1440-light.jpg` show the same layout as dark. No
light-only defect was found. Contrast was not measured.

---

## 3. Shared-component audit

Full tables: Appendix B (`lanes/component-audit.md`). Scope: `libs/frontend/chat/src/lib/settings/**`
and the settings pages in the redesign PRs.

### 3.1 Bypass counts (Appendix B)

| Pattern | Count | Files |
|---|---|---|
| Raw `<button>` without `ptahButton` | 64 | 25 |
| Raw `<input>`, `<select>`, `<textarea>` without a shared field | 22 | 13 |
| Raw `<table>` | 0 | 0 |
| daisyUI component classes (`btn`, `badge`, `input`, `select`, …) | 46 | 26 |
| `ptah-native-*` classes | 36 | 25 |
| One-off layout classes and inline styles | 44 | 29 |

### 3.2 Adoption of shared components (files)

| Component | Files |
|---|---|
| `ptahButton` | 62 |
| `ptah-field` | 24 |
| `ptahBadge` | 24 |
| `ptah-form-section` | 17 |
| `ptah-setting-row` | 11 |
| `ptah-inline-confirm` | 8 |
| `ptah-table` | 2 |

There is no rich `ptah-select`. Settings uses the native `select[ptahSelect]` in 13 files.
The selector table is in Appendix B lines 32-91.

### 3.3 Shared features that exist (do not rebuild)

Appendix B lines 337-348: control cells, row header, row state, row actions with an inline
action, order buttons with a live region, compact density, detail helpers and matrix helpers
(`libs/frontend/ui/src/lib/patterns/table/table-*.ts`).

### 3.4 Shared components that do not exist yet

Appendix B lines 327-335, checked against `table.component.ts:177-181` (the only inputs are
`label`, `size`, `density`, `collapseBelow`).

| Missing | Spec reference | Effect |
|---|---|---|
| Column definitions with a per-column priority | `D/settings-design-spec.md:309`, `:313` | The table can only collapse all optional columns at one width (LN-1). |
| `ng-template` cells indexed by column id | `D/settings-design-spec.md:310` | Each table writes its own cells and its own collapsed `<dl>`. |
| Automatic detail relocation, and a guard against sideways scroll | spec `:309-313` | `table.component.ts:34` uses `overflow-x-auto`, so a wide table scrolls instead of reflowing. |
| A wide detail row | — | `table-detail.ts:78` hides the shared detail row in wide mode. The lanes table uses a raw `<tr>` (EX-1, EX-2). |
| Default row density of about 52 px | spec | Actual 48 px (`table.component.ts:78`). |
| `ptah-progress` | spec | `ptah-meter` is the approved substitute. |
| Radio, slider and kbd primitives | spec | Raw inputs remain. |
| A rich select | — | 13 files use the native select. |

---

## 4. Root causes

Detailed evidence: Appendix A (`lanes/pr-survey.md`). Phase B PRs: #1357 (shell, Electron
screenshots at 600/1168/1920), #1372 (Connections), #1373 (Context), #1374 (Advanced),
#1376 (Search & Voice), #1371 (lanes wire, retire card). Only #1357 had Electron
screenshots. **No PR had a prototype screenshot beside it.** `gh` auth failed during the
survey, so the live PR bodies are **UNVERIFIED**. The survey used local drafts and merge
commits.

| # | Candidate | Verdict | Evidence |
|---|---|---|---|
| R1 | The plan said "wire" and "migrate", not "match the prototype". | **Partly confirmed** | `D/settings-apply-plan.md:22` ("Keep every id, data-testid, aria-label, role and behavior"), `:85-86`, `:115-116` (work units are wire and retire). Counter-evidence: `D/settings-design-spec.md:21`, `D/settings-apply-plan.md:8`. |
| R2 | No screenshot gate. | **Confirmed in practice** (the plan had a gate, the work skipped it) | `D/settings-apply-plan.md:45-47` (gate at 1440/1168/1024/784, no 1920, glob points to rev-1 names), `D/status.md:521` ("Screenshots: not taken (user: CI verifies)"), `:526-527`, `:533`. CI has no visual check. |
| R3 | The prototype covers only narrow widths. | **Partly confirmed** | The frame is 1168 px (`P/settings-prototype.html:106`), but a Fluid option exists (`:640`) and `.main` has no max width (`:140`). The review `responsive-review.md:43` already reported about 750 px blank at 1920 px. The 52rem token came later (`e0413f599`) and contradicts the Fluid prototype. |
| R4 | `ui-class-audit` counts classes, not design. | **Confirmed** | `tools/ui-class-audit/check-ui-classes.ts:49-51`, `:59-73`. It counts daisyUI classes only. It cannot see layout, width, column use or a missing component. Review of #1374 used it as the design proof (`review-1374:14,18`). |
| R5 | The work optimized for id/testid parity. | **Confirmed** | `D/status.md:395`, `parity-1371:11-18`, `:45-47`, `:53`, `B19:24`, `review-1359:17`. Parity documents check ids and test ids, not the screen. |
| R6 | Reviews read source only. | **Confirmed** | `review-1371:29`, `review-1373:25`, `review-1374:18`, `review-1376:26`. No reviewer opened Electron. |
| R7 | The prototype, design spec and apply plan are not in git. | **Confirmed** | `git ls-files` on `main` has no `settings-prototype.html`, `settings-design-spec.md` or `settings-apply-plan.md`. In the design worktree `D/` is untracked (`git status`: `?? .ptah/specs/TASK_2026_2196_0f09/`). A PR reviewer or a CI job cannot open the target. |
| R8 | The e2e harness height budget drove the layout. | **Confirmed** | `BNarrow:59-61`, `BWrap:6` (Appendix A). |
| R9 | The `ptah-table` API is smaller than the spec. | **Confirmed** | Section 3.4. With only one `collapseBelow` number, the lanes PR chose 900 and the table collapses on all real screens (LN-1). |
| R10 | The design was not approved. | **Rejected** | `D/status.md:5-6`, `:12-13`. |
| R11 | The PR consolidation weakened the gate. | **Partly confirmed** | Appendix A, verdict f4. |

**Main chain.** The plan had a screenshot gate (R1, R2), but the work skipped it, the
reviews read only source (R6), and the only automated design check counts classes (R4). The
target was not in git (R7). Parity work proved ids, not screens (R5). One shell token (52rem)
and one table number (900) then made every wide screen narrow and collapsed (R3, R9).

---

## 5. Fix plan (PR-size steps)

Rules for every step:

- Keep every `id`, `data-testid` and `aria-label`. Add new ones only.
- The `ui-class-audit` baseline and the `max-lines` baseline can only go down.
- Electron only. Each PR follows the gate in section 6.
- Run `npm run verify -- --related -p chat,ui` and
  `npm run verify -- -t lint,typecheck -p chat,ui`, then
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview` after a template change.
- Width table: behavior at 1024 / 1440 / 1920 / 2560 px.

### Step 1 — `fix(chat): keep the lanes matrix visible on partial data`

| Item | Value |
|---|---|
| Files | `libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.ts` (`:343-348` and other array reads), its spec |
| Shared components | `ptah-table` message cell (`.ptah-table-message-cell`) for an empty or partial state |
| Acceptance screen | `S/lanes-1440-dark.jpg` replaced by a capture with rows and an error message in the table |
| Widths | Same at all widths: rows render, the table shows one message row for missing data |
| Risk | Low. Guards only. Unblocks the screenshot gate for all later steps. |

### Step 2 — `fix(chat): keep uninstalled lanes in the saved order`

| Item | Value |
|---|---|
| Files | `cli-orchestration-matrix.component.ts:293-300`, `preferred-agent-order-save.ts`, specs |
| Change | Swap the two ids inside the full saved `preferredAgentOrder` (installed and uninstalled), not inside the installed subset. Add a spec: an uninstalled id keeps its index after a move. Confirm the backend normalization (**UNVERIFIED** today). |
| Shared components | `ptah-table-order` buttons and live region (no change) |
| Acceptance screen | Before/after of the lanes table after "move down", plus the saved value in the spec |
| Widths | No layout change |
| Risk | Low. Data fix. |

### Step 3 — `feat(ui,chat): fluid settings content and a wide layout`

| Item | Value |
|---|---|
| Files | `libs/frontend/ui/src/lib/foundation/ptah-tokens.css:482`, `settings-layout.component.ts:230`, the page section containers |
| Change | Replace the fixed 52rem panel. Center the content. Let sections that hold tables or card grids use the full main width with a large cap (for example 96rem). Keep text-only field sections at the prototype `15rem + minmax(0, 36rem)` (`P/settings-prototype.html:177`). Use `auto-fill` card grids (`:191-193`). |
| Shared components | `ptah-form-section`, `ptah-setting-row`, a shared settings grid utility in `libs/frontend/ui` (new, small) |
| Acceptance screen | `P/screens/rev2b-providers-lanes-dark-1168.jpg` and `review-a3-providers-lanes-dark-1440.jpg` |
| Widths | 1024: one column, no overflow (fix SH-3). 1440: card grids with 2 columns, lanes at about 1000 px. 1920: 3 columns, centered, no empty half. 2560: capped and centered. |
| Risk | Medium. Touches all pages. Check each page in the gate. |

### Step 4 — `feat(chat): show every lane column on wide panels`

| Item | Value |
|---|---|
| Files | `lanes-table.component.ts:84-101` |
| Change | After step 3 the host is wider than 900 px at 1440 px and more. Set `collapseBelow` to the prototype value (950, `P/settings-prototype.html:573`) measured on the table host. Apply the prototype column widths (`:438-451`) with a `<colgroup>`. |
| Shared components | `ptah-table`, control cells, row actions |
| Acceptance screen | `P/screens/rev2b-providers-lanes-dark-1168.jpg` |
| Widths | 1024: collapsed (host < 950). 1440, 1920, 2560: all 8 columns, no sideways scroll. |
| Risk | Low after step 3. |

### Step 5 — `feat(chat): real layout for the expanded lane row`

| Item | Value |
|---|---|
| Files | `lanes-table.component.ts:406-430+`, `lanes-table-detail.component.ts` |
| Change | Show the expander in wide mode too (local override or step 8 API). In wide mode lay out the detail as a grid: facts (version, executable, native behavior) in 2-3 columns, capabilities as one row of chips, actions on the right, the instance list as a sub-table. In collapsed mode show one `7rem 1fr` grid with the row controls first (`P/settings-prototype.html:573-592`), then the facts. Replace the inline popover style (`:255-259`) with the shared overlay. Keep `cli-provider-facts` and all test ids. |
| Shared components | `ptah-description-list`, `ptahBadge`, `ptahButton`, `ptah-table` detail cell |
| Acceptance screen | `P/screens/rev2b-providers-lanes-dark-784-expanded.jpg`, `P/screens/lane2b-detail-light-784.jpg` |
| Widths | 1024: 1-column grid. 1440: 2 columns. 1920 and 2560: 3 columns, no line longer than about 60 characters. |
| Risk | Medium. Many test ids in one component. |

### Step 6 — `refactor(chat): lanes header and Ptah CLI defaults as in the prototype`

| Item | Value |
|---|---|
| Files | `agent-orchestration-config.component.ts:115`, `cli-orchestration-matrix.component.ts`, the Ptah CLI instances card |
| Change | Remove the legacy Max Concurrent / Order form from the matrix card (move the field to Advanced if it is still needed, and keep its ids). Add the header row: ring, "Edit order", "New Ptah CLI instance". Add Ptah CLI defaults with 2 selects and Background models with a label column. Hide controls on muted rows (LN-8). |
| Shared components | `ptah-meter` (ring), `ptahButton`, `ptah-field`, `select[ptahSelect]`, `ptah-setting-row` |
| Acceptance screen | `P/screens/rev2b-providers-lanes-dark-1168.jpg` |
| Widths | 1024: header wraps to 2 lines. 1440 and more: one header row, defaults in 2 columns. |
| Risk | Medium. A behavior move of the legacy form. |

### Step 7 — `fix(chat): loading states inside their cards`

| Item | Value |
|---|---|
| Files | The Providers page template that renders "Loading CLI agents…", "Loading instance models…", "Loading delegated CLI models…" |
| Change | Show each state inside its card with the shared skeleton or a `ptah-table` message row. |
| Shared components | The approved loading primitive of `libs/frontend/ui` (name **UNVERIFIED**), `ptah-table` message cell |
| Acceptance screen | `S/page-providers-1920-dark.jpg` (before), the prototype "Loading" state (`P/settings-prototype.html` state switch) |
| Widths | Same at all widths |
| Risk | Low. |

### Step 8 — `feat(ui): ptah-table column priority and a wide detail row`

| Item | Value |
|---|---|
| Files | `libs/frontend/ui/src/lib/patterns/table/table.component.ts`, `table-detail.ts`, specs, then `lanes-table.component.ts` |
| Change | Add column definitions with a priority, so columns hide one at a time as the host gets narrower. Let `tr[ptahDetailRow]` and the expander show in wide mode when the table asks for it. Replace `overflow-x-auto` with reflow plus a guard. Set default density to the spec value. Move the lanes table off its raw `<tr>`. |
| Shared components | `ptah-table` (extended) |
| Acceptance screen | The step-4 and step-5 screens must not change. |
| Widths | Columns drop by priority between 1024 and 1440. |
| Risk | Medium. Two tables use `ptah-table` today. Keep the old inputs. |

### Step 9 — `refactor(chat): settings controls on shared components`

| Item | Value |
|---|---|
| Files | The 25 files with raw buttons, 13 with raw fields, 26 with daisyUI classes (Appendix B) |
| Change | Migrate in groups of 5-8 files per PR. Add a rich `ptah-select` in `libs/frontend/ui` first if the native select cannot show the prototype states. Add radio and slider primitives when a page needs them. |
| Shared components | `ptahButton`, `ptah-field`, `ptahBadge`, new `ptah-select`, radio, slider |
| Acceptance screen | Per page, the matching `P/screens/*` file |
| Widths | Same as step 3 |
| Risk | Low per PR. The `ui-class-audit` baseline goes down in each PR. |

### Step 10 — `docs: settings visual gate and prototype in git`

See section 6. Commit the prototype HTML and its screens with the design spec, so that PRs
and CI can link to them (fixes R7).

---

## 6. Process gate

Each settings PR must meet these rules before review:

1. The PR body has a table: page, width, theme, **prototype screen**, **Electron before**,
   **Electron after**.
2. Widths: 1024, 1440, 1920 and 2560 px, dark. 1440 px light. Use the design-preview capture
   with an isolated profile that has **fixture data** (lanes, instances, connections), so
   rows and expanded rows render.
3. Include one expanded lane row at 1440 and 1920 px when the PR touches Providers.
4. The prototype screen is a file under the committed design folder (step 10), not a path in
   a local worktree. Name the revision (rev 2 or rev 1) beside each screen.
5. The reviewer opens the screenshots and states one of: matches, differs (with a list),
   or not comparable (with a reason). A review from source only does not pass.
6. `ui-class-audit` and `max-lines` baselines can only go down. The PR states the counts.
7. Every `id`, `data-testid` and `aria-label` that existed stays. The PR states the parity
   check result in one line. Parity alone does not pass the gate.
8. A fixture-profile error (for example "could not be read") in a screenshot blocks the gate
   until the fixture is fixed. It is not accepted as "data only".

Proposed automation (separate task): a `design-preview` spec that captures the four widths
and fails when the content panel width at 1920 px is less than 70 % of the main width, or
when the lanes table at 1440 px has `data-collapsed="true"`.

---

## Appendix index

| File | Content |
|---|---|
| `lanes/pr-survey.md` | Phase B PR survey and root-cause verdicts (Appendix A) |
| `lanes/component-audit.md` | Shared-component audit with counts and file:line evidence (Appendix B) |
| `screens/*.jpg` | Electron captures (dark 1024/1440/1920/2560, light 1440). **Local only**: `.gitignore:136` ignores `.ptah/specs/**/*.jpg`, so the JPEG files are not in the pull request. They stay in the task worktree. Step 10 must choose a tracked location for gate screenshots. |
| `screens/metrics.json` | Measured nav, main, panel and table widths |
| `screens/probe.json` | Lanes table host attributes and row counts per width |
