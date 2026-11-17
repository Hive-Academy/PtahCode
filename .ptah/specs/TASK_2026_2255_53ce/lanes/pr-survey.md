# Settings Phase B: PR and design handoff survey

The strongest documented break is between the explicit prototype/Electron gate and the final tab deliveries: the status log says screenshots were not taken and reviews explicitly disclaim rendering. The plan retained design requirements, but its implementation rows and saved PR bodies mostly describe component substitution, behavior preservation and audit reductions. This is evidence of a weakened acceptance process; it does not establish anyone's intent.

## Scope, provenance and limits

- Read-only research against HEAD = `origin/main` = `7adadbf49d209ebd159b27f512c427a8ebd6f46f`; only this report was written. No checks, builds, tests, rendering, commits, pushes or PR mutations were performed.
- `D/<file>` means repository-relative `.ptah/specs/TASK_2026_2196_0f09/<file>` in the supplied `feat-settings-redesign-e2e2d736dbc2` design worktree. `C/<file>` means `.ptah/tmp/coordinator/<file>` in the repository coordinator checkout. `W/<name>/<file>` means repository-relative `<file>` in the design task's nested worktree named `<name>`. These aliases distinguish source checkouts without absolute machine paths.
- The requested `gh pr list --repo Hive-Academy/PtahCode --state merged --search settings --limit 60 --json number,title,mergedAt,headRefName` failed: “please run: gh auth login”. Public API access also failed. Live PR bodies, comments, review threads, file lists and GitHub `mergedAt` are **UNVERIFIED**. No credentials were changed. Parent blocker notification was refused with `parent-inbox-full`.
- Native PowerShell/`rg` and read-only Git history supplied local evidence. Ptah workspace analysis and skill inventory were available; no native CLI skill invocation/read mechanism was exposed. No design or frontend implementation was undertaken.
- Dates, titles and branches below come from local `origin/main` merge commit messages/timestamps, not a successful GitHub query. All dates below are **2026-11-16 UTC**, including #1371 (its local +02 timestamp falls on November 17). Exact GitHub merge dates remain UNVERIFIED.
- Saved `*-body.md` files are **draft evidence**, not verified copies of the final published bodies. Y/N flags below apply only to those saved drafts. For every row, final GitHub-body flags remain UNVERIFIED. “Electron Y” means a concrete capture/reference is recorded, not merely the word Electron or an unchecked task. “Prototype screenshot Y” requires a reference to prototype screenshots, not just a mention of the prototype. Widths are screenshot/capture widths, not arbitrary breakpoint numbers.
- Excluded without examining their contents: #1045, #1263–#1267, #1337, #1343, #1354, #1355, #1360, #1365, #1366.

## 1. Phase B PR table

All rows have merge date 2026-11-16 UTC from local Git. B-codes resolve to saved repository-relative body files immediately below the tables. U = UNVERIFIED (no matching saved body inspected).

| PR | Title from merge message | Merge date (UTC, Git) | Branch | Tab / plan item | Body's one-line scope (saved draft) | Prototype screenshot | Electron screenshots | Capture widths px | Word prototype |
|---|---|---|---|---|---|---|---|---|---|
| #1357 | feat(chat): move the settings shell onto ptah-settings-layout | 2026-11-16 | feat/settings-shell-layout | Shell / 5 | B5: navigation shell, projected context/security, headings, deferred states, Setup and visual fixes | N | Y | 600, 1168, 1920 | Y |
| #1372 | feat(chat): move Providers connections onto shared ui parts | 2026-11-16 | feat/settings-connections | Providers Connections / 17 | B17: migrate error/empty/loading states and catalog list; retain hooks | N | N | none | N |
| #1373 | feat(chat,ui,core): finish the Context Management tab | 2026-11-16 | feat/settings-context-budget | Context / 6+7+8b+20 | BContext: shared fields/rows, matrix child navigation, remove settings-field | N | N | none | N |
| #1374 | feat(chat): move the Advanced tab onto shared ui parts | 2026-11-16 | feat/settings-advanced-behaviour-mcp | Advanced / 9–12 | BAdv: shared membership/behavior/MCP/prompt forms, output-style tiles and tool rows | N | N | none | N |
| #1376 | feat(chat): move Search & Voice onto shared ui parts | 2026-11-16 | feat/settings-web-search | Search & Voice / 13–15 | BSearch: shared search/consent fields, voice select, key test and STT/TTS rows | N | N | none | N |
| #1371 | feat(chat): wire the lanes table into Providers, retire the card | 2026-11-16 | feat/settings-lanes-wire | Providers Lanes / 19+19a+19b | B19: mount table/detail, retire card, migrate harness and restore parity; old instances cleanup deferred | N | N | none | Y |

Supporting Phase B PRs and direct precursors (same merge date):

| PR | Title from merge message | Merge date (UTC, Git) | Branch | Tab / plan item | Body scope | Prototype screenshot | Electron screenshots | Capture widths px | Word prototype |
|---|---|---|---|---|---|---|---|---|---|
| #1344 | feat(ui): add ptah-instrument-band pattern | 2026-11-16 | feat/ui-instrument-band | Shared / 2b | U; status lists band implementation | U | U | U | U |
| #1346 | feat(chat): settings section state and connection test components | 2026-11-16 | feat/settings-shared-components | Shared / 4 | U; status lists shared components | U | U | U | U |
| #1347 | feat(ui): add navigation mode to ptah-settings-layout | 2026-11-16 | feat/ui-settings-layout-nav-mode | Shell / 2 | B2: navigation mode, child items, band slot, 14.5rem nav, preserve default tabs | N | N | none | N |
| #1348 | fix(ui): remove the band's temporary tabindex when focus fails | 2026-11-16 | fix/ui-instrument-band-focus | Shared / 2b fix | B2fix: clean up failed focus attempt | N | N | none | N |
| #1349 | feat(ui): add error role, test id and slots to ptah-field | 2026-11-16 | feat/ui-field-projection | Shared / 3 | B3: additive error attributes and before/after footer slots | N | N | none | N |
| #1351 | feat(ui): add setting-row and inline-confirm patterns | 2026-11-16 | feat/ui-setting-row-inline-confirm | Shared / 1 | B1: new row/confirm patterns; no consumers yet | N | N | none | N |
| #1353 | test(chat): add settings connection test component spec | 2026-11-16 | test/settings-connection-test-spec | Shared / 4b | B4b: missing connection-test component spec | N | N | none | N |
| #1358 | fix(chat): let the settings order strip wrap in a narrow box | 2026-11-16 | fix/settings-order-strip-wrap | Providers precursor | BWrap: wrap order bar; lower VS Code column budget | N | N | none | N |
| #1359 | feat(chat): add the decision matrix page on ptah-table | 2026-11-16 | feat/settings-decision-matrix-page | Decision matrix / 8 | B8: page/table/filter/state implementation; mounting deferred to 8b | N | N | none | N |
| #1362 | test(webview-e2e-harness): answer capability matrix in fixtures | 2026-11-16 | test/settings-fixtures-capability-matrix | Matrix precursor | BFixture: empty matrix RPC fixture avoids loading timeout | N | N | none | N |
| #1363 | feat(chat): add the lanes table on ptah-table | 2026-11-16 | feat/settings-lanes-table | Providers Lanes / 18 | B18: presentational compact v2 table; mount and host flows deferred | N | N | none | N |
| #1364 | refactor(chat): move main agent section onto shared settings parts | 2026-11-16 | feat/settings-main-agent | Providers / 16 | B16: surface-card/buttons/alert/tokens; main-agent footer move deferred | N | N | none | N |
| #1369 | fix(chat): fit settings cards and policy bar in narrow columns | 2026-11-16 | fix/settings-narrow-fit | Providers precursor | BNarrow: larger card minimum and container bar rules satisfy narrow harness budgets | N | Y | 784, 1024, 1152, 1280, 1440 measured; filenames also 1040, 1168, 1456 | N |

Body source key (all under each W worktree's `.ptah/tmp/`):

| Key | W worktree | Body filename / useful lines |
|---|---|---|
| B5 | settings-shell-layout | `pr5-body.md:3`, `:7`, `:35`, `:43`, `:46`, `:49` |
| B17 | connections | `pr17-body.md:3`, `:5`, `:11`, `:19` |
| BContext | context-budget | `ctx-body.md:3`, `:5`, `:9`, `:13`, `:15`, `:24` |
| BAdv | advanced-behaviour-mcp | `adv-body.md:3`, `:5`, `:8`, `:12`, `:15`, `:24` |
| BSearch | web-search | `ws-body.md:3`, `:5`, `:9`, `:12`, `:20` |
| B19 | design worktree itself | `.ptah/tmp/pr1371-body.md:3`, `:5`, `:19`, `:22`, `:29`, `:42` |
| B2 | ui-settings-layout-nav-mode | `pr2-body.md:2`, `:6`, `:16` |
| B2fix | ui-instrument-band | `pr-2bfix-body.md:2`, `:4` |
| B3 | ui-field-projection | `pr3-body.md:2`, `:3`, `:4` |
| B1 | ui-setting-row-inline-confirm | `pr1-body.md:3`, `:5`, `:6`, `:9`, `:16` |
| B4b | settings-connection-test-spec | `pr4b-body.md:3` |
| BWrap | order-strip | `os-body.md:3`, `:6`, `:11`, `:12` |
| B8 | settings-decision-matrix-page | `pr1359-body.md:6`, `:14`, `:17`, `:31` |
| BFixture | fixtures-matrix | `fx-body.md:3`, `:5`, `:6` |
| B18 | lanes-table | `pr18-body.md:3`, `:5`, `:14`, `:16`, `:28` |
| B16 | main-agent | `pr16-body.md:5`, `:15`, `:19`, `:30` |
| BNarrow | settings-narrow-fit | `narrow-fit-pr-body.md:3`, `:16`, `:45`, `:49`, `:59`, `:64` |

The table's inventory is locally reconstructed, not an exhaustive successful merged-settings search. Merge commits anchor final tabs: #1357 `8f208d940`, #1372 `e82bb1e48`, #1373 `cd55c2af5`, #1374 `790ba4a29`, #1376 `b4ab8f096`, #1371 `ab0df3580`. Supporting mappings also appear in `D/status.md:31–39`, `:455–461`. Live PR body edits after these drafts remain UNVERIFIED.

## 2. Candidate causes and verdicts

### a. Briefs/plans emphasized wiring, migration and hooks instead of matching screens — PARTLY

- `D/settings-apply-plan.md:22`: “Keep every `id`, `data-testid`, `aria-label`, role and behavior”. Its old implementation table is explicitly retained “for file lists and hooks only” (`:85–86`).
- `D/settings-apply-plan.md:115`: “smart parent: builds CLI + instance rows in try order”; `:116` names `refactor/settings-retire-cli-card`. The work units emphasize wiring and retirement.
- BContext `:5`: “Session budget and lane guards use shared fields”; `:15`: “Keep all ids, `data-testid` and `aria-label` values.” B17 `:5` says “Move the Providers connections error, empty and loading states onto shared” parts.
- Counterevidence: `D/settings-design-spec.md:21`: “the prototype wins for layout, spacing, copy and states”; `D/settings-apply-plan.md:8` requires each tab PR to compare Electron screenshots with prototype screenshots.
- B5 `:7`: “description from the design of record (prototype rev 2)”. The design reference was not erased everywhere. Actual child prompts beyond the saved documents and final GitHub bodies are UNVERIFIED.

### b. No screenshot gate against the prototype — PARTLY (gate existed; final-tab execution absent in the records)

- `D/settings-apply-plan.md:8`: “Each tab PR compares its Electron screenshots with `prototype/screens/<tab>-*.jpg`.” `:45–47` requires full-page dark/light Electron shots at 1440, 1168, 1024 and 784 before each tab push.
- `D/settings-design-spec.md:17`: “Rev 1: `prototype/screens/<tab>-<theme>-<width>.jpg` (Providers and Context are superseded)”. The plan's comparison glob therefore selects rev-1-style names, while its header `:3–6` identifies rev 2 (`rev2-*`, `rev2b-*`) as current. This is a concrete stale-target ambiguity, not proof an implementer actually compared against rev 1.
- `D/status.md:521`: “Screenshots: not taken (user: CI verifies).” `:526–527` reports “No visual check” for Context and Advanced; `:533` repeats it for Search & Voice. This is the report author's attribution of a user instruction; the originating user message was not independently available.
- B19 `:42`: “Electron screenshots: not run locally ... CI verifies.” BSearch `:20` similarly leaves Electron screenshots unchecked. No saved final-tab prototype comparison is established.
- Counterevidence: B5 `:46`, `:49` records shell captures at 600/1168/1920; `D/responsive-review.md:4–5` records 28 captures through 2560. These prevent a blanket “no screenshots ever” conclusion. Neither establishes the mandated per-tab comparison to approved rev-2 screens at delivery.

Screenshot revision detail: the supplied folder contains `providers-dark-1168.jpg`, unprefixed context/advanced/search variants, `rev2-*`, `rev2b-*`, `lane2-*`, `lane2b-*`, and 1440/1056 `lane-*` PNGs. The spec explicitly classifies the unprefixed files as rev 1; `D/status.md:108–110` identifies the published rev-2 sets. `D/prototype/lane-notes-2.md:28` describes follow-up `lane2b-` captures. The claimed rev-1 capture clock times 08:18–08:21 were not independently established from image metadata: **UNVERIFIED**. Unprefixed Advanced/Search references remain in the spec (`settings-design-spec.md:220` for Advanced), so “all unprefixed screenshots were rejected” would overstate it.

### c. Only narrow screens were designed, so 1920+ was never considered — PARTLY

- `D/prototype/settings-prototype.html:106`: “`--w: 1168px; width: min(var(--w), 100%); margin: 0 auto`”; `:640` offers “1168”, “784”, “390” and “Fluid”. The prototype is not hard-limited to narrow widths: Fluid exists.
- `D/prototype/lane-notes.md:6`: “dark and light at 1440 and 1056 viewport widths”; `D/status.md:95–98` describes rev-2 1168/784 content measurements. No approved 1920+/2560 prototype capture was found; absence from this inspected set is not proof no wide design discussion occurred.
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.css:482`: “`--ptah-settings-content-max-w: 52rem;`”; `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts:230` applies `max-w-[var(--ptah-settings-content-max-w)]` to the content column. This is the implemented 832px cap.
- Git `log -S '--ptah-settings-content-max-w'` identifies introduction in `e0413f599` (2026-11-14), “feat(ui): add ptah-form-section pattern and pattern layer spec”; its diff adds the 52rem token with the pattern tokens. It predates the November 16 Phase B tab work; no later token-value change appeared in this history search.
- `D/responsive-review.md:43`: “At 1920px, blank space on right is ~750px”; `:25` associates the 832px cap with one-column connections. That review's build is `e3b6d5a94` (`:3`), not an independently rendered current-main check. Its wide observations and the shell's 1920 check refute “wide was never reviewed”; wide **prototype approval and parity** remain unverified.

### d. Audit baselines measured class counts, not design — CONFIRMED

- `tools/ui-class-audit/check-ui-classes.ts:49–51`: “allowed count” and “Any count above the baseline fails”.
- Same file `:59–73` describes the second rule as “raw spacing utilities” and `baseline-spacing.json` as having “the same ratchet semantics”. These rules inspect source usage, not rendered screen similarity.
- `D/settings-apply-plan.md:14–15`: a changed baseline file “lowers its rows. It never raises a row.”
- `C/review-1374.md:14`: “baselines only delete entries (0 additions; 187 deletions)”; `:18` says “No ... screenshot inspection”. Passing migration counts and code review therefore do not evidence prototype parity.

### e. Child acceptance optimized ids/testids/aria parity — CONFIRMED (documented emphasis, not a motive claim)

- `D/status.md:395`: reuse card children “so no function and no test id is lost”, following 31 failed focused tests and missing acceptance items.
- `C/parity-1371.md:11–18` inventories “Capability”, “Base location”, “Head location”, “Status”, with outcomes “same”, “moved”, “changed”. `:45–47` separately inventories removed hooks and aria labels.
- B19 `:24`: “All other ids, `data-testid` and `aria-label` values stay.” The table label change is explicitly an exception because “prototype rev 2 names this table ‘Lanes’” (`:22`).
- `C/review-1359.md:17`: “Disappeared hooks: none”; `C/parity-1371.md:53`: “Read-only source audit only; no rendering”. Functional parity received concrete scrutiny; visual equivalence did not receive the same evidence in these reviews.

### f1. User never approved revision 2 — REJECTED

- `D/status.md:5–6`: “The user wrote ‘approved’ in this child tab after the rev 2 report” and identifies artifact `a5daf8a0-8052-4553-b521-8ee35c232c95`.
- `D/status.md:12–13`: “The parent confirmed: the user told the parent directly that rev 2 is approved.”
- Stale countertext remains in `D/settings-apply-plan.md:145`: “Open: user approval of the new revision”; `D/status.md:111` likewise records an earlier “Open: user approval of rev 2.” The document is a report log, not a single current state; these do not negate the later approval statement at its top.

### f2. Reviews provided code evidence rather than rendered-design acceptance — CONFIRMED for inspected reviews

- `C/review-1371.md:29`: “Electron visual layout ... reviewed from source only.”
- `C/review-1373.md:25`: “responsive visual quality remain unverified in a rendered Electron window”.
- `C/review-1374.md:18`: “No ... app rendering, or screenshot inspection”.
- `C/review-1376.md:26`: “Layout at 784 px and visual hint overlap were assessed from templates only”.
- These are explicit review constraints, not evidence the reviewers falsely claimed visual sign-off. Live GitHub review content and any other visual sign-off are UNVERIFIED.

### f3. Harness risk drove layout decisions — CONFIRMED for specific decisions

- BWrap `:6`: “`minColumnsAt800` from 2 to 1”; `:11` explains the shell's 232px nav and preserves the Electron budget.
- BNarrow `:59–61`: connections drop columns at 1440 and 1024; “the intended trade: a card never wraps past the 80 px check.” This is explicit optimization for a harness height budget.
- `D/status.md:418`: “Harness migration (4 files) moved from 19a into PR 19.” `settings-apply-plan.md:84–85` calls harness-selector migration “high risk”.
- BFixture `:6`: absent fixture response makes `waitForSettled` fail Electron “baseline smoke — tab captures”; it supplies empty profiles (`:5`). These choices address functional/geometry harness failures; none proves comparison to the approved prototype.

### f4. Consolidation and unmounted precursors weakened the gate handoff — PARTLY

- `D/settings-apply-plan.md:78–82` folds old items 6+7+8b+20, 9–12, 13–15 and 19+19a+19b into tab PRs; `D/status.md:442` says “19a/19b fold into PR 19”. This was an explicit plan change, not accidental unrelated merging.
- B8 `:17`: “No Electron visual review was possible ... until PR 8b”; “This PR must not merge before it.” Yet #1359 is in local main, and status `:458` later records its page still had “no consumer on main”.
- B18 `:14`: “no Electron screenshot is possible in this PR”; `:28` defers review until mounting. The later tab delivery records no visual check rather than closing that deferred gate.
- `D/status.md:386`: “The user-review wait rule no longer blocks tab PRs (parent has merge authority for reviewed, clean PRs).” This records the process change; it does not independently prove authorization to abandon all prototype comparisons.

### f5. ptah-table v2 never landed — REJECTED as a blanket cause; contract mismatch PARTLY

- B18 `:3`: “shared `ptah-table` v2”; `:5` names “compact density, priority columns, a detail-row expander and the order buttons”.
- Main has `patterns/table/table-matrix.ts:31–65` group rows/bar cells, `:125` sticky headers, `table-order.ts:21` order buttons and `table-detail.ts:24` collapsible cells.
- Main `ptah-ai/lanes-table.component.ts:84–88` uses `ptah-table`, compact density and `[collapseBelow]="900"`; `:255`, `:295` use compact selects; `capability-matrix-setting.component.ts:161–217` uses group headers and scores.
- But spec `D/settings-design-spec.md:309–313` asks for column definitions and per-column projected templates/priority inputs. Main `patterns/table/table.component.ts:33` projects caller markup and `:180–185` exposes density/table-wide collapse; `table-detail.ts:24` marks caller-owned cells. The inspected implementation is a compositional native-table API, not the specified column-definition/template API. Runtime dimension/contrast compliance remains UNVERIFIED.

## 3. Agreed revision and approval chain

| Record | Evidence | Interpretation |
|---|---|---|
| Design authority | `D/settings-design-spec.md:15`: “rev 2 (A3, current)”; rev 1 “superseded”. `:21`: prototype wins for “layout, spacing, copy and states”. | A3 rev 2, Flight deck Direction B, is the design of record. |
| A2/A3 decisions | `D/settings-apply-plan.md:145`: A3 candidate “confirmed by the user through the parent”; neutral checked toggle and left nav through 640 answered by parent. `:139` says Q2 cards were “superseded in A3” by the user's Lanes table; `:141` records matrix child page request. | User design choices were relayed through the parent. |
| Stale approval field | `D/settings-apply-plan.md:134`: “Phase B is still not approved”; `:145`: “Open: user approval of the new revision”. `D/status.md:84`, `:111` also record the pre-approval pause. | Contradictory snapshots remained in the handoff material. |
| Explicit approval | `D/status.md:5–6`: user “approved” after the rev-2 report; `:12–13`: parent separately confirmed direct user approval. | Local documentary evidence establishes user approval, witnessed/confirmed by the parent. Raw conversation independently UNVERIFIED. |
| Later handoff | `D/HANDOFF.md:7`: “No Phase B tab remains after #1371 and #1376”; `:56`: “Agent messages are not user approval.” | Handoff treats implementation as complete, but supplies no replacement design revision or visual-parity approval. |

Published approved artifact: `a5daf8a0-8052-4553-b521-8ee35c232c95`, with `prototype/rev-2.html` and `prototype/settings-prototype.html` recorded identical at publication (`D/status.md:87–90`). The superseded rev-1 artifact is `891e3f63-0b0a-4961-9521-1a7111230c85`. No named individual beyond the roles “user” and “parent” is established by these records.

## 4. Named deferrals, drops and origin/main disposition

Code paths below are repository-relative. `S/` = `libs/frontend/chat/src/lib/settings/`; `P/` = `libs/frontend/ui/src/lib/patterns/`. “Landed” means source exists at the inspected main commit, not exercised runtime behavior.

| Named item | Deferral / requirement evidence | Evidence on origin/main and disposition |
|---|---|---|
| 19a: instance tiers | `D/status.md:390`: accepted list includes “tiers from row.tiers” | **LANDED in source:** `S/ptah-ai/lanes-table.component.ts:186–189` tier summary; `:358–359` Tiers action emits row; `:427` detail forwards tiers. Runtime modal persistence UNVERIFIED. |
| 19a: system facts and actions | `C/review-1363-r2.md:9`: missing executable/source, provider, permissions, account, credentials, settings, Info and Re-detect | **LANDED substantially:** `S/ptah-ai/lanes-table-detail.component.ts:50` account, `:53–75` system details, `:80–149` permission/install/settings popovers, `:163–179` credentials. Full behavior parity remains UNVERIFIED; source parity inventory in `C/parity-1371.md:19–27`. |
| 19a: host writes and narrow layout | `D/status.md:390` explicitly defers “host write tests, narrow layout”; `:445` restates mounted 1440/1168/1024/784 gate | **PARTIAL:** `S/ptah-ai/cli-orchestration-matrix.writes.spec.ts:236–243` targets table hooks; `lanes-table.component.ts:88` collapses under 900. Specs exist but were not run here. Final mounted prototype screenshot comparison UNVERIFIED; status `:521` says not taken. |
| 19b: retire CLI provider card | `D/settings-apply-plan.md:116`; `D/status.md:442` folds into PR 19 | **LANDED:** Git tree has no `S/ptah-ai/cli-provider-card.component.ts`; B19 `:7–8` records retirement. Remaining `cli-provider-card-*` testids and `cli-provider-card-popovers.component.ts` are not the deleted card component. |
| Remaining instances card code | B19 `:29–32`: `[rows]="[]"`, unreachable cards/More menu and dead spec work deferred | **STILL PRESENT:** `S/ptah-ai/cli-orchestration-matrix.component.ts:203–204` mounts `ptah-cli-instances` with empty rows. Full instances component retirement did not land. |
| PR 8b: mount matrix child page | B8 `:14` defers mounting; `D/status.md:458` says absent then | **LANDED:** `S/settings.component.ts:46`, `:173–174` imports matrix page and declares “Decision matrix” child tab. BContext `:9–11` records navigation/deep-link work. |
| PR 20: retire settings-field | `D/settings-apply-plan.md:117` after zero consumers | **LANDED:** Git tree lacks `libs/frontend/ui/src/lib/extracted/settings-field/`; source search finds no `ptahSettingsField`, `SettingsFieldComponent` or `settingsFieldControl` in settings. BContext `:13` records deletion; `C/review-1373.md:20` reports no remaining apps/libs/tools references. |
| G7/v2 projected cells, numeric columns, compact editors | `D/settings-apply-plan.md:66–71`; `D/settings-design-spec.md:309–313` | **PARTIAL:** native projected markup, compact selects, row title and collapse landed (`P/table/table.component.ts:33`, `S/ptah-ai/lanes-table.component.ts:151`, `:255`, `:295`); specified column-definition/per-column-template API not found. Numeric alignment and all width hints not individually verified. |
| G7/v2 group rows, scores and clickable cells | `D/settings-apply-plan.md:71`; design spec `:316`, `:320` | **LANDED in source:** `P/table/table-matrix.ts:31–65`; matrix group row at `S/ptah-ai/capability-matrix-setting.component.ts:161`, score at `:217`, button/popover controls at `:229–260`. |
| G7/v2 sticky row header, detail priority | Design spec `:313`, `:319` | **LANDED structurally:** `P/table/table-matrix.ts:125`, `table-detail.ts:24–100`; matrix `:126`, `:186` uses sticky header directive; lanes `:416–419` renders detail row. Per-column priority API differs; no sideways scroll at required widths UNVERIFIED. |
| G7/v2 muted states, row actions, order mode, density, loading/empty/error | Design spec `:314–319`; plan `:70–71` | **LANDED structurally:** lanes `:125` muted state, `:138` order buttons, `:330` row actions, `:87` compact density; `P/table/table-matrix.ts:154–177` status cell. Actual 44–48px row heights, all states and focus outcomes UNVERIFIED. |
| PR 16 deferred Change main agent footer | B16 `:15`: design moves action into a `ptah-form-section` footer, later PR needed | **NOT LANDED as specified:** `S/providers/main-agent-section.component.ts:47` remains a custom section; `:119–126` defines its primary button. No form-section footer in that file. Whether later design direction authorized this difference is UNVERIFIED. |
| Main-agent stale Active state | `D/status.md:366–368`: “Not in #1364 (coordinator decision). Old behavior.” | **STILL POSSIBLE in source:** `S/providers/main-agent-section.component.ts:154` derives Active from `data?.ready`, independently of the route error state. Runtime reproduction UNVERIFIED. |
| Three progress sites -> ptah-meter | `D/settings-apply-plan.md:58–60` explicitly names STT, TTS and system-prompt drawer | **PARTIAL:** `S/ptah-ai/local-stt-panel.component.ts:230` and `local-tts-panel.component.ts:262` use `ptah-meter`; `S/pro-features/system-prompt-drawer.component.ts:251–254` still uses raw `<progress class="progress progress-primary w-full">`. Concrete shared-component migration omission. |
| Native card/popover retirement | `D/settings-apply-plan.md:119–121`: native-card “is not deleted”; native-popover “is not deleted (41 uses)” | **INTENTIONAL RETENTION:** settings still use `ptah-native-popover`, e.g. `S/license/license-status-card.component.ts:138` and matrix `:231`. These uses alone do not establish a dropped requirement; the plan explicitly retained that primitive. |
| User's shell review and final visual gate | Plan `:63–64`, `:132`; B5 `:35`, `:47`; B8 `:17` | **GATE CHANGED / FINAL PARITY UNVERIFIED:** status `:386` removes user-review blocking; `:521` reports no shots; review files disclaim rendering. Shell captures and later responsive review exist, but no inspected evidence closes all tab-to-rev-2 comparisons. |

The coordinator facts inventory is a useful source for ratchets and current primitives, but `C/epic-status-facts.md` section 7 says the design folder “is absent” in its searched trees. It therefore cannot establish the design handoff; the supplied design worktree contains the missing records. The report's conclusions use those records directly.
