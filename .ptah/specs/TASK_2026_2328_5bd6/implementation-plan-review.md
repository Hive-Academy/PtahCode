# implementation-plan review

- **Author:** claude CLI lane (software-architect), revision covering FA1-FA9 (FA8 and FA9 folded in as turns 2 and 3).
- **Reviewer:** document-review phase, ollama-cloud family, model `glm-5.3:cloud`.
- **Revision reviewed:** FA1-FA9 (task-description.md revision 4, decisions.md rows 6-10, 12, 14, 15, 17); round 2 re-reviewed the revision-log fixes for findings 1-7.
- **Round:** 2

## Round 1 verdict (superseded by round 2 below): REVISE

One Serious finding and two Moderate findings remain. The design is otherwise sound: coverage of FA1-FA9 is
complete, the off-mode separation is structurally correct, migration 0078 is the next free number, and every
cited contract I checked is accurate (one line number is off, one value is a placeholder). The Serious finding
is a one-sentence contract fix, but it is a contract fix: the plan as written lets a Claude lane silently lose
its effort argument.

## Review method (five questions)

1. **How does the code fail, not does it run?** I traced each failure boundary the plan names (catalog fetch
   fails, never read, stale, empty; model gone; at limit; probe failure; refused hint; unknown routeId) against
   section 5 and the code. One silent-failure path is missing: a Claude model that reports `supportsEffort:
   true` without a levels list (Finding 1).
2. **Trace behaviour end to end.** I followed one routed run: route call (3.3) -> spawn facts (2.6) -> effort
   resolution (2.12.4) -> transport (2.12.5) -> completion row (3.2) -> evidence index (2.8) -> score (4.1-4.4) ->
   view (2.11). Each new column has a writer and a reader (2.5). The loop closes.
3. **Inject failure at boundaries.** Catalog timeout, empty catalog, invalid snapshot, blank ids, refused
   effort, missing state fields, probe failure, schema-rejected seed: all have defined behaviour. Two failure
   modes are underspecified: the effort drop of Finding 1, and the row loss of Finding 6.
4. **Question the requirements.** FA1-FA9 all map to design elements and tests (coverage table). Three
   privacy criteria are covered by inspection only (FA2.5, FA3.6, FA7.4); I accept this because the enforcement
   is schema bounds plus a type with no text fields.
5. **Off-mode guarantee.** The structure is sound: `score()` without `choice` keeps today's body, `gather`
   with `choice: false` keeps today's live listing, `CapabilityMatrixStore.load` without `choice` keeps today's
   snapshot, `assembleGateResult` keeps `plan.policy.effort`, and the system CLI block stays in off mode. The
   only new off-mode outputs are `routeId`, `effortCheck` and the FA8.4 reason clause, which FA8 requires in
   both modes. The golden test is the right proof, but it runs too late (Finding 2).

## Findings

1. **Serious — §2.12.2 (claude row), with §2.12.4 rule 1.**
   **Issue:** the plan sets `efforts: { provenance: 'native', supported: supportsEffort ?
   supportedEffortLevels : [], default: null }` when `supportsEffort` is defined. Both fields are optional in
   the SDK catalog schema (`sdk-model-service.ts:303-313`). A model that reports `supportsEffort: true` and no
   `supportedEffortLevels` makes `supported` undefined (a type violation) or, if an implementer coerces it, an
   empty native list. Rule 2.12.4-1 reads that as "native and supported is empty: send nothing,
   `lane-takes-no-effort`". The Claude lane then silently loses its effort argument, in both modes, because the
   setting does not gate FA8. FA8.3 requires an explicit unknown when the lane does not report the list.
   **Required change:** fix the mapping: `supportsEffort: false` -> native, `supported: []`; `supportsEffort:
   true` with a non-empty `supportedEffortLevels` -> native with those values; `supportsEffort: true` with an
   absent or empty levels list -> `{ provenance: 'unknown' }`, so the labeled fallback mapper applies. Add a
   spec case to `claude-cli.adapter.spec.ts`. (Codex already states the right rule: "unfiltered, when the
   server sent the field" — absent is unknown there; keep that distinction.)

2. **Moderate — §4.5 and §7 (WU8, batch 5).**
   **Issue:** the plan says the off-mode golden test is "written FIRST on unchanged code". WU8 runs in batch 5.
   Batches 2-4 already changed lane-routing: `score.ts`, `route-decide-result.schema.ts`,
   `compile-reasons.ts`, `routing-constants.ts` and the matrix files (WU5, WU6, WU7). The golden fixture is
   therefore captured after those edits. An off-mode regression introduced by WU5-WU7 is baked into the fixture
   as "today's behavior".
   **Required change:** write and commit the off-mode golden case of `pipeline/route-choice.spec.ts` before any
   lane-routing unit lands (batch 1, as a standalone unit or the first item of WU5), or restate the guarantee
   as "written before WU8's own files change" and name the unchanged `score.spec.ts` as the score-path pin.

3. **Moderate — §7, note "Full gate projects".**
   **Issue:** WU12b edits `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`.
   The gate project list does not contain `webview-e2e-harness`, so the full gate never checks the one project
   that unit writes.
   **Required change:** add `webview-e2e-harness` to the gate list, or move the fixture edit into a unit whose
   project is gated.

4. **Minor — §2.2.**
   **Issue:** `routedModel` is added to `LaneOutcomeSummary`, `routedEffort` is not. The reader can derive a
   model override (FA5.3, §2.6) but not an effort override. The asymmetry has no stated reason.
   **Required change:** add `routedEffort` to the summary Pick, or state why it is absent.

5. **Minor — §4.4 step 5.**
   **Issue:** the exploration counter moves only when a routed run completes. Two concurrent route calls read
   the same counter value and can each take an explore turn before any run completes. The bound "at most 1 of
   every 5 routed runs" is therefore soft under concurrent coordinators.
   **Required change:** state the bound as approximate under concurrency, or move the counter at record time.

6. **Minor — §2.2 (decisionModel).**
   **Issue:** the plan says the `custom` decision-model id is reduced to `custom:<model>` and "Truncate to 128
   characters", but it does not name the writer that truncates. The row schema rejects over-long values, and
   `enqueueLaneCompletionOutcome` catches and warns (`lane-completion-outcome.ts:88-92`), so an untruncated id
   drops the whole outcome row.
   **Required change:** name the truncation point (the APM stamp in 3.2 step 4) and add a spec case.

7. **Minor — §2.4 and §2.2 (citations).**
   **Issue:** `ModelEffort` is cited at `route-decide-result.schema.ts:196`. The constant is at `:191`
   (`MODEL_EFFORTS`) and `:192` (`ModelEffortSchema`); `ChosenEntrySchema` starts at `:196`. The claim is
   correct, the line is off by five. `MAX_OUTCOME_EFFORT_LENGTH` is left as `/* copy the value */`; the value
   is 32 (`agent-spawn-args.schema.ts:71`).
   **Required change:** fix the line cite and state the value 32.

## Coverage table

| Criterion | Design section | Test |
| --- | --- | --- |
| FA1.1 catalog with provenance | 2.7, 3.1 | `lane-catalog.store.spec.ts`, `route-choice.spec.ts` |
| FA1.2 no wait beyond listing budget | 3.1 step 3 | `route-choice.spec.ts` (snapshot read) |
| FA1.3 failure: last known catalog + reason | 3.1 step 5, §5 row 1 | `route-choice.spec.ts` (stale reason) |
| FA1.4 never read: today's behavior | 3.1 step 4, §5 row 2 | `route-choice.spec.ts` (never-read lane) |
| FA1.5 model leaves catalog | 4.2, §5 (inCatalog: false) | `score-choice.spec.ts` (model not in catalog), `routing-evidence.service.spec.ts` |
| FA1.6 model enters catalog, zero samples | 4.4, §5 | `score-choice.spec.ts` (explore rules) |
| FA1.7 blank id not listed | 2.7 | `lane-catalog.store.spec.ts` (blank ids dropped) |
| FA1.8 no host text in results or logs | 2.7 log rule | `lane-catalog.store.spec.ts` (no host text) |
| FA2.1 model and effort recorded | 2.2, 3.2 | `lane-completion-outcome.spec.ts` |
| FA2.2 lane-default + resolved model | 2.12.3, 3.2 | `lane-completion-outcome.spec.ts` (reportedSession wins) |
| FA2.3 explicit unknown | 2.1, 2.2 | `lane-completion-outcome.spec.ts` (no value gives unknown) |
| FA2.4 old rows readable, today's keys | 2.3, 2.4 | `0078_...spec.ts`, `key-value-...spec.ts`, `sqlite-...spec.ts` |
| FA2.5 summary holds no text | 2.2 (ids/enums/numbers only) | inspection (schema bounds in `0078`/`2.3`) |
| FA3.1 ordered stage counts | 2.8 FunnelCounts | `choice-evidence.spec.ts` (funnel order) |
| FA3.2 revise rounds per key | 2.8 (`reviseRounds` sum) | `choice-evidence.spec.ts` |
| FA3.3 capacity failures separate | 2.8 (`capacityDropped`), §5 | `choice-evidence.spec.ts` (capacity out of rates) |
| FA3.4 aggregates per key | 2.8 FunnelAggregates | `choice-evidence.spec.ts` (aggregates) |
| FA3.5 zero data: zero counts | 2.8 (`cell` undefined) + 2.11 view | `choice-evidence.spec.ts` (zero data); the view materializes zero keys — stated only implicitly, see note under FA6.4 |
| FA3.6 unknown run report rejected | §5 (reports unchanged) | unchanged behavior, inspection |
| FA3.7 same window as score | 2.8 (same `OUTCOME_WINDOW_MS`, `dedupeByRun`) | `choice-evidence.spec.ts` (window) |
| FA4.1 evidence names M and E | 4.1-4.3 | `score-choice.spec.ts` (pair beats default) |
| FA4.2 codex promoted | 4.3, Proposed Removals | `score-choice.spec.ts` (codex in on mode only) |
| FA4.3 no evidence: today's result | 4.3 | `score-choice.spec.ts`, unchanged `score.spec.ts`, golden test |
| FA4.4 bounded exploration, visible | 4.4, 4.6 | `score-choice.spec.ts` (explore rules), `compile-reasons.spec.ts` |
| FA4.5 at limit excluded | 4.3, `score.ts:216-217` (verified) | unchanged `score.spec.ts` throw; explore rules |
| FA4.6 model gone not chosen | 4.2 | `score-choice.spec.ts` (model not in catalog) |
| FA4.7 user pin/rule wins | 4.1 (user layer, learned 0) | `score-choice.spec.ts` (user cell wins) |
| FA4.8 determinism | 2.8-4.4 (pure; counter-based explore) | `score-choice.spec.ts` (determinism) |
| FA4.9 reason names model, effort, count, source | 4.6 | `compile-reasons.spec.ts` |
| FA5.1 routed model/effort + routingSource | 2.6, 3.3 | `agent-namespace.builder.spec.ts`, `lane-completion-outcome.spec.ts` |
| FA5.2 model rejection counts against the key | §5 (rows keyed by requested id, 2.4) | `lane-completion-outcome.spec.ts`; WU3b checks the pre-record gap |
| FA5.3 override recorded as such | 2.6 | `lane-completion-outcome.spec.ts` (caller routingSource wins); see Finding 4 for effort override |
| FA6.1 rows per model, count and age | 2.11 | `routing-evidence.component.spec.ts`, `routing-evidence.service.spec.ts` |
| FA6.2 funnel per key | 2.11 | `routing-evidence.component.spec.ts` |
| FA6.3 catalog failure status and age | 2.11 (catalog block) | `routing-evidence.component.spec.ts` |
| FA6.4 "no samples", not 50 | 2.11 (`score: null`) | `routing-evidence.service.spec.ts` |
| FA6.5 Electron screenshot | §6 last row, §7 batch 9 | visual review phase |
| FA7.1 decision model id + confidence | 2.2, 2.10 | `route-record.registry.spec.ts`, `lane-completion-outcome.spec.ts` |
| FA7.2 figures with model and effort | 4.7 | `outcome-figures.spec.ts` |
| FA7.3 System One timeout: no proposal | §5, 2.10 | `route-record.registry.spec.ts` (proposal only with modelProposal) |
| FA7.4 no prompt text stored | 2.2 (id only, truncated) | inspection; see Finding 6 |
| FA8.1 catalog holds native efforts | 2.12.2 | per-adapter specs (`claude-cli.adapter.spec.ts`, `codex-app-server-lane-models.spec.ts`) |
| FA8.2 resolved model/effort, native | 2.12.3, 3.2 | `codex-context.spec.ts`, `acp-session-runtime.spec.ts`, `pi-cli.adapter.spec.ts`, `opencode-cli.adapter.spec.ts` |
| FA8.3 unknown explicit; fallback labeled, never native | 2.1, 2.12.4 | `native-effort.registry.spec.ts`, `score-choice.spec.ts` (fallback/unknown give no pairs), view badges |
| FA8.4 no silent mapping; disposition stated | 2.12.4, 2.9 (`effortCheck`), §5 | `lane-spawn-policy.spec.ts`, `compile-reasons.spec.ts`, `route-choice.spec.ts` |
| FA8.5 mappers kept as labeled fallback | D20, Proposed Removals | `lane-spawn-policy.spec.ts` (fallback dispositions), `provider-session-lane-handle.spec.ts` |
| FA8.6 version-sensitive from installed CLI | 2.12.5 | `copilot-effort-flag.spec.ts`, `pi-cli.adapter.spec.ts`, `acp-session-runtime.spec.ts` |
| FA9.1 seed cell source fields | 2.13 (`superRefine`) | `seed-source.spec.ts` |
| FA9.2 effort key; old seed -> `*` | 2.13 (profile `effort`), 2.4 | `capability-matrix.store.spec.ts`, `seed-source.spec.ts` |
| FA9.3 data-only alias map, drops counted | 2.13 (`compileSeed`) | `seed-source.spec.ts` |
| FA9.4 prior vs local, cap answer | 4.8 (blended, no cap in on mode) | `score-choice.spec.ts` (strong seed with 40 failed runs scores 16) |
| FA9.5 one kind per row | 2.13 | `seed-source.spec.ts`, `seed-matrix.spec.ts` |
| FA9.6 no network call; shipped seed unchanged | 2.13, §8 | `seed-matrix.spec.ts` |

No acceptance criterion is left without a design element. FA2.5, FA3.6 and FA7.4 are inspection-only.

## Citation spot-checks

| Plan citation | Checked | Result |
| --- | --- | --- |
| `ranking/score.ts:127-132` (system CLI promotion block) | read | correct (`isSystemCliLane` -> `null` at 129-131) |
| `ranking/score.ts:199-236`, `:209`, `:214-215`, `:216-217` | read | correct (prior rule, ±15 cap, at-limit throw) |
| `routing-constants.ts:24` (`LEARNED_DELTA_CAP` 15), `:169` (`MODEL_LISTING_BUDGET_MS` 2000) | read | correct |
| `routing-constants.ts:67` (`CLOSENESS_BAND` 5), `:116`, `:211`, `:220`, `:224` | read | correct |
| `lane-completion-outcome.ts:62` (`model: info.model ?? LANE_DEFAULT_MODEL`) | read | correct; catch at `:88-92` (Finding 6) |
| `claude-cli.adapter.ts:163-172` (`laneEfforts` fixed list; `{ id, name }` map) | read | correct |
| `codex-app-server-lane-models.ts:41-44` (`validatedEffort` filter) and `:27-35` | read | correct |
| `copilot-sdk.adapter.ts:382-385` (fixed `--effort` push) | read | correct (push at 383-385) |
| `decision-matrix-page.component.ts:92` (`<ptah-lane-rotation-setting />`) | read | correct (line 92 exactly) |
| `rpc.types.ts:168` and `:203` (capability-matrix export and type import) | read | correct |
| `migrations/index.ts` (0078 next free) | read | correct: version 77 is the last (`:527`); 0078 is free |
| `0075_phase_grade_keys.ts` (static SQL, bare ALTER form) | read | correct; 0078 same form |
| `sqlite-lane-outcome.store.ts:28-56` (`columns`), `:57-62` (INSERT/UPDATE) | read | correct |
| `sdk-model-service.ts:303-313` (`supportsEffort`, `supportedEffortLevels` optional) | read | correct; basis of Finding 1 |
| `codex-context.ts:363-366`, `:1050`, `:1466-1474` | read | correct (model kept, request seed, `defaultReasoningEffort` dropped) |
| `acp-session-runtime.ts:1095-1100` (`sessionModel` prefers request) | read | correct |
| `opencode-cli.adapter.ts:963`, `:1166-1179` | read | correct (request seed; native pair) |
| `pi-cli.adapter.ts:148-155`, `:786-791` | read | correct (`get_state` reads only session id/file) |
| `cli-adapter.interface.ts:142-143` (`LaneModelSource`), `:470-485` | read | correct; matches `OUTCOME_MODEL_SOURCES` |
| `agent-spawn-args.schema.ts:71` (`MAX_EFFORT_LENGTH` 32) | read | correct |
| `lane-model-listing.adapter.ts:92-96`, `:119-127`, `:136-139`, `:236-250` | read | correct (in-flight map, blank-id skip, merge) |
| `cli-model-list.service.ts:60-79`, `:108-114`, `:123` | read | correct |
| `gather.ts:485-490`, `:501-537`, `:532-534` | read | correct (reason, race, empty) |
| `assemble-gate.ts:649`, `:664` (`plan.policy.effort`) | read | correct |
| `matrix.schema.ts:28-79` (seed `superRefine`), `:113-127` (duplicate key) | read | correct |
| `seed-matrix.ts:16-17` (research date 2026-10-14), `:61-69` (one row) | read | correct |
| `local-derivation.ts:23-45`, `:72-111`, `:148`, `:168-173` | read | correct (blend, dedupe, key, family profile) |
| `capability-matrix.store.ts:300-355`, `:477-512` | read | correct |
| `lane-outcome.types.ts:85-86`, `:125-139` (15 Pick keys), `:166-187` | read | correct (15 keys exactly) |
| `lane-model-listing.port.ts` (`LaneModelEntry`) | read | correct; `efforts` is additive |
| `route-decide-result.schema.ts:83`, `:103-113`, `:196-215`, `:299-314`, `:66-72` | read | correct; `ModelEffort` is at `:191` (Finding 7) |
| `eslint.config.mjs:279-290` (`scope:extension` -> shared+extension) | read | correct |
| `lane-routing/src/index.ts` barrel header (imports shared + platform-core only) | read | correct; single barrel writer (WU9) is consistent |
| `agent-namespace.builder.ts:18` (existing lane-routing import) | read | correct |
| `file-settings-keys.ts:145-148`, `:394` (laneRotation pattern) | read | correct |
| `grok-acp-profile.ts:210`, `provider-session-lane-handle.ts:132-138`, `claude-sdk-lane-runner.ts:612-614`, `lane-model-log.ts:37-39` | read | correct |
| `outcome-figures.ts:17-45`, `decision-payload.ts:42-47` | read | correct |
| `webview-e2e-harness/.../settings.fixtures.ts` exists | read | correct; project missing from gate list (Finding 3) |
| `MODEL_EFFORTS` constant | read | exists (`route-decide-result.schema.ts:191`) |

Research-report findings 1-6, the per-lane matrix and the 15 s / 8 s / 10 min / 60 s bounds all match the
citations the plan draws from them.

## Scoring math check (check items 5 and 6 of the brief)

- **D21 (`priorMode: 'blended'`):** verified. With the cap, a strong seed (80) never totals below 65 and an
  unseeded model never totals above 65, so local evidence cannot overrule it — the plan's numbers
  (`score.ts:209-215`, cap 15; blend `round(100 * (s + k * prior / 100) / (n + k))`, `k = 10`) are correct, and
  40 failed runs on a strong seed give `round(100 * 8 / 50)` = 16 under the blend. Off mode keeps the capped
  formula unchanged.
- **Single lucky run:** cannot flip a choice against a healthy default. One delivered run on an unseeded pair
  gives a blended cell of 55, plus the exploration bonus 5, total 60; a default with no evidence totals 55, and
  60 - 55 = 5 equals `CLOSENESS_BAND`, which is not a promotion (the rule needs `> 5`). A flip needs at least
  two runs, or a default whose own local evidence is poor — which is the intended cold-start, and the reason
  names it. An unknown cell scores 55, so the bonus alone never passes the band.
- **Exploration reach:** a pair exists only for models in the current catalog (4.2, FA1.5/FA4.6); at-limit
  lanes are excluded before scoring (`score.ts:216-217` throws); an explore turn requires `confirmed-room` or
  `unknown`. Exploration cannot pick a model the lane cannot run, and `k === 'review'` is excluded. The counter
  is soft under concurrency (Finding 5).
- **FA8:** no path maps silently — a native list that lacks the requested value skips it and continues the
  precedence (D18); a fallback list is only checked when no native list exists and its result is labeled
  (`fallback-mapped` / `fallback-allowlist` / `fallback-refused`); fallback and unknown lists never create
  effort pairs (D13), so a `ptah-fallback` value is never scored as native. Copilot flag detection failure is
  safe: no effort is sent, disposition `cli-has-no-effort-flag`, one warning. The one leak is Finding 1, where
  a native-empty claim is manufactured from missing data.

## Lane-introduced constraints

Every lane brief for the work units of this plan must repeat:

- No `npm run verify`, no `nx`, no build, serve, dev, e2e or package targets. Lanes run only focused checks:
  `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx tsc --noEmit --project <tsconfig>`, `npx eslint <changed files>`. The coordinator runs the inner loop
  and the full gate.
- Memory-safe rules of the root CLAUDE.md apply inside the worktree (at most one heavy check per project; never
  start a check of a project a lane is editing).
- Electron first: the settings page is checked in Electron only; the renderer stays in
  `apps/ptah-extension-webview` and `libs/frontend/chat` with no Node or Electron import.
- Implementation lanes do not commit, push or open pull requests; they report changes to the coordinator.
- Work unit boundaries: write only the files listed for the unit, at most two projects and six write files per
  unit; `lane-outcomes` and `lane-routing` meet only through `LaneOutcomeReader` in `shared`;
  `cli-agent-runtime` does not import `lane-routing`; every import goes through a project barrel.
- WU8 commits the off-mode golden test before it changes `gather.ts`, `phase-plan.ts` or `assemble-gate.ts`
  (superseded in round 2: WU0 now writes the golden test in batch 1, before any lane-routing unit lands).

---

## Round 2

Scope: the seven round-1 fixes, checked in place, plus a check that the fixes introduced no new defect.

### Per-finding table

| # | Finding (round 1) | Fixed | Evidence |
| --- | --- | --- | --- |
| 1 | Serious: Claude `supportsEffort: true` without a levels list became an empty native list, so rule 1 would silently drop the effort | yes | Rule R0 in 2.12.4 (plan lines 699-709): a list is `native` only on a positive report; a "supports effort" flag with no level list is `unknown`; an empty native list exists only on a positive "no effort". The 2.12.2 claude row now maps all four cases (`false` -> native `[]`; `true` + non-empty levels -> native; `true` + absent or empty levels -> omit, unknown; flag absent -> omit). The codex row sets `efforts` only when the server sent a non-empty `supportedReasoningEfforts`, and WU14a keeps an absent field absent (`codex-context.ts:1472` today coerces it to `[]`). New failure-table row: "Never `lane-takes-no-effort`". Claude spec cases in section 6 cover all four mappings. FA8.3 now holds. |
| 2 | Moderate: the off-mode golden test landed in WU8 (batch 5), after lane-routing was already changed | yes | New test-only WU0 writes `pipeline/route-off-golden.spec.ts` and `__fixtures__/route-off-golden.json` in batch 1, on unchanged code, before any lane-routing unit (team-leader note; WU19 is the first and starts only after WU0 is committed). WU8 now writes `route-choice.spec.ts` only ("not the golden file"). The golden builds `RouteDecideService` with today's dependencies; D25 (absent `performanceRouting` dependency means off) keeps the file edit-free. No later unit writes the golden files; a later failure is an off-mode regression. |
| 3 | Moderate: `webview-e2e-harness` was missing from the gate list but WU12b edits it | yes | Gate list now contains `webview-e2e-harness` (section 7 note). |
| 4 | Minor: `routedEffort` missing from `LaneOutcomeSummary` | yes | The summary Pick now has 14 new keys including `routedEffort` (plan line 205), matching the 14 migration columns. The reader can now derive an effort override as well as a model override. |
| 5 | Minor: exploration bound stated as exact, but the counter is soft under concurrent routes | yes | Section 4.4 step 5 now says the bound is approximate under concurrent route calls, with the mechanism; D26 records the decision and why counting at route time would be worse (slots spent on routes nobody spawns; state inside a pure score input). |
| 6 | Minor: no named truncation writer for `decisionModel`, so an over-long id would drop the row | yes | Section 2.2 names both truncation points: `RouteDecideService` truncates when it stores `RouteSpawnFacts`, and the completion writer truncates again before the row is built (the catch is now cited at `lane-completion-outcome.ts:89`). Spec cases added to `route-record.registry.spec.ts` and `lane-completion-outcome.spec.ts`. |
| 7 | Minor: wrong line cite (`:196` for `ModelEffort`) and `MAX_OUTCOME_EFFORT_LENGTH` left as a placeholder | yes | The plan now cites `route-decide-result.schema.ts:191-192` and states `MAX_OUTCOME_EFFORT_LENGTH = 32` (plan line 173). The author's correction of this review is right: `MAX_EFFORT_LENGTH` is at `agent-spawn-args.schema.ts:75`, not `:71` as my round-1 spot-check table said. Verified by grep; my round-1 line was wrong, the value was right. |

### Checks for new defects from the fixes

- **Does R0 change any off-mode route result field? No.** R0 changes only how a native effort list is
  built. In off mode the choice fields (model, effort, tier, provenance, score, source) are untouched;
  `effortCheck` is itself a new additive field, and the golden fixture carries no `efforts`, so
  `effortCheck` is absent and the 2.9 clause does not appear. R0 can change only whether `effortCheck` is
  present for a level-less model, which is an additive-field presence, not a choice field.
- **D25 (absent reader = off) cannot silently disable the feature in production.** `RouteDecideService` has
  one production construction site, `lane-routing/src/lib/di/register.ts:221`, which WU9 edits. Consumers
  (`route-tool-handlers.ts`, `host-routing.coordinator.ts`, `route-namespace.builder.ts`) resolve it through
  the token. An absent reader arises only in hand-built test instances, which is the intent of D25.
- **Work-unit constraints still hold.** WU0 adds one project (lane-routing) and two write files, both unique;
  no other unit writes them (WU8 writes a different spec file). Every unit still has at most two projects and
  six write files (WU8 still six). Batches stay file-disjoint and the dependency order stays valid; batch 1
  sequences WU19 after WU0 is committed.

### New findings (round 2)

None blocking. Two residual notes, both Minor and neither a regression from the fixes:

1. **Minor (wording).** The batch note "When two units of one project share a batch (WU5 and WU19b, WU7 and
   WU9b, WU9 and WU8b)" does not list WU0 and WU19, which share batch 1 and the lane-routing project. The
   ordering sentence ("then WU19 after WU0 is committed") covers the sequence; the team-leader should also
   defer the lane-routing project check until both end, as the note does for the listed pairs.
2. **Minor (pre-existing, not introduced by the fixes).** The numbered offer rules in 2.12.4 cover `native`
   (rules 1-3) and `unknown`/absent (rule 4) but not a `ptah-fallback` list. This is safe as written: at
   spawn, `nativeEfforts` comes from the `NativeEffortRegistry`, which returns `native` or `unknown` only, so
   a `ptah-fallback` list never reaches `resolveLaneEffort`. The cursor/opencode `lane-takes-no-effort`
   disposition is defined by the `EffortDisposition` enum ("the lane has no effort transport"). No change
   required; a one-line note in 2.12.4 would remove the question for the implementer.

## Verdict: APPROVED

All seven round-1 findings are fixed with evidence, and the fixes introduced no new Blocking or Serious
defect. The two round-2 notes are Minor and need no revision round. The plan is ready for decomposition.
