# Context — TASK_2026_2282_5d12

## Problem

The Electron main process crashed twice on 2026-11-18 (12:50 and 17:01 local) with exception
`0xE0000008` (`ptype=browser`, V8 OOM annotations, `location=CALL_AND_RETRY_LAST`).

Evidence from the second Crashpad minidump:

- Main-isolate heap: 370 MB of a 4192 MB limit. System commit free: 31.5 GB.
- One 4 GB region (the V8 pointer-compression cage, shared by the main isolate and every
  `worker_threads` isolate of the process) had 3.84 GB committed.

Evidence from a 28-minute sample of the live main process (5 s interval), compared with the log:

- Each `ptah_get_diagnostics` call lines up with a rise of the main-process commit: one compile
  adds about 1.5 GB, two overlapping compiles reached 3223 MB.
- The compile continues after the 45 s answer (`RESULT_BUDGET_MS`), and an idle worker keeps its
  program for 60 s (`IDLE_TERMINATE_MS`).
- Workers are keyed by `(tsModulePath, lane)`. Each worktree has its own compiler path, so the
  number of live workers has no global bound. No worker sets `resourceLimits`.

Three overlapping (or still-resident) compiles exceed the 4 GB cage and kill the application.

## Scope of this task

1. Global bound on live diagnostics workers: at most one per lane (`scoped`, `unscoped`) across
   all compilers. Idle workers of another compiler are terminated first; busy ones are waited
   for (queued, never torn down mid-run).
2. `resourceLimits.maxOldGenerationSizeMb` on each worker, so an oversized compile fails alone
   and reports `unavailable`.
3. Telemetry: worker start / exit / out-of-memory, and heap use per run.

## Out of scope (follow-up)

- Moving the compile into a child or utility process (its own cage). This is the full
  correction and needs a new bundle target.
- Cancelling the compile at the 45 s answer. The current behaviour is deliberate
  (TASK_2026_559): a retry shares the running compile. Item 1 bounds its cost instead.

## Decisions (coordinator)

- Caps: `unscoped` 1792 MB, `scoped` 1024 MB. Budget: 2816 MB for diagnostics plus about
  0.6 GB for the main isolate and other workers stays under the 4 GB cage. The observed cost of
  one compile was about 1.5 GB of process commit. If the cap proves too low for the unscoped
  monorepo check, the telemetry of item 3 shows it and the cap is a single constant.
