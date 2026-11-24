# Batch B4 report — force plumbing + lazy freshness (TASK_2026_2312_c3ef)

Status: complete. All focused checks pass.

## Files changed

| File | Change |
| ---- | ------ |
| `libs/backend/memory-curator/src/lib/control/indexing-control.service.ts` | `IndexingRunDeps.runSymbols` options gain `force?: boolean`. `start()` passes its own `force` (computed at the old `:564`) into `runSymbolsIndexWithProgress`, which forwards it in the `deps.runSymbols` options. The caller's force is forwarded, not the joined census record's, so a forced start that joins an open boot census still reports `force` and the `indexing:start` handler's forced follow-up (which re-sends the same options) stays forced. `resume()` calls `start()` without options, so it never forces. |
| `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts` | The `runSymbols` adapter spreads `force` into `indexWorkspace` options (`...(options?.force ? { force: true } : {})`). Boot, watcher, lazy, resume and CLI runs never set it; `userInitiated: true` stays as before. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/code-namespace.builder.ts` | `startBackgroundRun` passes `force: true` with `userInitiated: true`, so `ptah_code_reindex` without `filePath` forces a full parse; the lazy run omits `force` (options stay `{ userInitiated: false }`). `isStale`: the "stale because empty" rule becomes `symbolCount === 0 && (validatedAt ?? null) === null`, so a validated zero-symbol root no longer starts a run on each tool call. Doc comments updated (D5, D2). |
| `libs/backend/memory-curator/src/lib/control/indexing-control.service.spec.ts` | New describe `force plumbing (TASK_2026_2312_c3ef D5)`: force reaches `runSymbols`; a non-forced start forwards `force: false`; a forced start that joins an open background census still forwards `force` (the property the handler's forced follow-up relies on); resume never forces. |
| `libs/backend/rpc-handlers/src/lib/handlers/indexing-rpc.handlers.spec.ts` | New case: `indexing:start` with `force: true` reaches the control service with `{ force: true }`, and the wrapped deps forward the run's `force` option to the underlying `runSymbols` unchanged and never add `userInitiated` (a boot-adapter concern, separate from force). No handler source change was needed: the existing forced-follow-up wrapper at `indexing-rpc.handlers.ts:201-227` already re-sends the same `options` it received, so it carries `force` once the control service forwards it. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/code-namespace.builder.spec.ts` | Updated the full-reindex assertion to `{ userInitiated: true, force: true }`. New describe `lazy freshness (TASK_2026_2312_c3ef)`: lazy run is never forced (aged index → `{ userInitiated: false }`, no `force` key); after an all-hit run (fresh `newestUpdatedAt` from `validatedAt`) no lazy run starts; a validated zero-symbol root starts no run; a zero-symbol root with `validatedAt` null still starts one. |

No change to `indexing-rpc.handlers.ts` source (see above), and no change to `apps/ptah-electron/src/di/task-end-hook-composition.ts`: its `runSymbols` adapter ignores the new optional option, which keeps the task-end hook non-forced exactly as D5 requires.

## Spec cases

All acceptance rows from the brief:

- `code-namespace.builder.spec.ts`
  - reindex passes `force: true` — updated existing full-run assertion.
  - lazy run is not forced — new case (exact options `{ userInitiated: false }`, no `force` key).
  - busy result unchanged — existing case "does not start a second full run while one is in flight" still passes unmodified.
  - after an all-hit run (fresh `newestUpdatedAt` from `validatedAt`) the lazy path does not start a run — new case.
  - a zero-symbol validated root does not start a run — new case.
  - a zero-symbol root with `validatedAt` null still starts one — new case.
- `indexing-control.service.spec.ts`
  - `force` reaches `runSymbols` — new case (asserts `force: true` plus signal and onProgress).
  - forced follow-up keeps force — new case: a forced start that joins an open background census still forwards `force: true` in the `runSymbols` options; the handler follow-up re-sends those options, so it stays forced.
  - resume never forces — new case (`force: false` on the fresh start resume performs).
- `indexing-rpc.handlers.spec.ts`
  - `indexing:start` with `force: true` reaches the control service with `force: true`, separately from `userInitiated` — new case (control receives `{ force: true }`; wrapped deps forward `force` unchanged; `userInitiated` never appears in runSymbols options).
  - Existing specs in all three files still pass (no other assertion was touched).

## Verification

Commands (CLI lane rules: no `npm run verify`, no `nx`), each output written to `.ptah/tmp/b4-*.log`:

| Command | Result |
| ------- | ------ |
| `npx jest --config libs/backend/memory-curator/jest.config.ts --runInBand --coverage=false --runTestsByPath .../indexing-control.service.spec.ts` | `Test Suites: 1 passed` — `Tests: 59 passed, 59 total` |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath .../indexing-rpc.handlers.spec.ts` | `Test Suites: 1 passed` — `Tests: 37 passed, 37 total` |
| `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath .../code-namespace.builder.spec.ts` | `Test Suites: 1 passed` — `Tests: 48 passed, 48 total` |
| `npx jest --config libs/backend/thoth-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath .../boot-thoth-runtime.spec.ts` (adapter change) | `Test Suites: 1 passed` — `Tests: 29 passed, 29 total` |
| `npx tsc --noEmit --project libs/backend/memory-curator/tsconfig.lib.json` / `tsconfig.spec.json` | exit 0 / exit 0 |
| `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` / `tsconfig.spec.json` | exit 0 / exit 0 |
| `npx tsc --noEmit --project libs/backend/thoth-runtime/tsconfig.lib.json` / `tsconfig.spec.json` | exit 0 / exit 0 |
| `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` / `tsconfig.spec.json` | exit 0 / exit 0 (no workspace-intelligence errors seen) |
| `npx eslint` on the six changed files | 0 errors; 1 pre-existing warning (`max-lines` on `indexing-control.service.ts`, already over the 700-line limit before this batch) |

## Decisions

1. **Forward the caller's force, not the census record's.** `runSymbolsIndexWithProgress` takes a new `force: boolean` parameter fed from `start()`'s own `force` option. Options: (a) read `record.force` inside the method, (b) pass the caller's force in. Evidence: a forced manual start that joins an open background census joins a record whose `force` was set by the background opener (`false`); reading `record.force` would strip `force` from the options the `indexing:start` handler re-sends for its forced follow-up, breaking the "forced follow-up carries force" requirement. Reversible: yes, one parameter.
2. **The lazy run omits `force` instead of passing `force: false`.** Options: (a) always `{ userInitiated, force: userInitiated }`, (b) conditional spread `...(userInitiated ? { force: true } : {})`. Evidence: the existing lazy-run assertions pin the exact options object `{ userInitiated: false }` (`code-namespace.builder.spec.ts`, the concurrent-calls case); the brief allows "force: false (or omits it)". Omitting keeps the lazy wire shape unchanged and the existing specs untouched. Reversible: yes.
3. **The control service passes `force` as an explicit boolean (false when not forced).** Options: (a) always include `force: boolean`, (b) conditional spread. Evidence: no existing spec asserts the exact options object of `runSymbols` (only call counts), and an explicit boolean makes the "resume never forces" and "non-forced start" contracts directly assertable. The boot adapter still spreads conditionally, so `indexWorkspace` never sees `force: false`. Reversible: yes.
4. **No `indexing-rpc.handlers.ts` source change.** The brief allows a change "only if a defect forces it". The forced follow-up wrapper re-sends the exact `options` it received, so it carries `force` once the control service forwards it; the joined-census defect that would have stripped force is fixed on the control side (decision 1). Verified by the new handler spec case. Reversible: yes.

## Not done

- Nothing from the B4 write set or spec list. Coordinator follow-ups (outside this batch): the inner loop (`npm run verify -- --related -p ...`) and the full gate for the four touched projects, and a check that `apps/ptah-electron` still type-checks with the unchanged task-end hook adapter (it ignores the new optional option; verified by reading, not by an Electron build, which this lane may not run).
