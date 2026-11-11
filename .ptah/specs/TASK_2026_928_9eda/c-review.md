# Batch (c) independent review

Reviewer: independent lane (read-only). Scope: uncommitted batch (c) diff in
`feat/cli-usage-live-fallback` (C1, C2, C3, C5). C4 (grok pty) is intentionally absent and is
not reported. Line numbers are for the working tree at review time.

## Verdict

**Do not ship.** Two binding conditions of `lane-rules.md` do not hold in production code:

1. A fallback process can run during a lane spawn and a message delivery (B1).
2. On Windows, the tree kill runs after the direct child is dead, so a grandchild survives.
   The fake-spawner test does not exercise the production kill path (B2).

A third condition (copilot, cursor, pi show `no-usage-source`) is met only in tests that build
a fabricated snapshot (M1). After B1, B2, M1 and the major items are fixed, the batch is close to
"ship after fixes".

---

## Blockers

### B1. The CLI fallback runs on the lane spawn path and the message delivery path

- Evidence:
  - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1297-1305`:
    the spawn tool calls `lookupAgentLimits(...)` for a named lane before the spawn.
  - `lookupAgentLimits` (`protocol-dispatcher.ts:293-310`) → `ptahAPI.agent.limits` →
    `LaneLimitLookupService.lookup` → `readLane`
    (`libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts:214-231`)
    → `this.snapshots.getOwnerSnapshot(plan.target, { signal })` → `PlanUsageService.read` →
    antigravity reader → `antigravity-cli` source
    (`readers/antigravity-plan-usage.reader.ts:116-131`) → `readAntigravityCliUsage` →
    `runFallbackUsage` → `nodeFallbackExecutor.start` → `spawn('agy', ['-p','/usage'])`.
  - The same chain runs from `LaneDeliveryLimitGate.check` in
    `cli-agent-runtime/.../messaging/agent-message-coordinator.service.ts:179,461` and
    `agent-message-delivery.scheduler.ts:270`.
- Why it matters: the binding condition says "A fallback NEVER runs ... during a lane spawn.
  It runs only when a list caller asks for a snapshot". With a cold 30 s cache and a failed
  OAuth/local server, an antigravity spawn now starts `agy` (up to 8 s, and the spawn waits on
  it). `PlanUsageReadRequest` has no field that tells a list caller from a spawn caller, so no
  part of the chain can enforce the rule.
- Fix: add an explicit opt-in to the read request (for example
  `allowCliFallback?: boolean` on `PlanUsageReadRequest` and on the `getOwnerSnapshot` options),
  default `false`. Set it to `true` only from the list caller (`ptah_agent_list` path,
  `protocol-dispatcher.ts:1667`, and the dashboard snapshot RPC if that is a "list caller").
  In the `antigravity-cli` source, return `source-not-applicable` (or a new typed reason) when
  the flag is absent. The spawn gate and the delivery gate then use the cached snapshot only.
  Add a test in `antigravity-plan-usage.reader.spec.ts` that proves `readCli` is not called
  without the flag, and one service-level test for the flag pass-through.

### B2. Windows tree kill runs after the direct child is dead; grandchildren survive

- Evidence: `readers/fallback-usage.runner.ts:137` calls `processHandle.kill()`
  (`child.kill()` = `TerminateProcess` on Windows) first. Then `:141-142` calls
  `killProcessTree(pid, 'SIGKILL')`, which on Windows runs `taskkill /pid <pid> /T /F`
  (`libs/backend/platform-core/src/utils/process-tree-reaper.ts:59-73`). When the parent PID is
  already gone, `taskkill /T` cannot walk the tree ("process not found"). The error is
  swallowed (no `onError`), so the result looks clean. The same order applies on the
  output-cap path (`fallback-usage.runner.ts:167,171` kill the direct child inside the executor
  before the runner's `finally`).
- Second defect on the same lines: the tree kill also runs on the success path, after the child
  closed normally. On Windows this starts one `taskkill` per successful read, and with PID reuse
  it can kill an unrelated process tree (`/T /F`).
- Test gap: `fallback-usage.runner.spec.ts:9-19` uses a fake handle whose `killTree` is a
  `jest.fn` that only resolves `closed`. All kill assertions (`:30-31,38,48,89`) check calls on
  that mock. The production handle from `nodeFallbackExecutor` has no `killTree`, so the
  `killProcessTree(pid)` branch, the call order, and the Windows behavior have no test. The
  test proves that the runner calls its own mock. It does not prove "no orphan".
- Fix:
  1. In `finally`, when the process has not exited (track `exitCode === null &&
     signalCode === null` in the executor handle, expose it as `exited(): boolean`), call the
     tree kill FIRST, then `kill()` only as a fallback. Skip both after a normal exit.
  2. In `nodeFallbackExecutor`, on output cap do not call `child.kill()`; reject only and let the
     runner do the tree kill (or do the tree kill there).
  3. Give the tree kill an upper bound (race with a timer) so that a hung `taskkill` cannot hold
     the gate (see m3).
  4. Add a spec that injects a fake `killProcessTree` (make it a parameter of the executor or
     the runner) and asserts: tree kill before direct kill on timeout, no tree kill after a
     normal exit, tree kill on output cap.

---

## Major

### M1. copilot, cursor and pi never get a `no-usage-source` snapshot in production

- Evidence: `quota/plan-usage.service.ts:92` keeps `NO_USAGE_SOURCE_PROVIDERS = new Set([])`.
  `LaneOwnerResolver.ownerForLane`
  (`cli-agent-runtime/.../limits/lane-owner.resolver.ts:117-133`) returns `undefined` for every
  CLI except codex, opencode, antigravity and grok. So `readLane` returns `{ owner: undefined }`
  (`lane-limit-lookup.service.ts:220`), and the formatter prints "limits not tracked"
  (`agent-limit.formatter.ts:540-541`). Discovery maps a selected copilot provider to
  `provider-unsupported` ("no reader for provider",
  `plan-limit-owner-discovery.service.ts:448`, `agent-limit.formatter.ts:257`).
- The C5 tests (`plan-tile-view.model.spec.ts:71-80`) build a snapshot with
  `status: 'no-usage-source'` by hand. No formatter test covers copilot, cursor or pi (the
  `agent-limit.formatter.spec.ts:210-229` cases use `cliRow('codex')`). The C5 report claim
  "Tests cover ... no-usage-source for copilot, cursor and pi" is true only for the
  presentation mapping, not for the product behavior.
- Fix: produce a typed `no-usage-source` result for these lanes. Options: (a) in
  `LaneLimitLookupService.readLane`, when `row.cli` is in a `NO_USAGE_SOURCE_CLIS` set
  (`copilot`, `cursor`, `pi`), return a status-only snapshot with `status: 'no-usage-source'`
  and no read, or (b) add an owner rule (`ownerForCliStore`) for them and add their provider
  IDs to `NO_USAGE_SOURCE_PROVIDERS`. Add a lookup-level test and a formatter test with
  `cliRow('copilot')`, `cliRow('cursor')`, `cliRow('pi')`.

### M2. Chain failure precedence hides the actionable CLI reason (regression vs batch (b))

- Evidence: `readers/usage-source-chain.ts:12-28`. `FAILURE_ORDER` does not list
  `cli-not-found`, `cli-exit-error`, `cli-backoff`, `cli-version-unsupported` or
  `service-unavailable`. `rank()` gives every unlisted reason the rank of
  `source-not-applicable`, and the comparison at `:71,74` uses `<`. Results:
  - cli-store owner, all three stages fail: OAuth `no-oauth` (rank 3) always wins. Batch (b)
    returned the CLI reason (`cli-not-signed-in`, `cli-timeout`, `cli-backoff`, ...). The user
    now sees "no OAuth" when the cause to fix is "sign in to agy" or "back-off active".
  - account owner: OAuth `source-not-applicable`, local `no-local-server` (rank 8), CLI
    `cli-not-found`/`cli-exit-error`/`cli-backoff` (unlisted, rank 9) cannot replace it.
  - if the first failure is `source-not-applicable` and later ones are unlisted, the final
    `statusReason` is dropped (`:84-85`), so the reason becomes empty.
- C2 reported this change. It is a user-visible regression, not a neutral port. The design
  says "Preserve the first useful failure reason", and `no-oauth` is not useful when the CLI
  stage ran.
- Fix: list every `UsageFailureReason` explicitly and make `rank` exhaustive (a
  `Record<UsageFailureReason, number>` gives a compile error on a new reason). Rank
  `account-unverified` first, then the reasons of the LAST applicable stage that ran (CLI
  reasons above `no-oauth`/`no-local-server`), which restores batch (b) output. Add tests for
  the three cases above.

### M3. The run is never aborted on dispose; a host exit can leave an `agy` process

- Evidence: `runSignal` exists in `FallbackRequest` (`fallback-usage.runner.ts:43-44`), but no
  production caller sets it (`antigravity-cli-usage.adapter.ts:115-120` passes only `signal`).
  `PlanUsageService` dispose does not reach the runner. On POSIX the child is spawned with
  `detached: true` (`fallback-usage.runner.ts:160`), so it survives a parent exit by design.
  On Windows no job object ties the child to the host.
- Why it matters: binding condition "a dispose leave[s] no child". The test
  "reaps an explicitly aborted run" (`fallback-usage.runner.spec.ts:83-89`) proves a path that
  production never uses.
- Fix: keep a module-level set of live handles in the runner and export
  `disposeFallbackRuns(): Promise<void>` that tree-kills all of them; call it from
  `PlanUsageService` dispose. Or pass a service-owned `AbortSignal` as `runSignal`. Add a
  test that the service dispose kills a running fake child.

### M4. Codex rollout data has no owner proof and can cross accounts

- Evidence: `readers/codex-rollout-usage.reader.ts:82-130` reads the newest rollout of the
  default Codex home (`codex-plan-usage.reader.ts:63`, `new CodexHomeResolver().path`). The
  event has no account identity check (the fixture even shows a `limit_id`, which is ignored).
  The guard at `codex-plan-usage.reader.ts:91-97` skips rollout only for
  `unsupported-auth`/`unsupported-config`/`cli-version-unsupported`.
- Why it matters: after `codex login` with another account (or a second account home in use),
  a rollout up to 15 min old from the old account becomes a verified `available` snapshot of
  the new owner. The design says "an unverified owner ... cannot win" and "never share rows
  across owners".
- Fix: accept a rollout event only when it is newer than the last change of the home's
  `auth.json` (mtime) AND the App Server did not report a sign-out/not-signed-in status; or
  compare an account field in the rollout `session_meta` with the owner key fingerprint. If no
  check is possible, return `account-unverified`. Add a spec with an auth file newer than the
  event.

### M5. Rollout windows are stamped `stream-event`, which the ledger treats as live evidence

- Evidence: `codex-rollout-usage.reader.ts:115-116` sets `usedSource`/`resetSource` to
  `'stream-event'`. `libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts:54-56`
  treats `stream-event` as a live source; `:89-97` prevents a later stale reading from
  replacing a live exhausted entry. `plan-limit-format.ts:185` shows it as "Live event".
  `used_percent: 100` with a future reset gives a limit-reached window, so the C3 claim
  "The rollout source supplies no exhaustion evidence" is not correct.
- Why it matters: a file record up to 15 min old is presented as a live event and gets live
  precedence. Combined with M4 it can block a lane with another account's state.
- Fix: stamp these windows with a non-live source (`provider-unofficial`, or add a
  `local-file` `PlanLimitSource` with its label), keep `observedAt` = event time. Optionally
  cap `used_percent >= 100` to "unknown" unless the App Server confirms. Add a spec that a
  100 % rollout window does not create live exhausted evidence.

### M6. Codex App Server "available with no windows" now becomes `service-unavailable`

- Evidence: `usage-source-chain.ts:30-36` rejects a reading with `windows.length === 0`. In
  `codex-plan-usage.reader.ts:99-104` the facade returns the mapped App Server result only when
  `lastResult.status !== 'available'`. An `available` App Server answer with credits/allowances
  but no rate-limit window (`mapCodexAccountUsage`, `:151-162`, `windowSetEstablished: true`)
  falls through to the chain result `service-unavailable` (reason `cli-unavailable` from the
  rollout).
- Why it matters: batch (b) returned `available` with `account`, `credits`, `allowances`.
  Now the data is lost, the snapshot is transient, and `settle` may reuse older cached windows
  as `stale` (`plan-usage.service.ts` `isTransientFailure`).
- Fix: in the facade, if `lastResult?.status === 'available'` and the chain did not win,
  return `mapCodexAccountUsage(lastResult, now())` (annotated with `provider-api`). Add a spec.

### M7. The 11 s chain deadline now applies to the Codex App Server

- Evidence: `codex-plan-usage.reader.ts:98` calls `readUsageSourceChain(...)` with the default
  `USAGE_CHAIN_DEADLINE_MS = 11_000` (`usage-source-chain.ts:10`). The App Server client has a
  10 s timeout per request (`providers/codex/codex-account-usage.service.ts:41`), and one read
  can need more than one request plus a cold start. The chain aborts the stage signal at 11 s,
  which aborts `getAccountUsage`.
- Why it matters: batch (b) had no outer deadline for Codex. A slow cold start can now fail on
  every read and never reach the rollout source either (deadline used up).
- Fix: pass an explicit, larger deadline for the Codex chain (for example App Server budget +
  rollout budget), or exempt the first stage from the chain deadline. Confirm with a spec that a
  12 s App Server answer still wins.

---

## Minor

- m1. `fallback-usage.runner.ts:96`: when the deadline already passed, `ms` is 0 but the
  process is still spawned and killed at once. The antigravity CLI stage also lost the batch (b)
  `MIN_STAGE_MS` check and the clamp to the remaining budget
  (`antigravity-plan-usage.reader.ts:122` passes the fixed 8 s). Fix: return
  `cli-timeout`/`budget` without a spawn when the remaining time is under 1 s, and pass
  `min(8 s, remaining)`.
- m2. `fallback-usage.runner.ts:82-88`: if `execute` rejects (for example `dispose()` or
  `logger.warn` throws in `finally`), `void flight.then(...)` has no rejection handler. That is
  an unhandled rejection, and the caller promise never settles until its signal aborts. Fix:
  `flight.then(ok, () => resolve(failure('cli-unavailable')))`.
- m3. `fallback-usage.runner.ts:141-142`: `killTree()`/`killProcessTree()` is awaited without
  an upper bound. A hung `taskkill` or pty `killTree` holds the per-CLI and global gate forever
  (`total`/`running` are released only in `.finally`, `:76-79`). Fix: race the tree kill with a
  timer (for example 2 s).
- m4. `fallback-usage.runner.ts:68-71`: reasons `cli-unavailable` (exit by signal, abort) and
  `cli-not-found` get no back-off, and the service does not cache transient failures. Each list
  read can start a new process for a CLI that dies by signal. Fix: apply the 5 min back-off to
  `cli-unavailable` when a process actually started.
- m5. `fallback-usage.runner.ts:173-174`: exit code 0 with any stderr text is
  `unexpected-stderr` → `cli-parse-failed` → 30 min back-off. A harmless warning on stderr
  disables the source for 30 min. Confirm this matches batch (b) behavior; if not, keep the
  batch (b) rule.
- m6. `fallback-usage.runner.ts:151`: the log is `warn` for every run, also on success. Use
  `debug` for `ok` and `warn` for failures. Content is correct (source ID, reason,
  elapsed bucket only).
- m7. `usage-source-chain.ts`: `retryAfter` from a failed source is dropped; the snapshot never
  carries it. The design says a failure reports a reason and `retryAfter`.
- m8. `antigravity-plan-usage.reader.ts:110`: batch (b) stopped the chain on `account-changed`
  from the local server. Now it continues to the CLI stage. For an `account` owner the CLI
  owner check protects it, so this is acceptable, but add a test that a cli-store owner with
  `account-changed` does not produce a cross-owner CLI reading.
- m9. `codex-rollout-usage.reader.ts:42-66`: the walk does `realpath` + `stat` for every
  rollout file of every year at each read. Walk only the newest year/month/day directories.
  `:54` compares a non-real joined path with the real `root`, so a home under a junction or
  symlink returns no file (fails closed, but silently).
- m10. `codex-rollout-usage.reader.ts:94,107,119,124,127`: the reason `cli-unavailable` for a
  local file failure gives wrong user text ("cli unavailable"). Add a typed reason (for example
  `local-state-unavailable`/`local-state-stale`) with dashboard and formatter labels in a
  later batch, or reuse `source-not-applicable` for "no file".
- m11. `fallback-usage.runner.ts:59,61`: two `as` casts on internal generic state. Not external
  data, so the rule is not broken. A per-source typed store removes them.
- m12. `agent-limit.formatter.ts:318`: the doc comment "The list's `Limit state` cell ..." is
  now attached to `USAGE_SOURCE_LABELS`, not to `formatLimitColumn`. `USAGE_SOURCE_LABELS` and
  `readingSourceText` are duplicated in the formatter and in `plan-tile-view.model.ts:46-62`;
  a shared helper in `@ptah-extension/shared` (`plan-limit-format.ts`) avoids drift.
- m13. `plan-usage.service.ts:388-399`: `source`/`readAt` are set only for `available`
  readings. A reader's own `stale` answer (Codex App Server `stale`) has no source or age.
- m14. `fallback-usage.runner.ts:7`: `node:child_process` moved from the adapter to the runner.
  The rule allows one owner file; the adapter no longer imports it, so this is OK. Record the
  move in the design note.

---

## Checked and found OK

- Gate counts: `total >= 2` and one flight per `sourceId` (`fallback-usage.runner.ts:63-66`);
  release in `.finally` on resolve and on reject (`:76-79`). A sync throw from
  `executor.start` is caught inside `execute`. No leak except the unbounded tree kill (m3).
- Timeout, early exit, caller abort, spawn error, output cap: each path reaches the `finally`
  with a direct kill, dispose and a bounded 500 ms close wait (`FALLBACK_CLOSE_GRACE_MS`).
  POSIX: `detached: true` + group `SIGKILL` reaps grandchildren after the leader exits.
- Caller abort ends only the caller wait (`:82-88`); the run continues to its 8 s cap.
- Constants: 8 s, 30 s, 30 min, 5 min, 64 KiB in one file `fallback-usage.constants.ts`, not
  settings. The cache key has source ID, owner key, executable, version and account fingerprint
  (`:54-55`); antigravity passes the active store owner key as the fingerprint.
- Cache hit keeps the original `readAt` (`:57-60`); service cache and stale reuse keep the
  annotated `readAt`/`source` of the cached reading (`plan-usage.service.ts` `settle` uses
  the cached reading as `staleFrom`). `fetchedAt` is unchanged.
- No synthesized 100 % window: chain failure returns `windows: []`
  (`usage-source-chain.ts:86-91`); `no-usage-source`, empty and `sourceInvalid` readings cannot
  win (`:30-36,66`); the winner must carry its own label (`:66`).
- Owner isolation in the chain: each source runs on the same `request.target`; no row moves
  between owners in the chain itself (M4 is a source-level problem).
- Antigravity order OAuth → local RPC → CLI, 11 s chain, 3 s OAuth/local stages, 8 s CLI cap,
  owner check before and after the CLI read (`antigravity-plan-usage.reader.ts:90-131`),
  fixed argument array `['-p','/usage']`, no shell, Zod tuple parser unchanged
  (`antigravity-cli-usage.adapter.ts:32-49,118`).
- Logs: only `sourceId`, `reason`, `elapsedBucket` (`fallback-usage.runner.ts:151-153`). Error
  objects with `stderr`/`stdout` are not logged. Codex facade rethrow reaches the service, which
  logs `errorKind` only. No `console.*` in touched files.
- Zod at the boundaries: antigravity rows (`antigravity-cli-usage.adapter.ts:32-49`), rollout
  lines `JSON.parse` → `unknown` → `event.safeParse` (`codex-rollout-usage.reader.ts:10-25,
  97-103`). No `any`, `@ts-ignore` or `as unknown as` in the new files. Catch variables are
  `unknown`.
- Degradation audit: ran `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`
  (exit 0). `libs/backend/auth-providers: 23 ok (baseline 24)`,
  `libs/backend/vscode-lm-tools: 2 ok (baseline 2)`. No new orphaned marker in touched files.
  The baseline does not go up.
- Rollout reader: tail bound 256 KiB with the first partial line dropped (`:68-80`); 15 min
  freshness ceiling and future-timestamp rejection (`:104-107`); expired windows dropped
  (`:110`); `..`/absolute/other-root paths rejected by `inside()` with `realpath` on the home,
  the `sessions` dir, each dir and each file (`:36-58`).
- Fixture `fixtures/codex-rollout-0.166.jsonl`: synthetic, uses `<account>`, no real ID,
  e-mail, token or home path.
- Presentation: `Record<UsageSourceLabel, string>` maps are exhaustive in both places; age is
  computed from `readAt` and `now` at render time (`provider-account-tile.component.ts:98-99`
  uses the shared clock input). `PLAN_LIMIT_REASON_LABELS` needs no change because no reason
  was added. The one HTML line (`provider-account-tile.component.html:20-22`) is an `@if` with
  text interpolation and a `title` binding: no unsafe binding.
- Layering: no `electron`/`vscode` import in the touched libs. `child_process` is imported
  only in `fallback-usage.runner.ts` (and lazily in `platform-core`'s existing reaper). Imports
  use `@ptah-extension/*` aliases. `platform-cli` and `cli-engine` do not reference
  `PlanLimitOwnerSnapshot` or `UsageSourceLabel`; the shared change only adds optional fields,
  so they are not affected.
- Startup/DI: `PlanUsageService` constructor and `register.ts` are unchanged; the runner is
  reached only from `PlanUsageService.read` through the antigravity reader. No constructor, DI
  factory or Electron activation calls it. (The lane spawn and delivery paths do: see B1.)

## Not run

- No test run by this review. The lane reports state `auth-providers` passed except the 2
  known Windows failures, and the C5 run failed on a type error that C3 later fixed. The
  coordinator must run `npm run verify -- -p auth-providers,shared,vscode-lm-tools,dashboard`
  on the final tree before commit.
