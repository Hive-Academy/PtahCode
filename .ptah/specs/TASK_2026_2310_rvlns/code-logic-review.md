# Code Logic Review — `TASK_2026_2310_rvlns`

Review family: same (Claude), weaker evidence; reason: no CLI lanes in this session.
Scope: `git diff main...HEAD` (B1-B8), read in full for review-core lanes, stages, persistence, orchestrator; Electron gateway and DI; rpc-handlers; review-contracts lanes schema; review-runs-ui store, drawer, lanes section, pool, options, run detail. Requirements: task-description.md, design-spec rev 3, implementation-plan rev 1, decisions.md D1-D18, issue #1481. No builds or gates were run (a gate is running). Verification evidence read: the batch reports and the spec titles for the real-runner tests; I did not re-run them.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 8/10           |
| Assessment          | APPROVED       |
| Blocking issues     | 0              |
| Serious issues      | 0              |
| Moderate issues     | 6              |
| Failure modes found | 8              |

Score rationale: the production path for #1481 is wired end to end and tested through the real runner. The 8 (not 9) is because several degraded paths (corrupt lane document, settings-unavailable checkpointing, blocked lane default model) end in a quiet "no pins applied" or a non-retried partial, and the partial-save path leaves store signals stale. Nothing found loses data or misleads a user on a likely path.

## Five logic questions

### 1. How does this fail silently?

- Corrupt `review.lanes.v1` document: `ReviewLaneSettingsStore.get()` returns empty lanes and only logs a warning (`libs/backend/review-core/src/lib/persistence/review-lane-settings.store.ts:38-44`). Every review then runs with no pins or pool, with no run-detail record that the operator's pins were dropped. The drawer shows empty lanes, and D18 omits unchanged lanes (`review-runs.store.ts:~508`), so the corrupt document is never repaired unless the operator edits lanes. Moderate (M1).
- Blocked or absent lane default model: with `model: null` nothing is sent and the lane's own configured model applies. `AgentProcessManager` refuses a blocked resolved model at spawn (`agent-process-manager.service.ts:1282,1370`). Selection checks `blocked()` only for entries that name a model (`review-lane-selection.ts:~63`), so a lane whose default model is blocked is chosen, fails at spawn and ends `lane-failed` with no retry (Req 4.6 allows this, but it is a silent loss of a lens when another lane was available). Moderate (M3).
- Triage or verification ended `partial` with `lane-settings-unavailable` is checkpointed by `stage()` as `completed` (`review-orchestrator.service.ts:336-340`), so a resumed attempt never re-selects it. The same holds for `no-confirmed-room` today. Lens rows end `interrupted` and do re-run. Moderate (M2).

### 2. What user action produces unexpected behaviour?

- Escape or the Close button closes the drawer and the next open calls `loadSettings()` (`review-runs-page.component.ts:286-289`), which replaces `draftSettings` and `draftLanes`. Pool and pin edits are lost with no prompt. This is the old drawer's behaviour for the other settings (parity row "Close via Escape"), but a lane pool is more work to redo. Minor (m2).
- Save when the lane write fails: operator settings are already committed (`review-rpc.handlers.ts:~491-503`) but the store catch path does not update `settings`, `draftSettings` or `repositories` (`review-runs.store.ts:~540-554`). The footer shows "Review lanes were not saved" and the list page keeps pre-save repository state until reload. A second Save completes it (idempotent). Moderate (M4).
- Double add of one lane gives `(lane, null)` twice; the save is blocked client-side with a clear message (`review-runs.store.ts:~497`) and the pool shows the duplicate line only after a save error (`review-lanes-section.component.ts` `showDuplicates`). Works as designed.
- Escape inside the confirm dialog or an open rich select is stopped before it reaches the drawer (`review-confirm-dialog.component.ts` onKeydown; `rich-select.component.ts:248-250`). OK.

### 3. What input data produces a wrong answer?

- A lane id outside `ReviewLaneIdSchema` (`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`) or a label/family over the bounds would make `LaneListSchema.parse` throw for every role (`review-lane-attempt.ts:~108`), failing the whole review at the lens stage instead of dropping the lane. Real ids (`codex`, `ptah-cli:pc-<uuid>`) fit; the RPC path (`review-rpc.handlers.ts:~189-200`) drops a bad lane instead. The two paths treat a bad row differently. Moderate (M5).
- A model list holding only static-provenance entries is never `verifiable`, so a saved model is passed unchecked. That matches Req 4.2 and A5; it is the intended answer.
- Verifier tie-break: a family that ran a lens and authored zero merged candidates counts 0, same as a family that never ran. Matches Req 3.3 ("authored none of those candidates").
- Family strings come from `laneFamilyOf` for the lens author (`result.family`) and for the listing, so the counts and the listing agree.

### 4. What happens when a dependency fails?

- Lane settings read throws: cached rejection per attempt, role ends `partial lane-settings-unavailable`, logged once per attempt (`review-lane.runner.ts:~110-118`, WeakSet). OK.
- Catalog read: bounded at 8 s, attempt abort and timeout both give `{}` and a warn log; the saved model is passed unchecked (`review-lane-attempt.ts:~140-165`). Timer and listener are cleaned in `finally`. The result is cached for the whole attempt (no retry), as designed. The Electron side rejects per lane on abort (`review-lane-gateway.ts` `untilAborted`) and maps to `failed` (not verifiable). OK.
- Lane list rejects: thrown out of `run()`; lens stage saves the row `failed` and rethrows; the review fails at stage `lanes`. Same class as before the change.
- Spawn refused for a lane that turned `at-limit` between list and spawn: `spawn()` re-checks (`review-lane-gateway.ts:~125-128`) and the role ends partial. The window is one lookup wide; per-role fresh list (D7) closes the "known at-limit" case of Req 2.8.
- `review:getSettings` now also awaits `laneSettings.get()`; a throwing storage read makes the whole settings read fail (`review-rpc.handlers.ts:~419`), so operator settings become unreachable. The drawer shows its error state with Retry. Minor (m1).
- `review:listLanes`: a list failure maps to the generic error (drawer shows Retry); a catalog failure maps to failed catalogs; a bad lane entry is dropped. OK.

### 5. What is missing that the requirements never mentioned?

- No record on the run that lane settings were ignored because the stored document was invalid (see M1).
- No unsaved-changes guard on close (m2).
- No check that a pin or pool lane that is not in the listing is surfaced to the operator at save time. It is shown in the drawer as "Unavailable" and recorded as a fallback at run time, which is what Req 4 asks for.
- `review:listLanes` calls `limits.lookup` for every lane on each drawer open, and each role calls `list()` again; the gateway lookup cost is repeated six or more times per review. Minor (m3).

## Failure modes

### Corrupt lane document is treated as "no pins"
- Trigger: `review.lanes.v1` fails `ReviewLaneSettingsDocumentSchema` (hand edit, future version, partial write).
- Symptom: reviews ignore the operator's pins and pool; the run detail shows no fallback; only a warn log with schema paths.
- Evidence: `review-lane-settings.store.ts:38-44`; D18 omission at `review-runs.store.ts:~508`.
- Current handling: empty settings, logged without values.
- Recommendation: either surface a one-line state in `review:getSettings` (for example `lanes` invalid) or record a run-level note; at minimum let the drawer repair it by always allowing a save of unchanged-but-invalid state.

### Settings-unavailable partial is checkpointed as completed
- Trigger: lane settings read throws during triage or verification.
- Symptom: stage row `completed` with a partial result; resume does not retry.
- Evidence: `review-orchestrator.service.ts:327,336-340`; `review-lane.runner.ts:~140-143`.
- Recommendation: acceptable and consistent with `no-confirmed-room`; note it in the run error text (it already carries the reason).

### Blocked lane default model
- Trigger: lane has no pin model, its configured default model is on the block list.
- Symptom: lane chosen, spawn refused, role partial `lane-failed`, no other lane tried.
- Evidence: `review-lane-selection.ts` availability (model check only when `entry.model !== null`); `agent-process-manager.service.ts:1282`.
- Recommendation: out of scope for this task (Req 4.6); consider asking the gateway to expose "default model blocked" in `list()`.

### Lane write fails after operator settings commit
- Trigger: `storage.update` rejects.
- Symptom: error "Review lanes were not saved"; operator settings changed on disk; store `settings` stale.
- Evidence: `review-rpc.handlers.ts:~494-503`; `review-runs.store.ts:~540-554`.
- Recommendation: on `lanesFailed`, still apply the saved settings result to `settings` and `repositories` if the host returned them; today the error path drops it.

### Strict lane list parse fails the review
- Trigger: the gateway returns a lane with an id, label or family outside the schema, or more than 100 lanes.
- Symptom: `ZodError` out of `choose()`; stage `lanes` fails.
- Evidence: `review-lane-attempt.ts` `LaneListSchema`; compare `review-rpc.handlers.ts:~189-200` which drops the entry.
- Recommendation: drop invalid rows in `choose()` as the RPC path does.

### Stale lane record after an aborted rerun
- Trigger: a lens ended `interrupted`, the attempt resumes, the rerun aborts before `saveStageLane`.
- Symptom: the run detail shows the earlier lane and fallback for that lens.
- Evidence: `sqlite-review.repository.ts` `saveStage` upsert leaves `family` alone; `lens-stage.runner.ts:~62-64` (`if (signal?.aborted) break;` before `saveStageLane`).
- Recommendation: minor; clear the lane row when the stage restarts.

### Lost lane edits on close or reload
- Trigger: Escape, Close or a settings reload while editing.
- Evidence: `review-runs-page.component.ts:286-289`; `review-settings-drawer.component.html:1-8` (`closeOnBackdrop=false`, Escape closes).
- Recommendation: unchanged from old behaviour for other fields; consider a dirty guard later.

### Repeated lane lookups
- Trigger: every role start and every `review:listLanes`.
- Evidence: `review-lane-attempt.ts:~107`; `review-rpc.handlers.ts:~177`.
- Recommendation: acceptable (Req 2.8 needs a fresh list); measure if lookups hit the network.

## Blocking issues

None found.

## Serious issues

None found.

## Moderate and minor issues

- M1 Corrupt `review.lanes.v1` silently equals empty settings: `review-lane-settings.store.ts:38-44`.
- M2 `lane-settings-unavailable` for triage and verification is checkpointed completed: `review-orchestrator.service.ts:336-340`.
- M3 Blocked lane default model is not seen by selection: `review-lane-selection.ts` (`entry.model !== null` guard).
- M4 Partial-save leaves `settings`, `draftSettings`, `repositories` stale: `review-runs.store.ts:~540-554`.
- M5 Strict `LaneListSchema` fails the whole review for one bad row: `review-lane-attempt.ts` (`LaneListSchema`).
- M6 Stale `checkpoint:lane` and `family` on an aborted rerun: `lens-stage.runner.ts:~62-64`.
- m1 `getSettings` fails whole when lane storage read throws: `review-rpc.handlers.ts:~419`.
- m2 No dirty guard on drawer close: `review-runs-page.component.ts:286-289`.
- m3 Repeated `limits.lookup` per role and per listing: `review-lane-attempt.ts:~107`.
- m4 `INVALID_PARAMS` lane message says "Review lanes were not saved" when nothing (operator settings included) was saved; harmless: `review-rpc.handlers.ts:~437`.

## Data flow

1. Orchestrator `process()` creates one `ReviewLaneAttempt` per attempt: `review-orchestrator.service.ts:247`. OK, no singleton state; selection service and runner hold none (the runner's WeakSet is keyed by attempt).
2. Triage, lens and verification runners pass `attempt` plus `usedFamilies`, `laterLenses` or `authorFamilyCounts` into `ReviewLaneRunner.run`: `triage-stage.runner.ts`, `lens-stage.runner.ts:59-63`, `verification-stage.runner.ts:111-114`. OK. Reused lens checkpoints count via `usedFamilies(results)` (reused results are pushed first): `lens-stage.runner.ts:~25-30,45-48`. OK.
3. `ReviewLaneRunner.choose` calls `attempt.choose`: fresh `list()`, settings and catalog read once per attempt. OK (M5 on strict parse).
4. `selectReviewLane`: pin first, then pool or global order, lens avoidance by rank, verifier by fewest author count, ties by preference order; skipped pin and pool entries recorded. Matches Req 2-4. OK.
5. Admission, spawn with `model` only when set; gateway re-checks limit and lane presence. OK (M3 for default model).
6. Result carries `lane` (lane, model, family, fallback) on every result once selection ran. Stage runners persist it with `saveStageLane` (`family` column plus `checkpoint:lane:<stage>` row). OK; `saveStage` does not reset `family`. M6 for the abort case.
7. `ReviewQueryRepository` reads `checkpoint:lane:%` rows by `stage#ordinal`; the main stage query excludes `checkpoint:%`, and lens checkpoint reuse reads `checkpoint:lens:x`, which `checkpoint:lane:lens:x` cannot collide with. The only other `review_stages` readers are these two repositories. OK.
8. Renderer: `loadSettings` plus `loadLanes` on open, generation-guarded listing, `saveSettings` omits unchanged lanes (D18), maps coded errors. OK (M4).

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| 1.1-1.6 settings contract, storage outside `settings_json` | COMPLETE | corrupt doc is silent (M1) |
| 2.1-2.2 empty settings parity plus diversity (#1481 item 1) | COMPLETE | none |
| 2.3-2.6 pool order, models, single family | COMPLETE | none |
| 2.7 reused checkpoint family counts | COMPLETE | none |
| 2.8 fresh list per role, at-limit skipped | COMPLETE | spawn re-check window only |
| 3.1-3.2 pins and diversity | COMPLETE | none |
| 3.3-3.5 verifier family (#1481 item 2) | COMPLETE | none |
| 3.6 triage family in summary | COMPLETE | 'unavailable' when triage did not complete |
| 4.1-4.5 availability and fallback record | COMPLETE | default-model block not detected (M3) |
| 4.6 no retry on started lane failure | COMPLETE | none |
| 4.7-4.8 run detail lane, model, fallback; old records render | COMPLETE | none |
| D9-D13 drawer redesign, parity | COMPLETE | Escape or close discards edits (m2), same as before |
| D14 same-family badge from findings | COMPLETE | depends on the loaded findings page |
| D18 omit unchanged lanes | COMPLETE | none |

Implicit requirements not addressed: surfacing an invalid stored lane document to the operator (M1); a dirty-close guard (m2).

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Empty pool and pins, 3 families | YES | global order, rank by used families | none |
| Single-family pool | YES | all lenses on it | none |
| Pin on later lens counts for earlier lenses | YES | `laterLenses` availability | none |
| Pin unavailable | YES | recorded `source: pin`, falls to pool or global | none |
| Pool entry unlisted | YES | recorded `lane-not-listed` | none |
| Catalog timeout or abort | YES | `{}`, warn, model unchecked | whole attempt cached |
| `catalogs['constructor']` style ids | YES | `hasOwnProperty` in `catalogFor`, `parseCatalogs` | none |
| Concurrent reviews | YES | per-attempt state; one worker | none |
| Two saves racing on `review.lanes.v1` | PARTIAL | last writer wins on the whole document | single window in practice |
| Lane write fails after settings commit | PARTIAL | error shown, retry idempotent | stale signals (M4) |
| Old run with no lane rows | YES | null fields accepted, family-only card | none |
| Resume with legacy lens checkpoint (no `lane`) | YES | `lane` optional in `ResultSchema` | none |

Callers outside the diff: `ReviewLaneSelector` and `ReviewLaneCapability` have no remaining non-spec users (grep of review-core); `new ReviewOrchestratorService/LensStageRunner/TriageStageRunner/ReviewRpcHandlers` has no non-spec constructor callers in `libs/backend` or `apps`; `cli-engine` only lists `review:listLanes` as an absent method. The wide grep over `libs` timed out, so `libs/frontend` and `libs/shared` consumers of the removed `sameFamilyVerification` stage check and of `ReviewLaneCapability` were not exhaustively searched.

## Verdict

- Recommendation: APPROVE
- Confidence: MEDIUM (same-family review; tests read by title, not re-run)
- Top risk: degraded paths (corrupt lane document, blocked lane default model, settings-unavailable checkpoint) fall back quietly to "no pins" or a non-retried partial instead of telling the operator.
- What a robust implementation would add: a run-visible note when stored lane settings were invalid; drop-bad-row handling in `choose()` to match the RPC listing; apply the saved operator settings to the store when only the lane write fails; clear the lane row when a stage restarts; expose default-model blocking from the gateway; a dirty guard on closing the drawer.

## Re-review 1 (fix round, working-tree diff on 5bbe772fb, D19-D20)

Review family: same (Claude), weaker evidence. Read the diff and the two fix-round reports; no specs, nx or builds were run (a gate is running).

| Finding | Status | Evidence |
| ------- | ------ | -------- |
| M1 corrupt lane document | CLOSED | `review-lane-settings.store.ts` `read()` returns `corrupt`; `getSettings` sends `lanesCorrupt` (`review-rpc.handlers.ts:~371-377`); store keeps it in `lanesCorrupt` and sends lanes even when equal to the empty fallback (`review-runs.store.ts`, `sentLanes`), clearing the flag after a save; the lanes section shows a warning (`review-lanes-section.component.ts` `storedCorrupt`, drawer binds `lanesCorrupt()`). Reviews still run with empty settings, now reported to the operator. |
| M2 settings-unavailable checkpointed | CLOSED | `review-orchestrator.service.ts` `stage(..., retry)`: a matching triage or verification result is saved `interrupted`, no checkpoint, so resume reselects. The matcher is a non-strict schema on `status: partial, reason: lane-settings-unavailable`, which fits the runner result (`lane` key ignored). Other partials (no-confirmed-room) still checkpoint as before. |
| M3 blocked lane default model | CLOSED (backend); drawer display deferred as D20 | Gateway `list()` sets `defaultModelBlocked` from the same `resolveModel(cli, undefined)` call spawn uses (`review-lane-gateway.ts:~110-125`; the resolver only reads config, no throw path seen). `reviewLaneEntryAvailability` treats a model-less entry on such a lane as `model-blocked`, so pins and pool entries are recorded and global-order lanes are skipped unrecorded (documented). The field is not in the RPC listing, so the drawer cannot mark it (D20, accepted). |
| M4 stale store after lane-only failure | CLOSED | On `REVIEW_LANES_NOT_SAVED` the store calls `refreshSavedSettings()` which re-reads `getSettings` and applies settings, repositories, lanes and corrupt flag; the lane draft and error stay. A failed refresh is logged and does not mask the error. The refresh runs while `settingsSaving` is still true, so no edit races. |
| M5 strict lane list | CLOSED | `parseReviewLaneList` drops invalid rows with one count-only warn, cuts at 100, throws only on a wrong outer shape. Used by both `ReviewLaneAttempt.choose` and `ReviewLaneListingService`. |

Callers and exports:
- `ReviewLaneCapability`, `ReviewLaneKind`, `LaneLimitState` and `review-lane-selector.ts`: no remaining references in `libs/backend/review-core`, `libs/backend/rpc-handlers` or `apps/ptah-electron/src`. The Electron gateway now imports `ReviewLaneCandidate`, exported from the review-core index.
- `ReviewLaneErrorCode`: backend throws it as the `RpcUserError` code and shared lists both codes in `RPC_USER_ERROR_CODES`; the store maps by code (not by English text) and only for `review:updateSettings`. The only consumer of the code list found in shared, vscode-core and frontend is the shared file itself (no exhaustive `Record<RpcUserErrorCode, ...>` seen; the wide libs grep timed out, so this is not exhaustive).
- Handler DI: the handler injects `LANE_LISTING` instead of the gateway; the token is registered in `registration.ts`, listed in `expected-resolvable.ts` and stubbed in `container.smoke.spec.ts`.
- `IReviewLaneSettingsStore.read()` is a new interface member: the only implementer is `ReviewLaneSettingsStore`; consumers that need only `get` were narrowed to `Pick<..., 'get'>`.

New observations (minor, no change required):
- r1: the dropped-row warn in `parseReviewLaneList` logs on every role start and every listing while the bad row persists; count only, so no leak.
- r2: a lane with a blocked default model is skipped silently in global-order mode (no fallback record), consistent with at-limit lanes; pins and pool entries are recorded.

No regressions found. Verdict: APPROVED, score 9/10 (M1-M5 closed; remaining items are the D20 drawer display and the minor items from the first review).
