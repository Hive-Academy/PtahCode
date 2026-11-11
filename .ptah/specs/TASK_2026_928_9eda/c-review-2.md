# Batch (c) second independent review (after F1 and F2)

Reviewer: independent lane, read-only. Scope: the uncommitted batch (c) tree in
`feat/cli-usage-live-fallback` after the fixes in `f1-report.md` and `f2-report.md`. C4 (grok
pty) is not implemented on purpose and is not reported. m7, m10, m11 and m12 are deferred on
purpose and are not reported again. Line numbers are for the working tree at review time.

## Verdict

**Ship after fixes.** B1 is fixed. B2 is fixed for the Windows order, but the new `exited()`
short-circuit removes the POSIX group kill that reaped grandchildren after the leader exits
(N1). M3 is only partly fixed: `PlanUsageService.dispose` is never called in production, so
the new reaper never runs when the host quits (N2). M6 is only partly fixed (N3). These three
items are small, local changes. No other blocker remains.

Checks run by this review:

- `npm run verify -- -t test -p auth-providers -- "--testPathPatterns=(fallback-usage.runner|usage-source-chain|antigravity-plan-usage.reader|antigravity-cli-usage.adapter|codex-plan-usage.reader|codex-rollout-usage.reader|plan-usage.service).spec.ts"`:
  exit 0, "1 task: 1 succeeded, 1 cached" (Nx cache hit for this tree).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0.
  `auth-providers: 24 ok (baseline 24)` (was 23 at the first review),
  `cli-agent-runtime: 1 ok (baseline 1)`, `vscode-lm-tools: 2 ok (baseline 2)`. See N6.

---

## Prior findings

### B1. CLI fallback on the spawn and delivery paths: **fixed OK**

Every production path that reaches `PlanUsageService.getOwnerSnapshot` or
`LaneLimitLookupService.lookup`:

| Caller | Evidence | Flag |
|---|---|---|
| `ptah_agent_list` | `protocol-dispatcher.ts:1669` → `lookupAgentLimits(..., true)` → `:303-304` `agent.limits(rows, { allowCliFallback: true })` → `agent-namespace.builder.ts:732-735` passes `options` → `ptah-api-builder.service.ts:836` binds `LaneLimitLookupService.lookup` | **true** |
| Spawn gate (pre-spawn) | `protocol-dispatcher.ts:1304` (`spawn` argument, flag default `false`) | false |
| Spawn error paths | `protocol-dispatcher.ts:1367`, `:1405` | false |
| Message delivery gate and scheduler | `lane-delivery-limit.gate.ts:140` `lookup([info], { deadlineMs })` | false |
| Dashboard lane plan limits RPC | `lane-plan-limits-rpc.handlers.ts:133` `agent.limits(rows, { deadlineMs })` | false |
| Dashboard owner snapshot RPC | `plan-limits-snapshot.service.ts:231` `getOwnerSnapshot(target, { refresh, signal })` | false |
| Lane routing / host routing | `lane-routing/.../gather.ts:132`, `host-routing.coordinator.ts:670` `source.limits(rows)` | false |
| Review lane gateway (Electron) | `review-lane-gateway.ts:68`, `:84` | false |

- No constructor, DI factory (`register.ts:328-340`), timer or Electron activation path sets the
  flag. The only literal `true` is `protocol-dispatcher.ts:1669`. `grep allowCliFallback` in
  non-spec files finds only the plumbing listed above.
- The flag is enforced at the process boundary:
  `antigravity-plan-usage.reader.ts:123` returns `source-not-applicable` before `readCli`.
  The Codex rollout source reads files only, so it starts no process.
- Cache semantics (`plan-usage.service.ts:213-226`):
  - An unflagged read cannot start a process: it never joins a `:cli` flight, and its reader
    request has `allowCliFallback: false`.
  - A cached unflagged failure cannot satisfy a flagged read. A chain failure is
    `service-unavailable`, which `isTransientFailure` (`:513-519`) never caches. Any other
    cached non-`available` reading is bypassed for a flagged read (`:218`).
  - A flagged read is not starved. It joins only `:cli` flights. If the list caller leaves at
    its 12 s deadline and the flight aborts, the runner run continues to its own timeout and
    its success is cached for 30 s in the runner (`fallback-usage.runner.ts:93-98`), so the
    next list call gets it without a new process.
- Info: `ptah.agent.limits(rows, { allowCliFallback: true })` is also reachable from
  `execute_code`. That is a list caller by intent, so it is acceptable. See N5 for a cost note.

### B2. Windows tree kill after the direct child died: **partly fixed**

Fixed:

- `stopRun` (`fallback-usage.runner.ts:53-68`) runs the tree kill first, bounded by
  `FALLBACK_TREE_KILL_TIMEOUT_MS` (2 s), then `kill()` only if the child is still alive.
- After a normal exit no kill runs (`:54`), so there is no `taskkill` per success and no PID
  reuse risk.
- The executor no longer kills on the output cap (`:199-205`). The runner does the tree kill.
- Path by path, with the production executor:
  - Timeout (`:129-131`, `:137`): tree kill, then direct kill.
  - Output cap: same order.
  - Spawn error (`ENOENT`): `pid` is undefined, so the tree kill is a no-op, then `kill()` on
    an unspawned child, which is harmless. The reason is `cli-not-found`.
  - Caller abort: ends only the caller wait (`:107-114`). The run ends at its timeout.
  - Run abort (`runSignal`): works in tests, but no production caller sets it.
  - Dispose: see M3 / N2.
- Gate release: `total` and `running` are released in `.finally` (`:100-104`). `execute` always
  settles: the stage timeout always fires, the tree kill is bounded at 2 s, and the close wait
  is bounded at 500 ms. A rejection of `execute` maps to `cli-unavailable` (`:92`). The gate
  always releases.
- The new specs are real proof for the runner order: `fallback-usage.runner.spec.ts:132-178`
  use `createNodeFallbackExecutor` with a fake `spawn` and an injected `killTree`, and assert
  the order `['tree', 'direct']`, no kill after a normal exit, and the gate release after a hung
  tree kill.

Not fixed: the early-exit case on POSIX. See **N1**.

### M1. copilot, cursor, pi: **fixed OK, with one wording note**

- `lane-limit-lookup.service.ts:143`, `:223-228` return a status-only `no-usage-source`
  snapshot with no provider read for `copilot`, `cursor` and `pi`.
- `ptah_agent_list` cell: `unknown (no usage source)` (`agent-limit.formatter.ts:106-107`,
  `:371`; spec `agent-limit.formatter.spec.ts` "shows no usage source for %s").
- Spawn gate: `spawnGateVerdict` (`agent-spawn-limit-gate.ts:43-53`) returns
  `{ kind: 'unknown', reason: 'no usage source' }`. It does not block. The spawn text is
  `> Note: limit state unknown (no usage source); spawned without a limit check.`
  (`agent-limit.formatter.ts:726-729`). Before the fix the same verdict said
  "limits not tracked", so only the text changed.
- Delivery gate: `unknown` gives `unconfirmed()` (`lane-delivery-limit.gate.ts:156-158`), the
  same outcome as the earlier `no-owner` result.
- Dashboard: the lane plan limits RPC goes through the same lookup and gets the typed status.
  The provider account tiles read `PlanUsageService`, where `NO_USAGE_SOURCE_PROVIDERS` is still
  empty (`plan-usage.service.ts:93`). This is unchanged, and no copilot owner reaches it.
- Wording note (minor, m-A below): the cell still starts with `unknown`. The lane rule says
  "show ... `no usage source`, not 'unknown'".

### M2. Chain failure ranking: **fixed OK, with two residual gaps**

- `usage-source-chain.ts:12-21`: `Record<UsageFailureReason, number>` is exhaustive at compile
  time. `account-unverified` ranks 0, CLI reasons 1, `no-local-server` 2, `no-oauth` 3,
  `source-not-applicable` 99. An account proof failure stops the chain (`:65`, `:69`).
- User-visible reasons compared with batch (b)
  (`git show main:.../antigravity-plan-usage.reader.ts`):
  - Flagged (list), cli-store owner, all three stages fail: the CLI reason wins, as in batch (b).
  - Unflagged (spawn gate, dashboard): the CLI stage is `source-not-applicable`, so the reason
    is `no-local-server` ("no local server"). Batch (b) showed the CLI reason. This follows from
    B1 and is acceptable, but see N4 for the dashboard.
  - CLI stage with less than 1 s left: `cli-timeout` (`antigravity-plan-usage.reader.ts:125`).
    Batch (b) said `usage-budget-exhausted`. This is a small wording change.
  - Local server `account-changed`: now `account-unverified`. Batch (b) returned
    `service-unavailable` with no reason. This is better.
- Residual gap: see **N7** (a deadline break gives `no-usage-source`).

### M3. Dispose leaves a child: **partly fixed**

- The mechanism exists: `liveRuns` (`fallback-usage.runner.ts:52`), `disposeFallbackRuns`
  (`:69-72`), and the call in `PlanUsageService.dispose` (`plan-usage.service.ts:232`).
  The spec (`plan-usage.service.spec.ts`, "dispose" case) proves that `dispose()` reaches
  `killTree` and `kill` of a running fake handle.
- Not fixed in the product: see **N2**. Nothing in production calls `PlanUsageService.dispose`.

### M4. Codex rollout owner proof: **fixed OK (fail closed), with a known residual**

`codex-rollout-usage.reader.ts:100-117`:

- A user who logged in long ago, with an old `auth.json` and a fresh event, still works:
  `readAt >= authChangedAt` passes.
- An event in the same second as the auth write: the event timestamp has millisecond
  precision, and the comparison is `readAt < authChangedAt`. An event whose timestamp is earlier
  than the mtime fails closed (`account-unverified`). An event at the exact millisecond is
  accepted. If Codex writes second-precision timestamps, a true post-login event in the same
  second is rejected. That is fail closed and acceptable.
- A missing `auth.json` (after `codex logout`) gives `account-unverified`.
- A token refresh that rewrites `auth.json` after the newest event rejects the rollout until
  the next event. That is fail closed.
- Residual (info): a Codex session started before `codex login` with another account keeps the
  old token in memory. Its new events are newer than the new `auth.json`, so they pass the
  check. The App Server runs first, so this matters only when it fails. Accept and record it.
- Note: when the App Server ran, the facade returns the App Server mapping, not the rollout
  failure reason (`codex-plan-usage.reader.ts:102-108`). So `account-unverified` from the
  rollout is not visible to the user in practice. The visible Codex reasons stay as in batch (b).

### M5. Rollout stamped as a live event: **fixed OK**

- `codex-rollout-usage.reader.ts:128-129`: `usedSource` and `resetSource` are
  `provider-unofficial`. `observedAt` is the event time.
- `isLiveSource` (`evidence-precedence.ts:54-56`) is only `stream-event` / `error-derived`, so
  rule 2 of `supersedes` does not protect a rollout reading. Newer evidence replaces it.
- A 100 % rollout window cannot produce LIMIT REACHED. `windowExhaustion` uses only an explicit
  `window.exhaustion` stamp (`window-state.ts:117-128`), and the rollout sets none. The ledger
  (`plan-limit-ledger.service.ts:202-226`) does not derive an exhaustion from a percent.
  `classifyWindow` (`window-state.ts:204-233`) gives `not-confirmed`, because `lastResetAt` is
  undefined and `resetSource` is not `provider-api`. `fullWindow` blocks only `ok` / `near-limit`
  windows (`agent-limit.formatter.ts:199-208`), so the spawn is not refused.
- What the user sees in `ptah_agent_list` for a 100 % rollout window:
  `unknown (<window label>: not confirmed (last reset unknown)) [local state, <age>]`. The spawn
  prints the "limit state unknown ... spawned without a limit check" note. Delivery is
  `unconfirmed`.
- Consequence (info): a rollout reading is never `confirmed room` and never `near limit`. It is
  informational only. If that is the intent, record it in the design.

### M6. App Server `available` with no windows: **partly fixed**

- Fixed when no rollout file exists: `codex-plan-usage.reader.ts:104-107` returns the App Server
  mapping with `source: 'provider-api'`. The spec "keeps App Server account and allowances when
  no windows exist" uses `'/no-rollout-home'`.
- Not fixed when a fresh rollout exists. See **N3**.

### M7. Codex chain deadline: **fixed OK, with a design gap**

- `codex-plan-usage.reader.ts:46-47`, `:100`: a 50 s chain deadline. Specs cover a 12 s App
  Server success and a 12 s App Server failure followed by a rollout success.
- The 50 s deadline does not delay the spawn path or the list path. `LaneLimitLookupService`
  races each lane against its own deadline (`lane-limit-lookup.service.ts:185-208`):
  `SLOW_LIMIT_LOOKUP_DEADLINE_MS` = 12 s for codex (`evidence-precedence.ts:24-39`), 1.5 s for the
  delivery gate. When the only caller leaves, the flight aborts (`plan-usage.service.ts:280-287`).
  Batch (b) had no outer deadline, so 50 s is not worse.
- Design gap (major for value, not for safety): in the lookup path, the rollout runs only when
  the App Server fails in less than about 12 s. When the App Server hangs, the caller leaves at
  12 s, the flight aborts, and the rollout never runs. That is the case where the rollout
  matters most. Fix options: read the rollout in parallel and use it only if the App Server has
  no answer by about 9 s, or give the App Server stage a budget below the caller deadline when
  the caller passes a signal. Add a spec that a lookup with a 12 s deadline and a hung App
  Server returns the rollout reading.

### Minors from the first review

| Item | Result | Evidence |
|---|---|---|
| m1 | fixed | `fallback-usage.runner.ts:120`; `antigravity-plan-usage.reader.ts:124-126` clamps to the remaining budget. A pre-spawn `cli-timeout` from `:120` still writes a 5 min back-off (`:95`), but the reader's 1 s check makes this rare. |
| m2 | fixed | `:92` `.catch(() => failure('cli-unavailable'))`; `:112-113` reject handler. |
| m3 | fixed | `:57-64` 2 s race. |
| m4 | fixed | `:95` includes `cli-unavailable`. |
| m5 | fixed | `:207-208` exit code 0 resolves regardless of stderr. |
| m6 | fixed | `:180` `debug` on `ok`, `warn` otherwise; fields are `sourceId`, `reason`, `elapsedBucket` only. |
| m8 | fixed | `antigravity-plan-usage.reader.ts:110` returns `account-unverified`; the chain stops at `:65/:69`. |
| m9 | fixed | `codex-rollout-usage.reader.ts:44-71`: newest three directories per level, 64 files, real paths on both sides. |
| m13 | fixed | `plan-usage.service.ts:394-404`. |
| m14 | recorded | design note per F1. |

---

## New findings

### Major

**N1. POSIX: the `exited()` short-circuit skips the group kill when the leader exited but a
grandchild is alive.**

- Evidence: `fallback-usage.runner.ts:54` returns at once when `handle.exited()` is true.
  `exited` becomes true on the `'exit'` event (`:211`). On POSIX the child is a group leader
  (`detached: true`, `:194`). If `agy` exits and a descendant keeps the inherited stdout pipe
  open, `'close'` never fires, `result` stays pending, and the 8 s timeout fires. Then `stopRun`
  sees `exited() === true` and does nothing. The descendant stays alive. The first review
  recorded that "POSIX: `detached: true` + group `SIGKILL` reaps grandchildren after the leader
  exits". That protection is now gone. The same short-circuit applies in
  `disposeFallbackRuns`.
- On Windows the skip is correct, because `taskkill /T` cannot walk the tree of a dead PID and
  a reused PID is a risk.
- Fix: track a `closed` flag in the executor handle (set on `'close'`). In `stopRun`, skip only
  when `closed` is true on POSIX, and when `exited` is true on win32. `killProcessTree` on POSIX
  signals `-pid` and polls the group (`process-tree-reaper.ts:75-110`), so it is safe after the
  leader exited. Add a spec with the production executor: emit `'exit'` without `'close'`,
  advance 8 s, and expect `tree` to run on a POSIX platform stub. Also expect no tree kill on a
  win32 stub.

**N2. `PlanUsageService.dispose` has no production caller, so the M3 reaper never runs.**

- Evidence: no call to `.dispose()` on the `PLAN_USAGE_SERVICE` instance in `apps/` or `libs/`
  (non-spec). The service is an `instanceCachingFactory` registration
  (`auth-providers/src/lib/di/register.ts:328-340`). `apps/ptah-electron/src/activation/shutdown.ts`
  (`:272-274` and nearby) disposes other services but not this one. No `container.dispose()`
  call exists in the Electron app.
- Also `plan-usage.service.ts:232` uses `void disposeFallbackRuns()`. Even when wired, the quit
  path does not wait. On Windows the tree kill starts only after a dynamic `import()` and a
  `taskkill` spawn (`process-tree-reaper.ts:59-72`), so the host can exit first. A rejection from
  `handle.kill()` inside `stopRun` would be unhandled.
- Why it matters: binding condition "a dispose leave[s] no child". When the user quits Electron
  during a list read, `agy` (detached on POSIX) is not killed by the host.
- Fix: add `nonFatal('PlanUsage fallback reap', () => disposeFallbackRuns())` (awaited, with the
  existing shutdown timeout pattern) to the Electron shutdown sequence, or resolve
  `PLAN_USAGE_SERVICE` there and call an `async dispose()` that awaits
  `disposeFallbackRuns()`. Catch its rejection. Add a shutdown spec that asserts the call.

**N3. M6 residue: an App Server `available` answer with no windows lets the rollout win.**

- Evidence: `codex-plan-usage.reader.ts:73-84`: an `available` App Server result with no
  windows is not `usable` (`usage-source-chain.ts:23-29`), so the chain continues.
  `guardedRollout` (`:86-92`) skips only `unsupported-auth`, `unsupported-config` and
  `cli-version-unsupported`. A fresh rollout file then wins (`:101`), and the App Server's
  authoritative "no rate-limit windows" answer, the account and the allowances are lost. The M6
  spec uses `'/no-rollout-home'`, so it does not cover this.
- Fix: in `guardedRollout`, also skip when `lastResult?.status === 'available'`. Add a spec with
  a fresh synthetic rollout file and an `available`, window-less App Server answer, and expect
  `allowances` and `source: 'provider-api'`.

### Minor

**N4. The dashboard never runs the antigravity CLI fallback.**

- Evidence: `lane-plan-limits-rpc.handlers.ts:133` and `plan-limits-snapshot.service.ts:231` do
  not pass the flag. For an antigravity user with no OAuth and no local server, the dashboard
  shows "no local server", or a stale reading after a recent `ptah_agent_list` call. Batch (b)
  showed CLI data on the dashboard.
- This follows the lane rule ("only when a list caller asks"). The doc comment of
  `lane-plan-limits-rpc.handlers.ts:123` calls that RPC "The `ptah_agent_list` lookup". Decide
  whether the dashboard lane plan limits RPC is a list caller. If yes, pass
  `allowCliFallback: true` there. If no, record the regression in the design note.

**N5. A flagged read bypasses the 30 s cache for every non-`available` owner of every provider.**

- Evidence: `plan-usage.service.ts:218` applies to all providers. Each `ptah_agent_list` call
  re-reads owners with a cached `unsupported-auth`, `cli-unavailable`, `cli-version-unsupported`,
  `provider-unsupported` or `no-usage-source` status. Codex has its own 30 s cache
  (`codex-account-usage.service.ts:37`, `:265-268`), so the cost is small today. It is still
  wider than the CLI fallback needs.
- Fix: bypass only for providers that have a CLI fallback source (antigravity now, grok later),
  for example a `CLI_FALLBACK_PROVIDERS` set next to the readers.

**N6. A new unmarked swallow uses the last degradation-audit headroom.**

- Evidence: the audit reports
  `fallback-usage.runner.ts:59 [promise-catch-sentinel] .catch() handler swallows the rejection with a literal`
  (`tree.catch(() => undefined)`). `auth-providers` went from 23 to 24, which equals the
  baseline. The next unmarked swallow in this library fails the ratchet.
- Fix: add the `// degradation-audit: optional-capability - ...` marker on that line, or pass
  `onError` to `killProcessTree` and log the error code only through the logger.

**N7. A deadline or abort break before any failure gives `no-usage-source`.**

- Evidence: `usage-source-chain.ts:44` and `:57` `break` without `applicable = true`. If the
  first stage overruns the chain deadline, `failure` is undefined and `applicable` is false, so
  the result is `status: 'no-usage-source'` (`:79-86`). That status is not transient and is
  cached for 30 s (`plan-usage.service.ts:438-444`). The user sees "no usage source" for a
  provider that has a source. For Codex this is reachable when the App Server overruns 50 s with
  a pinned caller. Then `lastError` and `lastResult` are not set yet, so the facade returns the
  chain reading (`codex-plan-usage.reader.ts:102-108`).
- Fix: on a deadline break, set `applicable = true` and use `failure ??= 'cli-timeout'` (or
  `usage-budget-exhausted`, as in batch (b)). On a caller abort, leave it, because the service
  throws `abortError` (`plan-usage.service.ts:393`). Add a chain spec with a stage that never
  settles and a 10 ms deadline.

**m-A. The list cell for copilot, cursor and pi still starts with `unknown`.**

- Evidence: `agent-limit.formatter.ts:371` prints `unknown (${unknownCause(limit)})`, which gives
  `unknown (no usage source)`. The lane rule asks for "no usage source", not "unknown".
- Fix: in `formatLimitColumnBase`, return `no usage source` when `hasNoUsageSource(limit)` and
  the state is `unknown`. Update the three formatter cases.

**m-B. `cli-busy` is shown as `cli-unavailable`.**

- Evidence: `antigravity-plan-usage.reader.ts:128` maps `cli-busy` to `cli-unavailable`. When a
  second owner's `agy` run holds the per-CLI gate, the list shows "cli unavailable", which is
  not the cause. This is acceptable until a typed reason exists. Record it with m10.

### Checked and found OK

- No `console.*`, `as any`, `@ts-ignore` or `as unknown as` in the changed reader and runner
  files. The `as` casts at `fallback-usage.runner.ts:84,86` are on internal generic state (m11,
  deferred). External data is parsed with Zod: rollout lines (`codex-rollout-usage.reader.ts:12-27`,
  `:108-114`), antigravity rows (adapter, unchanged). Catch variables are `unknown`.
- Logs: only `sourceId`, `reason`, `elapsedBucket` (`fallback-usage.runner.ts:180-182`). No
  stdout, stderr, owner key or account key is logged. The runner spec checks that output and the
  owner key are absent.
- Gate limits: one flight per `sourceId`, at most 2 in total (`:88-91`). The antigravity
  candidate loop runs candidates one after another, so it never holds two slots.
- `child_process` is imported only in `fallback-usage.runner.ts:1`. No `electron` or `vscode`
  import in the touched libraries.
- The antigravity order is OAuth, local RPC, CLI (`antigravity-plan-usage.reader.ts:91-131`).
  Constants are in one file (`fallback-usage.constants.ts`).
