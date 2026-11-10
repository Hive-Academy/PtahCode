# Code logic review — TASK_2026_921_fde0

Review family: anthropic-api (reviewer) vs codex (implementer)

Score: 7/10. Verdict: APPROVE WITH FIXES (no blocker; one major observability defect).
Scope: the 8 changed files, read as a diff plus the surrounding code. No test run (read-only review).

## Findings

1. MAJOR — `libs/frontend/core/src/lib/services/renderer-frame-monitor.service.ts:98-100`.
   The long-frame line now holds `scriptCount` and 3 `scripts`, each with 6 fields (invoker, fn, src up to 80 chars each).
   The Electron console forwarder cuts each line to `CONSOLE_MAX_BYTES = 256`
   (`apps/ptah-electron/src/services/diagnostics/process-lifecycle-recorder.ts:70,76-80,225`).
   Scenario: a frame with 3 scripts gives a line far over 256 bytes, so the main log shows broken JSON and
   usually only the first script. The new diagnostic data is lost in the one place it is needed.
   Fix: keep the line under about 240 bytes (one script, shorter cut length, drop `type` when `invoker` is set),
   or raise the cap for the `RendererFrame` source in the recorder, or log a second short line per script.
   Add a test that `JSON.stringify` of the worst case stays under the cap.

2. MINOR — `libs/frontend/core/src/lib/services/vscode.service.ts:243-257` (`electronState`).
   When `this.vscode` is null the code caches `{}` under the root. `getState` returns early when `vscode` is null
   (line ~228) and `setState` too, so this is unreachable today. Low risk, but it would pin `{}` if the order changed.
   Fix: do not cache when `this.vscode` is null.

3. MINOR — `libs/frontend/core/src/lib/services/vscode.service.ts:229-233, 281`.
   `getState` returns the cached nested values by reference, and `electronState()` returns the cache object itself.
   `setState` spreads it (shallow), so a caller that mutates a nested object it got from `getState` changes the cache
   without a `set-state` call. Before, after the first write, the same by-reference exposure existed
   (`pendingElectronState.state[key]`), so this is not a regression. Only the pre-first-write window is new.
   Fix (optional): `structuredClone` on read for object values, or document the read-only rule.

4. MINOR — `libs/frontend/core/src/lib/services/vscode.service.ts:169-171` and `electron-layout.service.ts:650,712`.
   Pre-existing window, not new: `coordinator.switchWorkspace(newPath)` starts first and `updateWorkspaceRoot(newPath)` runs
   after in the same tick. Main switches `activeStateWorkspace()` after the async RPC. A `setState` in between
   (for example a route or theme write) goes to main under the active workspace of that moment. The new cache does not widen
   this window. The reset on root change is correct. Note: a root change to the same value is a no-op for the cache, good.

5. NIT — `libs/frontend/core/src/lib/services/vscode.service.ts:249-252`.
   The slow-read warning is logged after the fact, so it only reports the freeze. This is fine for diagnosis.
   No recursion: `LoggingService` imports only `@angular/core` (logging.service.ts:1) and does not inject `VSCodeService`.

6. MINOR — `libs/frontend/chat/src/lib/services/session-list/recent-sessions.store.ts:47-53`.
   Empty-path branch: `++requestSequence` runs first, so a pending real load is discarded by its own sequence check
   (assuming the existing `request !== this.requestSequence` guard after each await). The state is
   `confirmed:false, loading:false, error:null`. Check that no consumer retries on that triple.
   Fix: add a test that a pending load for path A cannot overwrite the empty state, and the reverse.

7. NIT — `recent-sessions.store.ts:89-90`.
   `pinned.error?.slice(0,200)` goes to the log. Error strings from the RPC can contain a workspace path.
   The logs are local, but pass them through the project redaction helper if one exists, or log only the error code.

8. MINOR — `libs/frontend/core/src/lib/services/vscode.service.ts:93-94` vs `index.html:113-114`.
   The pre-paint theme read still calls `window.vscode.getState()` once, synchronously, before Angular boots.
   That is one sync IPC outside the cache, and it is not counted in the "one read per root" claim.
   It is a single call, not the N-call storm, so accept. But the first `electronState()` read adds a second one.
   Fix (optional): share the pre-paint result through a window global.

## Answers A-J

A. The main renderer is the only writer of `webview-state` in Electron: only `ipc-bridge.ts:871` writes the key,
   and `set-state` accepts role `main` only (ipc-bridge.ts:862-868). The Display window may read but not write.
   The recovery mode handler answers `get-state` with an empty object and does not touch storage. I found no main-process
   code that writes the key or changes the `get-state` return value without a renderer `set-state`.
   One new staleness case: a stored-state change made by main after the first renderer read (for example a state migration
   or clear-data run while the renderer lives) is no longer seen until a root change. Before, reads re-fetched until
   the first write. I found no such caller; treat as low risk and note it.
B. Callers: `electron-layout.service.ts:650` and `:712` (the latter with `''`), and the WORKSPACE_CHANGED handler
   (`vscode.service.ts:115`). A read in the gap between main switching and the renderer root update returns state cached under
   the old root, which is correct for the old root. The cache clears on the root change, so A data is not stored under B.
   A write in the gap goes to the main storage of the newer active workspace. This window existed before; unchanged.
   The `''` root case caches under `''`, then a real root clears it: two reads at most.
C. `index.html:113-114` calls `window.vscode.getState()` directly and falls back to `localStorage`. It does not use
   `VSCodeService`. It stays correct. `theme.service.ts` reaches state through `VSCodeService`, so it uses the cache.
D. No cycle: `logging.service.ts` imports only `@angular/core` and injects nothing from VSCodeService.
   No recursion: the logger does not call `getState`.
E. The non-Electron path is unchanged: `getState` and `setState` use `this.vscode.getState()` for non-Electron as before.
   `getState` returns early at line ~228 when `vscode` is null. The only addition is `inject(LoggingService)` in all hosts.
F. `vscode` null: not reachable (see Finding 2). Array, null and non-object host values become `{}`. The cache can be mutated
   through nested references (Finding 3); this was possible before after the first write.
G. Privacy: `src` keeps only the last path segment, `invoker` the same, and each text is cut to 80 chars. No full URL or path.
   `[...list].sort` copies the array and does not mutate the entry. Cost: a sort of a short array per long frame, which is
   negligible. I found no consumer that parses the old `script` field (only the frame-monitor spec and the e2e perf spec
   mention RendererFrame; the e2e spec reference was not a `.script` parse). The console forwarder cuts at 256 bytes,
   so the JSON is truncated (Finding 1).
H. See Findings 6 and 7. A sequence bump at entry protects against a stale load. A consumer effect loop was not
   found in the files read, but not proven for every caller. `ChatVitalsStore` skips empty paths at
   `chat-vitals.store.ts:106`, consistent with the store.
I. The specs cover the claims at the unit level, but the following are missing: a root change after a write (stale
   write must not leak); `getState` for N keys with exactly one host read, including a null or array host value;
   the `LoggingService.warn` call above 200 ms (fake `performance.now`); a pending-load vs empty-path race;
   and the 256-byte cap for the frame line.
J. I found no `any`, `@ts-ignore`, `as unknown as` or swallowed error in the diff. The existing `console.warn` in
   `setState` is old code. The diff adds `as Record<string, unknown>` casts after a runtime object check, which is acceptable.
