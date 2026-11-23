## Backend implementation — `TASK_2026_2310_rvlns`, batch B2

**Tasks completed**: B2 "lane store + selection blocks". That covers plan component 3 (`ReviewLaneSettingsStore`), the B2 files of component 5 (pure selection, attempt, selection service), the review-core DI and barrel edits, the Req 1.6 compatibility test, and `expected-resolvable.ts`. Nothing calls the new code yet. `review-lane.runner.ts`, `review-lane-selector.ts`, the stage runners and the gateway were not touched; they belong to B3.

**Files** (paths are relative to `D:\projects\PtahCode\.claude-worktrees\review-lane-pool\`):

- CREATED `libs\backend\review-core\src\lib\persistence\review-lane-settings.store.ts`
  - `IReviewLaneSettingsStore` (:14) and `REVIEW_LANE_SETTINGS_KEY = 'review.lanes.v1'` (:19).
  - The document schema `{version: 1, pool, pins}` is strict (:22) and reuses the pool and pins shapes of `ReviewLaneSettingsSchema`, including the duplicate check.
  - `get()` (:41):
    - A missing or null document returns new empty settings.
    - An invalid document logs a warning with schema paths only (no values) and returns empty settings.
    - A throwing `IStateStorage.get` propagates to the caller.
  - `update()` (:55) parses first and only then writes, so a rejected value never touches storage.
  - Dependencies are injected: `PLATFORM_TOKENS.STATE_STORAGE` (global) and `TOKENS.LOGGER`.
- CREATED `libs\backend\review-core\src\lib\lanes\review-lane-selection.ts`
  - Types: `ReviewLaneCandidate` {id, label, family, limitState}, `ReviewLaneSource` {list, listModels, modelBlocked}, the selection input, `ReviewLaneChoice` and `ReviewLaneSelection`.
  - `isVerifiableCatalog` (:61): a catalog counts as verifiable only if `verifiable`, `status === 'read'` and `!truncated` all hold. This is A5, checked again here.
  - `reviewLaneEntryAvailability` (:70) checks in the order Req 4.1 lists: lane-not-listed, then at-limit, then model-blocked, then model-not-offered.
  - `selectReviewLane` (:107):
    - An available pin wins, with no skip notes.
    - An unavailable pin is recorded as `source: 'pin'`, and selection carries on as if the role had no pin.
    - Candidates are the pool entries in pool order when a pool is set. Without a pool, they are every listed lane in gateway order with `model: null`.
    - Ranking is a stable sort:
      - triage: preference order;
      - lenses: families not in `avoidFamilies` first;
      - verifier: ascending `authorFamilyCounts`, ties in preference order.
    - Unavailable pool entries ranked ahead of the choice are recorded as `source: 'pool'`.
    - Global-order lanes are never recorded.
    - A set pool never falls back to lanes outside it (A11).
- CREATED `libs\backend\review-core\src\lib\lanes\review-lane-attempt.ts`
  - Exports `REVIEW_CATALOG_TIMEOUT_MS = 8_000`, `ReviewLaneSettingsUnavailableError` (message `lane-settings-unavailable`, with the original error as `cause`), `catalogLaneIds()` and the class `ReviewLaneAttempt` (not a DI class).
  - Settings and the catalog are each cached promises, so each is read at most once per attempt (A12).
  - Catalog read:
    - It is skipped when no pool entry or pin names a model, or when the attempt is already aborted.
    - Otherwise there is one `listModels` call. It is raced against an abort that fires on the attempt signal or on the 8 s timer from the injected `IReviewLaneClock`. The timer and the listener are cleared in `finally`.
    - If the read rejects, times out or returns a malformed result, there is no catalog, so saved models pass unchecked. This is logged once with a `degradation-audit: reported` marker.
    - Lane entries that fail validation are dropped.
  - `choose()` (:98):
    - It loads settings, then the catalog, then reads `source.list()` fresh and validates it with strict zod; `label` is required.
    - It builds `avoidFamilies` from `usedFamilies` plus the families of the later lenses' pins that are available in this list (Req 3.2).
    - It then calls `selectReviewLane` and returns the result together with `maxConcurrentAgents` taken from the same list.
- CREATED `libs\backend\review-core\src\lib\lanes\review-lane-selection.service.ts`
  - `@injectable() ReviewLaneSelectionService` takes `REVIEW_LANE_TOKENS.GATEWAY`, `REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE`, `REVIEW_LANE_TOKENS.CLOCK` and `TOKENS.LOGGER`.
  - `beginAttempt(signal?)` returns a new `ReviewLaneAttempt` each call.
- CREATED specs:
  - `review-lane-selection.spec.ts`: 26 tests.
  - `review-lane-attempt.spec.ts`: 13 tests.
  - `review-lane-selection.service.spec.ts`: 1 test, resolved through a real child container.
  - `persistence\review-lane-settings.store.spec.ts`: 9 tests.
- MODIFIED `libs\backend\review-core\src\di\tokens.ts:6-7`: adds `LANE_SETTINGS_STORE` and `LANE_SELECTION` (`Symbol.for('ReviewLaneSelectionService')`).
- MODIFIED `libs\backend\review-core\src\di\registration.ts`:
  - imports at :8 and :12;
  - the comment at :36-37 notes the STATE_STORAGE dependency;
  - :45-46 registers the store as a singleton plus its token;
  - :66-67 registers the selection service as a singleton plus its token.
- MODIFIED `libs\backend\review-core\src\index.ts`:
  - :21-22 exports the store, its key and version constants, and its interface type;
  - :29-31 re-exports selection, attempt and service with `export *`.
- MODIFIED `libs\backend\review-core\src\lib\persistence\review-settings.store.spec.ts`:
  - imports at :8-9 and :14;
  - a new test at :142-185 covers Req 1.6. After `updateSettings`, a lane `update` and a second `updateSettings`, the raw `settings_json` keys are exactly the `OperatorSettingsSchema` keys plus `liveGate`. Parsing it the old way (strip `liveGate`, then strict parse) succeeds.
- MODIFIED `apps\ptah-electron\src\di\expected-resolvable.ts:102-103`: adds `REVIEW_LANE_SETTINGS_STORE` and `REVIEW_LANE_SELECTION`.

**Requirement coverage at the pure seam**:

- 2.1: gateway order, at-limit skipped silently, no model sent.
- 2.2: the #1481 two-family spread with empty settings.
- 2.3: `min(N, 4)` families in pool order.
- 2.4: a single-family pool.
- 2.5: the pool entry's model is chosen.
- 2.6 / A11: no lane outside a set pool.
- 2.7 / 3.2: used families and available later-lens pins count towards diversity. An unavailable pin does not.
- 2.8: a fresh list for each role.
- 3.1 / 3.5: pins are honoured, including a verifier pin on a lens author's family.
- 3.3 / 3.4: the verifier prefers a family with no candidates, then the fewest; ties go by pool order, then global order.
- 4.1: all four reasons are checked, in order.
- 4.2: an unread, failed, empty, truncated or config-only catalog lets the model pass.
- 4.3: a pin skip note, falling back to the pool or global order.
- 4.4: pool skip notes, in order.
- 4.5: `choice: null`.

**Stack observed**:

- tsyringe with explicit `@inject` tokens (`review-lane.runner.ts`, `registration.ts`).
- zod 4 strict schemas from `@ptah-extension/review-contracts` (B1 `review-lanes.schema.ts`).
- A versioned global-state document modelled on `lane-routing/src/lib/ranking/rotation.store.ts`.
- `IStateStorage` and `PLATFORM_TOKENS.STATE_STORAGE` from `@ptah-extension/platform-core`.
- `Logger` and `TOKENS.LOGGER` from vscode-core, which review-core already uses throughout.
- Spec fake: `createMockStateStorage` from `@ptah-extension/platform-core/testing`.

**Verification** (logs are in `.ptah/tmp/b2-*.log` in the worktree; each heavy command ran under `node scripts/verify.mjs --exec`):

- `npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false --runTestsByPath <the 5 specs>`: 5 suites passed, 51 tests passed (49 new plus the existing settings-store test).
- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.lib.json`: exit 0. The same command with `tsconfig.spec.json`: exit 0.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`: exit 0.
- `npx eslint` on all 13 changed or created files: exit 0, with no output.
- `npx ts-node --transpile-only tools/di-lint/check-injects.ts` (the pre-push di-lint check): OK. All 2260 `@inject` sites resolve.
- **Not completed**: `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --runTestsByPath apps/ptah-electron/src/di/container.smoke.spec.ts` ran out of memory. The JS heap hit its default ~2 GB limit after 78 s (exit 134). I did not retry it, to protect machine memory. AS3 (the new tokens resolve in Electron) is therefore not confirmed at runtime. The coordinator should confirm it with `npm run verify -- --related -p @ptah-extension/review-core,ptah-electron`, which runs it with the Nx target's settings.
- Not run, per the brief: nx lint and typecheck for `rpc-handlers`. B2 changes no export it uses; it only adds exports.

**Decisions**:

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| The selection service gets its own token, `REVIEW_CORE_TOKENS.LANE_SELECTION` | inject by class / new token | Backend conventions say never inject by class name; the runner injects `REVIEW_LANE_TOKENS.ADMISSION` by token. Plan C5 says only "Registered as singleton". | yes |
| A settings read failure reaches B3 as a thrown `ReviewLaneSettingsUnavailableError` (message `lane-settings-unavailable`). It is cached, so every role of the attempt sees it, and no lane list is read. | typed error / result union | Plan C5 failure behaviour. The runner can map it with `instanceof` to `partial` / `lane-settings-unavailable`. A list failure is still thrown as it is today. | yes |
| The lane-list zod parse moved into `ReviewLaneAttempt.choose()`, strict, with `label` required and `ReviewLaneIdSchema` for `id`. | parse in runner / in attempt | Plan C5: `choose` returns `maxConcurrentAgents` from the same `list()`, so it owns the read and its boundary check. B3 should remove the runner's own capacity parse. | yes |
| A pool entry whose lane is not listed ranks as an unused family, so it gets rank 0 for lens and verifier ranking. | rank first / rank last | Its family is unknown. Ranking it first means the role that would have used it records the skip (Req 4.4). | yes |

**Plan deviations**:

- **`ReviewLaneSelectionService` also injects `TOKENS.LOGGER`.** The plan lists only gateway, store and clock. The attempt has to log a failed catalog read, because the degradation audit rejects an unlogged catch that returns `{}`. The attempt is not a DI class, so the service passes the logger in.
- **`choose()` takes no `signal`.** The catalog read is attempt-wide and is bound by the attempt signal passed to `beginAttempt(signal)` plus the 8 s timer. A per-role signal would let one role abort the attempt's shared catalog read. The runner keeps its existing abort checks around `choose()`.
- **The pure function takes `lanes: ReviewLaneCandidate[]`, not `ReviewLaneCapability[]`.** `ReviewLaneCapability` gains `label` and becomes an alias only in B3.
- **`selectReviewLane` takes `authorFamilyCounts` as a `ReadonlyMap`; `choose()` takes a `Record`.** This matches the plan; `choose()` converts it.
- **B3 needs to know:** `REVIEW_LANE_TOKENS.GATEWAY` is typed as `ReviewLaneSource` in the service. The current Electron gateway does not implement `listModels` or `modelBlocked` until B3. That is safe in B2 because nothing calls `beginAttempt`.

**Out-of-scope observations**:

- `git status` shows concurrent changes that are not mine: `libs/frontend/review-runs-ui/**`, `batch-B6-report.md` and `batch-B7-report.md`.
- Git warns "CRLF will be replaced by LF" on the four modified files. The working copies contain no CR bytes, so this comes from `core.autocrlf=true` only; the content is LF, like HEAD.
