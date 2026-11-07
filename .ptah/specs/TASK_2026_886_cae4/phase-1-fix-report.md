# Phase 1 fix report — TASK_2026_886_cae4, review fix round 1

Base head: 300e39e29. No git commands were run. Nothing was committed, staged or stashed. `batches.md`, `task.md` and `src/index.ts` were not edited.

## Files

Modified:
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/index-request.step.ts — L1 (start before coalesce) and L2 (`comparablePath` fails closed)
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/index-request.step.spec.ts — L1 and L2 specs
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts — S1: now only the orchestrator (1,046 → 810 lines). Helpers are imported from the new modules.
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.spec.ts — end-to-end L3 spec

Created (all in `dispose/`):
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/fs-probe.ts — `isMissing`, `realpathOrNull`. These were moved unchanged and are shared by the collector, the reader and the resolver.
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/task-spec.reader.ts — carrier and context reads: `readCarrier`, `readCarrierFile`, `readContextWorktreeLine`, `ContextLine`, `worktreeLinePath`, `readdirOrEmpty`, `MAX_SPEC_FILE_BYTES`
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/task-spec.reader.spec.ts
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/candidate-path.resolver.ts — `resolveCandidatePath`, `ResolvedCandidate` (P5)
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/candidate-path.resolver.spec.ts
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/ignored-files.walker.ts — `walkIgnored`, `isAllowListed`, `IgnoredWalkCaps` (P7). Includes the L3 fix.
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/ignored-files.walker.spec.ts

## Per finding

### L1 (Serious) — joined steps stranded as `succeeded/coalesced` when start refuses
- **Fix:** `requestCensus` now calls `coordinator.start(...)` first. `coalesceDeferredInto(mainRoot, runId)` runs only when `start` returned `true`.
  - If `start` refuses (coordinator disposed, or already in flight), the owner records `failed/census-interrupted` and every other waiting step stays `deferred`, so it can re-enter.
  - D22 still holds: steps join at the moment the census is actually requested, synchronously right after the start is accepted.
  - The one-census-per-window rule still holds: the coordinator's in-flight guard is unchanged, and the existing "three tasks … at most one further census" spec still passes.
- **Test:** `IndexRequestStep cooldown window (AC 5.3) › shutdown before the cooldown-end request leaves both waiting runs deferred`.
  - Setup: three runs defer under the cooldown, then `dispose()` is called and the owner re-enters at the cooldown end.
  - It asserts: the owner records `census-interrupted`; run-b and run-c stay `deferred/census-cooldown`; no census was requested.
  - After a restart, a fresh coordinator lets run-b request exactly one census, and run-c joins it.
- **Proof it fails without the fix:** with `coalesceDeferredInto` moved back before `start`, this test fails (mutation run below).

### L2 (Moderate) — `comparablePath` lexical fallback on any realpath error
- **Fix:** `comparablePath` returns `string | null`.
  - Only a confirmed missing path (`ENOENT`/`ENOTDIR`, checked by `isMissingPathError`) falls back to `path.resolve`. Any other failure returns `null`.
  - If the main root resolves to `null`, `isOpenWorkspace` warns (`[task-end-hook] index main root path unverifiable`) and returns `false`. The step then records the existing `skipped/main-root-not-open`.
  - A registered root that resolves to `null` never matches.
  - No new reason code was added: the closed set in `libs/shared/src/lib/types/task-end-hook.types.ts:425-426` already has `main-root-not-open`.
- **Tests:**
  - `IndexRequestStep gate 0 (D6) › fails closed when realpath fails for a reason other than a missing path`. `fs.promises.realpath` throws `EACCES` for the main root, whose lexical spelling matches the registered root. The test expects `skipped/main-root-not-open`, zero census requests and the warning.
  - Companion: `compares a confirmed missing root (ENOENT) by its lexical spelling`. It keeps the documented fallback.
- **Proof it fails without the fix:** with the catch-all fallback restored, the EACCES test fails (mutation run below).

### L3 (Moderate) — a vanished ignored entry was silently skipped
- **Fix:** in `ignored-files.walker.ts`, the old `lstatOrNull` and the `isMissing → continue` on `readdir` are gone.
  - Any `lstat`/`readdir` failure, including ENOENT on an entry `git status` listed, now reaches the walk's catch. The result is `{ kind: 'error' }`.
  - The collector then records `ignored-walk-failed`, and `decideDisposal` P7 records `blocked/precondition-unverifiable`, never `eligible-report-only`.
- **Tests:**
  - `walkIgnored › maps an ignored file that vanished after git status to error (L3)`
  - `walkIgnored › maps an ignored directory that vanished after git status to error (L3)`
  - `walkIgnored › maps an entry that vanished between readdir and lstat to error`
  - End to end: `DisposeEvaluateStep › records precondition-unverifiable when an ignored entry vanished after git status (L3)`. Status lists `!! gone.log` and `!! gone-dir/`, neither of which exists. The test expects `blocked/precondition-unverifiable` and `expectReadOnly`.
- **Proof it fails without the fix:** with the old vanish-skip restored, both walker L3 tests and the DisposeEvaluateStep L3 test fail. The old code returned `ok` with no files, so the outcome was `eligible-report-only`.

### S1 (Serious, style) — collector split
- **Change:** `DisposalInputCollector` stays the orchestrator: survey, collect, git, activity and PR probes, `PathKeyCache` and `CandidateSet`. The read logic moved, unchanged, into `task-spec.reader.ts`, `candidate-path.resolver.ts` and `ignored-files.walker.ts`, each with typed results, plus the shared `fs-probe.ts`.
  - The only signature change is in `walkIgnored`. It now takes `IgnoredWalkCaps { maxFiles, maxBytes }` instead of `DisposalCollectorSettings`, so the walker does not import the collector. The collector maps `archiveMaxFiles`/`archiveMaxBytes` into it.
  - Dependency direction: the new modules depend only on `node:*`, `@ptah-extension/shared` (types), `@ptah-extension/task-specs`, `./disposal-input` and `./git-porcelain.parser`. Nothing imports the collector. The port-based collector dependencies (`ReadOnlyGit`, `SessionLinkPort`, `ActivityPort`, `PrStatusPort`) are unchanged.
  - `DisposalInputRecord` and `disposal-input.ts` were not edited (D13). `src/index.ts` was not edited (D4). The collector's public exports used by `dispose-evaluate.step.ts` are unchanged.
- **Tests:** three new focused specs: `task-spec.reader.spec.ts` (9 tests), `candidate-path.resolver.spec.ts` (5), `ignored-files.walker.spec.ts` (7). Every existing spec passes unchanged.

### Mutation run (proof the tests fail without the fixes)

Command, run under the verify lock:

`node scripts/verify.mjs --exec --task b886-mutation -- npx jest -c libs/backend/task-end-hook/jest.config.ts --maxWorkers=2 'index-request.step|ignored-files.walker|dispose-evaluate.step'`

It ran with all three fixes reverted at once. Result: `Tests: 6 failed, 43 passed, 49 total`. The failing tests:

```
● IndexRequestStep gate 0 (D6) › fails closed when realpath fails for a reason other than a missing path
● IndexRequestStep cooldown window (AC 5.3) › shutdown before the cooldown-end request leaves both waiting runs deferred
● walkIgnored › maps an ignored file that vanished after git status to error (L3)
● walkIgnored › maps an ignored directory that vanished after git status to error (L3)
● walkIgnored › maps an unreadable directory to error
● DisposeEvaluateStep › records precondition-unverifiable when an ignored entry vanished after git status (L3)
```

"maps an unreadable directory to error" failed only because my mutation swallowed every `readdir` error. The original code rethrew EACCES into the catch, so the original passes that test, and it is not counted as L3 proof. "entry vanished between readdir and lstat" did not fail under this mutation, because the mutation reverted only the top-level `lstat` and the `readdir` paths. It covers the decision below.

The sources were restored afterwards and checked with `cmp` against the backups. The full suite was then re-run green.

## Verification

`npm run verify -- -p @ptah-extension/task-end-hook -- --output-style=static` → exit 0:

```
 NX   Running targets lint, typecheck for project @ptah-extension/task-end-hook:
 NX   Successfully ran targets lint, typecheck for project @ptah-extension/task-end-hook
 NX   Running target test for project @ptah-extension/task-end-hook:
Test Suites: 12 passed, 12 total
Tests:       467 passed, 467 total
 NX   Successfully ran target test for project @ptah-extension/task-end-hook
[verify 2026-11-06T21:46:59.807Z] lock released after 63.5s, exit code 0
```

- The test header names exactly one project, matching the one requested.
- `ptah_get_diagnostics` on all changed and new source files: 0 errors.
- `@ptah-extension/cli-engine` and `@ptah-extension/platform-cli` were not run. No file they own changed, and no shared, platform-core or barrel file was touched.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` → exit 0, `TOTAL 220 unsuppressed site(s)`, with no `libs/backend/task-end-hook` violation.

- An intermediate run flagged the new `return null` in `comparablePath` as `catch-return-sentinel`, and the first marker placement was orphaned.
- Final state: a `// degradation-audit: reported - …` marker as the first line inside that catch body. This matches the zone-2 placement in the tool header.
- The walker's catch carries the same kind of `reported` marker. Its `error` result is recorded as a probe-error code.

## Decisions

- **L1: start first, then coalesce.** The alternative was rollback after a refusal. Start-first was chosen because:
  - Nothing is written for joiners before a census exists, so there is no rollback write that can fail halfway.
  - `start` is synchronous, and `runCensus` records nothing before its first await, so no completion can race the coalesce.
  - Evidence: `census-coordinator.ts` `start` and `coalesceDeferredInto`.
  - Reversible: yes.
- **L2: reuse `main-root-not-open`.** The reason set is closed. `main-root-not-open` is the existing outcome for "open workspace not proved", and the `unavailable` workspace-roots probe already maps to it. Reversible: yes.
- **L3 scope.** Every vanish during the walk now maps to `error`: a status entry, a stacked directory, and an entry between `readdir` and `lstat`. The review cited the first two. The third is the same "worktree changed under the census" condition, and skipping it would also make P7 report an incomplete census. Reversible: yes.
- **S1 module naming** follows the folder's `<subject>.<role>.ts` convention (`git-porcelain.parser.ts`, `disposal-input.collector.ts`). `fs-probe.ts` holds the two helpers that four modules share, rather than duplicating them.

## Risks

- **C1 (no delete, move or archive):** the new modules call only `realpath`, `lstat`, `readdir` and `readFile`. The end-to-end L3 test asserts `expectReadOnly`.
- **C3:** no `git fetch` was added. No git command changed.
- **Peer TASK_2026_879_9809 files:** not touched.
