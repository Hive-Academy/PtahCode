# Lane brief — resolve lane-routing merge conflicts (TASK_2026_2325_899d, D23)

Read first: TF/lane-brief-common.md (short, binding). Ignore its "plan" paragraph: you do not
need the plan.
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d

## Situation
The coordinator ran `git merge origin/main` on branch feat/skill-judge. The merge is in
progress. Four files have conflict markers. Do NOT run any git command that changes state
(no add, commit, merge --abort, checkout, restore, stash, reset). Read-only git is allowed:
`git diff`, `git show :2:<path>` (ours), `git show :3:<path>` (theirs), `git log`.

- OURS (HEAD) = commit 362f89a76 "feat(lane-routing): report provider dispatch and keep blocked
  pair". It adds: `OpenedCaller` blocked `configuredPair`; `DecisionCaller` supplies `provider`
  on the system-one dispatch; `runFixedRequest` gets optional `signal` and
  `onProviderSubmit(submitted: ModelPair)` (overloads: without a signal the cause type stays
  the original type; with a signal the cause may be `cancelled`); `callSystemOne` /
  `callStructured` check abort before submission and call `onProviderSubmit` synchronously
  just before the provider call; structured completer gets the caller signal combined with its
  dispatch timeout. Report: TF/batch-G-Lane-Routing-Dispatch-report.md.
- THEIRS (origin/main) = PR #1511 (fix/route-decide-predictability). It adds: decision budget
  and `admission` on the system-one dispatch (rate admission, `model-busy`, `deadline`,
  `timeoutCapMs` passed to `caller.decide(payload, timeoutCapMs)`, token metrics,
  `logInputTokens`), `requestReason`, `questionCap`, `optionCapOffered`, `prunedLanes`,
  `FallbackCause` / `PrunedCause` types, `DECISION_QUESTIONS_PER_CALL`.

## Objective
Resolve every conflict so BOTH behaviors work together. Keep all of THEIRS. Re-apply OURS on
top:
- Cause types: keep their `FallbackCause` and add our `cancelled` the same way ours did (generic
  `ModelRequestCause` / overloads), so no-signal callers keep the original type.
- `emptyOutcome(cause, requestReason?)` keeps their `requestReason` and our generic cause.
- `ModelDispatch` system-one variant has both `provider?` and `admission?`.
- `callSystemOne`: their admission flow stays. Our abort check (return `cancelled` if the caller
  signal is aborted) and `onProviderSubmit(pair)` run immediately before `caller.decide(...)`,
  after admission succeeds (only a real submission reports a pair). Pass both
  `submission` (pair, signal, onProviderSubmit) and their metrics through a clear signature.
- `runFixedRequest`: keep their `questionCap` and their comment, keep our overloads,
  `signal`, `onProviderSubmit`, and the pre-abort check after the size check.
- `decision-caller.ts`: keep their budget/factory/admission code and our `provider:
  caller.provider` field.
- `model-call.spec.ts`: keep the tests of both sides; fix their call signatures if needed.

Files (write only these four, LR = libs/backend/lane-routing/src/lib/):
LR decision-model/decision-caller.ts, LR pipeline/model-refine.ts, LR pipeline/model-call.ts,
LR pipeline/model-call.spec.ts. You may read any lane-routing file. If another lane-routing
file fails to compile because of the merge, you may fix it too and list it in the report.

## Checks (lane only)
- `grep -rn '^<<<<<<<\|^>>>>>>>\|^=======$' libs/backend/lane-routing/src` returns nothing.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json` (if it exists)
- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  (drop a path that does not exist)
- `npx eslint <the files you changed>`
Never `npm run verify` or `nx`. Never commit or push.

**Deliverable**: TF/batch-merge-lane-routing-report.md (skeleton first). Sections: files and
hunks resolved with the choice per hunk; checks with results; `## Decisions`; open items.
Reply: `WROTE: <absolute path>` plus one headline line.
