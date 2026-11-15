**Verdict: CHANGES REQUESTED**

# Logic re-review: batch (b), antigravity `agy` plan-usage reader

Score: 7/10. The fix lane closed all 8 findings of `review-batch-b.md`. The temporary `cwd`
now lives exactly as long as the process. The JSON percent math, row tolerance, stale reset
and key identity are correct. One new major defect stops approval: the fix removed the bounded
close wait in the shared runner. A process that never emits `close` now keeps the flight open
forever. A score of 8 needs that fixed. A score of 6 would need a false AT LIMIT path or a
privacy leak. I found neither.

## Scope and checks

- `git diff main -- libs/backend/` (10 files) and the untracked
  `antigravity-usage-json.parser.ts`, `antigravity-usage-json.parser.spec.ts` and
  `antigravity-usage-window.ts`. Read in full: `fallback-usage.runner.ts`,
  `antigravity-cli-usage.adapter.ts`, the parser, the window identity, and the adapter spec
  cases at `antigravity-cli-usage.adapter.spec.ts:122-185`.
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false
  --runTestsByPath` with the adapter, JSON parser, runner, plan reader and OAuth reader specs:
  5 suites, 111 tests passed.
- I did not run `tsc` or `eslint` again. The fix report states both pass (1 old warning).

## Status of findings 1-8

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 1 | `cwd` removed while `agy` runs | Fixed (see N1) | `fallback-usage.runner.ts:134` creates the directory inside `execute`, only for a new flight. `:182` waits for `closed`, then `:188-195` removes it. A caller abort ends only the wait (`:114-119`). Test `antigravity-cli-usage.adapter.spec.ts:145-166` asserts `['closed','remove']` after abort. |
| 2 | 100 % while quota remains | Fixed for JSON (see N5 for TSV) | `antigravity-usage-json.parser.ts:70`: `remaining === 0 ? 100 : Math.min(round1((1 - r) * 100), 99.9)`. Spec checks 0.004, 0.995 and 0. |
| 3 | One bad row discards the output | Fixed | `antigravity-usage-json.parser.ts:16,22` parse `groups`/`windows` as `unknown[]`. `:49-55` skip a row that fails. Spec `antigravity-usage-json.parser.spec.ts:17`. |
| 4 | Stale `reset_time` accepted | Fixed | `antigravity-usage-json.parser.ts:72` drops `resetsAt` older than 24 h and keeps the row. Spec `:25`. |
| 5 | Keys and labels differ, slugs collide | Fixed (see N3) | `antigravity-usage-window.ts:9-12` is the one builder. Used at `antigravity-cli-usage.adapter.ts:206` and `antigravity-usage-json.parser.ts:62`. Empty slug falls back to `group-${index}`. Specs `antigravity-usage-json.parser.spec.ts:34,41`. |
| 6 | Test gaps | Mostly fixed | Success, cache hit, `mkdtemp` failure, abort during run and timeout: `antigravity-cli-usage.adapter.spec.ts:122-185`. Pre-run abort kept: `:468`. Gap: no test for a process that never closes (N1). |
| 7 | Directory work on cache hit or backoff | Fixed | Cache and backoff return at `fallback-usage.runner.ts:87-90`. A joined caller does not call `execute` (`:92-112`). `create` runs at `:134` only. Spec `:122-133` asserts `create` once. |
| 8 | Implementer report out of date | Fixed | `batch-b-report.md:6,22` now state `ANTIGRAVITY_CHAIN_TIMEOUT_MS = 20_000` and the 12 s outer deadline. |

## New findings

### N1. [major] The runner waits forever for `close`, so one stuck process blocks all antigravity CLI reads

Evidence:
- On `main`, the runner waited for `Promise.race([processHandle.closed, FALLBACK_CLOSE_GRACE_MS])`
  (500 ms). The fix replaced it with `await processHandle.closed` (`fallback-usage.runner.ts:182`).
  `FALLBACK_CLOSE_GRACE_MS` (`fallback-usage.constants.ts:7`) is now unused.
- The Node executor resolves `closed` only on the `close` event (`fallback-usage.runner.ts:229`).
  `close` waits until all stdio pipes close. A grandchild that inherits stdout (for example a
  helper or daemon that `agy` starts) keeps the pipe open after `agy` exits.
- On Windows, `stopRun` returns at once when the parent `exited()` (`:59`). Then no tree kill
  runs, and the grandchild keeps the pipe open.
- Result: `execute` never settles. The `finally` at `:106-110` never runs, so the flight stays
  in `flights` and `running.get('antigravity')` stays 1. Each later read joins the stuck flight
  (`:92`) and waits the full stage budget, then returns `cli-unavailable`. Antigravity CLI usage
  stays "unknown" until the app restarts. The temporary directory also stays on disk. The fix
  report accepts this ("a process that never closes can retain its directory"), but it does not
  note the stuck flight.
- This is not a false AT LIMIT. It is a silent, permanent loss of the source and a slow read on
  every request.

Fix:
1. Bound the close wait again, for example `Promise.race([closed, grace])` with
   `FALLBACK_CLOSE_GRACE_MS` (or a longer value for antigravity).
2. When the grace expires, release the flight. Move the directory removal to
   `processHandle.closed.then(() => remove(cwd))` so that the directory is removed when the
   process really closes, and not while it runs.
3. On Windows, do not skip the tree kill only because the parent exited, or kill the tree when
   the grace expires.
4. Add a runner test with a handle whose `closed` never resolves. Assert that the flight
   settles, that a new flight can start, and that `remove` is not called before `closed`.

### N2. [minor] The first caller's signal can cancel a shared flight and start a 5-minute backoff

Evidence:
- `fallback-usage.runner.ts:135` checks `request.signal` after `await create()`. `request` is
  the first caller's request, so its abort stops the shared run. A second caller that joined
  the flight (`:92`) and did not abort also gets `cli-unavailable`.
- `cli-unavailable` is in the short-backoff list (`:101`), so the result is cached for
  `FALLBACK_SHORT_BACKOFF_MS` (5 min). Later reads get `cli-backoff`.
- This contradicts the fix report decision "keep caller abort separate from shared flight
  cancellation". The window is small (the duration of `mkdtemp`), so the severity is minor.

Fix: check only `request.runSignal` at `:135`. Do not cache a result that a caller abort caused.

### N3. [minor] Every window key now contains the group position, so keys change when `agy` reorders groups

Evidence:
- `antigravity-usage-window.ts:12`: `other:cli-${groupKey}-${index}-${suffix}`. The index is
  part of the key even when the slug is unique. On `main` the TSV key was
  `other:cli-${slug(group)}-${kind}`, so all existing keys change once.
- When `agy` adds, removes or reorders a group, the keys of the later groups change. Ledger
  state on the old key (`plan-limit-ledger.persistence.ts`) no longer matches.
- The JSON index counts skipped invalid groups (`antigravity-usage-json.parser.ts:48-50`). The
  TSV index counts groups by first appearance (`antigravity-cli-usage.adapter.ts:180`). The
  same data with one bad group gives different keys in the two formats.
- Impact is low because CLI windows carry no exhaustion evidence (decision in
  `context-batch-b.md`).

Fix: use `slug(group)` alone when it is not empty and unique in the output. Add `-${index}` only
for an empty slug or a collision.

### N4. [minor] An `mkdtemp` failure with `ENOENT` is reported as "CLI not found"

Evidence: `fallback-usage.runner.ts:134` runs `create()` inside the same `try` as the spawn.
The `catch` maps `code === 'ENOENT'` to `cli-not-found` (`:165`). A missing temp directory
(`TMP` points to a deleted folder) then shows "agy is not installed". The adapter also tries the
next candidate (`antigravity-cli-usage.adapter.ts:138-141`) and calls `mkdtemp` again.

Fix: catch the `create()` error separately and return `cli-unavailable`. The existing
`mkdtemp` failure test (`antigravity-cli-usage.adapter.spec.ts:135`) uses an error without a
`code`, so it does not cover this case.

### N5. [minor] The TSV path still rounds to 100 % while quota remains

Evidence: `antigravity-cli-usage.adapter.ts:214`: `Math.round((100 - remaining) * 10) / 10`.
A remaining value of `0.04%` gives 100. This is the same defect as finding 2 on the fallback
format. It stops `readingClears` (`plan-limit-ledger.rules.ts:166`) in the same way.

Fix: apply the same rule as the JSON parser:
`remaining === 0 ? 100 : Math.min(used, 99.9)`. Add a `0.04%` test.

## Checked and clean

- False AT LIMIT: JSON and TSV windows carry no `modelScope`, no exhaustion and no
  `reachedType` (`antigravity-usage-json.parser.ts:67-73`, `antigravity-cli-usage.adapter.ts:207-221`).
  A parse failure returns `undefined`, which gives `cli-parse-failed` (unknown). JSON with no
  usable row returns `undefined` (`:45,77`).
- Percent math: `used = 1 - remaining_fraction`. For 0.83 the value is 17. For 0.0004 the value
  is 99.9. For 1 the value is 0. For 0 the value is 100.
- Timer and listener cleanup: `timer` and `runAbort` are cleared at `fallback-usage.runner.ts:171-172`
  on all paths, also on the early return at `:135`. The caller abort listener is removed in
  each branch (`:115-119`).
- `mkdtemp` failure: `cwd` stays `undefined`, no process starts, no `remove` is called
  (`:134,188`).
- Abort before the process starts: `:135` returns, and the `finally` removes the directory
  (`:188`).
- Privacy: the cleanup warn logs only `error.name` (`:191-193`). The temporary path, the group
  output and the owner key are never logged. Fixtures contain no emails, tokens, account ids or
  user paths.
- Electron main loop: `mkdtemp`/`rm` are async and run only from a plan-usage request.

## Decisions

- Classified N1 as major and not as blocker. Evidence: it needs a process that keeps its stdio
  open after exit. The result is "unknown", not a false limit. Reversible.
- Treated finding 1 as fixed although N1 can leak the directory. The lifecycle order is
  correct. The leak comes from the unbounded close wait, which N1 covers. Reversible.
