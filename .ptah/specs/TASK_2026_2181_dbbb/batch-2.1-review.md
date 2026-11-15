# Batch 2.1 review: ptah_agent_spawn dedupe, gate budget, timing

Files: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/` (`agent-spawn-dedupe.ts`, `protocol-dispatcher.ts` ~1139-1330, `agent-spawn-limit-gate.ts`, specs). Static read only; no tests or tsc run.

## Verdict

APPROVE WITH FIXES

The concurrency core is sound. Defects 1-3 are behavioural and should be fixed or consciously accepted before merge.

## Defects

1. Serious. `agent-spawn-dedupe.ts` (entry settled at `promise.then`, TTL 120 s) with `protocol-dispatcher.ts` ~1205-1262. The window starts when `agent.spawn` returns, not when the lane ends. Scenario: lane A fails in 10 s (quota or auth), and the agent re-spawns the identical task on purpose. It gets "Replay of earlier spawn: A" for the dead lane for another ~110 s, with no hint that A has ended. Fix: on a replay, look up `ptahAPI.agent.status(agentId)`. If the lane is terminal and failed, drop the entry and start a new lane. Or put the lane's status into the replay text. Or evict the entry when the lane terminates.
2. Serious. `protocol-dispatcher.ts` ~1286-1300 (`const limits = gate?.peekLimits()`) with `agent-spawn-limit-gate.ts:150-151`. For an auto-detect spawn (`target` undefined) there is no pre-lookup, so `peekLimits()` is always `undefined`. The success reply loses the `Limit state` block, which main produced through a post-spawn lookup. The "limit lookup timed out" note from `appendPendingSpawnLimits` (main dispatcher line 1272) is also gone on the named-target path when the pre-lookup is pending. The spec "does not look up limits after an auto-detected spawn" only pins that the lookup is absent. Fix: confirm this with the task owner. If the block is still wanted, append `formatPendingSpawnLimitBlock` when `preLimits` was PENDING and unsettled. Expose a `pending` flag from the gate for that.
3. Moderate. `agent-spawn-dedupe.ts:51-52` (`while (size >= MAX_ENTRIES) delete(oldest)`). It evicts the oldest entry by insertion order even when that entry is in flight (`expiresAt = Infinity`). A retry of that in-flight spawn then starts a duplicate lane. It needs about 200 distinct spawns while one is still pending, so it is rare. Fix: skip in-flight entries when evicting (prefer settled-and-expired first). If all 200 are in flight, run without dedupe.
4. Moderate. A hung `agent.spawn` leaves an `Infinity` entry that never expires. Every identical retry then awaits the same hung promise. Before this change a retry started a new lane. Fix: give the in-flight entry a ceiling (for example 5 min) after which it is ignored.
5. Minor. `protocol-dispatcher.ts` error path (~1255-1262). On a replay caller `gate` is `undefined`, so an `AgentRoleError`, `CliCommandLineTooLongError` reply for a concurrent replay loses the `Limit state` suffix. The text is otherwise identical. Cosmetic, no fix needed.
6. Minor. With `idempotencyKey` set, `force: true` does not bypass dedupe, because the check is `force && !idempotencyKey`. It also does not appear in the key, so a gate refusal is not cached (good). The behaviour is consistent but undocumented in the schema comment (`agent-spawn-args.schema.ts:112`).
7. Verify only. `gate`, `gatedAt` and `spawnedAt` are declared with `let` and assigned inside a closure. TypeScript may narrow them to `undefined` / `never` at the later `gate?.peekLimits()` and `gatedAt === undefined` sites. I could not confirm this without running `tsc`. Check the gate output.

## Checked and correct

- Q1 concurrency: `entries.set` runs synchronously inside `run()`, before any await. The work is scheduled with `Promise.resolve().then(start)`, so a second concurrent call finds the in-flight promise. No two concurrent identical calls can both start a spawn (apart from defect 3).
- Q1 rejections: the `.then(ok, noop)` and `.catch(evict)` handlers both handle the rejection, so there is no unhandled rejection. The evict handler is registered before the caller's `await`, so the failed entry is gone by the time the caller can retry. `evict` checks `entries.get(key) === promise`, so it cannot delete a newer entry.
- Q1 key: it covers every spawn arg (task, cli, ptahCliId, model, tier, files, role, phase, skills, effort, resume id, account, permission, network, timeout, deliverables, taskFolder, resolved workingDirectory) plus scope. It excludes only `force` and `idempotencyKey`. `canonical()` sorts object keys, keeps array order, and `JSON.stringify` drops `undefined`. It is stable within a process; `localeCompare` is deterministic there.
- Q2 refusal: `SpawnGateRefusal` is caught first, and the log message, fields and `Error: <text>` reply match main. A concurrent replay caller shares the rejection and gets the same refusal. Rejections are evicted, so refusals are not cached. `force: true` skips dedupe, so a forced retry still works.
- Q3 replay caller: `gate` is undefined and `forced` is undefined. The replay branch returns before `gate` is read. The error path uses `gate?.`, so it is safe. Timing: `limitGateMs` and `spawnMs` become null for the replay caller; this is acceptable.
- Q5 `peekLimits`: it returns `preLimits`, or the settled value of the same lookup when the lookup was pending. It does not wait. It is bounded by 1 s plus the spawn time, and for a named target it is the right lane (same lookup, same model). Staleness is only what was read before the spawn. The auto-detect case is defect 2.
- Q6 timing: the `finally` runs on a parse-failure early return (parse spans are set, the rest are null), on a refusal (`spawnMs` and `replyFormattingMs` are null), on a thrown error (the inner `finally` sets `spawnedAt`) and on success. The fields are timings, `agentId` and `cli` only. There is no task text or key in the line.
- Gate budget: 4 s to 1 s is applied once. The spec constant was updated.

## Q7 realistic false-positive replays (scope fallback)

- All external MCP clients with no `_callerSessionId` share the first workspace root scope. Two separate agent sessions on the same machine that send the same (task, cli, model, ...) within 120 s collapse into one lane. The second one gets a replay pointing at the first one's lane. Unlikely, since task text is usually unique.
- Defect 1: re-spawn after a fast failure.
- An orchestrator that intentionally fans out N identical lanes (same task and cli) in one session gets one lane plus replays. The replay text tells the caller to use `force` or `idempotencyKey`.
- A deliberate resume or retry of the same task after a lane finishes successfully within 2 minutes gets a replay. This is the same class as defect 1.

## Test gaps

| Acceptance point | Status |
| --- | --- |
| One underlying spawn for two concurrent calls | Proven (dedupe spec 1, dispatcher spec "simultaneous", `spawn` called once) |
| Replay within 120 s | Proven (both specs) |
| New spawn after 120 s | Proven at unit level (fake timers, `advanceTimersByTime(120_001)`); not at dispatcher level |
| `force` bypasses | Proven at unit level; dispatcher test shows only that `force` is not forwarded |
| Distinct key starts a new lane | Proven |
| Same key with a different task is a replay | Proven |
| Failed first call is not replayed | Proven at unit level (rejects once, retry starts). Not tested: a concurrent replay caller of a failing call. |
| AT LIMIT still refused | Not proven by this batch's new specs. The dispatcher spec has no refusal test; coverage must come from `agent-spawn-limits.transport.spec.ts` (I did not confirm it). Add one test: refused call, then an identical retry is also evaluated (not cached), and a concurrent replay caller gets the same refusal. |
| No limit lookup after spawn | Proven for the auto-detect path only. Not proven for a named target (pre-lookup is allowed, no second lookup). |

Also untested: `MAX_ENTRIES` eviction (and defect 3), the hung in-flight entry (defect 4), the replay `Limit state` loss (defect 2), the timing line for refusal and parse failure, and the replay reply wording for the concurrent second caller (the spec checks only `a-9`).
