# P1 code-logic review — slice C
Reviewer family: claude (CLI lane, opus). Implementer families of this slice: codex (G-Runner-And-Extract,
G-Skills-Judge, G-Skills-Draft-And-Fs completion, G-Skills-Rec-And-DI revise 1, G-Setup-RPC-Integration),
antigravity (G-Skills-Rec-And-DI), kimi (G-Guidance-Backend, G-Generation-Handlers, G-Skills-Draft-And-Fs
start), Ollama Code (preview-fidelity fixture D27, G-Skills-Ranking-Delete).

Scope: `git diff main -- libs/backend/rpc-handlers` (working tree, including the uncommitted
G-Skills-Ranking-Delete). Production files read in full: skill-judge.service.ts/.schema.ts/.types.ts,
skill-recommendation.service.ts, skill-draft-generation.service.ts, skill-json-extract.ts. Diff hunks read:
setup-rpc.handlers.ts, harness-llm-runner.service.ts, harness-fs.service.ts, settings-rpc.handlers.ts,
wizard-generation-rpc.handlers.ts, wizard-generation-binding.ts, wizard-generation-checkpoint.service.ts,
enhanced-prompts-rpc.handlers.ts, di/register.ts, di/tokens.ts, index.ts, services/index.ts.

## Verdict: REVISE   Score: 7/10

One Major defect: `wizard:set-setup-model` can report a failure after the commit succeeded. The rest
of the deadline chain, the pair attribution and the typed errors agree with the plan. Score 7, not 8,
because of the Major item. Score 7, not 6, because the core judge logic, the per-item validation and the
deadline chain are correct, and 161 focused tests pass.

## Findings

1. [Major] `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:408-409` — after
   `commitSetupPair` succeeds, the handler calls `this.resolveSetup(workspaceRoot)` again for `state`.
   `resolveSetup` converts every exception and its 15 s timeout to `RpcUserError(SETUP_MODEL_INVALID)`
   (`:353-371`). Thus a slow or failed resolver after a good commit gives an RPC error. The new pair is on
   disk, but the renderer gets no `committed` receipt and no `commitSeq`. It cannot bind the Undo target
   (plan 3.2, lines 369-375), and it shows "could not be resolved" for a save that succeeded. That is the
   inverse of the "no false success" rule: a false failure. `commitSeq` is also consumed with no response,
   which is harmless but shows the order problem. Fix: after the commit, do not throw. Catch the second
   resolution and return `{ committed, commitSeq, state }` with a non-throwing state, for example
   `{ kind: 'unavailable', source, cause }`, or the pre-commit validation result for a set pair. Add a
   spec: "post-commit resolution failure still returns the committed receipt".

2. [Minor] `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:647-653`
   — the backstop paths of `runJudgeWithDeadline` discard all judge state. A hard-deadline hit
   (`+70 s`) gives Decision `skipped/timed-out`, and an unexpected throw gives Decision
   `skipped/unavailable` with Normal `failed/provider-error`. Decision may already have run and
   produced verdicts and `pairUsed`. The Normal `pairAttempted` is also lost. This misreports R14 stage
   records (the banner shows "skipped" for a stage that ran). The probability is low because
   `SkillJudgeService` caps Normal at `rpcEntry + 65 s` with its own timer. Fix: label the fallback
   Decision record `failed` (not `skipped`), or let `judge()` return a partial result that the outer race
   keeps.

3. [Minor] `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.ts:216-223` — in the
   catch block, `abortController.signal.aborted` overrides `submitted`. An abort while the request waits
   for a slot, or before submission, is broadcast and logged as `timed-out` ("The AI request timed out").
   Plan Revision 3 line 398 requires `queue-timed-out` or `pre-dispatch-error` when no submission
   occurred. The judge classifies its own stage record correctly (`skill-judge.service.ts:650-661`), so
   only the stream broadcast and the warn log are wrong. Fix: use `timed-out` only when
   `submitted && aborted`, and `pre-dispatch-error` when `!submitted && aborted`.

4. [Minor] `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.ts:183` —
   the model `description` goes to `serializeSkillDocument` with only `trim()`. The serializer escapes
   only `"` and `\n` (`libs/shared/src/lib/utils/skill-document.ts:29-32`). A `\r`, another control
   character or a backslash (for example `C:\path` or `\d`) in the AI description gives an invalid YAML
   double-quoted scalar. Preview and Create stay byte-identical, but the written SKILL.md can fail to
   parse in skill discovery. Before this task this writer received only user-typed text. Fix: in the
   draft service, replace control characters with a space and remove or double backslashes in the
   description before serialization (the shared writer must stay byte-compatible, so do it here).

5. [Minor] `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.ts:300` — unreferenced
   Build outcomes always get unique proposal IDs, also with equal names (this agrees with plan line 126).
   Two proposals can therefore have the same `skillDocumentSlug`. `HarnessFsService.createSkillPlugin`
   (`harness-fs.service.ts:96-121`) writes both to the same `ptah-harness-<slug>` directory, so the second
   Create silently replaces the first draft. Not a plan violation, but no layer guards it. Fix: the
   renderer (or `wizard:generate-skill-draft`) should detect a slug that is already used in the run and
   ask first, or suffix the slug.

6. [Minor] `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:152` — `buildReasons` has a
   per-entry limit (2,000 characters) but no count limit. With `items.max(30)` the prompt size is still
   unbounded from the renderer. Fix: add `.max(n)` (for example 10) to the array.

7. [Minor] `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:178-188` — the
   `SETUP_MODEL_INVALID` message names the source and the cause, but not the provider. Plan line 135 says
   "naming Setup provider" and R13 says "An error names the provider". The renderer can get the pair from
   `wizard:get-setup-model`, so the impact is small. Fix: add the stored provider ID (not a secret) when
   the resolution has it, or confirm that the renderer names it.

### ESLint warnings (D30)
- `setup-rpc.handlers.ts:282` `preserve-caught-error`: in `resolveService`, which this diff does not
  change. Not a task defect. Note that this pre-existing throw puts the raw DI error `message` into an
  `Error` that can reach the RPC caller. Leave it out of this task.
- `setup-rpc.handlers.ts` `max-lines` (1,777 lines, limit 700): the file was already over the limit, and
  the task adds about 200 lines. Accept for this task. Add a future enhancement to move the Setup model and
  draft handlers into their own handler class.

## Write-path trace
- `setup.provider` + `setup.model`: `wizard:set-setup-model` (`setup-rpc.handlers.ts:384-411`) →
  validation through `validateSetupPair` (both empty → skip, partial → `invalid`) →
  `WorkspaceScopeResolver.commitSetupPair` (`settings-core/src/scope/workspace-scope-resolver.ts:417-460`)
  → `writeGlobalBatch` (one atomic global slice, both keys) → receipt from the committed slice. Runtime
  reader: `WorkspaceLlmResolver.resolveSetup` → `scope.readSetupPair()` (`auth-providers/.../
  workspace-llm-resolver.ts:157`, global-only, partial values preserved as invalid). Key, scope (global)
  and format (trimmed strings, `''` = clear) agree. Side effect: none other than the post-commit
  resolution (finding 1).
- `settings:set` denies both keys (`settings-rpc.handlers.ts:81-85,214-219`), so no non-atomic write
  path exists through the generic setter. `settings:import` was not traced (see Not checked).
- Generation checkpoint: `recordEffectivePair` (`wizard-generation-checkpoint.service.ts:479-496`) writes
  only provider and model IDs, no credentials or options. `input.model` is no longer written, and retries
  reuse `lastGenerationInputs` with `model` and `setupSnapshot` removed
  (`wizard-generation-rpc.handlers.ts:686-689`). This agrees with D6/D7.

## Checked and OK
- Deadline chain (D28, one clock `Date.now()`): `rpcEntry` is the first statement of
  `wizard:recommend-analysis-skills` (`setup-rpc.handlers.ts:847`). Pre-search `+6 s` covers Setup
  resolution and the saved-analysis load through `beforeDeadline` (timer cleared in `finally`). Search
  `+26 s`, 4 workers, 8 s per term, no new term below 500 ms, `searchSettled` guard against late writes,
  started-but-unfinished terms → `search-failed/timed-out`, unstarted → `not-searched/budget-exceeded`.
  Decision gets `rpcEntry` (its `+31 s` cap is in lane-routing, slice B). Normal deadline
  `min(now + 45 s, rpcEntry + 65 s)`, skip below 5 s (`skill-judge.service.ts:530-535`). Hard `+70 s`
  outer race. Every timer is cleared in a `finally`. No negative budget reaches `setTimeout`
  (`Math.max(0, …)`).
- Late output: stage records are built from copies of `trace` at return time, so runner writes after the
  outer timer cannot change a returned record. `Promise.race` keeps the rejection of the losing `run()`
  handled.
- Normal attribution: `pairUsed` only after `terminal?.kind === 'success'`, `trace.pairUsed` set by the
  runner, and at least one valid item (`:614-646`). `queue-timed-out` only for
  `InternalQueryQueueTimeoutError` without `pairAttempted` (`:650-655`). Outer timer → `timed-out`,
  `pairAttempted` only when the runner recorded a submission. `pre-dispatch-error` never keeps
  `pairAttempted` (`stageRecord`, `:352-365`). Decision failed records keep only the plan-allowed pairs.
- Per-item validation: permissive transport schema, unknown IDs ignored, duplicate IDs invalid,
  `no-skill` cannot combine, Install needs `registry === 'matched'`, an eligible case-normalized ID and
  no duplicates. A bad item does not invalidate siblings (structured and text paths, `extractJsonObject`
  fallback).
- Build grouping: same `proposalRef` merges only on equal slug and normalized description, conflicts
  split to `build:<ref>#n`, collision loop against generated IDs (`:329-340`).
- Typed RPC errors: `SETUP_MODEL_INVALID` before the broad `try`; `ANALYSIS_LOAD_FAILED` for a rejection
  or timeout of `loadByRunId`; `SKILLS_RECOMMEND_FAILED` for an unexpected throw, `RpcUserError`
  re-thrown. Missing run or empty summary stays an empty success with a warning (plan 3.8).
- `wizard:generate-skill-draft`: strict zod input with control-character and bidi sanitization, typed
  failures, no disk write, `toolAccess: 'none'`. Preview uses `normalizeDraftBody` once and
  `serializeSkillDocument({ name: slug, description, body })`; `createSkillPlugin` uses the same
  serializer, so Preview and Create are byte-identical for unchanged values.
- No raw provider error or secret in UI-facing results or logs in the new code: runner broadcasts fixed
  messages; judge, draft and recommendation log only categories; Setup error text uses enum causes.
- Legacy removal: no reference to `SKILL_RANKING_SERVICE` or `SkillRankingService` remains outside
  lane-routing.
- Focused tests (`npx jest --runInBand --coverage=false --runTestsByPath`): skill-judge, skill-recommendation,
  skill-draft-generation, setup-rpc.handlers, harness-llm-runner → 5 suites, 161 tests pass.
  ESLint on setup-rpc.handlers.ts: 0 errors, 2 warnings (above).

## Not checked
- Spec quality in depth (spec files read only through test names and the passing run).
- `settings:import` path for `setup.*` keys, and `PtahFileSettingsManager.setMany` internals (slice A).
- Lane-routing `SkillRankingCallerService` Decision cap and its pair trace (slice B).
- `wizard:retry-item`: whether `recordEffectivePair` (`wizard-generation-rpc.handlers.ts:1369-1373`) can
  write a pair for a retry that `runs.run` then refuses as busy.
- Other `HarnessLlmRunner` callers that now get a `success=false` broadcast on a non-success terminal
  while they still return output.
- Renderer consumers of the results (later phase).

## Re-review round 1

Scope: `git show a953fc030 13fcde258` (production files and specs) and the serializer part of
`ac0edd9d7`. Checks: `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` (0 errors),
and 5 focused suites (setup-rpc, skill-draft-generation, skill-recommendation, harness-llm-runner,
skill-judge): 167 of 167 tests pass.

| ID | Status | Evidence |
| --- | --- | --- |
| C1 | Closed | `setup-rpc.handlers.ts:434-449` — after `commitSetupPair`, a failure of the second `resolveSetup` is caught and logged with a fixed message. The handler returns `{ committed, state, commitSeq }` with an `unavailable` state that agrees with `SetupPairState` (`rpc-skill-judge.types.ts:25-31`). A pre-commit failure still throws (`:416-428`). New spec covers the case. |
| C2 | Closed | `skill-recommendation.service.ts:650` and `:654` — the hard-deadline and throw backstops now record Decision as `failed`, not `skipped`. The "judge not configured" path (`:625`) and the "deadline already passed before start" path (`:631`) stay `skipped`, which is correct because Decision did not run. `pairAttempted` is still lost in the backstop. This is the accepted option of the fix, and the probability is low. |
| C3 | Closed | `harness-llm-runner.service.ts:219` — `timed-out` now needs `submitted && aborted`. An abort before submission falls to `queue-timed-out` (only `InternalQueryQueueTimeoutError`) or `pre-dispatch-error`. The A1 change (`:176`, `auth: { ...auth, providerId }`) gives the SDK the snapshot provider ID, and `sdk-query-runner.service.ts:508` prefers it. |
| C4 | Closed | `skill-draft-generation.service.ts:68-73,190-191` replaces CR, LF, control and bidi characters with a space and rejects an empty result as `invalid-output`. `skill-document.ts:22-28` (ac0edd9d7) escapes the backslash first, then `"`, CR and LF, for name and description. Preview and Create still use the same serializer, so byte equality holds. |
| C5 | Deferred | Coordinator triage moves it to the frontend phase (the renderer detects a used slug and asks before Create). No backend change. Re-check in the frontend review. |
| C6 | Closed | `setup-rpc.handlers.ts:152` — `buildReasons` has `.max(10)`. A larger array gives `INVALID_PARAMS`. |
| C7 | Closed | `setup-rpc.handlers.ts:178-213` — `setupModelError` names the provider from the resolution or from the pair under validation. `sanitizeProviderId` removes control and bidi characters and limits the ID to 64 characters. A provider ID is not a secret. When the stored-pair resolver throws with no pair, the message has no provider. That case has no provider data to give, so it is acceptable. |

### New defects from the fixes

No Major or Minor defect found.

- [Nit] `setup-rpc.handlers.ts:440-446` — when the user clears the pair (`committed === null`) and the
  second resolution fails, the fallback state is `{ kind: 'unavailable', source: 'workspace',
  provider: '', model: '' }`. The type allows it, but the renderer can show an empty provider name.
  The renderer should treat an empty provider as "workspace default". No backend change is necessary.
- [Nit] The `ac0edd9d7` serializer escapes backslashes, but `validateSkillDocument` and any
  frontmatter reader must decode `\\` and `\r` as YAML does. A YAML double-quoted scalar decodes both,
  so the files are valid. I did not trace a custom reader in skill discovery (out of slice C).

## Verdict (round 1): APPROVED   Score: 8/10

All accepted findings (C1, C2, C3, C4, C6, C7) are closed with file:line evidence and specs. C5 is
deferred to the frontend phase. Score 8, not 9, because the backstop still drops the partial judge
state (`pairAttempted`) and C5 has no guard yet. Score 8, not 7, because the Major false-failure path
is closed and no new Major or Minor defect appears.
