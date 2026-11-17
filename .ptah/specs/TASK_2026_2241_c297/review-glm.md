# Independent logic review — TASK_2026_2241_c297 (P5 PR 1: host load measurement)

Reviewer: code-logic-reviewer lane (read-only). Base: `main` b4ab8f096. Scope: the full
uncommitted diff (10 files) plus the surrounding code each change touches.

## Verdict

**APPROVE.**

Score: **8/10** (sound: behavior verified preserved at every touched path, labels and
privacy verified against the code, parser verified against the real logger format; the
remainder is coverage gaps, not defects).

No blocking and no major findings. Three minor findings and four nits follow. None of
them changes runtime behavior or corrupts the measurement; fix them in this PR or a
follow-up as the coordinator sees fit.

## Findings

### Blocking

None.

### Major

None.

### Minor

1. **The measurement depends on debug level, and nothing in this PR states that.**
   All three new lines are `logger.debug` (`plan-limits-snapshot.service.ts:175`,
   `plan-usage.service.ts:279` and `:294`, `rebuild-timing.ts:48` for rebuilds under
   250 ms). Both logger implementations default to `info` outside development
   (`logger.ts:80-84`, `electron-adapters.ts:275-277`), and the level filter drops
   debug before the payload is ever formatted. A production-profile perf run without
   `PTAH_LOG_LEVEL=debug` (or the dev profile) captures none of the plan-limits and
   plan-usage lines and only rebuilds over 250 ms (`rebuild-timing.ts:47`), so the two
   new parser sections stay empty and the run silently proves nothing.
   Fix: confirm the perf harness sets `PTAH_LOG_LEVEL=debug` (the e2e
   permission-seam fixture already does,
   `apps/ptah-electron-e2e/src/support/permission-seam-fixtures.ts:159`), or write the
   requirement into the perf run instructions next to the parser usage.

2. **Spec gap: the join-path rejection semantics of `snapshot()` are not pinned.**
   The join line changed from `return existing` to `const result = await existing`
   (`plan-limits-snapshot.service.ts:137-141`). Reading the code confirms a joiner
   still receives the same rejection the shared assemble produced (the `await`
   rethrows it), and the cleanup handlers (`plan-limits-snapshot.service.ts:150-153`)
   still swallow the rejection for the map, so no unhandled-rejection regression
   exists. But no spec makes a shared assemble reject with two concurrent same-scope
   callers, so a later edit of that line (for example a `catch` around the `await`)
   would go unnoticed.
   Fix: add a spec where `discoverTargets` rejects, two concurrent same-scope pulls
   both reject with the same reason, and no `snapshot served` line is logged for
   either call (`logSnapshot` is skipped on the rejection path).

3. **Spec gap: plan-usage counter values are not asserted.**
   The new test (`plan-usage.service.spec.ts:170-197`) proves each `outcome` and each
   `bypass` label appears, and that owner keys are absent, but it never asserts the
   `hits`/`joins`/`starts` numbers. "Counters increment once per call" is therefore
   proven for the task index (`rootRebuilds: 1` then `: 2`,
   `task-index.service.spec.ts:990-996`) and for pushes (`pushes: 1` exact,
   `plan-limits-snapshot.service.spec.ts:139`) but not for the owner cache.
   Fix: assert the first `flight-start` line carries `starts: 1`, the `flight-join`
   line `joins: 1`, and the first `cache-hit` line `hits: 1`.

### Nit

4. `refresh` is normalized two ways in the two payload shapes:
   `options.refresh ?? false` on the hit path (`plan-usage.service.ts:281`) vs
   `options.refresh === true` on the bypass path (`plan-usage.service.ts:296`). The
   declared type makes them equal; pick one form.

5. `scopeId`/`rootId` are 32-bit sha256 prefixes, so distinct scopes or roots can
   collide and the parser's `scopes`/`roots` counts
   (`streaming-load-metrics-lib.cjs:312`, `:320`) can under-count. The brief accepts
   short hashes; say so next to the parser fields so `roots: 1` is not read as proof
   of uniqueness.

6. `task-index.service.ts` already exceeded the eslint `max-lines` limit at HEAD
   (932 physical lines); this change adds 10 more, so the pre-existing warning stays
   (now 742 counted lines, limit 700). Not a new violation.

7. Pre-aborted or disposed `getOwnerSnapshot` calls return before any logging
   (`plan-usage.service.ts:260`) and are not counted; a request that starts and then
   aborts is counted. Negligible for load measurement; recorded for completeness.

## Checks against the review questions

### 1. Behavior change

No behavior change found at any of the three services.

- `PlanLimitsSnapshotService.snapshot()`: the dedupe key moved to `scopeKey()`
  (`plan-limits-snapshot.service.ts:365-372`) with byte-identical JSON shape
  (providerId, sorted unique sessionIds/ownerKeys, refresh), so dedupe decisions are
  unchanged. The join path awaits the same pending promise and returns
  `result.snapshot` — the identical object the starter returns; the spec pins this
  with `toBe` (`plan-limits-snapshot.service.spec.ts:116`) and one assemble with
  `discoverTargets` called once. Rejection semantics: `await existing` rethrows the
  same rejection the old `return existing` delivered; the map cleanup handlers are
  unchanged, so the derived cleanup promise still absorbs the rejection
  (`plan-limits-snapshot.service.ts:150-153`). `currentSnapshot()` still assembles
  the last scope independently and returns the same snapshot shape. `assemble()` is
  private with exactly the two updated callers; its timing capture adds no awaits
  between existing ones (`plan-limits-snapshot.service.ts:213-232`).
- `PlanUsageService.getOwnerSnapshot()`: the hit condition and its `return` are
  untouched; only a counter and a log were inserted inside the branch. The bypass
  block is pure computation between the branch and the unchanged flight lookup.
  `joining` is computed with the same key expression as the following `get` and as
  `startFlight` uses (`plan-usage.service.ts:291`, `:300`, `:326`), and no `await`
  sits between `has` and `get` (the injected `logger.debug` is synchronous), so
  `flight-join` vs `flight-start` always matches the decision the flight code makes.
- `TaskIndexService.rebuild()`: `scanMs` is captured with a `finally` on the scan
  promise (`task-index.service.ts:821-822`), so it is recorded when the scan settles
  or rejects and the rejection still propagates unchanged into the outer `finally`,
  which still logs. A synchronous throw from `scanner.scan` leaves `scanMs` at 0 and
  propagates exactly as before. The trigger expression was hoisted verbatim
  (`task-index.service.ts:898` vs the old inline ternary), and the counters are pure
  additions in the existing `finally`.

### 2. Label correctness

- Bypass order **equals** the cache condition order. The hit condition checks named
  route → refresh → cached → CLI fallback → TTL (`plan-usage.service.ts:271-277`);
  the bypass chain tests exactly that order: `named-route`, `refresh`, `empty`,
  `cli-fallback`, `expired` (`plan-usage.service.ts:286-290`). The impl-report claim
  ("first failed rule") is accurate.
- `joined` is logged only for callers that found a pending same-scope assemble;
  `assembled` for the starter; the push always logs `assembled` because it never
  reads the pending map — correct, since a push re-assembles the last scope with
  cached reads (`plan-limits-snapshot.service.ts:160-168`).
- Trigger mapping unchanged; the parser groups by the same `trigger` values.
- Counters increment exactly once per call: `pulls` per `snapshot()` call (joiners
  included), `joins` per join, `pushes` per `currentSnapshot()`
  (`plan-limits-snapshot.service.ts:132`, `:138`, `:162`);
  `rootRebuilds`/`triggerRebuilds` once per completed rebuild in the `finally`
  (`task-index.service.ts:899-902`); `cacheHits`/`flightJoins`/`flightStarts` once
  per served request on exactly one branch (`plan-usage.service.ts:278`, `:292-293`).
  The task-index spec proves the progression (1 → 2 per root, per-trigger 1).

### 3. Privacy

No path, session id, owner key, email or error message in any new payload.

- Rebuild line: `rootId` is `sha256(root).slice(0, 8)`
  (`task-index.service.ts:904`); the raw root never enters the payload. The existing
  spec keeps asserting `ROOT` and the file-body marker absent.
- Plan-limits line: `scopeId` is an 8-hex sha256 of the scope key
  (`plan-limits-snapshot.service.ts:176`); the payload carries only counts and
  booleans (`hasProvider` is the boolean, not the provider id; `owners` is a count).
- Plan-usage line: `providerId` is a provider label, which the brief allows; owner
  keys never enter the payload.
- Both new specs assert the raw values ('a'/'b'/'x', `CODEX_A.key`, `CLAUDE_A.key`,
  'private-session'/'private-owner') are absent from the logged lines.

### 4. Unbounded growth and hot-path cost

- Counters are plain numbers. The two new maps in `TaskIndexService` are keyed by
  root (same cardinality as the existing `states` map) and by trigger (a fixed small
  set). Nothing grows with request volume.
- Cost per call: one sha256 over a short string per logged call
  (`planLimits` hash, task-index root hash) and a handful of `Date.now()` calls —
  small, and the brief accepts it. Nothing worse: no synchronous I/O, no deep copies.
- Parser: three `startsWith` checks per parsed line and three extra kind-filter
  passes per `summarize` — proportional to the existing ~10 `of()` passes.

### 5. Parser

Verified against the real producing code, not just the claimed shape:

- Both logger implementations inline payload objects into the message as
  `message: {JSON}`: vscode-core `logger.ts:227-235` (`log()`), and the Electron
  adapter `electron-adapters.ts:460-484` (`log()`). Both format the entry as
  `[LEVEL] ISO - message` with `padEnd(5)` levels (`logger.ts:265-268`,
  `electron-adapters.ts:354-356`), so `[DEBUG]` has no padding space while `[WARN ]`
  does — both match the parser regex `\[(\w+)\s*\]`
  (`streaming-load-metrics-lib.cjs:23-24`).
- The Electron file channel prepends the leading `[ISO] `
  (`libs/backend/platform-electron/src/implementations/electron-output-channel.ts:36`),
  producing exactly `[ISO] [LEVEL] ISO - message: {JSON}`. The spec fixtures follow
  this shape (`streaming-load-metrics.spec.ts:85-89`).
- No regression of existing metrics: the new branch claims only the three new
  prefixes and runs before the existing chain; an unrecognized or unparseable line
  still falls through to `kind: 'line'`. WARN/ERROR rebuild-timing lines still also
  count as `levelOnly` (`streaming-load-metrics-lib.cjs:253-255`), so `warnErr` and
  log volume are unchanged. `flatten` and `--compare` are untouched, and old stored
  summaries still compare. Empty windows are safe: `percentile([])` and `maxOf([])`
  return 0 (`streaming-load-metrics-lib.cjs:194-205`), so the new sections render
  `0/0` and `{}` rather than NaN.
- Markdown placement: the three sections sit directly under the title, before the
  `Window` line and the existing tables — sensible for a load-focused report.

### 6. Spec quality

The new assertions prove most claims: exact payload pass-through and rounding
(`rebuild-timing.spec.ts`, `scanMs` 201.6 → 202), `rootId` format and per-root /
per-trigger counter progression (`task-index.service.spec.ts:977-996`), shared
assemble plus object identity plus payload shapes plus `pushes: 1` plus privacy
(`plan-limits-snapshot.service.spec.ts`), each outcome and bypass label plus privacy
(`plan-usage.service.spec.ts`), and end-to-end aggregation plus section rendering
(`streaming-load-metrics.spec.ts:85-105`). The gaps are findings 2 and 3 above: the
join rejection path and the plan-usage counter values are not pinned.

### 7. Rule breaks

None in the changed lines. No new `any`, no `@ts-ignore`, no new
`as unknown as` (the pre-existing harness casts in the plan-usage spec predate this
diff), no `console.*` in libs, no silent error swallow (the `finally` measurement
does not catch). ESLint on the 10 files: 0 errors, 3 warnings, all pre-existing
(unused catch binding `plan-usage.service.ts:314`, non-null assertion in the spec at
`:111`, `max-lines` — see nit 6).

## Verification evidence (focused checks I ran)

- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand
  --coverage=false --runTestsByPath` (rebuild-timing + task-index specs):
  **2 suites / 67 tests pass**.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts ...` (plan-limits
  snapshot spec): **1 suite / 18 tests pass**.
- `npx jest --config libs/backend/auth-providers/jest.config.ts ...` (plan-usage
  spec): first full run **55/59 pass, 4 failures — all 5000 ms timeouts, no assertion
  failures**, with a different failing subset on a second run. Re-running the failing
  tests with `--testTimeout=30000`: **all pass**. The machine was heavily loaded
  during the runs (a filtered 2-test run took 161 s wall). The diff adds no async
  work to any await path, so I attribute the timeouts to load, not to the change.
  The new logging test passed in every run.
- `npx jest --config scripts/jest.config.ts ...` (streaming-load-metrics spec):
  **1 suite / 18 tests pass**.
- `npx tsc --noEmit --project` for task-specs, rpc-handlers and auth-providers:
  **0 errors each**.
- `npx eslint` on the 10 changed files: **0 errors**, 3 pre-existing warnings (above).
- No `npm run verify`, no `nx`, no workspace-wide command was run.

## Decisions

- **Bypass-order question, resolved by evidence:** the review brief asked whether
  the bypass order equals the cache condition order. Reading
  `plan-usage.service.ts:271-290` shows they match exactly; the suspicion of a
  mismatch (which the truncated diff context can suggest) is wrong for this file.
  Options were "report mismatch" vs "verify against the full condition"; the full
  condition settles it. Reversible: a one-word label change.
- **auth-providers timeout failures, resolved as environmental:** the failing
  subset changed between runs and both tests pass with a longer timeout, while the
  diff adds no promise-chain work. I did not treat them as task defects; the
  coordinator should re-run the suite (or the gate) when the machine is quieter.
  Reversible: if the gate run reproduces them deterministically, reopen.

## Remaining uncertainty

The parser is verified against the two logger implementations and the Electron file
channel in this repository, and against the format documented from real logs in the
lib header. I did not run the Electron app to capture a live line, because the
verification rules forbid running the app; if the first real perf run produces
empty new sections, check finding 1 (debug level) first.
