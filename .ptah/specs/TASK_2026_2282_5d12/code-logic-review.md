# Code Logic Review — TASK_2026_2282_5d12

## Verdict

**REVISE — 6/10.** The one-worker-per-lane bound, awaited termination before replacement, OOM mapping and telemetry are sound. A queued cross-compiler run can be starved by a busy same-key stream, and the fairness path has no test. Both are cheap to fix.

Spec run: both spec files pass (2 suites, 86 tests). No test exercises the starvation case in defect 1, so the pass does not clear it.

## Defects

1. **major — `ts-diagnostics-worker.ts:223-246` (`run()`): same-key runs jump ahead of queued cross-compiler runs → starvation.**
   Steps: unscoped lane has worker A with a run pending. Compiler B posts a run → queued (existing key ≠ B). Compiler A (the same worktree, e.g. agent retries) posts another run: `existing.key === key(request)` and nothing is retiring, so the code takes `postRun` directly and never looks at the queue. `drain()` only replaces A once `entry.pending.size === 0` (line 260). While A keeps receiving overlapping runs, pending never reaches 0, so B waits until the 300 s queue timeout and is rejected with "queue wait exceeded". This is the FIFO guarantee in the contract, and the pattern is plausible: the provider deliberately leaves a compile running after the 45 s answer, and agents retry.
   Fix: in `run()`, queue whenever `this.queues.get(lane)?.length` > 0, not only when `retiring`/different-key. `drain()` already posts a same-key head directly.

2. **minor — `ts-diagnostics-worker.ts:471-486` (`settleIdle`): idle timer armed after `drain` has posted a run.**
   `drain()` at line 476 can call `postRun`, which cancels the idle timer. Line 478 then arms a fresh one while `pending.size > 0`. The callback at line 481 returns early, so nothing breaks, and the next `settleIdle` re-arms it. It is dead work, but it also means `entry.worker.unref()` (line 475) ran before the `ref()` in `postRun`; that ordering is fine. Fix: return after `drain` if `entry.pending.size > 0`.

3. **minor — `ts-diagnostics-worker.ts:369`: `raw as WorkerResponse` on worker messages is unvalidated.** Repo rule says parse IPC data with Zod. This is pre-existing, but the diff adds two more optional heap fields to the unvalidated shape. Low risk (the worker is our own code).

4. **minor (design note) — `resourceLimits` only sets `maxOldGenerationSizeMb`** (`ts-diagnostics-worker.ts:356`). Young generation and external memory (ArrayBuffers) are not capped, so the "fails alone" guarantee is slightly looser than stated. A worker at the old-gen cap can still hold a few hundred MB more in the shared cage. Consider `maxYoungGenerationSizeMb` or keep the headroom the 0.6 GB budget assumes. Not a blocker.

## Checked and correct

- Two workers alive in one lane while a termination is pending: `failWorker` calls `forget()` and sets `retiring` synchronously (`ts-diagnostics-worker.ts:422-433`). `run()` (line 226) and `drain()` (line 254) both refuse to construct while `retiring.has(lane)`. The replacement is built only after the awaited termination resolves (line 429-432).
- Worker `error` then `exit` ordering: `error` calls `failWorker` (line 377). `exit` then runs `forget` and `rejectPending`, which are no-ops, and `drain` returns early because the lane is retiring (lines 379-388). An `exit` with no prior `error` has no live thread, so the immediate `drain` is safe.
- Run timeout: `pending.delete(id)`, then `failWorker`, then reject only after termination (lines 281-303). `failWorker` rejects siblings with a distinct message, and the queue drains after termination.
- Idle timer firing while a run is queued: `settleIdle` calls `drain` first, which fails an idle different-key worker and re-checks `workers.get(key)` (lines 475-478). Same-key head is posted directly.
- Idle timer on a retired entry: `forget()` cancels it (line 441), and the callback re-checks registration (line 482).
- Queued run lost or started twice: it is shifted and its timer cleared before `postRun` (lines 264-266). The timeout path splices it only if still present (lines 231-233). A synchronous `ensureWorker` failure rejects via `postRun` (lines 273-276).
- Queue timer vs compile timer: the queue timer is cleared at start (line 265) and the compile timer is created in `postRun` (line 281). The two are independent.
- `dispose()` rejects queued runs, clears timers and the queue (lines 326-337), refuses new `run()` while disposing (line 219), and `drain` is gated on `disposing` (line 254). It joins `terminations` (line 338), including termination started earlier by timeout/error.
- `ref`/`unref`: `unref` at construction (line 358), `ref` in `postRun` (line 304), `unref` in `settleIdle` (line 475). Idle and queue timers are `unref`'d (lines 239, 300, 485).
- OOM path: Node emits `'error'` with `code: 'ERR_WORKER_OUT_OF_MEMORY'` before `'exit'`. The handler maps it to a message with the limit and preserves `code` (lines 371-377). The provider catch turns any rejection into `unavailable` and warns on the code (`type-script-diagnostics-provider.ts:~426-433`), so it never produces a false clean result.
- Worker source: heap fields are measured after `run()` returns (`ts-diagnostics-worker-source.ts:~275`), it is still plain CommonJS with no imports, and the header contract comment lists the new fields.
- Provider/DI: the logger is optional and typed `Pick<Logger,'info'|'warn'>`, `register.ts` passes it, the CLI host is unaffected, and there is no `any`, no `!`, and the catch uses `error: unknown`. The only production cast is the pre-existing `raw as WorkerResponse` (defect 3).
- Unchanged behaviours: `RESULT_BUDGET_MS`, cache TTL, `IDLE_TERMINATE_MS`, `admissionToken` — not touched in the diff.

## Test gaps

- No test for starvation or FIFO fairness (defect 1): A pending, B queued, then another A run. This is the case that would have caught it.
- No test of FIFO order with three or more compilers or lane mixes.
- No test that an idle timer firing with a queued run replaces the worker, and none for the exit-without-error path draining the queue.
- OOM is covered only with a hand-emitted `error` on the mock. No real-thread test with a tiny `resourceLimits` (the spec already supports an injectable worker source). This leaves the event name and `code` property unproven against Node.
- The queue-timeout test asserts the timed-out run's rejection but not that the queued entry is gone from the queue or that the lane then drains.
- The heap test only checks pass-through on the mock. Nothing checks that the real worker source emits `heapUsedMb`/`heapTotalMb`.
- Provider telemetry tests mock `tsDiagnosticsWorker.run`, so the "one info line per run" check depends on the result cache. No test covers a run rejected for a non-OOM reason (no warn expected).

## Round 2

**Verdict: APPROVED** (no new defects).

### Round-1 defects
- Defect 1 (starvation): **fixed**. `ts-diagnostics-worker.ts:229-234` a run joins the queue whenever the lane queue is non-empty, so a same-key run cannot pass an older queued run. Trace A busy, B queued, A2 queued: A settles, `settleIdle` calls `drain` (`:262-272`), which sees head B on a different key with A idle, so it retires A. When the termination finishes, `failWorker` clears `retiring` and drains, posting B. The follow-up `drain` (`:276`) sees head A2 on a different key with B busy and returns. B settles, `settleIdle` drains, B is retired, A2 starts on a fresh worker. FIFO holds.
- Defect 2 (`settleIdle` leaves the idle timer set after drain posts a run): **fixed**. `settleIdle` returns after `drain` when `entry.pending.size > 0` (see the `pending.size > 0` early return directly after `this.drain(entry.lane)`, `ts-diagnostics-worker.ts:~494-498`).

### Stranding check for the new `waiting` condition
- Queue non-empty, no live worker, not retiring, new run arrives: the run is queued (`:229-235`), then `drain` runs right away (`:252`). It finds no entry, shifts the head and posts it, then drains again. Not stranded.
- Paths that free the lane each end in a `drain`:
  - settle: `settleIdle` calls `drain`.
  - worker `error`: `failWorker` drains when the termination finishes.
  - `exit`: `failWorker` drains when the termination finishes, plus an explicit `drain` (`:402`).
  - run timeout: `failWorker` drains when the termination finishes.
  - idle termination: now goes through `failWorker`, which drains.
- Paths that shorten the queue end in a `drain`: start (`:276`), queue timeout (`:246`). `dispose` clears the queue and rejects every queued run, and no run is admitted while disposing.
- A `drain` that returns early (retiring, or head on another key with the entry busy) always has a pending event that will call `drain` again.

### New test (`ts-diagnostics-worker.spec.ts:320-340`)
- It would fail without the fix: A2 would be posted directly to worker A. A would then not be idle when A1 settles, so `terminateCalls` would stay 0 at `:330` and `instances` would stay at length 1 at `:331`.
- It proves FIFO through the order A, then B on instance 1, then A2 on instance 2, with `terminateCalls` and instance counts asserted at each step.

### New defects
None.
