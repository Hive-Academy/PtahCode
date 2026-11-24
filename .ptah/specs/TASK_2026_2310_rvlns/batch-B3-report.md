## Backend implementation — `TASK_2026_2310_rvlns`, batch B3

**Tasks completed**: B3 "runtime wiring": plan components C4 (port widening), C5-B3 (runner, selector rewrite, old selector spec deleted), C6 (stage runners + orchestrator), C7 (stage lane persistence + run query), C8 (Electron gateway, DI resolver, `findBlockedLaneModel` export). Nothing under `libs/frontend/**` and no RPC file (B4) was touched. No git was run.

Skills: `resilient-nestjs-patterns` was not loaded (optional; this repository uses tsyringe, and the plan already applied its general rules: bounded catalog read, explicit fallback, no retry of a started lane).

**Files** (relative to `D:\projects\PtahCode\.claude-worktrees\review-lane-pool\`):

- MODIFIED `libs\backend\review-core\src\lib\lanes\review-lane.runner.ts`
  - :19 `IReviewLaneGateway extends ReviewLaneSource` (list with `label`, `listModels`, `modelBlocked`) plus `spawn({ laneId, model?, cwd, prompt, signal })`.
  - :25 `ReviewLaneUseSchema` / `ReviewLaneUse` `{ lane, model, family, fallback }` (zod, used by lens checkpoints and persistence).
  - Request: `attempt` (required), `usedFamilies`, `laterLenses`, `authorFamilyCounts`; `lensAuthorFamily` removed (A10). Result: optional `lane`; runner-level `evidenceStrength` removed.
  - :114 `choose()`: one `attempt.choose()` per role (fresh list, maxConcurrentAgents from the same read; the runner's own capacity parse is gone). `ReviewLaneSettingsUnavailableError` -> `partial` / `lane-settings-unavailable`, logged once per attempt through a `WeakSet` (:75); any other error (lane list failure) is thrown as before.
  - `lane` is attached to every result once selection ran (completed, no-confirmed-room, admission partial, deadline/abort after selection, lane failure); absent when the role stopped before selection.
  - :164 spawn passes `model` only when the choice has one.
- REWRITTEN `libs\backend\review-core\src\lib\lanes\review-lane-selector.ts`: only `ReviewLaneKind`, `LaneLimitState`, `ReviewLaneCapability = ReviewLaneCandidate`. Class `ReviewLaneSelector` removed.
- DELETED `libs\backend\review-core\src\lib\lanes\review-lane-selector.spec.ts`.
- CREATED `libs\backend\review-core\src\lib\stages\review-stage-keys.ts`: `TRIAGE_STAGE {triage,1}`, `VERIFICATION_STAGE {verification,3}`.
- MODIFIED `stages\triage-stage.runner.ts`: injects `REVIEW_CORE_TOKENS.REVIEW_REPOSITORY`; `run(claim, context, deadline, attempt, signal)`; `saveStageLane(attemptId, 'triage', 1, lane)` (:26) when a lane use exists and not aborted.
- MODIFIED `stages\lens-stage.runner.ts`: `ResultSchema` gains optional `lane` (pre-change checkpoints still parse); `usedFamilies()` (:30) = `lane?.family ?? completed family` over reused and new results; `laterLenses` = lenses after the current one (:63); `saveStageLane` before the completion `saveStage` (:65); signature `run(claim, context, deadline, attempt, signal, onCompleted)`.
- MODIFIED `stages\verification-stage.runner.ts`: `authorFamilyCounts()` (:72) over the merged candidates; passed in the request; `saveStageLane('verification', 3, batch.lane)` (:117); last constructor param `@inject(REVIEW_REPOSITORY) stages: IReviewRepository | null = null` (:83); signature `run(claim, context, lenses, deadline, attempt, signal)`. Per-candidate `same-family-weaker` marking unchanged.
- MODIFIED `stages\publication-stage.runner.ts`: new last param `triageFamily: string | null = null` (:31); summary family = `triageCompleted && triageFamily ? triageFamily : 'unavailable'` (:67). `grep coordinator` on the file is empty.
- MODIFIED `review-orchestrator.service.ts`: injects `REVIEW_CORE_TOKENS.LANE_SELECTION` (:68, before the optional `statuses`); `beginAttempt(signal)` once per attempt after the context stage (:247), passed to triage, lenses, verification; stage keys used for triage/verification; publication gets `completedTriageFamily(triage)` (:37, zod `safeParse`, works for a reused checkpoint too) (:278).
- MODIFIED `persistence\review-repository.interface.ts:62`: `saveStageLane(attemptId, stage, ordinal, use)`.
- MODIFIED `persistence\sqlite-review.repository.ts:314`: one transaction: `UPDATE review_stages SET family = ?` on the stage row, and the existing checkpoint upsert (now the shared `UPSERT_CHECKPOINT` constant) for `checkpoint:lane:<stage>` with `{ version: 1, lane, model, family, fallback }`. Static SQL, bound parameters. Exports `REVIEW_STAGE_LANE_RECORD_VERSION`.
- MODIFIED `persistence\review-query.repository.ts`: `ordinal` added to the stage SELECT and `stageSchema` (:30, :68); `stageLanes()` (:98) reads `checkpoint:lane:%` rows of the attempt once per run, parses each with a lenient zod pipe (invalid JSON or shape -> ignored, no throw), keys `<stage>#<ordinal>`; stages get `lane`, `model`, `fallback` (null without a record). `family` still from the column.
- MODIFIED `apps\ptah-electron\src\services\review\review-lane-gateway.ts`
  - :16 spawn schema gains `model` (trim, 1-200, strict kept); `runLane` passes `...(model ? { model } : {})` to `manager.spawn` (typed field, never argv text).
  - :59 `labelOf` = trimmed `ptahCliName` or the lane id (A4), capped at 128; `list()` returns `label`.
  - :123 `listModels`: no listing resolver or no ids -> `{}`; listed requested lanes only; each read raced against the signal by `untilAborted` (:26; listener removed on settle, a late result is dropped, a late rejection is consumed); `Promise.allSettled`; `catalogOf` (:37) drops ids failing `ReviewModelIdSchema`, blocked ids and duplicates, truncates to `REVIEW_LANE_CATALOG_MAX` with `truncated`, `verifiable = !truncated && some kept entry is 'reported'`; empty -> `empty`; rejected/aborted -> `failed`.
  - :138 `modelBlocked(model)` = `findBlockedLaneModel(model) !== undefined`.
  - Constructor gains last param `getModelListing?`.
- MODIFIED `apps\ptah-electron\src\di\phase-2-libraries.ts:598-609`: resolver for `LANE_ROUTING_TOKENS.LANE_MODEL_LISTING`, try/catch + warn with a `degradation-audit: reported` marker (same pattern as the registry resolver); `type LaneModelListing` import added to the existing lane-routing import.
- MODIFIED `libs\backend\cli-agent-runtime\src\index.ts:169`: exports `findBlockedLaneModel`.
- Specs:
  - `lanes\review-lane.runner.spec.ts`: fake gateway gains `label`/`listModels`/`modelBlocked`; runs through a real `ReviewLaneAttempt`; exact expectations include `lane`; the old `lensAuthorFamily`/`evidenceStrength` test replaced by: pool model on spawn + lane use on completed, no `model` key with lane default, lane use on a failed lane, no-confirmed-room with pool skip notes, settings unavailable (no list read, no spawn, one log across two roles), list failure thrown, verifier author counts with no `evidenceStrength`, lens `usedFamilies` diversity. 30 tests.
  - `stages\lens-stage.runner.spec.ts`: existing checkpoint test kept (+ attempt passed through); new "#1481" describe with a **real `ReviewLaneRunner` + real `ReviewLaneAttempt` + fake gateway** and in-memory repository (records `saveStageLane` and call order): empty settings spread codex/claude/gemini/codex with no model (2.1, 2.2, settings read once); pool order + models + lanes outside pool unused (2.3, 2.5, 2.6); single-family pool (2.4); reused pre-change checkpoint family counts (2.7); at-limit between lenses (2.8); pin honoured and counted for earlier and later lenses (3.1, 3.2); unavailable pin reasons `lane-not-listed` / `model-blocked` and lane record before completion row (4.1, 4.3); pool skip notes in order incl. `model-not-offered` from a verifiable catalog (4.4); unreadable catalog passes saved model (4.2); no lane -> `no-confirmed-room` + record (4.5); started lane failure not retried and its family still counts (4.6).
  - `stages\verification-stage.runner.spec.ts`: existing tests pass an idle attempt; new "#1481" describe through the real runner: avoids every author family (3.3), fewest-candidates family (3.4), tie by pool order then global order, pinned verifier on an author family keeps `same-family-weaker` (3.5), no verifier lane -> all `unavailable` with pin + pool skip notes recorded on `verification#3`.
  - `stages\publication-stage.runner.spec.ts`: triage family in the summary, `unavailable` when triage did not complete, no `coordinator` (3.6).
  - `review-orchestrator.service.spec.ts`: repository fake gains `saveStageLane`; constructor gets the selection service; new tests: one `beginAttempt(signal)` per attempt, the same attempt to triage/lenses/verifier, triage family `'claude'` / `null` to publication.
  - `persistence\sqlite-review.repository.spec.ts`: family written, lane record round trip, survives a later `saveStage`, does not shadow the stage checkpoint (4.7).
  - `persistence\review-query.repository.spec.ts`: lane/model/fallback projected by stage+ordinal, wrong-ordinal and invalid-JSON records ignored, older run renders nulls, lane rows not listed as stages (4.7, 4.8).
  - `apps\ptah-electron\src\services\review\review-lane-gateway.spec.ts`: label for both row kinds; model forwarded / omitted / over-long rejected; read/empty/failed mapping with blocked and invalid ids dropped; config-only list not verifiable; 600-id list truncated to 500, unverifiable; never-settling listing fails on abort while the other lane is read; no listing -> `{}`; `modelBlocked`. `findBlockedLaneModel` is jest-mocked to a spec-local id so the spec does not depend on the product block list.
  - `testing\dry-run-fixture.spec.ts`: passes a stub selection service to the orchestrator constructor (see deviations).

**Stack observed**: tsyringe with explicit `@inject` tokens (`review-orchestrator.service.ts`, `di/registration.ts:67` registers `REVIEW_CORE_TOKENS.LANE_SELECTION`); zod 4 at boundaries (`review-lanes.schema.ts`); better-sqlite3 prepared statements in transactions (`sqlite-review.repository.ts`); Electron gateway built by a `useFactory` with lazy resolvers (`phase-2-libraries.ts:566`); `LaneModelListing` port from `@ptah-extension/lane-routing` (`lane-model-listing.port.ts:10`).

**Verification** (every heavy command under `node scripts/verify.mjs --exec`; logs in `.ptah/tmp/b3-*.log`):

- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.lib.json`: exit 0. Same with `tsconfig.spec.json`: exit 0.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0. Also `rpc-handlers` and `cli-engine` `tsconfig.lib.json`: exit 0.
- `npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false` (whole review-core project, 36 suites): 36 passed, 335 tests passed.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/services/review/review-lane-gateway.spec.ts`: 14 passed (ts-jest also type-checks the spec).
- `NODE_OPTIONS=--max-old-space-size=4096 npx jest ... --runTestsByPath apps/ptah-electron/src/di/container.smoke.spec.ts`: 67/67 passed; process exit 1 from "require a file after the Jest environment has been torn down" (late settings-manager logging), the same exit-1 pattern recorded as identical on main in decisions.md D17.
- `npx eslint <24 changed files>`: exit 0, 0 errors, 4 warnings, none new in kind: `phase-2-libraries.ts` max-lines (833; it was already over 700 before this batch), two `preserve-caught-error` on the runner's existing `throw new Error('output-missing')` lines, one existing unused `_saveError` in the orchestrator.
- `npx ts-node --transpile-only tools/di-lint/check-injects.ts`: OK, 2263 `@inject` sites resolve.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: TOTAL 0 unsuppressed sites.
- Not run (per brief): `npm run verify`, nx targets, builds. The coordinator's `--related` / lint+typecheck gate for review-core, ptah-electron, cli-agent-runtime, rpc-handlers, cli-engine is still due. The Electron `tsconfig.spec.json` was not type-checked as a whole (only the changed spec via ts-jest and the DI smoke suite).
- Migrations: no file under `libs/backend/persistence-sqlite/` changed (A1/A2).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| `lane` is attached to every result once selection ran, including deadline/abort/admission partials after the choice; absent before selection and for `lane-settings-unavailable` | only on spawned lanes / once selection ran | Plan C5: "Every result (completed and partial, including no-confirmed-room) carries lane ... Aborted/deadline results before a choice carry lane: undefined". The run detail then names the lane the role was given | yes |
| Settings-read failure is logged once per attempt via a `WeakSet<ReviewLaneAttempt>` in the singleton runner | log per role / once per attempt | Plan C5 "logged once via the runner's logger"; the attempt caches the rejection so every role sees it; a WeakSet needs no release path | yes |
| `ReviewLaneUseSchema` lives in `review-lane.runner.ts` (next to `ReviewLaneResult`) | runner / selection file (B2-owned) / new file | Plan C6 "`ReviewLaneUse` zod in review-core"; the runner owns the result type; B2 files are outside this write set | yes |
| Selection service is a required orchestrator parameter placed before the optional `statuses` | last optional / required before `statuses` | An optional selection service would need a no-lane fallback the plan does not define; a required parameter cannot follow an optional one | yes |
| The lane record rows are read by a lenient zod pipe (JSON.parse inside `transform`, issue + `z.NEVER` on failure) | try/catch returning null / zod pipe | Plan C7 "invalid -> ignored"; the degradation audit flags a catch that returns a literal; the pipe reports an issue instead | yes |
| The triage family for publication comes from the triage stage value (`completedTriageFamily`), not from the lane record | stage value / lane record | The value is available for fresh and reused checkpoints; pre-change checkpoints carry `family` too | yes |

**Plan deviations**:

- `libs\backend\review-core\src\lib\testing\dry-run-fixture.spec.ts` was edited (not in the plan's B3 file list): it constructs `ReviewOrchestratorService` positionally and would not compile with the new required selection-service parameter. The edit only adds a stub `ReviewLaneSelectionService` whose `beginAttempt` returns an idle attempt.
- `stages\context-stage.runner.spec.ts` and `status\review-status-coordinator.service.spec.ts` were **not** edited although the plan lists them as repository fakes: both build `IReviewRepository` with `Object.create(null) as IReviewRepository`, so the new method does not break them (tsc spec exit 0, suites pass).
- No `stages/triage-stage.runner.spec.ts` was created (plan says "if absent"): triage's lane wiring is a four-line delegation covered by the orchestrator spec (attempt passed) and the runner/lens seam (lane use content). Say if a dedicated spec is wanted.
- `VerificationStageRunner`'s new repository field is named `stages`, because `run()` already has a local `repository` (the publication outbox repository).
- The plan names the attempt parameter `lanes`; the stage runners call it `attempt` (`lanes` is already the runner field name). The orchestrator's local is still `lanes`.

**Out-of-scope observations**:

- `ReviewLaneAttempt.readCatalog` (B2) leaves its `stopped` promise and its controller `abort` listener pending when the catalog read wins the race; it is released with the attempt (no timer left), so no leak beyond the attempt's lifetime. Not changed (B2 file).
- When `LANE_ROUTING_TOKENS.LANE_MODEL_LISTING` is not registered, the gateway resolver logs a warn on each `listModels` call (once per attempt that saved models). Matches the registry resolver pattern; not a correctness issue.
- `git status` still shows the coordinator's own `batches.md` / `decisions.md` changes; untouched.
