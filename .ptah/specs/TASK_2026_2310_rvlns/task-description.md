# Requirements - TASK_2026_2310_rvlns

## Context

A PR review runs one triage lane, four lens lanes (`LensSchema`:
`correctness-lifecycle`, `contracts-callers`, `security-privacy`, `host-di-config`,
`libs/backend/review-contracts/src/lib/review-config.schema.ts:5`) and one batched verifier lane.
Each stage calls `ReviewLaneRunner.run()` once per role: triage
(`libs/backend/review-core/src/lib/stages/triage-stage.runner.ts:14`), each lens in sequence
(`lens-stage.runner.ts:34-51`), and one verifier batch over every lens candidate
(`verification-stage.runner.ts:99`). The runner asks `ReviewLaneSelector.select([request.kind], ...)`
for one kind per call (`review-lane.runner.ts:98`). The selector builds `usedFamilies` fresh on every
call (`review-lane-selector.ts:26`), so it always returns the first non-`at-limit` lane in the
`agentOrchestration.preferredAgentOrder` order that `ReviewLaneGateway.buildLanes()` applies
(`apps/ptah-electron/src/services/review/review-lane-gateway.ts:41-65`). No caller sets
`lensAuthorFamily`, so the verifier never avoids the lens author's family. Issue #1481 records 11 of
12 recent attempts running all four lenses on `codex`. The publication summary also labels triage
`family: 'coordinator'` whatever lane ran it (`publication-stage.runner.ts:66`).

TASK_2026_896_1ec9 (D2, D3) made review lanes follow the global `preferredAgentOrder` and
`disabledClis` and declined a review-specific setting. The user now wants that setting, in the shape
"pool + per-role pins": an ordered review lane pool (lane + optional model per entry), family
diversity across lens lanes, and optional pins for triage, any single lens, or the verifier. The
verifier by default avoids the lens author's family. Empty settings keep today's behaviour.

Review settings are `OperatorSettingsSchema` (`review-config.schema.ts:83`, `.strict()`), stored as
one JSON row by `ReviewSettingsStore` (`libs/backend/review-core/src/lib/persistence/review-settings.store.ts:63-89`),
read and written through `review:getSettings` / `review:updateSettings`
(`libs/backend/review-contracts/src/lib/review-rpc.schema.ts:86-89`), and edited in
`libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.{ts,html}`.
`gateway.spawn()` takes no model today (`review-lane-gateway.ts:79,111-113`), while
`AgentProcessManager.spawn` accepts `request.model` and resolves it request > per-CLI setting >
CLI default (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:323-331`,
`agent-spawn-environment.service.ts:241-261`), and refuses blocked models
(`agent-process-manager.service.ts:1277-1290`). Live per-lane model catalogs already exist:
`agent:listCliModels` (`libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.ts:31`)
and `LaneModelListing` for system and Ptah CLI rows
(`libs/backend/rpc-handlers/src/lib/services/lane-model-listing.adapter.ts`). The run detail shows
only a stage `family` (`review-run.schema.ts:56`, `review-run-detail.component.ts:62`).

## Classification

- Type: FEATURE — a new operator setting, a settings UI section, and a selection redesign; it also
  closes bug #1481 because the new selection replaces the per-call selector (decisions.md D4).
- Estimate: L — spans review-contracts (schema), review-core (selection, runner, stages, run
  record), the Electron gateway (model on spawn, catalog read), and the review-runs-ui drawer and
  run detail, with backward-compatible persistence.
- Priority: not defined here.

## Scope

In scope:

- An optional review lane pool in operator settings: ordered entries of lane id + optional model.
- Optional pins: triage, each of the four lenses individually, verifier; each pin is lane + optional model.
- Pool and pins persisted outside the strict `settings_json` object (a separate row or table), still
  read and written through `review:getSettings` / `review:updateSettings`, so an older build either
  opens the database and loads review settings without a parse error, or is refused by the existing
  forward-only migration guard, and never fails on a settings parse error caused by pool or pin
  keys (decisions.md D5). The architect shall prefer storage that needs no new migration when one
  exists, and shall state the choice.
- Per-role lane choice at role start, from a fresh lane list and the families already used in the
  attempt, that spreads lens lanes across CLI families (fixes #1481 item 1; decisions.md D7).
- Verifier default, chosen after the lens stage, that avoids the families that authored the
  candidates it checks (fixes #1481 item 2).
- Empty-settings parity interpreted as "no new configuration effect": with empty pool and pins,
  the lane set and order are today's (global `preferredAgentOrder`, `disabledClis` removed), while
  the #1481 diversity and verifier fixes still apply. It does not mean "lenses stay on one family"
  (decisions.md D6).
- Passing the chosen model to the lane spawn.
- Explicit, recorded fallback when a pin or pool entry cannot be used, visible in the run detail.
- A "Review lanes" section in the Reviews settings drawer to edit pool and pins, listing only lanes
  the review gateway can run and models from the live catalog.
- Triage's real family in the publication summary instead of the hard-coded `coordinator`.
- Tests for the #1481 cases through the runner/stage path, not only `select()` with several kinds.

Out of scope:

- Re-enabling a lane listed in `agentOrchestration.disabledClis` from review settings — the global
  disable stays authoritative (TASK_2026_896 review finding 2 treated re-enabling as a defect).
- The large-diff issue #1457 — ships as TASK_2026_2309_bigdf.
- Wiring or removing the unused `fallbackFamilies` field — removal breaks the strict schema for
  saved settings; it stays as is. A future task can retire it.
- Per-repository lane settings — pool and pins are operator-wide, like the other operator settings.
- Effort/reasoning level per entry — not requested; lanes keep their existing effort resolution.
- Running lenses in parallel or changing lens prompts, `laneCapPerPr`, or admission.
- Honouring `RepoReviewConfigV1.lenses` toggles in the lens stage — not requested.
- The VS Code host — the review pipeline exists only in Electron (`apps/ptah-electron/src/services/review/`).

## Requirements

### 1. Settings contract and persistence

Requirement: operator settings carry an optional review lane pool and optional per-role pins,
validated at the RPC and store boundary, and readable from settings saved before this change.

Acceptance criteria:

1. When saved settings lack the new fields, `review:getSettings` shall return them with an empty
   pool and no pins, and the next `review:updateSettings` shall succeed without operator edits.
2. When `review:updateSettings` receives a pool entry or pin with an empty or over-long lane id or
   model, a duplicate pool entry (same lane and model), a pin role that is not `triage`, one of the
   four `LensSchema` values, or `verifier`, or an unknown key, the system shall reject the call with
   a validation error and leave the stored settings unchanged.
3. When the pool has more entries than the schema's stated maximum, the system shall reject the save.
4. When valid settings with pool and pins are saved and read back, the round trip shall return the
   same entries in the same order.
5. When the drawer saves an unrelated change (for example a repository toggle), the pool and pins
   shall be preserved unchanged.
6. When a build from before this change opens a database in which this build has saved a pool and
   pins, the older build shall either open the database and load review settings without a parse
   error, or be refused by the existing forward-only migration guard (`migration-runner.ts:85-91`);
   it shall never fail on a settings parse error caused by pool or pin keys. The architect shall
   prefer storage that needs no new migration when one exists, and shall state which was chosen.

### 2. Selection: pool, family diversity, empty-settings parity

Requirement: the review pipeline chooses each role's lane when that role starts, from the pool (or,
with no pool, from the global order), and spreads lenses across CLI families within an attempt.

Acceptance criteria:

1. When pool and pins are empty ("no new configuration effect", decisions.md D6), the candidate set
   and order shall equal today's
   `ReviewLaneGateway.list()` result (global `preferredAgentOrder`, `disabledClis` removed,
   `at-limit` skipped), and the spawn shall carry no model, so the lane's existing model setting or
   CLI default applies.
2. When pool and pins are empty and at least two families are available, the four lens lanes in one
   attempt shall use at least two distinct families (the #1481 fix applies with empty settings too;
   empty settings do not mean "lenses stay on one family").
3. When the pool lists lanes from N available families, the four lenses shall use
   min(N, 4) distinct families, choosing pool entries in pool order within that constraint.
4. When the pool lists lanes of a single family, all lenses shall run on that family and the run
   shall complete as today.
5. When a pool entry names a model, the lane shall be spawned with that model, and the model the
   lane used shall be recorded on the stage.
6. When a pool is set, lanes not in the pool shall not be used for unpinned roles, except as the
   recorded fallback in requirement 4 criterion 3.
7. When a lens checkpoint from an earlier run of the same attempt is reused
   (`lens-stage.runner.ts:37-41`), its recorded family shall count towards diversity for the
   remaining lenses.
8. When a role (triage, each lens, the verifier) starts, its lane shall be chosen from a lane list
   read at that moment and from the families already used in the attempt (pinned, completed and
   reused lenses); a lane that became `at-limit` or unavailable after an earlier role started shall
   not be chosen, and the role shall follow requirement 4 instead of ending `partial` on a spawn
   refusal for a lane that was already known to be `at-limit`.

### 3. Pins and verifier family

Requirement: an operator can force a lane (and optional model) for triage, a single lens, or the
verifier; without a verifier pin, the verifier avoids the lens author families.

Acceptance criteria:

1. When triage, a lens, or the verifier has an available pin, that role shall run on the pinned lane
   and model, whatever the pool order or diversity would choose.
2. When a lens is pinned, its family shall count towards diversity for the unpinned lenses.
3. When the verifier is not pinned, its lane shall be chosen after the lens stage ends, from the
   author families of the candidates it actually receives; when a lane of a family that authored
   none of those candidates is available, the verifier shall run on such a lane.
4. When every available family authored at least one candidate, the verifier shall run on the
   family that authored the fewest candidates, counted over the merged candidates the verifier
   receives (after `uniqueLensCandidates`, `verification-stage.runner.ts:78`), one count per merged
   candidate's `authorFamily`. Ties shall be broken by pool order, then by the global
   `preferredAgentOrder` (with no pool, by the global order alone). The candidates of the chosen
   family shall keep the existing `same-family-weaker` marking (`verification-stage.runner.ts:115`).
5. When the verifier is pinned to a lens author's family, the pin shall be honoured and the affected
   findings marked `same-family-weaker`.
6. When triage completes, the publication summary shall report the family that ran triage, not
   `coordinator`.

### 4. Unavailable lanes and models: explicit fallback

Requirement: a pin or pool entry that cannot be used never silently changes the review; the run
detail shows what was asked, what ran, and why.

Acceptance criteria:

1. A pin or pool entry shall count as unavailable when its lane is absent from the review lane list
   (uninstalled, in `disabledClis`, Ptah CLI agent disabled, deleted or without a key), its lane is
   `at-limit`, its model is on the lane block list, or the lane's live model catalog was read and
   does not offer the model.
2. When the live model catalog cannot be read, the saved model shall be treated as available and
   passed to the spawn; no static model list shall be consulted.
3. When a pinned lane is unavailable, the role shall run on the lane the pool (or global order)
   would choose, and the stage record shall state the pinned lane/model, the lane/model used, and
   the reason (for example "pinned lane disabled", "at limit", "model not offered").
4. When a pool entry is unavailable, selection shall skip it and the stage record of the role that
   would have used it shall name the skipped entry and the reason.
5. When no lane is available for a role, the role shall end `partial` with reason
   `no-confirmed-room` as today.
6. When a lane starts and then fails (exit, timeout, invalid output), the role shall end `partial`
   as today, with no retry on another lane.
7. When a run recorded after this change used a fallback, the run detail in the Reviews page shall
   show the fallback note on that stage or lens card, and every stage card of such a run shall show
   the lane and model that ran it.
8. When the run detail shows a run recorded before this change, the stage records shall accept null
   lane, model and fallback fields, and each stage card shall show the family only and render
   without error.

### 5. Reviews settings UI (Electron renderer)

Requirement: an operator edits the pool and pins in the Reviews settings drawer.

Acceptance criteria:

1. When the drawer opens, a "Review lanes" section shall list the lanes the review gateway can run
   (same set as requirement 2 criterion 1) with their family and limit state, and the current pool
   and pins.
2. When the operator chooses a model for an entry or pin, the choices shall come from that lane's
   live catalog, with a "lane default" choice that saves no model; when the catalog is empty or
   unreadable, the control shall say so and still allow "lane default".
3. When the operator adds, removes or reorders pool entries, or sets or clears a pin, and saves, the
   saved settings shall reflect exactly that change.
4. When a saved pin or entry refers to a lane or model that is no longer listed, the drawer shall
   show it marked unavailable rather than dropping it, and the operator can remove it.
5. When pool and pins are empty, the section shall say that reviews follow the global agent order.
6. The section shall be operable by keyboard alone and every control shall have an accessible name.

## Non-functional requirements

- Compatibility: settings saved before this change load and save unchanged (req. 1.1), and an older
  build either loads review settings without a parse error or is refused by the forward-only
  migration guard, never failing on a parse error caused by pool or pin keys (req. 1.6). Electron
  first: verify and visually review in `apps/ptah-electron`; UI lives in
  `libs/frontend/review-runs-ui`, rendered by `apps/ptah-extension-webview`. Provider CLI lanes and
  the benchmark's `platform-cli` / `cli-engine` libraries keep working.
- Model data: models come only from live catalogs (`agent:listCliModels` / `LaneModelListing`); no
  hard-coded model list or fallback list may be added (repository memory rule "No static model lists").
- Security: lane ids and models are validated at the RPC boundary; a model id reaches the CLI only as
  the `model` field of the existing spawn request, never concatenated into a command line.

## Stakeholders

| Stakeholder | What they need from this change | How they will judge it |
| --- | --- | --- |
| Operator (repo maintainer) | Control which lanes/models review PRs; reviews not all on one family | Run detail shows varied families, pins honoured, fallbacks explained |
| PR authors | Cross-family verification that is real | Fewer `same-family-weaker` badges when several families exist |
| Users with no review settings | Nothing breaks | Reviews run as before, now spread across families |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| `OperatorSettingsSchema` is `.strict()`; an older app build reading settings with the new keys fails `getSettings` parse | MEDIUM | HIGH | Pool and pins stored outside `settings_json` (D5, req. 1.6); an older build either loads settings without a parse error or is refused by the forward-only migration guard (`migration-runner.ts:85-91`); architect prefers storage needing no new migration when one exists (settings table is single-row, `0065_ptah_review.ts:21-25`) and states the choice; tester adds a load test for pre-change JSON and a test that the `settings_json` row written by this build still parses under the pre-change schema |
| Reading live model catalogs per review attempt adds latency or network calls | MEDIUM | MEDIUM | Architect bounds the catalog read (once per attempt, signal/timeout) and requirement 4.2 makes failure non-blocking |
| Diversity moves lenses onto `unknown`-limit lanes that then fail, lowering completion vs today's codex-only runs | MEDIUM | MEDIUM | Keep `limitCheck: 'unavailable'` recording; tester covers an attempt mixing confirmed-room and unknown lanes; operator can pin |
| Lane ids for Ptah CLI agents (`ptah-cli:<id>`) go stale when an agent is deleted | HIGH | LOW | Requirement 4.1 / 5.4 treat it as unavailable and visible, never dropped silently |
| Existing selector spec passes while production path fails (#1481) | HIGH | HIGH | Tests drive `LensStageRunner`/`VerificationStageRunner` with a fake gateway and assert families |

## Open questions

- None blocking. Recommended default the architect may confirm: pool maximum of 12 entries
  (matches the existing `fallbackFamilies` bound, `review-config.schema.ts:110`). Lane choice is
  per role at role start (requirement 2 criterion 8, decisions.md D7), not computed once before
  triage.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Global `disabledClis` overrides the review pool | pool re-enables / global wins | TASK_2026_896 D2, D8 finding 2 | yes |
| Verifier batch avoids every candidate-author family, else the least-used one (count per merged candidate, tie-break pool order then global order) | single author family / all families / least-used | Verifier is one batch over all lens candidates (`verification-stage.runner.ts:73-102`) | yes |
| Unavailable pin falls back with a visible note; a started lane that fails is not retried | fail the role / fallback / retry after failure | Author's decision (a proposal for the gate, not a user request), derived from the pin requirement: without a defined fallback a stale `ptah-cli:<id>` pin would fail the role (Risks row 4); retry would double run time against the 480 s lane limit (`review-lane.runner.ts:89`) | yes |
| Empty settings mean "no new configuration effect", not "lenses stay on one family" | literal one-family parity / today's set and order with #1481 fix | User asked this PR to fix #1481; the selector's intent is diversity (`review-lane-selector.ts:17,26-31`); decisions.md D6 | yes |
| Pool and pins stored outside the strict `settings_json` object, same RPCs | separate storage / accept downgrade break | `review-config.schema.ts:111` `.strict()`; review finding 1; decisions.md D5 | yes |
| Lane chosen per role at role start; verifier after the lens stage | once before triage / per role | `verification-stage.runner.ts:73-79`, `lens-stage.runner.ts:37-41`, `review-lane-gateway.ts:84-85`; decisions.md D7 | yes |
| Unreadable catalog does not block a saved model | block / allow | Memory rule: no static lists, so nothing else to validate against | yes |
| `fallbackFamilies` left untouched | wire / remove / leave | Strict schema; removal breaks saved settings | yes |

## Handoff

- Next specialist: software-architect (after the design step for the drawer section).
- Why: the shape of per-role selection across three stage runners, the storage for pool and pins
  outside `settings_json`, the stage-record fields for lane/model/fallback, and the catalog read path
  cross review-contracts, review-core, the Electron gateway and the UI.

## Revision 1

Response to `task-description-review.md` (REVISE, round 0) and decisions.md D5-D7.

- F1 (D5): Scope adds storage of pool and pins outside the strict `settings_json` object, served by
  the same RPCs. New requirement 1 criterion 6: an older build reading the database still loads
  settings and runs reviews, ignoring the new data. NFR Compatibility and Risks row 1 now point to it.
- F2 (D7): Removed "selection computed once before triage" from Open questions. Scope and
  requirement 2 now say lane choice happens per role at role start. New requirement 2 criterion 8:
  fresh lane list plus the families already used in the attempt. Requirement 3 criterion 3: the
  verifier is chosen after the lens stage from the actual candidate author families. Added a
  Decisions row. The Handoff wording now says per-role selection.
- F3: The fallback Decisions row is now labelled as the author's decision (a proposal for the gate),
  derived from the pin requirement and Risks row 4, not a user request.
- F4 (D6): Scope states the "no new configuration effect" reading of empty-settings parity.
  Requirement 2 criteria 1 and 2 state it, and a Decisions row records it.
- F5: Requirement 4 criterion 7 now applies only to runs recorded after the change. New criterion 8:
  older runs accept null lane/model/fallback fields and show family only, without error.
- F6: Requirement 3 criterion 4 counts "fewest candidates" over the merged candidates the verifier
  receives, one per merged candidate's author family. Ties go by pool order, then global
  `preferredAgentOrder`. The verifier Decisions row now mentions this.

## Revision 2

- F7: Requirement 1 criterion 6, the scope bullet, NFR Compatibility and Risks row 1 now allow two
  outcomes for an older build: it loads review settings without a parse error, or the existing
  forward-only migration guard refuses it. It never fails on a parse error caused by pool or pin
  keys. The architect prefers storage that needs no new migration when one exists, and states the
  choice.
