# Document review - task-description.md - TASK_2026_2310_rvlns

## Review state

| Field | Value |
| --- | --- |
| Artifact | `task-description.md` (read-only to the reviewer) |
| Author | project-manager subagent (Claude) |
| Reviewer | software-architect subagent acting as document-review (Claude) |
| Execution sides | Author: Claude subagent. Reviewer: Claude subagent. **Same family**: no CLI lanes in this session (decisions.md D3). This is weaker evidence than a cross-vendor review. |
| Reviewed revision | round 2 (task-description.md "Revision 2"). Round 1: "Revision 1" + decisions.md D5-D7. Round 0: initial draft |
| Completed revise rounds | 2 |
| Source baseline | worktree `review-lane-pool` at `a4e0154ae` |
| Verdict | **APPROVED** (round 2) |

## Requirement-to-section trace

| Source requirement | Source | Artifact section | Status |
| --- | --- | --- | --- |
| Ordered review lane pool, lane + optional model per entry | context.md "User decisions" | Scope; Req 1 (1.1-1.5); Req 2.3, 2.5, 2.6 | Traced |
| Family diversity across lenses | context.md; #1481 consequence 1 | Req 2.2, 2.3, 2.4, 2.7; 3.2 | Traced |
| Optional pins: triage, a specific lens, verifier | context.md | Scope; Req 1.2; Req 3.1, 3.2, 3.5 | Traced |
| Verifier default avoids the lens author family | context.md; #1481 consequence 2 | Req 3.3, 3.4 | Traced, but timing conflicts with the Open-questions default (finding 2) |
| Empty settings keep today's behaviour | context.md | Req 2.1 (plus 2.2 changes lens spread) | Traced with an unrecorded interpretation (finding 4) |
| #1457 in a separate PR | context.md, decisions.md D2 | Out of scope | Traced |
| This PR fixes #1481 | context.md, `gh issue view 1481` | Classification; Scope; Req 2.2, 3.3; Risks row 5 | Traced |
| #1481 suggested fix: tests that drive several lenses through the runner, verifier avoids author | `gh issue view 1481` "Suggested fix" | Scope bullet "Tests for the #1481 cases"; Risks row 5 | Traced (scope item, not an AC; acceptable) |
| No static model lists, live catalogs only | project rule / MEMORY.md | NFR "Model data"; Req 4.2; Req 5.2 | Traced |
| Electron first, renderer in `apps/ptah-extension-webview` | CLAUDE.md | NFR "Compatibility"; Out of scope (VS Code host) | Traced |
| Settings backward compatible | project rule | Req 1.1, 1.5; NFR; Risks row 1 | Traced for old-data-in-new-build; downgrade not settled (finding 1) |
| Provider CLI lanes, `platform-cli`, `cli-engine` keep working | CLAUDE.md | NFR "Compatibility" | Traced |

Missing items: none of the user decisions is missing. Open issues are in the findings.

Parity deltas: no capability is removed. `fallbackFamilies` stays as is (Out of scope), and the global
`disabledClis` stays authoritative. Today's per-call selection is replaced, which is the intended fix.

## Feasibility citations (verified in source)

| Claim in artifact | Verified at | Result |
| --- | --- | --- |
| One kind per `select()` call; fresh `usedFamilies` | `libs/backend/review-core/src/lib/lanes/review-lane.runner.ts:98`; `review-lane-selector.ts:26-31` | Confirmed |
| `lensAuthorFamily` never set by stages | `triage-stage.runner.ts:14-16`, `lens-stage.runner.ts:48-50`, `verification-stage.runner.ts:99-102` (no `lensAuthorFamily` passed) | Confirmed |
| Gateway order from `preferredAgentOrder`, `disabledClis` filtered | `apps/ptah-electron/src/services/review/review-lane-gateway.ts:41-65` | Confirmed |
| `spawn()` carries no model | `review-lane-gateway.ts:9-12` (strict `spawnInputSchema` has no `model`), `:79`, `:111-113` | Confirmed. Adding `model` means widening the strict schema and `IReviewLaneGateway` |
| Manager resolves request > setting > CLI default | `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:323-331`; `agent-spawn-environment.service.ts:241-261` | Confirmed. A request model wins, so model-per-spawn is feasible for system CLIs and `ptah-cli` (`resolveLaneModel` does not depend on CLI) |
| Blocked models refused at spawn | `agent-process-manager.service.ts:1265-1290` (`LaneModelBlockedError`) | Confirmed. `findBlockedLaneModel` (`lane-spawn-policy.ts:297`) is **not** exported from the `cli-agent-runtime` index. The Req 4.1 pre-spawn "blocked model = unavailable" check needs a new export. That is architect work, not a requirement defect |
| Live catalogs exist | `libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.ts:19-33`; `lane-model-listing.adapter.ts:92-127` (handles `ptah-cli` rows at `:123`) | Confirmed. The adapter is registered in `register-shared-rpc-handlers.ts:34,117`, so the Electron container can resolve it |
| Spawn re-checks `at-limit` | `review-lane-gateway.ts:82-85` throws `Review lane is at its limit` | Confirmed. Relevant to finding 2 |
| Verifier is one batch over deduplicated candidates | `verification-stage.runner.ts:73-79`, `:99-102`, `:115` | Confirmed. The `same-family-weaker` mark is computed per candidate from `batch.family === authorFamily`, so Req 3.5 holds without new marking logic |
| Triage hard-coded `coordinator` | `publication-stage.runner.ts:66` | Confirmed. The triage `family` is in `ReviewLaneResult` (`review-lane.runner.ts:42,145`), but the publication stage gets only `triageCompleted`, so the family has to be passed through |
| `OperatorSettingsSchema` `.strict()`; store parses on read | `libs/backend/review-contracts/src/lib/review-config.schema.ts:83-111`; `review-settings.store.ts:63-76` (strips only `liveGate`) | Confirmed. See finding 1 |
| Drawer parses full settings before save | `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts:428-471` | Confirmed. Req 1.5 is testable at this seam |
| Stage record has `family` only, strict | `libs/backend/review-contracts/src/lib/review-run.schema.ts:52-62`; family read from the query at `review-query.repository.ts:26,57` | Confirmed. Lane/model/fallback note needs new nullable fields plus a persistence source |

## Proposed-constraint and scope-addition decisions

| # | Author addition | Decision | Reasoning |
| --- | --- | --- | --- |
| C1 | Triage's real family in the publication summary (Scope; Req 3.6) | **Accept** | The #1481 evidence names it ("Triage is labelled `coordinator`"). Once triage can be pinned, a hard-coded label would show the wrong value for a pinned role. Small change at `publication-stage.runner.ts:66` |
| C2 | Lane + model on every stage record and card via new stage-record fields (Req 2.5, 4.7) | **Accept**, with finding 5 | Req 2.5 (record the model) and the stakeholder test "pins honoured" cannot be checked without it. New fields must be nullable for runs recorded before the change |
| C3 | Explicit recorded fallback for an unavailable pin or pool entry (Req 4.1-4.4) | **Accept the behaviour, correct the attribution** (finding 3) | A defined fallback is needed: without one, a stale `ptah-cli:<id>` pin would fail the role. The user did not ask for it, though |
| C4 | No retry on another lane after a started lane fails (Req 4.6) | **Accept** | Matches today. Evidence cited: the 480 s per-lane limit at `review-lane.runner.ts:89` |
| C5 | Global `disabledClis` beats the pool (Out of scope; Decisions) | **Accept** | Consistent with TASK_2026_896 D2 and its review finding 2 (context.md) |
| C6 | `fallbackFamilies` left untouched | **Accept** | Required field in the strict schema (`review-config.schema.ts:109`). Removing it is a separate compatibility change |
| C7 | Pool maximum 12 (Open questions) | **Accept as architect default** | Has precedent in `review-config.schema.ts:109` |
| C8 | "Per-attempt selection computed once before triage and reused by later stages" (Open questions) | **Reject as stated** | Conflicts with Req 3.3/3.4 and 4.3 (finding 2) |
| C9 | Unreadable catalog does not block a saved model (Req 4.2) | **Accept** | Required by the no-static-list rule. The manager still refuses blocked models at spawn |

## Findings

1. **Major - downgrade outcome of the strict schema is not a requirement.**
   `OperatorSettingsSchema` is `.strict()` (`review-config.schema.ts:111`). The store strips only `liveGate`
   before parsing (`review-settings.store.ts:73-75`), and the runner parses settings again for every lane
   (`review-lane.runner.ts:100`). An older build that reads a row with the new pool/pin keys therefore throws in
   `getSettings`. The drawer fails to load and every review lane run errors. If the older build had saved once,
   it would also drop the keys. The artifact marks this HIGH impact (Risks row 1) but only says the architect will
   "state" it and the PR will "document" it. There is no acceptance criterion.
   Impact: a capability-wide outage after a downgrade, with no in-app recovery, under a "settings must stay
   backward compatible" rule.
   Correction: add a Req 1 criterion that fixes the downgrade outcome. Options:
   (a) **Recommended:** pool/pins persist outside the strict `settings_json` object (a separate row or table, still
   served through `review:getSettings`/`review:updateSettings`), so an older build keeps reading its settings.
   (b) Accept the limit explicitly, state the recovery step, and record that acceptance as a user gate item.
   This is a public-compatibility choice, so the orchestrator should raise it at the gate if the author picks (b).

2. **Major - selection timing contradicts the verifier rule and the fallback rule.**
   The Open-questions default (C8) computes the selection once before triage and reuses it. That cannot meet these
   requirements:
   - Req 3.3/3.4: the verifier family depends on which families actually authored candidates. That is only known
     after the lens stage. Candidates come from completed lenses (`verification-stage.runner.ts:73-77`) and are
     merged across lenses (`:78-79`).
   - Req 2.7: a reused checkpoint's family is only known at the lens stage (`lens-stage.runner.ts:37-41`).
   - Req 4.3/4.4: limit state can change between triage and the verifier. The gateway re-checks `at-limit` at
     spawn and throws (`review-lane-gateway.ts:84-85`). Under Req 4.6 that ends the role `partial` instead of the
     required fallback.
   Correction: say that each role's lane is resolved when that role starts, from a fresh `list()` and the families
   already used in the attempt (lens pins, completed and reused lenses). The verifier is resolved after the lens
   stage from the actual candidate author families. Drop or rewrite the Open-questions default.

3. **Minor - fallback is attributed to the user without evidence.**
   Decisions row 3 says "User asked for explicit, visible fallback". Neither context.md nor decisions.md records
   that. The user decisions cover pool, diversity, pins, verifier default, empty-settings parity and the PR split.
   Impact: at Gate 1.7 the user may assume they already approved this behaviour.
   Correction: label it as an author decision derived from the pin requirement (and Risks row 4), so the gate sees
   it as a proposal.

4. **Minor - the "empty settings keep today's behaviour" interpretation is not recorded.**
   Req 2.1 keeps today's candidate set and order. Req 2.2 changes which lanes run the lenses when settings are
   empty, because the #1481 fix applies by default. That is defensible: today's intended behaviour is diversity
   (`review-lane-selector.ts:17,26-31`), and the user asked this PR to fix #1481. Still, it reads against the
   literal user wording.
   Correction: add a Decisions row stating that empty settings mean "no new configuration effect", not "lenses
   stay on one family". Cite #1481 and the selector's intent.

5. **Minor - Req 4.7 is untestable for runs recorded before the change.**
   "Every stage card shall show the lane and model that ran it" cannot hold for existing rows. `StageRecordSchema`
   has only `family` (`review-run.schema.ts:52-62`), and no lane id or model is persisted today
   (`review-repository.interface.ts:5-16`).
   Correction: limit the criterion to runs recorded after the change. State that older runs show family only and
   render without error, with null lane/model accepted.

6. **Minor - Req 3.4 "fewest candidates" is ambiguous.**
   It does not say whether the count is before or after `uniqueLensCandidates` merging
   (`verification-stage.runner.ts:78`), and it has no tie-break. The `same-family-weaker` mark is per candidate,
   from the merged candidate's `authorFamily` (`:115`).
   Correction: count the merged candidates the verifier receives, and break ties by pool order (or by global order
   with no pool).

## Unresolved items

- Finding 1, option (b) only: if chosen, the downgrade limit is a public-compatibility acceptance for the user gate.
- No other open decisions. Findings 2-6 are corrections the author can make without user input.

## Verdict

**REVISE.** Every user decision is traced, and the model-per-spawn path is feasible against the source. Two Major
findings block approval: the downgrade outcome has no acceptance criterion (1), and the selection-timing default
contradicts Req 3.3/3.4 and 4.3 (2). Findings 3-6 are small corrections. Next round: recheck the changed
revision as round 1 in this same record.

---

## Round 1 recheck

Scope: only the sections changed for findings 1-6 (Revision 1 changelog, decisions.md D5-D7). Same reviewer,
same side (Claude subagent, weaker evidence). The artifact and the code were not edited.

| Round-0 finding | Changed section | Status |
| --- | --- | --- |
| 1 Downgrade | Scope bullet (lines 56-58), Req 1.6 (107-110), NFR, Risks row 1, D5 | **Partly resolved**: option (a) chosen, but the new criterion conflicts with the migration guard. See finding 7 |
| 2 Selection timing | Scope (59-62), Req 2 intro, Req 2.8 (138-142), Req 3.3 (154-156), Open questions, Decisions row, D7 | **Resolved** |
| 3 Fallback attribution | Decisions row 3 (259) | **Resolved** |
| 4 Empty-settings interpretation | Scope (63-66), Req 2.1/2.2, Decisions row, D6 | **Resolved** |
| 5 Older runs | Req 4.7 (190-192), new 4.8 (193-195) | **Resolved** |
| 6 Fewest-candidates count | Req 3.4 (157-162), Decisions row 2 | **Resolved**. Count after `uniqueLensCandidates`, tie-break by pool order then global order |

Proposed-constraint decisions this round: C8 is withdrawn by the author and replaced by D7 (accepted). D5
storage outside `settings_json` is accepted as the direction, with finding 7 below. D6 is accepted. It is a
recorded interpretation for the gate to see, not a user decision.

### New finding (round 1)

7. **Major - Req 1.6 cannot hold if the new storage needs a migration.**
   - Req 1.6 (lines 107-110) says that when an older build reads a database where this build saved pool and pins,
     the older build loads settings and runs reviews.
   - `review_operator_settings` allows only one row (`id INTEGER PRIMARY KEY CHECK (id = 1)`,
     `libs/backend/persistence-sqlite/src/lib/migrations/0065_ptah_review.ts:21-25`). So "a separate row" is not
     possible there, and "a separate table" needs a new migration after `0076`.
   - The migration runner refuses to open a database whose recorded version is newer than the build's bundled
     maximum (`libs/backend/persistence-sqlite/src/lib/migration-runner.ts:85-91`, "Refusing to downgrade").
     With a new table, every pre-change build is refused before it reads any settings. Req 1.6 is then false,
     not just untested.
   - Impact: the implementer or the tester hits a criterion that the chosen design cannot meet.
   - Correction: reword Req 1.6 (and NFR Compatibility, Risks row 1) as a testable either/or:
     "A build from before this change either opens the database and loads operator settings without a parse
     error, ignoring pool and pins, or is refused by the existing forward-only migration guard
     (`migration-runner.ts:85-91`). It never fails on a settings parse error caused by pool or pin keys."
   - This keeps D5's intent: no new keys in the strict `settings_json`. It leaves the choice to the architect:
     storage with no migration, if an existing store fits, or a new table under the platform's existing downgrade
     guard. Correct the scope bullet "separate row or table" to match.
   - No user decision is needed. The forward-only guard is existing, platform-wide behaviour that applies to
     every migration.

### Unresolved items after round 1

- Finding 7 only. Findings 1-6 are closed. Finding 1 is closed once finding 7's rewording lands.

### Verdict (round 1)

**REVISE.** Five of the six round-0 findings are resolved as asked. The downgrade fix brought in a new conflict:
Req 1.6 promises that an older build opens the database, but a new table would trigger the migration runner's
forward-only refusal (`migration-runner.ts:85-91`). The correction is a rewording of one criterion, with the
matching NFR, risk and scope lines. The next recheck is round 2 in this same record.

---

## Round 2 recheck

Scope: only the sections reworded for finding 7. Those are Req 1.6 (task-description.md lines 110-114), the
scope bullet (56-60), NFR Compatibility (224) and Risks row 1 (245). Same reviewer, same side (Claude subagent,
weaker evidence). The artifact and the code were not edited.

| Finding | Status |
| --- | --- |
| 7 Req 1.6 vs migration guard | **Resolved**. Req 1.6 now allows exactly two outcomes for an older build: it loads review settings without a parse error, or the forward-only guard refuses it (`migration-runner.ts:85-91`). It never fails on a parse error caused by pool or pin keys. It is testable with either storage choice, and the architect must state which storage was chosen. NFR, Risks row 1 and the scope bullet match |
| 1 Downgrade | **Closed**. It depended on finding 7 |

Non-blocking note for the architect: the scope bullet still says "a separate row or table". A second row is not
possible in `review_operator_settings` (`CHECK (id = 1)`, `0065_ptah_review.ts:21-25`). Risks row 1 already
says so, and a row in another existing store is still a valid reading, so this needs no further revision.

### Unresolved items after round 2

- None. No user decision is needed from this review. D6 (empty-settings interpretation) and the fallback
  decision are proposals for the user at Gate 1.7, not review defects.

### Verdict (round 2)

**APPROVED.** Every user decision traces to an acceptance criterion. All seven findings are resolved. The handoff
is feasible against the source cited in the feasibility table and in rounds 1-2.
