# Implementation Plan Review - TASK_2026_2310_rvlns

| Field | Value |
| --- | --- |
| Artifact | `implementation-plan.md` (read-only to the reviewer) |
| Author | software-architect subagent (Claude) |
| Reviewer | document-review subagent (Claude) |
| Execution sides | Same side, Claude on both. Lanes are disabled (decisions.md D3), so this counts as **weaker evidence** |
| Reviewed revision | Round 0: initial draft. Round 1: revision 1 (2026-11-23) |
| Completed revise rounds | 1 |
| Verdict | Round 0 **REVISE**. Round 1 **APPROVED** (F1-F9 closed; 3 advisory notes R1-R3, none blocking) |

Inputs checked: `context.md`, `decisions.md` D1-D13, `task-description.md` rev 2 (Gate 1), `design-spec.md`
rev 3 (Gate 1.7), `parity-inventory.md`. Source was read in the worktree
`D:\projects\PtahCode\.claude-worktrees\review-lane-pool` at `a4e0154ae`. No nx, build or test command was run.

## 1. Requirement-to-section trace

| AC | Plan section | Batch | Status |
| --- | --- | --- | --- |
| 1.1 empty lanes on read, next save ok | C3 `get()` missing key; C9 getSettings | B2, B4 | Traced |
| 1.2 rejections (empty/long ids, duplicate, bad role, unknown key) | C1 schema (strict pins, superRefine, regex); C9 parse before write | B1, B4 | Traced |
| 1.3 pool max | C1 `REVIEW_LANE_POOL_MAX = 12` | B1 | Traced |
| 1.4 round trip in order | C1 and C3 specs; C9 spec | B1, B2, B4 | Traced |
| 1.5 unrelated save keeps lanes | C9 (absent `lanes` keeps stored); C10 store spec | B4, B5 | Traced |
| 1.6 older build | A1 (global `IStateStorage`, no migration); C3 compat test | B2 | Traced, verified below |
| 2.1 empty settings = today's set/order, no model | C5 preference list, `model: null` | B3 | Traced |
| 2.2 ≥2 families with empty settings | C5 lens ranking; C6 runner-path test | B3 | Traced |
| 2.3 min(N,4) families, pool order | C5 ranking | B3 | Traced |
| 2.4 single-family pool | C5; C6 test | B3 | Traced |
| 2.5 model on spawn + recorded | C5 spawn `model`; C7 lane record; C8 gateway | B3, B4 | Traced |
| 2.6 no out-of-pool lanes for unpinned roles | C5 + A11 | B3 | Traced |
| 2.7 reused checkpoint counts | C6 `usedFamilies` from `results` and the `lane` field on `ResultSchema` | B3 | Traced, verified below |
| 2.8 fresh list at role start | C5 `choose()` reads `list()` | B3 | Traced |
| 3.1 pins honoured | C5 | B3 | Traced |
| 3.2 pinned lens counts | C5 `laterLenses` pins + `usedFamilies` | B3 | Traced |
| 3.3 / 3.4 verifier avoids / fewest, tie-break | C5 verifier ranking; C6 `authorFamilyCounts` over merged candidates | B3 | Traced |
| 3.5 pinned verifier on author family keeps marking | C6 (marking at `verification-stage.runner.ts:115` unchanged) | B3 | Traced |
| 3.6 triage family in summary | C6 publication change | B3 | Traced |
| 4.1 availability rules | C5 availability; A5, A6, A9 | B3, B4 | Traced |
| 4.2 unreadable catalog passes model | A5; C5 attempt catalog → `{}` | B3 | Traced |
| 4.3 pin fallback with note | C5 pin → unpinned + `{source:'pin'}` | B3 | Traced; consistent (see section 4) |
| 4.4 skipped pool entry note | C5 walk | B3 | Traced |
| 4.5 none → `no-confirmed-room` | C5; A11 | B3 | Traced |
| 4.6 started lane fails → partial, no retry | C5 failure behaviour | B3 | Traced |
| 4.7 fallback note + lane/model on every card | C7 projection; C14 | B2, B5 | Traced |
| 4.8 old runs with nulls | C1 `.nullable().optional()`; C7; C14 | B1, B2, B5 | Traced |
| 5.1-5.6 drawer section | C10-C13 | B5-B7 | Traced |

Design-spec section 8 visible changes 1-9: 1-7 and 9 map to C13 (B7); 8 maps to C12 (B6). Run-detail
section 6 maps to C14 (B5). Section 9 handoff items 1-12 are all addressed (A3, A4, A5, A7, A8, A13, C13).
Every parity-inventory row is `keep` and maps to C13. D10 (removal of the placeholder) is approved.

Missing items: the `cli-engine` RPC surface spec (F1). The run-level same-family badge effect needs a
user decision (F3).

## 2. Feasibility citations (load-bearing claims)

| Claim | Evidence | Result |
| --- | --- | --- |
| Global `IStateStorage` readable/writable from review-core and the RPC handlers in Electron | Token `platform-core/src/di/tokens.ts:18`. Electron binds global state with no worker options (`platform-electron/src/registration.ts:146-153`), so the constructor loads synchronously and is ready at once (`electron-state-storage.ts:81-88`); `get` is synchronous (`:133-137`). No phase overrides `STATE_STORAGE` (only `WORKSPACE_STATE_STORAGE`, `phase-1-infra.ts:161`). review-core is registered only in Electron (`phase-2-libraries.ts:524`) | Verified |
| Survives restart | `update` awaits the debounced flush to `global-state.json` (`electron-state-storage.ts:186-213`) | Verified |
| No migration; an older build ignores the key | No schema change. Old code never reads `review.lanes.v1`. Precedent `rotation.store.ts:1-22` | Verified |
| Boundary allowed | review-core `scope:extension`; platform-core `scope:shared` (`eslint.config.mjs:285-287`) | Verified |
| `review_stages.family` exists and is never written | Column `0065_ptah_review.ts:77`. `saveStage` insert/update lists omit `family` (`sqlite-review.repository.ts:291-299`). A later `saveStage` therefore keeps a written family | Verified |
| `checkpoint:*` rows excluded from runs | `review-query.repository.ts:51-52` `NOT LIKE 'checkpoint:%'`. Interrupt updates touch only `state = 'running'` (`sqlite-review.repository.ts:164-165,184-185,257-258`); checkpoint rows are `completed` | Verified |
| Lens checkpoint reuse is safe both ways | `ResultSchema` uses non-strict `z.object` (`lens-stage.runner.ts:21-24`), so an older build strips `lane` and a new build parses an old checkpoint with optional `lane`. The orchestrator `VerificationSchema` is non-strict too (`review-orchestrator.service.ts:28-32`). Old builds look up checkpoints by exact name (`:311-313`, `lens-stage.runner.ts:37-39`), so `checkpoint:lane:*` never collides | Verified |
| UPDATE of `family` finds the row | Triage and verification run inside `stage()`, which writes the `running` row first (`review-orchestrator.service.ts:315-317`). The lens runner writes its row before the lane call (`lens-stage.runner.ts:43-45`) | Verified |
| Gateway port widening | Only implementer is `apps/ptah-electron/src/services/review/review-lane-gateway.ts:30`; spawn schema strict, no model (`:9-12,111-113`) | Verified |
| `findBlockedLaneModel` not exported | Helper `lane-spawn-policy.ts:297-303`; barrel exports only `LaneSpawnPolicyError` (`cli-agent-runtime/src/index.ts:169`) | Verified |
| "Not offered" only with a live `reported` entry | `LaneModelEntry.provenance` (`lane-model-listing.port.ts:3-7`). Ptah CLI discovery failure returns saved config entries (`lane-model-listing.adapter.ts:176-207`). Codex/Copilot non-live entries get `fallback` (`cli-model-list.service.ts:36-50`). A5 is sound | Verified |
| `review:updateSettings` result consumers | Only the store (`review-runs.store.ts:448-471`) and the handler/store specs. No e2e mock (`apps/ptah-electron-e2e` mocks no settings RPC) | Verified |
| New method surfaces | `RPC_METHOD_ENTRIES` (`rpc.types.ts:4163-4177`); `METHODS` (`review-rpc.handlers.ts:64-80`); Electron count "fifteen" (`apps/ptah-electron/src/di/rpc-surface.spec.ts:117-125`); **CLI expected-absent list `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:44,94-109,210` not in the plan** | Gap (F1) |
| AS1 lane-id regex | Ptah CLI ids are `pc-<uuid>` (`cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-registry.utils.ts:39-40`). `ptah-cli:pc-…` is 48 characters and matches the regex. The plan's check path (`libs/backend/agent-sdk/src/lib/ptah-cli`) is wrong | Resolved (F8) |
| Native drawer API | Inputs `isOpen`, `widthClass`, `ariaLabel`, `showCloseButton`, `closeOnEscape`, `closeOnBackdrop`, outputs `opened`, `closed` (`native-drawer.component.ts:206-236`); barrel `ui/src/lib/native/drawer/index.ts:8` | Verified |
| Project names in verify commands | `@ptah-extension/review-contracts`, `shared`, `review-core`, `rpc-handlers`, `cli-agent-runtime`, `ptah-electron`, `@ptah-extension/review-runs-ui`, `ptah-extension-webview` (has `typecheck-templates`, `project.json:160`) | Verified |

## 3. Proposed-constraint decisions

| Plan decision | Decision | Reason |
| --- | --- | --- |
| A1 global `IStateStorage`, no migration | Accept | Meets Req 1.6 by its first outcome and the "prefer no migration" rule; evidence above |
| A2 `family` column + `checkpoint:lane:<stage>` row | Accept | No consumer breakage found (section 2) |
| A3 separate `review:listLanes` | Accept, but complete the surface (F1) | `getSettings` keeps its 5 s timeout (`review-runs.store.ts:535`) |
| A4 label source | Accept | `ptahCliName` exists |
| A5 catalog verifiable only with a `reported` entry | Accept | Evidence above |
| A6 export blocked helper behind a port | Accept | Keeps review-core host-neutral and adds no second list |
| A7 duplicate check on server and client | Accept | `ZodError` becomes a generic message (`review-rpc.handlers.ts:139-140`) |
| A8 pool max 12 | Accept | Recommended in task-description |
| A9 no "pinned lane disabled" code | Accept, record as a Gate 2 copy deviation (F6) | Req 4.3 says "for example"; `buildLanes` drops disabled rows (`review-lane-gateway.ts:43-44`) |
| A10 `authorFamilyCounts` replaces `lensAuthorFamily` | Accept | No caller sets `lensAuthorFamily`; per-candidate marking stays (`verification-stage.runner.ts:115-120`) |
| A11 pool exhausted → `partial`, no global fallback | Accept | Required by Req 2.6 + 4.5 (section 4) |
| A12 settings once per attempt, list per role | Accept | Req 2.8; drawer copy "Settings apply to the next run." |
| A13 separate `draftLanes` | Accept | Keeps `OperatorSettingsSchema.safeParse` (`review-runs.store.ts:430`) |
| Catalog bound `models.max(500)` (C1) | Reject as written (F4) | A reject-on-overflow bound can fail the whole listing |
| "Write sets are file-disjoint" (handoff) | Reject as written (F2) | B2 and B3 both write the runner, the selector, `registration.ts` and `index.ts` |

## 4. Deviations the author listed

1. **No "pinned lane disabled" reason (A9).** This matches Req 4.3, whose reason texts are examples. It does
   differ from the Gate 1.7 copy (`design-spec.md:252`, which lists "pinned lane disabled"), and the plan adds
   a reason the design does not have ("model blocked"). Disabled and uninstalled lanes look the same at the
   gateway, so the change is justified. **No user decision needed.** The orchestrator should name it at
   Gate 2 as a copy change to an approved design.
2. **Pool all unavailable → `partial`, no global fallback (A11).** Req 4.3 covers only a *pinned* lane, and
   it falls back to "the lane the pool (or global order) would choose". The plan does this: an unavailable
   pin goes back to normal selection, which uses the pool when one is set and the global order otherwise.
   For unpinned roles, Req 2.6 forbids lanes outside the pool and Req 4.5 requires `no-confirmed-room`.
   The plan is consistent with both. **No user decision needed.**
3. **Same-family badge now visible.** The badge logic does not change, but its outcome does. See F3.
   **This needs the user.**

## 5. Findings

**F1 (major): the benchmark `cli-engine` RPC surface spec will fail.**
`libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:44` keeps `EXPECTED_ABSENT_METHOD_NAMES`, with
every review method at `:94-109`. `:210` asserts that `surface.excluded` equals that list exactly.
`review:listLanes` joins the manifest through `ReviewRpcHandlers.METHODS` (`manifest.ts:539-544`). The CLI
excludes it (no `review` capability), so the equality breaks. The plan updates only the Electron spec
(component 8). Fix: add `'review:listLanes'` to that list in its sorted position. Add the file to the C2 or
C9 file list and to B4. Add `@ptah-extension/cli-engine` to B4's verify commands and to the full gate.
Impact: the benchmark CLI's tests go red, which breaks the CLAUDE.md "keep platform-cli/cli-engine working" rule.

**F2 (major): batch boundaries leave committed batches red in their dependents, and B4 has a missing dependency.**
- B1 makes `getSettings.result.lanes` required and changes the `updateSettings` result to
  `{settings, lanes}`. The handler (`review-rpc.handlers.ts:362-366,426`), the store
  (`review-runs.store.ts:468-471`, `this.settings.set(saved)` no longer type-checks) and the page spec mocks
  (`review-runs-page.component.spec.ts:211,242`, a `getSettings` mock without `lanes`) break until B4, B5 and
  B7. B1's verify covers only review-contracts and shared, so its check cannot see this.
- B2 widens `IReviewLaneGateway` and requires `label` in the runner's strict capacity parse
  (`review-lane.runner.ts:92-95`). That breaks the `ptah-electron` gateway typecheck and runtime until B4.
- B4 adds `ReviewLaneSelectionService` to `expected-resolvable.ts`, but that service is created in B3. B4
  lists only B1 and B2 as dependencies and is marked parallel-safe.
- The handoff says write sets are file-disjoint, yet B2 (C4) and B3 (C5) both write `review-lane.runner.ts`,
  `review-lane-selector.ts`, `di/registration.ts` and `src/index.ts`. C3 and C5 also share `registration.ts`
  and `index.ts`.
Fix: regroup so that each batch includes the consumers its contract change breaks, or state the expected red
window and the verify that proves it closed. One workable set:
- Move the `review-rpc.schema.ts` and `rpc.types.ts` changes into B4 with the handler.
- Make B5 depend on B4, and give B5 the page-spec `getSettings` mocks.
- Move C8 (the gateway adapter and the barrel export) into the batch that widens the port.
- Make B4 depend on B3.
- Correct the disjointness claim to "disjoint between batches that run in parallel".

**F3 (major, user decision): the run-level "same-family verification" badge will show on almost every new run.**
`sameFamilyVerification()` (`review-run-detail.component.ts:119-122`) fires when **any** lens stage family
equals the verifier family. Today it never fires, because `family` is never written. After this plan, the
lenses spread over min(N,4) families (Req 2.3). With 2 to 4 available families, every family is used by
some lens, so the verifier family always matches one lens and the badge appears, even when the verifier
avoided every candidate-author family (a lens with zero findings still matches). This goes against the
stakeholder expectation "Fewer `same-family-weaker` badges when several families exist"
(task-description Stakeholders) and against the intent of "badge logic unchanged" (`design-spec.md:252`).
The per-finding marking is correct (`verification-stage.runner.ts:115`) and is already exposed on
findings (`review-finding.schema.ts:57`).
Options:
- (a) **Recommended.** Base the badge on findings: show it when any loaded finding has
  `verification === 'same-family-weaker'`. This is a small C14 change, using findings the run detail already loads (`:72`).
- (b) Keep the logic and accept a badge on almost every run.
- (c) Compare the verifier family only with lens stages that produced candidates. This needs a per-stage
  candidate count that the run record does not have.
The choice changes approved design behaviour, so the orchestrator must put it to the user at Gate 2.

**F4 (medium): `ReviewLaneCatalogSchema.models.max(500)` can fail the whole lane listing.**
C9 parses the `review:listLanes` result with this schema. Large provider catalogs can go past 500 ids
(for example OpenCode across providers, or OpenRouter-backed Ptah CLI agents through
`LaneModelListingAdapter`). One lane over the bound then throws, and the whole drawer section shows the
lane-list error. Fix: the gateway truncates to the bound (or the bound is raised), and the truncation is
recorded (for example `truncated: true`, or a note in the model control). Rejection on overflow must not
be the behaviour.

**F5 (minor): the catalog time bounds are not enforced for system lanes.**
`LaneModelListingAdapter.listSystemCli` ignores the signal (`lane-model-listing.adapter.ts:126-128`), so
`Promise.allSettled` over `listing.list(row, signal)` waits for the slowest system read. The 8 s attempt bound
(C5) and the 10 s `listLanes` bound (C9) hold only if `listModels` races each read against `signal` itself.
The plan says "abort honoured" but gives no mechanism. Fix: state in C8 that each read races an abort
promise and maps to `status: 'failed'` on abort. Add a gateway spec case with a never-settling listing.

**F6 (minor): copy and state deviations from the approved design are not listed for Gate 2.**
(i) The design reason "pinned lane disabled" is dropped (A9). (ii) The new reason "model blocked" has no
drawer state or copy in design 4.3 (`design-spec.md:174-178`). C8 removes blocked ids from the catalog, so a
saved blocked model shows "(not offered)" only when the catalog is verifiable, and "Saved. Not checked."
otherwise, while runs report `model-blocked`. Fix: specify the drawer status for a saved blocked model, for
example by exposing `blocked` per saved model in the listing or through a check in the option logic. List
(i) and (ii) under a "Design deviations" heading so that Gate 2 shows them.

**F7 (minor): B3 is too large for one developer pass.**
B3 holds C5 and C6: the selector rewrite, a new attempt class, a new service, the runner redesign, four
stage runners, the orchestrator, a new keys file, and about seven specs, including the #1481 runner-path
suite. Suggest B3a (C5 with its pure and attempt specs) and B3b (C6 with the stage and orchestrator specs).
They are sequential and already split cleanly by file.

**F8 (minor): implementation details to correct in the plan text.**
- C7: the run query's stage `SELECT` and `stageSchema` have no `ordinal` (`review-query.repository.ts:26-27,51-52`).
  Mapping lane records "by `<stage>#<ordinal>`" requires adding it.
- C10: `saveSettings` limits error messages to a prefix whitelist in its `catch`
  (`review-runs.store.ts:473-477`), and `request` limits them to `REVIEW_DISABLED` messages (`:554-557`). The
  "Review lanes were not saved" message (code `PERSISTENCE_UNAVAILABLE`) needs both changed.
- AS1: replace the check path with the verified source
  (`cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-registry.utils.ts:39-40`, `pc-<uuid>`), which settles AS1.

**F9 (minor): parity rows with "missing" tests are not all covered in the C13 seam.**
`parity-inventory.md:84-122` marks several kept capabilities without tests. The C13 seam covers the X
button, Escape, title focus, ids/aria-labels, and the pause and token flows. It does not name the loading
panel, the error panel with Retry (`:93-94`), the Tab trap now owned by the native drawer (`:89`), focus
restore (`:90`), or the attestor login field (`:104`). Fix: add them to the drawer spec list. The drawer
shell is replaced, so these are exactly the regressions a parity check exists to catch.

## 6. Other checks

- Electron first: yes. The review pipeline runs only in Electron, and the visual review and baselines are
  deferred to the user (e2e).
- No static model lists: yes. Catalogs come only from `LaneModelListing`. The existing safety block list is
  reused through an export, not copied (A6).
- Provider CLI lanes: the spawn gains only the typed `model` field (`agent-process.types.ts:442-443`).
- Benchmark: not affected at runtime (review-core is not registered in `cli-engine`), but its spec is (F1).
- Verify commands follow CLAUDE.md (`--related`, `-t lint,typecheck`, `typecheck-templates -p
  ptah-extension-webview`). The full gate lacks `@ptah-extension/cli-engine` (F1).
- Executors: backend for C1-C9 and frontend for C10-C14 are appropriate.

## 7. Unresolved items

| Item | Owner | Recommendation |
| --- | --- | --- |
| F3 badge behaviour | User at Gate 2 | Option (a): base it on findings |
| F1, F2, F4-F9 | Author (revision 1) | As stated per finding |

## 8. Verdict

**REVISE.** The architecture holds: storage without a migration, the lane-record approach and per-role
selection all check out against the code, and every acceptance criterion traces to a component and a batch.
The handoff is not executable as written: the benchmark spec breaks (F1), batches leave dependents red and
B4 depends on B3 without saying so (F2), and the listing bound can fail the drawer (F4). F3 must go to the
user. Re-review revision 1 as round 1 of this record.

---

## Round 1: re-review of revision 1

Scope: only the parts revision 1 changed, plus a check for regressions. The plan was read at revision 1
(its "Revision 1" section). Decision D14 (user, 2026-11-23) settles F3. Both sides are still Claude, so
this is still weaker evidence. No nx, build or test command was run.

### Status of the round 0 findings

| Finding | Revision 1 change | Check | Status |
| --- | --- | --- | --- |
| F1 benchmark spec | C9 and B4 add `review:listLanes` to `cli-engine/src/lib/rpc/rpc-surface.spec.ts` (sorted between `listFindings` and `listRepositories`). cli-engine is now in B3 lint/typecheck, in B4 tests, lint and typecheck, and in the gate (9 projects) | The list is compared exactly at `:210`. `--related` on B4 runs the changed spec | Closed |
| F2 batches | B1-B8 re-cut (detail below) | Each file appears in one batch only. Dependencies checked | Closed |
| F3 badge | A15 and C14 base the badge on findings marked `same-family-weaker`; B7 has three named tests | Matches D14. The component already has the findings (`review-run-detail.component.ts:72`) | Closed |
| F4 catalog bound | Truncate to `REVIEW_LANE_CATALOG_MAX`, `truncated` flag, a truncated catalog is not verifiable, test with 600 ids | Consistent across C1, C8 and C11 | Closed |
| F5 abort | Each read races the signal and the listener is removed when it settles; test with a listing that never settles | Covers `lane-model-listing.adapter.ts:126-128` | Closed |
| F6 copy | New section "Copy changes vs approved design"; `blockedModels` in the listing drives the drawer state | Section reviewed below | Closed |
| F7 size | Pure selection, the attempt and the service move to B2; the wiring is in B3 | B3 is still large (R1) | Closed, advisory |
| F8 details | `ordinal` added to the query; both error whitelists changed; AS1 settled | Matches `review-query.repository.ts:26-27,51-52` and `review-runs.store.ts:473-477,553-557` | Closed |
| F9 parity tests | Named tests for the loading panel, error panel with Retry, Tab wrap, focus restore, attestor login, maintainers, number fields and polling toggle | Covers `parity-inventory.md:89-90,93-94,99,104-110` | Closed |

### Batches B1-B8

- **File disjointness.** Each file is in exactly one batch. `di/tokens.ts`, `di/registration.ts`,
  review-core `index.ts` and `expected-resolvable.ts` are edited only in B2. The runner and selector are
  edited only in B3. The RPC schema, `rpc.types.ts` and both surface specs are edited only in B4. The
  repository fakes are edited only in B3. A grep for `saveCheckpoint` fakes finds only
  `lens-stage.runner.spec.ts` and `review-orchestrator.service.spec.ts`, and both are in B3. The extra
  context and status specs in the list are harmless.
- **Each batch is green when committed.**
  - B1 is additive: new schemas, plus optional `StageRecord` fields. Its typecheck covers every consumer.
  - B2 adds only files that no code calls yet. The new service is resolved only by `expected-resolvable`.
    Resolving it builds it on top of the current gateway; it calls no gateway method yet, so it is safe.
  - B3 lands together, in one commit: the port, its only implementer, the runner, the stages, the
    persistence and the fakes. Verified: there is no other implementer of `IReviewLaneGateway` or
    `IReviewRepository` outside review-core and Electron.
  - B4 keeps the `updateSettings` result unchanged and makes `getSettings.lanes` optional (A14). The
    store from before B5 and the page-spec mocks (`review-runs-page.component.spec.ts:211,242`) still
    parse.
  - B5 reads `lanes ?? EMPTY`.
  - B8 updates the page mocks.
- **Dependencies.**
  - B4 depends on B2 (lane store) and B3 (`listModels`, `modelBlocked`, `label`). Correct.
  - B5 depends on B4. Correct.
  - B6 and B7 need only the B1 types (`ReviewLaneListing`, `blockedModels`, `EMPTY_REVIEW_LANE_SETTINGS`,
    `duplicatePoolEntryIndex`, `StageRecord` lane fields). Correct.
  - B8 depends on B5 (store signals) and B6 (section components). Correct.
  - The one-check-per-project rule for review-runs-ui while B6 and B7 run in parallel is stated.
- **Verify coverage.** Every batch lists the projects it can break. B1 typechecks review-core,
  rpc-handlers, review-runs-ui and ptah-electron. B3 adds cli-agent-runtime and cli-engine. B4 adds
  shared, cli-engine and review-runs-ui. The commands follow CLAUDE.md: `--related` separate from
  `-t lint,typecheck`, and `typecheck-templates` for template batches.

### A14 against Req 1.1-1.5 and the design

- 1.1: the handler always sends `lanes`, empty when nothing is stored; the store also falls back to empty.
- 1.2 and 1.3: unchanged; params are parsed before any write.
- 1.4: covered by the handler and store round-trip tests.
- 1.5: absent `lanes` keeps the stored value, and the store always sends its draft.
- The design does not specify the result shape, so A14 conflicts with nothing approved.
- One small gap, R2 below.

### "Copy changes vs approved design"

All four items are true to the source and correctly limited to copy and state:

1. Dropping "pinned lane disabled" is backed by `review-lane-gateway.ts:43-44`.
2. "Model blocked" is a new state. Req 4.1 counts a blocked model as unavailable. The drawer state comes
   from `blockedModels` and shows even when the catalog cannot be read. The 36-entry bound covers the
   18 possible saved models.
3. The truncation hint has its own copy.
4. The D14 badge keeps its text and placement.

The orchestrator should show this list at Gate 2. The user has not yet approved items 2 and 3; D14
settles only item 4.

### Advisory notes (non-blocking)

- **R1.** B3 is still the largest batch. It holds the runner, the stage runners, the orchestrator,
  persistence, the gateway adapter and the #1481 runner-path suite. The coupling that forces one commit is
  real. If the team-leader needs a smaller unit, one option is to land C7 first: the repository method,
  SQL, query, fakes and the `ReviewLaneUse` type. That would move the two fake specs out of B3, so
  `lens-stage.runner.spec.ts` and `review-orchestrator.service.spec.ts` would then be edited in two
  sequential batches. Either way works; the team-leader decides.
- **R2.** A14: the store sets `settingsLanes` from the lanes it *sent*, but the server parses
  `ReviewLaneIdSchema` and `ReviewModelIdSchema` as *trimmed* strings. Values come from selects, so this is
  harmless today. The client could apply `ReviewLaneSettingsSchema.parse(draftLanes())` before sending
  and store that result. Then the draft equals what was stored, and Req 1.4 holds exactly.
- **R3.** In B6, `typecheck-templates -p ptah-extension-webview` probably does not compile the new
  section components yet, because nothing imports them until B8. B6's template coverage before B8 comes
  from its component specs, which compile templates in TestBed. The B8 `typecheck-templates` run is the
  real template gate.

### Regressions

None found. The revision did not change A1-A13, the storage or stage-record approach, the selection rules
or the trace in section 1. Every acceptance criterion and design visible change still maps to a
component and a batch: B1-B8 take over the old B1-B7 rows, and the run detail moves to B7.

### Round 1 verdict

**APPROVED.** The handoff can be executed as written. R1-R3 are optional improvements for the
team-leader. Gate 2 belongs to the user and should include the "Copy changes vs approved design" list.
