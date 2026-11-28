# Batch 6 code logic re-review

Review family: kimi-code (implementer family: codex, claude)

## Score and verdict

**5/10 — REVISE.** The attempt guard fixes the three principal races from the first review. The blocked-owner redirect and transcript acceptance also work in the tested paths. Five new Major defects still affect background settlement or owner attachment. The architecture is usable, but the remaining silent state errors prevent a 7/10 score.

All source and spec paths below are relative to `libs/frontend/setup-wizard/src/lib/services/`.

## Defects 1 to 6

| Defect | Status | Evidence |
| --- | --- | --- |
| 1. Retry and early-push attempt identity | **FIXED** | `setup-run-attempt.ts:140`-`:153` creates an attempt before the RPC. `setup-run-attempt.ts:160`-`:174` rejects earlier readers and pending observations. `setup-run.store.ts:1024`-`:1030` rereads after acceptance. The test at `generation-run-event-adapter.spec.ts:286`-`:329` sends early stream and terminal pushes before acceptance. It covers a new guidance ID and a reused agent ID. It also resolves an older read after retry starts. |
| 2. Detached recovery after inconclusive terminal verification | **FIXED** for the reported sequence | `setup-run.store.ts:405`-`:421` enables fallback after an inconclusive lookup. `setup-run-attempt.ts:183`-`:188` preserves fallback across later progress. `setup-run-attempt.ts:177`-`:180` stops polling after settlement. The parameterized test at `generation-run-event-adapter.spec.ts:516`-`:567` covers rejection, null, running, and malformed replies. It completes through the shared poll and proves that later ticks stop. New poll defects are below. |
| 3. Stale running evidence and cross-run overwrite | **FIXED** for stale running evidence | `setup-run.store.ts:815`-`:835` applies one attempt-aware guard to pushes and reads. `setup-run-attempt.ts:160`-`:174` rejects old attempts, old run IDs, and settled records. Tests at `generation-run-event-adapter.spec.ts:392`-`:416`, `:570`-`:589`, and `:591`-`:609` exercise delayed A, late running replies, and an unbound poll. A valid terminal correction is also rejected now. See new defect 4. |
| 4. Blocked-owner lifetime and same-ID owner | **PARTIAL** | `setup-run.store.ts:424`-`:428` resolves the settled redirect through `ownerId`. `setup-run.store.ts:1037`-`:1049` looks up a same-ID owner during retry or rerun. Tests at `setup-run.store.spec.ts:1331`-`:1362` cover both settlement boundaries. Tests at `:1364`-`:1390` cover foreign owners, and `:1392`-`:1432` covers same-ID retry. The initial-start path still fails for a same-ID owner. See new defect 2. |
| 5. Event-envelope validation | **PARTIAL** | `generation-run-event-adapter.ts:48`-`:70` now checks workflow, lifecycle, terminal lifecycle, and run identity. `setup-run-attempt.ts:102`-`:120` validates lookup binding, source, and lifecycle. The test at `generation-run-event-adapter.spec.ts:637`-`:685` exercises those checks. However, `readPush` never validates the stream `kind` or its fields. A payload containing only a valid `tabBinding` still adopts a phantom run through `generation-run-event-adapter.ts:88`-`:94`. Restore a closed stream-kind whitelist and required per-kind fields before adoption. |
| 6. Transcript acceptance check | **FIXED** | `generation-run-event-adapter.spec.ts:227`-`:268` uses the real message router and both real handler registrations. Each stream type updates `record-x`, appends exactly one payload to the correct buffer, and creates no tab. |

## New defects

### 1. Major — A view lookup disables detached polling without any push

- **Evidence.** `generation-workflow.store.ts:85`-`:109` refreshes immediately when a view binds. `generation-workflow.store.ts:483`-`:510` reports the lookup result. `guidance-generation.store.ts:169`-`:195` does the same. `setup-run.store.ts:375`-`:380` passes `pushed = true` for these RPC reads. `setup-run-attempt.ts:183`-`:185` then marks the record as push-delivered. Neither `unbind` method restores fallback.
- **Trigger.** Open a running record, let its initial lookup return `running`, and leave Setup before a real stream push arrives.
- **Impact.** The shared poll stays disabled after the view closes. A lost terminal push can leave the run running with no unseen completion. A view read does not prove that the backend will send another push.
- **Suggested fix.** Mark delivery only in `reportStream` or another genuine push path. Do not pass `pushed = true` from view-driven `reportRun` calls. Add a bind, running lookup, unbind, and shared-poll completion test with no stream push.
- **Test gap.** `setup-run.store.spec.ts:1298`-`:1307` currently pins the suppression behavior. It does not distinguish a view read from a push.

### 2. Major — A same-ID blocked initial start remains stuck in `starting`

- **Evidence.** `generation-workflow.store.ts:305`-`:317` handles every blocked initial start through `bindRecord`. For a same-ID owner, `bindRecord` calls `bind` with the existing binding. The early return at `generation-workflow.store.ts:87`-`:95` then skips the refresh. The `reject` method returns without setting `idle` or refreshing. The previous state is `starting` from `generation-workflow.store.ts:188` or `:149`.
- **Trigger.** Start agents or guidance and receive `{ reason: 'blocked', ownerTabId: binding.tabId }`.
- **Impact.** The view remains `starting` and `isBound` remains true. The existing backend run is not attached automatically.
- **Suggested fix.** Route initial blocked replies through the same owner-resolution path as retry and rerun. At minimum, force a fresh lookup for a same-ID owner instead of relying on `bind`.
- **Test gap.** `generation-workflow.store.spec.ts:663`-`:682` covers only a distinct owner. `setup-run.store.spec.ts:1392`-`:1432` covers same-ID retry, not initial start.

### 3. Major — A persistent missing run causes permanent fallback polling

- **Evidence.** Starts and streams add the record to `liveThisSession` at `setup-run.store.ts:394` and `:1007`. A null lookup can settle a missing record only when `stillMissing` passes. That guard requires `!this.liveThisSession.has(record.id)` at `setup-run.store.ts:784`-`:793`. Terminal verification enables fallback at `setup-run.store.ts:417`-`:418`. `pollTick` repeats while the record remains running at `setup-run.store.ts:1092`-`:1105`.
- **Trigger.** A streamed or locally started run disappears, and every later bound-state lookup returns null. A same-ID blocked lookup that returns null also leaves a running record at `setup-run.store.ts:1037`-`:1049`.
- **Impact.** The record remains running forever. The 2.5-second poll never stops, and no interrupted state or attention badge appears.
- **Suggested fix.** Implement the plan's orphan grace. Count or timestamp consecutive missing replies after the last valid run evidence. Mark the record interrupted after that grace and stop its fallback delivery. Keep the acceptance window short enough to avoid premature interruption.
- **Test gap.** `generation-run-event-adapter.spec.ts:528`-`:566` uses one null reply and then a completed reply. No test keeps returning null beyond an orphan grace.

### 4. Major — The terminal guard rejects a valid finalization correction

- **Evidence.** `generation-workflow.store.ts:493`-`:507` explicitly accepts a verified failed-to-completed correction after finalization failure. It then calls `report` at `:509`-`:510`. `setup-run.store.ts:375`-`:380` forwards that correction to `observeRun`. `setup-run-attempt.ts:170` rejects every observation for a terminal record through `setup-run.store.ts:821`-`:823`.
- **Trigger.** A run first settles as failed with `finalizationFailed`, and a later authoritative lookup returns completed with result counts and outcomes.
- **Impact.** The workflow view shows completed, while the persistent Setup record remains failed. The user can see contradictory status and can retry work that already completed.
- **Suggested fix.** Allow only the existing verified correction for the same attempt and run ID. Require the same finalization-failure and completed-result proof used by the workflow store. Continue to reject running observations and unrelated terminal transitions.
- **Test gap.** `generation-workflow.store.spec.ts:333`-`:379` uses a permissive fake store. `setup-run.store.spec.ts:1254`-`:1261` does not exercise the valid correction.

### 5. Major — A guidance trace-write failure becomes a completed Setup record

- **Evidence.** `guidance-generation.store.ts:169`-`:184` reports the run before it maps the view status. The view correctly maps `completed` with an invalid `committedState` to `failed`. `setup-run-attempt.ts:50`-`:58` and `:118`-`:120` map the same lifecycle to `completed` without checking `committedState`. `setup-run.store.ts:823`-`:835` applies that status.
- **Trigger.** Guidance returns `status: 'completed'` with `committedState: 'unknown'`, or with another value accepted by neither committed success branch.
- **Impact.** The view shows failed, but the Setup record shows completed and sets the unseen completion badge. This is a success-looking result after a trace-write failure.
- **Suggested fix.** Apply the guidance committed-state rule in the central verified-status mapping. Report `failed` with fixed guidance copy for an uncommitted completed lifecycle. Use the same rule for pushes, polls, and view reports.
- **Test gap.** `guidance-generation.store.spec.ts:162`-`:168` asserts only the view status. Its fake `reportRun` at `:91`-`:102` does not map record status.

### 6. Minor — Retry and rerun lose the required workspace-mismatch copy

- **Evidence.** Initial starts map both rejection reasons correctly at `generation-workflow.store.ts:318`-`:325`. Retry and rerun now use `SetupRunStore` at `:238`-`:239` and `:261`. `setup-run.store.ts:1060`-`:1063` instead applies `START_REFUSED_COPY` to every unhandled rejection. `setup-run-attempt.ts:227`-`:229` also discards coded RPC errors.
- **Impact.** The record still becomes failed, but it says `The run could not be started.` The plan requires `This run belongs to another workspace.` for `invalid-binding` and `workspace-mismatch`. Actionable coded guidance-start errors also collapse to generic copy.
- **Suggested fix.** Preserve the rejection reason through `requestBoundStart`. Map both workspace reasons in `sendBoundStart`. Keep raw backend text out of the record. Add retry and rerun cases for both reasons.
- **Test gap.** `generation-workflow.store.spec.ts:622`-`:640` covers initial start only. `setup-run.store.spec.ts:882`-`:897` pins generic copy for a different rejection reason.

### 7. Minor — Attempt and delivery entries survive terminal settlement and eviction

- **Evidence.** `setup-run-attempt.ts:149`-`:152` deletes only the settled promise. It retains the attempt and optional redirect. `setup-run-attempt.ts:191`-`:197` retains delivery entries until `start` or `forget`. Terminal settlement at `setup-run.store.ts:1142`-`:1151` clears neither structure. `remove` calls `forget` at `setup-run.store.ts:1185`-`:1200`, but cap eviction at `:1174`-`:1181` bypasses `remove`.
- **Impact.** Settled and cap-evicted IDs accumulate for the store lifetime. Every later delivery change clones the growing map. Retained owner redirects are intentional, but other entries have no consumer after settlement.
- **Suggested fix.** Clear delivery on terminal settlement. Prune attempt, delivery, and related session metadata for cap-evicted IDs. Retain only settled redirects that still have a live `whenStarted` use.
- **Test gap.** The dismissal and cap tests do not inspect cleanup across terminal settlement or eviction.

## Task 6.2 behavior

| Behavior | Status | Evidence |
| --- | --- | --- |
| Retry and rerun go through `SetupRunStore` | **PASS** | `generation-workflow.store.ts:231`-`:241` and `:249`-`:263`. The specs assert `runs.retry` and `runs.rerun` at `generation-workflow.store.spec.ts:445`-`:477` and `:714`-`:775`. |
| Cancel goes through `SetupRunStore` | **PASS** | `generation-workflow.store.ts:455`-`:468` calls `runs.cancel(record.id)`. Tests at `generation-workflow.store.spec.ts:564`-`:586` and `:642`-`:661` reject the old direct RPC path. |
| Stop never cancels an unrelated run | **PASS for the examined paths** | The held-run guard at `generation-workflow.store.ts:444`-`:448` blocks a foreign lookup. The lost-lookup test at `generation-workflow.store.spec.ts:684`-`:700` proves no cancel. The blocked-owner test at `:663`-`:682` proves pending Stop is discarded on attach. |
| Blocked owner attach | **PARTIAL** | Distinct-owner attach works. Same-ID initial start fails under new defect 2. |
| Invalid binding or workspace mismatch becomes failed | **PARTIAL** | Both initial and centralized paths become failed. Centralized retry and rerun use the wrong error copy under new defect 6. |
| Guidance record status matches the view | **FAIL** | An uncommitted completed lifecycle becomes a completed record under new defect 5. |

## Coverage of setup-run-attempt.ts

The absence of a dedicated spec is not itself a defect. The adapter and real-store suites exercise the attempt class directly. They cover attempt replacement, pending reads, accepted rereads, delivery fallback, binding validation, and terminal polling. The named race tests perform the asynchronous ordering that they claim to test.

Coverage is not sufficient for approval. The workflow-store suites replace `SetupRunStore` with permissive fakes. They cannot expose the central terminal-correction and committed-state conflicts. No suite covers persistent null replies, initial same-ID blocking, view-read polling, or metadata eviction. Add focused integration cases through the real store before adding a separate helper spec.

## Five logic questions

1. **How does this fail silently?** A missing backend run stays running and polls forever under new defect 3. A corrected generation stays failed, and uncommitted guidance becomes completed, under new defects 4 and 5.
2. **What user action produces unexpected behavior?** Opening and leaving a run can disable background polling. Starting a same-ID blocked run can leave the view stuck at `starting`.
3. **What input produces a wrong answer?** A stream containing only a valid binding still creates a phantom running record. A completed guidance lifecycle with an invalid committed state creates a completed record.
4. **What happens when a dependency fails or returns an unexpected shape?** Malformed lifecycles and sources are rejected. Null replies have no orphan limit. Centralized starts also discard rejection reasons and coded errors.
5. **What is missing from the requirements?** The plan names an orphan grace but gives no duration. The contract does not define attempt-metadata cleanup or propagation of verified terminal corrections.

## Requirements fulfilment

| Requirement | Status | Evidence |
| --- | --- | --- |
| Preserve attempt identity across retry and early events | **COMPLETE** | Defect 1 evidence. |
| Recover a streamed run after inconclusive terminal verification | **COMPLETE for the reported sequence** | Defect 2 evidence. |
| Keep polling correct across views and missing runs | **PARTIAL** | New defects 1 and 3. |
| Prevent stale evidence from changing settled state | **PARTIAL** | Stale running evidence is blocked. Valid terminal correction is also blocked. |
| Attach every valid blocked owner | **PARTIAL** | New defect 2. |
| Reject malformed events before adoption | **PARTIAL** | Defect 5 evidence. |
| Deliver one routed push to record and transcript | **COMPLETE** | Defect 6 evidence. |
| Keep Setup record status consistent with verified run meaning | **PARTIAL** | New defects 4 and 5. |

## Verification

- Read the first review, fix report, Batch 6 contract, implementation plan, context, Task 6.2 test report, complete source diff, and the new helper.
- Read all five changed source files and all four focused specs in full.
- Ran the requested focused Jest command. **PASS: 4 suites, 177 tests, 0 failures, 0 snapshots.** Log: `.ptah/tmp/code-logic-review-batch6-rereview-jest.log`.
- Scoped `ptah_get_diagnostics` covered five source files but timed out after 45 seconds. It reported all five files unchecked. Independent type diagnostics remain unavailable.
- No source or spec file was edited. No build, workspace-wide check, or mutating git command was run.

## Decisions

- **Evaluate blocked ownership across every start path.** Options were limiting defect 4 to retry and rerun, or applying the Batch 6 contract to initial start too. The plan states the blocked-owner rule without a start-mode exception. This review therefore marks defect 4 partial. This decision is reversible if the contract is narrowed explicitly.
- **Distinguish RPC reads from genuine pushes.** Options were treating every view report as push delivery, or only actual stream events. The poll contract concerns missing pushes, and binding a view performs an RPC read without any push. This review uses the second interpretation. The delivery API can make that distinction explicit.
- **Keep the original envelope defect at Minor severity.** The remaining binding-only stream creates a phantom record, but no trusted backend path was shown to emit it. The new user-visible settlement defects receive Major severity because they contradict authoritative state on supported paths.
