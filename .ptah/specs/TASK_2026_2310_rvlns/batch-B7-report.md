## Frontend implementation — `TASK_2026_2310_rvlns`, batch B7

**Tasks completed**: B7 (plan component C14, Req 4.7 and 4.8, decisions.md D14).

**Files**:

- CREATED D:\projects\PtahCode\.claude-worktrees\review-lane-pool\libs\frontend\review-runs-ui\src\lib\components\review-stage-lane.ts — pure helpers `laneLine(stage, withFamily)` (returns `{ lane, model|null, family|null }` or null) and `fallbackNotes(stage)` (pin and pool sentences; reasons "lane not listed", "at limit", "model blocked", "model not offered").
- CREATED D:\projects\PtahCode\.claude-worktrees\review-lane-pool\libs\frontend\review-runs-ui\src\lib\components\review-stage-lane.spec.ts — 8 tests: both sentence forms, pin with and without a model, several skipped entries, all four reasons, lane default, older records.
- MODIFIED D:\projects\PtahCode\.claude-worktrees\review-lane-pool\libs\frontend\review-runs-ui\src\lib\components\review-run-detail.component.ts — lane line on pipeline cards (family appended on triage and verification) and lens cards (above the kept "Family: x · Verifier family: y" line); `Family: {family}` on a pipeline card only when `lane` is null/missing and family not null; fallback notes per skipped entry; `sameFamilyVerification()` now `findings().some(f => f.verification === 'same-family-weaker')` (D14).
- MODIFIED D:\projects\PtahCode\.claude-worktrees\review-lane-pool\libs\frontend\review-runs-ui\src\lib\components\review-run-detail.component.spec.ts — first test now passes a `same-family-weaker` finding for the badge (it relied on the old family rule); new tests: a run recorded after the change (lane, model, triage family, pin and pool fallback incl. "model blocked"); a run recorded before the change (missing keys and explicit nulls) shows family only; lane-less stages add nothing; the three D14 badge tests (shown with one `same-family-weaker` finding; hidden when the verifier family equals a lens family but no finding is marked; hidden with no findings).

**Stack observed**: Angular standalone + OnPush + signal `input()` (the existing component); Tailwind tokens from `apps/ptah-extension-webview/tailwind.config.js` (`state-need` at L34, `base-content`); contracts from `libs/backend/review-contracts/src/lib/review-run.schema.ts` (`StageRecordSchema` optional `lane`, `model`, `fallback`) and `review-lanes.schema.ts` (`ReviewLaneFallbackSchema`, reasons enum).

**Design fidelity**: design-spec.md section 6 plus the plan's "Copy changes vs approved design". Lane line `text-xs text-base-content-muted` with `font-mono` spans; `{lane} · lane default` when the model is null; fallback note `p.text-xs border-l-2 border-state-need pl-2 mt-1 text-base-content`. Reason "pinned lane disabled" dropped and "model blocked" added, as the plan says. No `alert`/`skeleton` classes added (the existing `alert alert-error` lines were left untouched; not in this batch).

**States covered**: new run (lane/model/fallback), older run (null or missing fields renders family only, no error), lane-less stages (nothing added), badge shown/hidden by findings. Notes are plain text, no new role or tooltip (per design). The lane line is `truncate` so a long model id cannot widen the card.

**Verification**:

- `node scripts/verify.mjs --exec --task b7-jest -- npx jest --config libs/frontend/review-runs-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath <review-run-detail.component.spec.ts> <review-stage-lane.spec.ts> <review-failure-display.spec.ts>` → Test Suites: 3 passed; Tests: 24 passed.
- `node scripts/verify.mjs --exec --task b7-tsc -- npx tsc --noEmit --project libs/frontend/review-runs-ui/tsconfig.spec.json` → exit 2 with 7 errors, all TS2737 (BigInt literals) in `libs/shared/src/lib/types/capability-id-codec.ts` and `libs/shared/src/lib/types/messages/attention-identity.ts`; no error in review-runs-ui or in any changed file. These come from the shared lib under this tsconfig's target, not from B7.
- `npx eslint <4 changed files>` → 0 errors, 26 warnings, all `explicit-member-accessibility` in `review-run-detail.component.ts` (the existing methods; the two new methods follow the file's local style).
- Not run (coordinator): `typecheck-templates -p ptah-extension-webview` (template changed; nx not allowed for this lane) and the nx inner loop/gate.

**Plan deviations**:

- `laneLine` returns structured parts instead of a string so the template can wrap lane and model in `font-mono` spans as design section 6 requires.
- A fallback on a stage with no lane (every entry skipped) ends "No lane ran." instead of "Ran on {lane}." The design has no copy for this case; the backend may record skipped entries on a role that ended `no-confirmed-room`. Reversible.

## Decisions

- "No lane ran." sentence end for a fallback without a ran lane. Options: omit the note, show a broken "Ran on ." sentence, or this text. Evidence: design-spec.md section 6 covers only a ran lane; Req 4.5 keeps `no-confirmed-room`. Reversible.

**Out-of-scope observations**: `tsconfig.spec.json` of review-runs-ui pulls `libs/shared` BigInt sources that fail under its target (pre-existing). The detail's existing `alert alert-error` raw classes remain (not in B7).
