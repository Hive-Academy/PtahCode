## Changes

- `libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker.ts`: globally limits live workers to one per lane, queues cross-compiler runs FIFO, awaits heap teardown before replacement, independently bounds queue wait, rejects queued work during disposal, retains same-key message queues, and adds lane-specific 1792/1024 MB resource limits. OOM errors retain a machine-readable code and recommend passing files. Optional readonly heap fields flow to outcomes. Worker stays below 700 lines.
- `libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker-source.ts`: dependency-free CommonJS string measures rounded heap MB after the compile and includes the figures in successful responses; protocol comment updated.
- `libs/backend/workspace-intelligence/src/diagnostics/type-script-diagnostics-provider.ts`: optional fourth logger parameter preserves existing constructor calls; logs successful run lane, heap, elapsed milliseconds, program count, and warns on memory-cap failures when supplied.
- `libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker.spec.ts`: adapts previous unlimited-compiler assumptions and tests global containment, asynchronous retirement, bounded queue wait, disposal, resource limits, OOM, and heap fields.
- `libs/backend/workspace-intelligence/src/diagnostics/type-script-diagnostics-provider.spec.ts`: completion logging/cache deduplication and OOM warning/unavailable regressions.

## Tests

Initial command:
`npx jest --config libs/backend/workspace-intelligence/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker.spec.ts`
Result: 30 passed, 1 failed (existing idle-respawn assertion assumed asynchronous termination had completed); test updated to await termination microtasks.

Final focused commands (executed one at a time from the worktree root; output tailed with PowerShell Select-Object -Last):

1. `npx jest --config libs/backend/workspace-intelligence/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker.spec.ts libs/backend/workspace-intelligence/src/diagnostics/type-script-diagnostics-provider.spec.ts`
   - PASS: 2 suites, 86 tests passed, 0 failed (147.517 s). Worker suite: 31 passed; provider suite: 55 passed. Node emitted an ES-module configuration warning; tests completed successfully.
2. `npx tsc --noEmit --project libs/backend/workspace-intelligence/tsconfig.lib.json`
   - PASS: exit 0, 0 reported errors.
3. `npx tsc --noEmit --project libs/backend/workspace-intelligence/tsconfig.spec.json`
   - PASS: exit 0, 0 reported errors.
4. `npx eslint libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker.ts libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker-source.ts libs/backend/workspace-intelligence/src/diagnostics/type-script-diagnostics-provider.ts libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker.spec.ts libs/backend/workspace-intelligence/src/diagnostics/type-script-diagnostics-provider.spec.ts`
   - PASS: exit 0, no lint errors. The module-boundary rule printed a missing cached ProjectGraph warning for each file and skipped its check. No forbidden Nx command was run to populate the cache.

Ptah diagnostics after the worker edits: 0 errors, 0 warnings. Final all-changed-files ptah_get_diagnostics: PASS, 0 errors and 0 warnings (typescript-compiler, clean coverage).

Added/adapted tests:

- instance.emit('message', {
- it('spawns one worker bound to the requested compiler and resolves its reply', async () => {
- instance.emit('message', {
- it('reuses one worker for repeated runs on the same compiler', async () => {
- it('rejects a run that the worker answers with ok:false', async () => {
- instance.emit('message', {
- instance.emit('error', new Error('worker blew up'));
- instance.emit('exit', 3);
- it('a dead worker is replaced on the next run rather than reused', async () => {
- WorkerMock.instances[0].emit('exit', 1);
- it('rejects after RUN_TIMEOUT_MS and terminates the wedged thread', async () => {
- it('a sibling queued on the same thread is told why it died, not that it timed out', async () => {
- it('a timed-out run does not poison the compiler: the next run gets a fresh worker', async () => {
- it('queues a different compiler until the busy lane settles without rejecting its run', async () => {
- it('a failing compiler only takes down its own worker', async () => {
- workerB.emit('error', new Error('B is broken'));
- it('a scoped run gets its own thread and resolves while an unscoped run on the same compiler is still in flight', async () => {
- it('two scoped runs share one lane and queue on it', async () => {
- thread.emit('message', {
- it('two unscoped runs share one lane and queue on it', async () => {
- thread.emit('message', {
- it('a failure on one lane leaves the other lane of the same compiler running', async () => {
- unscopedThread.emit('error', new Error('unscoped lane died'));
- it('each lane self-terminates after its own idle window', async () => {
- it('dispose() resolves only once every lane of every compiler is gone', async () => {
- it('a run posted while dispose() is in progress is refused and creates no thread', async () => {
- it('rejects an in-flight run and resolves only once the thread is gone', async () => {
- it('waits for a termination that a worker error started earlier', async () => {
- instance.emit('error', new Error('died mid-compile'));
- it('terminates every live worker, not just the most recent', async () => {
- it('is idempotent with nothing running', async () => {
- it('awaits idle compiler termination before constructing its replacement', async () => {
- it('runs different compilers in different lanes concurrently with lane memory caps', async () => {
- it('disposal rejects queued runs and prevents a replacement thread after termination', async () => {
- it('bounds queue wait independently of the compile timeout', async () => {
- it.each([['unscoped', 1792], ['scoped', 1024]] as const)('reports a %s worker memory-cap failure', async (lane, limit) => {
- WorkerMock.instances[0].emit('error', error);
- it('carries heap telemetry through the success outcome', async () => {
- worker.emit('message', { id: idOf(worker), ok: true, collected: [], errors: [], programCount: 2, heapUsedMb: 123, heapTotalMb: 150 });
- it('the worker source stays a valid String.raw payload', () => {
- it('refs the worker for a run and unrefs it once idle, so it never holds the host open', async () => {
- it('clean project (valid tsconfig, no errors) -> available with empty diagnostics', async () => {
- it('error project -> available with diagnostics carrying correct file/line/severity', async () => {
- it('EXPECTED RED (Batch 8 finding #1) — solution-style root traverses referenced child projects once and collects their diagnostics', async () => {
- it('EXPECTED RED (Batch 8 finding #2) — configs discovered but zero programs built and zero errors -> unavailable, not a false clean', async () => {
- it('malformed tsconfig (invalid JSON) -> unavailable with reason, does not throw', async () => {
- it('no tsconfig under root -> unavailable with reason', async () => {
- it.each([undefined, ''])(
- it('dedup: the same diagnostic reachable via two discovered tsconfigs appears once', async () => {
- it('workspace switch: two sequential calls with different roots each see only their own tsconfigs (no caching)', async () => {
- it('Windows paths: backslash-bearing temp paths are normalized to forward slashes in output', async () => {
- it('root filtering: a diagnostic from a file outside the requested root is excluded', async () => {
- it('keeps diagnostics when the requested root differs from disk only in casing', async () => {
- it('does NOT fold case on a case-sensitive platform', async () => {
- it('saturated discovery + zero diagnostics -> unavailable, naming the cap', async () => {
- it('a workspace with more configs than the cap cannot report a clean result', async () => {
- it('saturated discovery + real diagnostics -> still available with those findings', async () => {
- it('an unsaturated page still reports a clean project as clean', async () => {
- it('leaves the calling event loop free while the compile runs', async () => {
- it('single-flight: concurrent callers on one root share a single run', async () => {
- it('single-flight releases the slot, so a later call can still run', async () => {
- it('cache: a repeat call within the TTL is served without a second compile', async () => {
- it('cache: the entry expires, so a fixed error is not reported forever', async () => {
- it('cache is per root, so one workspace never answers for another', async () => {
- it('two configs, one clean and one malformed -> the result names the malformed config', async () => {
- it('a broken config beside a clean project cannot render as "No issues found"', async () => {
- it('real diagnostics and a config failure are reported together, failure first', async () => {
- it('every discovered config failing -> unavailable, with each failure named', async () => {
- it('invalidate(root) makes the next call within the TTL reflect the edit', async () => {
- it('invalidate() with no argument drops every cached root', async () => {
- it('the TTL is short enough that a call six seconds later recompiles', async () => {
- it('an unavailable result is not served from cache: the next call re-runs the check', async () => {
- it('a rejected worker run is not cached: the next call recompiles', async () => {
- it('compiles only the owning project and never walks the workspace', async () => {
- it('still reports a sibling file in the same project', async () => {
- it('does not answer a whole-workspace call from a scoped result', async () => {
- it('refuses a scope whose files are all outside the root', async () => {
- it('reports unavailable when no tsconfig owns the requested files', async () => {
- it('a scoped run posted while an unscoped run holds its thread completes in its own time', async () => {
- it('asks the worker for the lane that matches the scope', async () => {
- it('discovery resolving after dispose() answers unavailable and never reaches the worker', async () => {
- it('a call started during dispose() is never admitted, even when discovery resolves after it', async () => {
- it('answers "still running" at 45 s, shares the kept run with the retry, then serves it from cache', async () => {
- it('logs heap figures and duration once per completed worker run', async () => {
- it('warns on a memory-cap rejection and reports unavailable', async () => {

## Decisions

- Decision: reserve a lane while termination is pending and drain only after termination resolves. Options: remove registration alone, or also retain a lane retirement barrier. Evidence: removing registration before terminate resolves permits a replacement heap to overlap the dying one. Reversible: yes, private lifecycle code only.
- Decision: same-key requests continue posting directly to their existing worker; cross-compiler requests wait FIFO. Options: globally serialize all runs, or preserve existing worker message queues. Evidence: explicit task contract requires the latter. Reversible: yes.
- Decision: add a compatible optional fourth logger argument. Options: edit host composition outside scope, resolve a global DI container inside the provider, or accept the host logger explicitly. Evidence: provider has no existing logger; `src/di/register.ts` has the logger but constructs `new TypeScriptDiagnosticsProvider(fileSystem)`. An optional argument keeps Electron/CLI API compatibility and avoids service-locator wiring. Reversible: yes. Production wiring requires parent action outside this lane's allowed write set.

## Not done / risks

- Production telemetry is not enabled until `libs/backend/workspace-intelligence/src/di/register.ts` passes its existing logger as the fourth constructor argument: `new TypeScriptDiagnosticsProvider(fileSystem, undefined, undefined, logger)`. This file is outside the authorized write set; it was not changed. Parent escalation was attempted, but ptah_agent_report returned parent-inbox-full.
- Actual memory exhaustion inside Electron was not forced; fake-Worker tests cover resource-limit options and the Node OOM error event, and real compiler fixtures pass.
- Caps bound old-generation heaps, not every byte of worker/native memory. Child/utility-process isolation remains the planned follow-up.
- Skill discovery/loading is unavailable in this lane. No skill steps were invented.
- No git commands, broad checks, build, serve, dev, e2e or package targets were run. The deliberate 45-second provider answer and cache/idle constants are unchanged.

## Extra files read

- `.ptah/specs/TASK_2026_2282_5d12/context.md` (coordinator evidence and cap decisions).
- `D:/projects/ptah-extension/.claude/agents/backend-developer.md` (output contract and backend conventions).
- `libs/backend/workspace-intelligence/src/diagnostics/ts-diagnostics-worker-containment.spec.ts` (existing string-source test pattern; unchanged).
- `libs/backend/workspace-intelligence/src/diagnostics/language-aware-diagnostics-provider.ts` (host-neutral provider conventions).
- `libs/backend/vscode-core/src/logging/logger.ts` (logger signatures).
- `libs/backend/workspace-intelligence/src/di/register.ts` (confirmed missing logger wiring; unchanged).
- `libs/backend/workspace-intelligence/tsconfig.lib.json`, `jest.config.ts` (focused verification configuration).

Ptah fallbacks: ptah_ast_analyze initially rejected the filePath argument; native worker reads used. ptah_search_files returned zero results for task documents and AGENTS.md; native paths/free-text search used. ptah_code_search_symbols returned zero indexed Logger hits; one native logger search followed. No unrelated source edits were made.
