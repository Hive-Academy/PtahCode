# Code logic review — TASK_2026_2252_a91c, PR A (windows-job-native)

Verdict: PASS WITH CHANGES — 7/10 (sound). The logic matches the approved small design in
`context.md:17-40`. The intended call path is correct. Zero critical findings, 2 major and
5 minor findings follow. Checks run: none; the task forbids builds and tests. This review is
code reading. The known result (clean compile, 13 unit and 6 live cases pass on Windows x64)
is stated by the task and was not re-run here.

Scope examined, in full: `libs/backend/windows-job-native/native/windows_job.c`,
`binding.gyp`, `src/lib/windows-job-assigner.ts`, `src/lib/windows-job-assigner.spec.ts`,
`src/lib/windows-job-assigner.live-windows.spec.ts`, `project.json`, `jest.config.ts`,
`eslint.config.mjs`, the three `tsconfig*.json`, `src/index.ts`, the package
`.gitignore`, `libs/backend/platform-core/src/interfaces/windows-job-assigner.interface.ts`,
and the diff of `process-spawner.interface.ts`, `platform-core/src/index.ts` and
`tsconfig.base.json`.

## Findings

1. **major** — `libs/backend/windows-job-native/native/windows_job.c:102-111`
   (`close_job`). `napi_get_value_external` accepts every external value, also externals
   from other native modules. `close_job` cannot tell this module's external from a foreign
   one. On a foreign external it reads `handle->job` inside that foreign allocation, writes
   `NULL` at its first field, and passes the read value to `CloseHandle`. A direct
   `require` of the `.node` file can pass a foreign external. The result is memory
   corruption in another addon and a `CloseHandle` call on an arbitrary handle value. The
   wrapper never does this, but the raw module stays reachable in the packaged app.
   Smallest correction: tag the external with `napi_type_tag` at creation and verify with
   `napi_check_type_tag` in `close_job`; a magic first field is a weaker fallback.

2. **major** — `libs/backend/windows-job-native/native/windows_job.c:25-33,90` with
   `src/lib/windows-job-assigner.ts:44-52` and
   `libs/backend/platform-core/src/interfaces/windows-job-assigner.interface.ts:3-6`.
   The finalizer closes the job when the garbage collector collects the external. A caller
   that drops the `WindowsJobHandle` without `close()` gets a kill of the whole tree at the
   next collection, at a non-deterministic time. The direction is safe: an abandoned job
   must not leak its tree, which is the goal of the change. But no text states the rule.
   A PR C caller that stores the handle per root must know that the handle must stay
   referenced, and that losing the reference kills the root later. Neither the interface
   document, the wrapper, nor the contract in `context.md` records this semantic.
   Smallest correction: add one document line on `WindowsJobHandle` ("drop without close
   kills the job at the next garbage collection; keep the handle referenced while the
   root must live") and one on the wrapper class.

3. **minor** — `libs/backend/windows-job-native/native/windows_job.c:67`.
   `OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, ...)` requests
   `PROCESS_TERMINATE`, but no code calls `TerminateProcess`. The assignment needs
   `PROCESS_SET_QUOTA` only. The kernel kills the tree when the job handle closes; that
   needs no process handle right. The extra right can fail where the minimal right would
   pass. Smallest correction: open with `PROCESS_SET_QUOTA` only.

4. **minor** — `libs/backend/windows-job-native/native/windows_job.c:108-112`.
   `close_job` sets `handle->job = NULL` before `CloseHandle`. If `CloseHandle` fails, the
   job handle is unreachable, every later close is a silent no-op, and the tree never dies
   by job. The wrapper sets `closed = true` before the native call, so it cannot retry
   either. `CloseHandle` on a valid handle does not fail in practice, so the likelihood is
   very low. Smallest correction: on failure restore `handle->job = job` before the throw.
   The function is single-threaded, so the restore is safe.

5. **minor** — `libs/backend/windows-job-native/native/windows_job.c:67` and
   `src/lib/windows-job-assigner.live-windows.spec.ts:167-171`. `OpenProcess` opens a PID
   with no proof that the PID is still the caller's child. In the intended same-tick call,
   libuv still holds the child's process handle until the exit event, so Windows cannot
   recycle the PID first. This precondition is written nowhere. The live test
   "throws for an exited PID" assigns only after the exit event. If Windows recycles the
   PID inside that window, `createJobForPid` succeeds on an unrelated process, the test
   fails, and the unrelated process sits in a kill-on-close job until the finalizer kills
   it. Smallest correction: document the rule on `assignToNewJob` ("assign in the same
   tick as the spawn, before the exit event") and name the assumption in the live test.

6. **minor** — `libs/backend/windows-job-native/native/windows_job.c:52-53`. The argument
   check lets `NaN` pass: `NaN < 1` is false and `NaN > UINT32_MAX` is false. The value
   then reaches `(uint32_t)NaN`. The C standard makes that conversion undefined, because
   `NaN` is outside the range of the integer type. MSVC converts it to a fixed pattern
   today, and the following `!=` comparison still rejects the value. The check must not
   depend on undefined behaviour. Smallest correction: write `!(numeric_pid >= 1)` in place
   of `numeric_pid < 1`.

7. **minor** — `libs/backend/windows-job-native/src/lib/windows-job-assigner.ts:12` with
   `tsconfig.lib.json:4`. The default loader resolves the binary at
   `__dirname + '../../build/Release'`. That path is correct only while the module runs
   from `src/lib`, as under Jest. This repo compiles libraries into `dist/out-tsc`; from
   `dist/out-tsc/lib` the lookup misses the binary. Any bundler rewrite of `__dirname`
   moves it too. No check in PR A executes the compiled output, so a packaging mismatch
   can only surface in PR B. Smallest correction: add a comment at the loader that names
   the layout assumption, and let the PR B packed check assert it.

## Files with no finding

- `binding.gyp` — no finding. The `type: none` target on other operating systems is
  correct, and the package `.gitignore` keeps `build/` out of the commit.
- `project.json`, `jest.config.ts`, `eslint.config.mjs`, `tsconfig.json`,
  `tsconfig.lib.json`, `tsconfig.spec.json`, `src/index.ts` — no finding. The project is
  wired into the gate: `nx.json:222` and `nx.json:311` list this package for the eslint and
  jest plugin inference, and the manual `typecheck` target matches the sibling pattern.
- `src/lib/windows-job-assigner.spec.ts` — no finding. The 13 cases cover idempotent
  close, PID rejection, host rejection, the binary error cause, binding shape, and native
  error pass-through. No `any`, no swallowed error.
- `src/lib/windows-job-assigner.live-windows.spec.ts` — no finding besides the note in
  finding 5. The cleanup is sound: a PID set, `taskkill /T /F` per PID, and a
  marker-keyed PowerShell sweep that also catches detached orphans. Failures of the sweep
  fail the test through an `AggregateError`, so no leak stays silent. The self-skip gate
  matches the sibling `windows-orphan-cleanup.live-windows.spec.ts:153-155`.
- The platform-core additions — `windows-job-assigner.interface.ts`,
  `index.ts:21-25`, `process-spawner.interface.ts:77-78` — and the
  `tsconfig.base.json:155-157` mapping — no finding. They match the approved contract
  exactly: type-only exports, no native import, `windowsJobPolicy` optional with omitted
  meaning `no-job`.

## Verified correct

- `GetLastError` is captured before any cleanup call on every error path
  (`windows_job.c:59,62-65,68-71,73-77,79-82`). No error path loses the original error.
- Every error path closes the job it created. After a successful assignment, a later
  failure closes the job and kills the child (`windows_job.c:79-83`). That is the safe
  direction: no child survives as a native success after a failed step.
- `napi_create_external` failure calls the finalizer by hand, so no handle and no memory
  leak (`windows_job.c:90-92`); the `malloc` failure closes the job (`:84-88`). No double
  close exists anywhere: `close_job` nulls before it closes, and the finalizer closes
  only a non-null handle.
- The job and the process handle are non-inheritable
  (`windows_job.c:57,67`), so a later spawned child cannot keep the job open.
- The PID check rejects zero, negatives, fractions and values above 32 bits at both
  layers, and the wrapper keeps the external private inside the returned object, so
  finding 1 needs a direct require to trigger.
- The live tests cover the three promises of the design: descendants that join after the
  assignment die, a detached grandchild whose parent exited dies, and an unrelated process
  stays alive.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| The GC-finalizer kill direction is safe and stays | Kill on GC; keep the job alive after GC | The design goal is that an abandoned job dies with its tree; the module exists to close the orphan race (`context.md:24-29`; `implementation-plan.md:15`) | Yes, one comment can forbid it later |
| The missing `package.json` is PR B scope | Add now; defer | `context.md:46-48` puts packaging and the packed check in PR B; `apps/ptah-electron/scripts/rebuild-native.js:54-93` rebuilds node_modules packages | Yes |
| No live nested-job case is required | Add a case; accept the generic error path | `context.md:19-22` replaces the implementation batches; the unit native-error case covers the pass-through (`windows-job-assigner.spec.ts:45-52`) | Yes |
