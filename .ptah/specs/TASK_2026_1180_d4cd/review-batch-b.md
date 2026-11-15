# Logic review: batch (b), antigravity `agy` plan-usage reader

## Verdict: CHANGES REQUESTED

Score: 6/10. The direction is correct. The JSON command, the tolerant fallback to TSV, the
OAuth fast-fail and the 20 s chain constant all work as described. Two defects stop approval:
the temporary `cwd` can be removed (or leaked on Windows) while `agy` still runs in it, and the
JSON percent math rounds a nearly-full window to exactly 100 %. A score of 7 needs both fixed.
A score of 5 would need a false AT LIMIT path. I found none (see "Checked and clean").

## Scope

- `git diff main -- libs/backend/` (10 files) and the untracked
  `libs/backend/auth-providers/src/lib/quota/readers/antigravity-usage-json.parser.ts`
  (no spec file of its own; its cases are in `antigravity-cli-usage.adapter.spec.ts`).
- Read in full: the runner core (`fallback-usage.runner.ts:51-188`), the reader chain
  (`antigravity-plan-usage.reader.ts:77-140`), the OAuth missing-file path,
  `plan-limit-ledger.rules.ts:160-182`.
- Check run: `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand
  --coverage=false --runTestsByPath` with the 4 changed specs: 4 suites, 99 tests passed.
- Out of scope: the 3 `libs/frontend/**` files in `git diff main -- libs/`. They are not task
  changes. `main` (bc55aee1b) moved past the branch base (0a89f658e). Rebase before the PR.

## Findings

### 1. [major] Temporary `cwd` is removed while `agy` still runs in it (leak on Windows, process orphaned)

Evidence:
- `antigravity-cli-usage.adapter.ts:122` creates the directory, and `:142-151` removes it in
  `finally` as soon as `runFallbackUsage` returns.
- `fallback-usage.runner.ts:107-114`: when the caller `signal` aborts, `runFallbackUsage`
  resolves `cli-unavailable` at once. The shared flight continues. The process is killed only
  by its own 15 s timer, because the adapter does not pass `runSignal`
  (`fallback-usage.runner.ts:44,136-139`).
- The outer lane lookup deadline is 12 s. Any cold read that is slower than the remaining
  budget hits this path. That is the normal slow path, not an edge case.
- Result on Windows: `rm` of the working directory of a live process fails (`EBUSY`/`EPERM`).
  The directory leaks, and one warn line is logged for each read. On POSIX the `rm`
  succeeds and `agy` continues in a deleted directory. If `agy` writes state relative to
  `cwd`, it recreates nothing, but it can fail and give `cli-exit-error`.
- A second caller with the same flight key (`fallback-usage.runner.ts:84-85`) joins the first
  caller's flight. If the first caller aborts, the first caller's `finally` deletes the
  directory that the shared process uses. The second caller's own directory is never used.

Fix (choose one):
- Pass a `runSignal` that is linked to the caller `signal`, so abort kills the tree before
  `rm`. The runner already waits for `closed` in its `finally`.
- Or move directory ownership into the executor run: create it in `execute` and remove it
  after `processHandle.closed` settles. Then `cwd` lives exactly as long as the process.
- Add a test that aborts during a run and asserts that `rm` happens after the process closes.

### 2. [major] JSON percent rounds to 100 % while quota remains

Evidence: `antigravity-usage-json.parser.ts:62`
`percent: Math.round((1 - remaining) * 100)`.
- `remaining_fraction: 0.004` gives `used = 100`. Any value below 0.005 shows a full window.
- `plan-limit-ledger.rules.ts:166`: `percent >= 100` stops `readingClears`, so a held
  exhaustion is not cleared by this reading. The UI meter (`chart-geometry.ts:45`) shows the
  error color. This is not exhaustion evidence, so it is not a false AT LIMIT, but it is a
  false "full" display and it keeps a stale limit.
- The TSV path keeps decimals (spec expects `74.5`), so the two parsers disagree for the same
  data.

Fix: keep one decimal, and never report 100 while `remaining > 0`:
`const used = Math.round((1 - remaining) * 1000) / 10;`
`percent: remaining > 0 ? Math.min(used, 99.9) : 100`.
Add boundary tests for `remaining_fraction` 0.004, 0.995 and 0.

### 3. [minor] The schema is strict at the row level, so one bad row discards the whole output

Evidence: `antigravity-usage-json.parser.ts:4-23,41`. `z.array(WindowSchema)` fails if any
row has `remaining_fraction` as a string, a value outside 0..1, or `reset_time` as a number.
Then the full `OutputSchema` fails. The TSV parser then also fails on JSON text, and the
runner caches `cli-parse-failed` for 30 minutes (`fallback-usage.runner.ts:94`).
The outcome is safe ("unknown"), but it is not "tolerant" as the intent states, and one
upstream field change blanks antigravity usage for 30 minutes.

Fix: parse `groups` and `windows` as `z.array(z.unknown())`, then `safeParse` each row and skip
rows that fail. Add a test with one valid row and one row with a string fraction.

### 4. [minor] JSON path accepts stale or past `reset_time`

Evidence: the TSV path rejects a reset more than 24 h old
(`antigravity-cli-usage.adapter.ts`, `parseLine`: `resetsAt < observedAt - 24 * 60 * 60_000`).
The JSON path (`antigravity-usage-json.parser.ts:58-64`) has no such check. A past reset with
`remaining_fraction: 0` gives a 100 % window with a reset in the past.

Fix: apply the same 24 h guard. Drop `resetsAt` (not the row) when it is stale.

### 5. [minor] Window keys and labels differ between the JSON and the TSV path, and slugs can collide

Evidence:
- JSON key `other:${slug(group)}:${suffix}` and label `Group · Weekly`
  (`antigravity-usage-json.parser.ts:55,60`).
- TSV key `other:cli-${slug(group)}-${suffix}` and label `Weekly · Group`
  (`antigravity-cli-usage.adapter.ts`, `parseLine`).
- When `agy` output switches format (version change, or the JSON flag is ignored), the ledger
  sees new window keys. Held evidence on the old keys does not carry over.
- `slug` (`antigravity-usage-json.parser.ts:33-35`) maps a non-ASCII group name to `''`. Two such
  groups both give `other::weekly`, and `keys.has(key)` (`:56`) silently drops the second group.

Fix: use one key and label builder for both parsers. Fall back to a group index when the slug
is empty, for example `group-${index}`.

### 6. [minor] Tests do not cover several claims

- No test asserts that the temporary directory is removed after success, timeout or abort.
  The adapter skips `mkdtemp` when `options.exec` is set (`antigravity-cli-usage.adapter.ts:122`),
  so the current specs never run the create or remove code.
- No test for the `mkdtemp` failure path (`:123`, returns `cli-unavailable`).
- No percent boundary test (finding 2) and no partial-bad-row test (finding 3).
- `antigravity-cli-usage.adapter.spec.ts:168` now waits one `setImmediate` before `abort()`.
  The previous test covered an abort before the run started. That case now has no test.
  Keep both cases.

Fix: inject `mkdtemp`/`rm` (or a `tempDir` factory) through `AntigravityCliOptions`, and add the
tests listed above.

### 7. [minor] Each call creates and removes a directory, also on a cache hit or backoff

Evidence: `antigravity-cli-usage.adapter.ts:122` runs `mkdtemp` before `runFallbackUsage`
checks the 30 s cache and the backoff (`fallback-usage.runner.ts:86-90`). Most calls do
not spawn a process, but they still do disk I/O. The fix in finding 1 (directory owned by
`execute`) also removes this cost.

### 8. [minor] `batch-b-report.md` describes a state that the diff does not show

Evidence: the report says "Antigravity still overrides this with 11 s ... this batch is
incomplete". The diff sets `ANTIGRAVITY_CHAIN_TIMEOUT_MS = 20_000`
(`antigravity-plan-usage.reader.ts:49`). The report must be corrected so that the team-leader
does not reopen a closed decision. With the 12 s outer lookup, the CLI stage gets
`min(15 s, chain remaining)` but is cut at 12 s overall. A cold read of 5-6 s fits after the
3 s local probe. A slower read leads to the path in finding 1.

## Checked and clean

- False AT LIMIT: JSON windows carry no `modelScope`, no `exhaustion` and no `reachedType`
  (`antigravity-usage-json.parser.ts:59-66`). Parse failure returns `undefined`, which gives
  `cli-parse-failed` (unknown). It never gives 0 % or 100 %. An empty `groups` array or no usable
  rows returns `undefined` (`:44,69`).
- Percent direction: `used = 1 - remaining_fraction` is correct. The spec checks 0.83 → 17 and
  0 → 100.
- Reset parse: `Date.parse` with a finite check. An invalid date omits `resetsAt` and keeps
  the row.
- Kill on timeout: `execute` clears its timer, tree-kills and then direct-kills, and waits for
  `closed` (`fallback-usage.runner.ts:164-181`). The per-source `timeoutMs` reaches the timer
  (`:127`). No timer leak was found in the new code.
- OAuth: an absent `acp_token.json` returns `no-usage-source` before any `fetch`
  (`antigravity-oauth-plan-usage.reader.ts:100-102`), and the spec asserts that `fetcher` is
  not called. The chain still maps a non-`available` reading to `no-oauth` and continues.
- Privacy: the new log line logs only `error.name`. Fixtures use group names and 2030 dates.
  No paths, emails, tokens or account ids were found.
- Electron main loop: the reader runs only from a plan-usage request, not at construction.
  `mkdtemp`/`rm` are async.

## Decisions

- Classified finding 2 as major and not as blocker. Evidence: a 100 % value blocks
  `readingClears` and colors the meter, but it does not create exhaustion evidence. Reversible.
- Did not count the 3 frontend files as task changes. Evidence: `git merge-base main HEAD` is
  0a89f658e and `main` is bc55aee1b. `git status` shows no frontend changes. Reversible.
