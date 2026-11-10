## Files changed

- `libs/frontend/core/src/lib/services/vscode.service.ts` - Cache Electron state on the first read per workspace and warn on slow sync reads.
- `libs/frontend/core/src/lib/services/vscode.service.spec.ts` - Cover cache reads, writes, root changes, invalid values, webview reads, and slow warnings.
- `libs/frontend/core/src/lib/services/renderer-frame-monitor.service.ts` - Log a bounded frame summary and up to three separate, privacy-reduced script lines.
- `libs/frontend/core/src/lib/services/renderer-frame-monitor.service.spec.ts` - Cover ranking, attribution details, empty scripts, privacy, and longtask fallback.
- `libs/frontend/chat/src/lib/services/session-list/recent-sessions.store.ts` - Skip RPC for blank paths and include clipped failure messages.
- `libs/frontend/chat/src/lib/services/session-list/recent-sessions.store.spec.ts` - Cover blank paths, stale responses, and failure messages.
- `libs/frontend/chat/src/lib/services/vitals/chat-vitals.store.ts` - Skip blank workspace paths in the effect.
- `libs/frontend/chat/src/lib/services/vitals/chat-vitals.store.spec.ts` - Cover blank path behavior.

## Decisions

- Use `LoggingService` for slow reads; options were logger or existing console warning. Its source does not import `VSCodeService`, so injection has no circular dependency. Reversible.
- Keep `scriptCount: 0` on long animation frames with no scripts; options were omit or explicit zero. Explicit attribution absence is easier to diagnose. Reversible. Script details now use separate bounded lines.
- Keep blank `workspacePath` exactly as supplied in local state; options were trim or preserve. The guard only checks `trim()`, and preserving the input follows existing state semantics. Reversible.
- No consumer parses the old `script` field: source search across apps and libs found only the producer and its tests. No consumer update needed.

## Verification

- Command (PowerShell equivalent of requested `tail`): `npm run verify -- -p @ptah-extension/core,@ptah-extension/chat 2>&1 | Select-Object -Last 60`.
- The requested `Running target ... for N projects` header was absent from Nx's default dynamic output. The command reported `NX 4 tasks` for lint and typecheck and `NX 2 tasks` for tests.
- Final run: lint/typecheck 4 succeeded, 0 failed; test 1 succeeded, 1 failed (`@ptah-extension/chat:test`). Exit code 1. The core test target passed. Three requested verify runs produced the same project result after fixes. No `Running target ... for N projects` header was emitted by the dynamic Nx output. A separate full chat Jest run found 249 suites passed, 106 suites failed to load, and 4335 tests passed, 3 tests failed; its visible failures include the missing `marked` module mapping.
- Changed chat specs: 2 suites, 25 tests passed. Changed core specs before final edits: 2 suites, 46 tests passed. The final core target passed after the edits.

## Open items

- Full chat test target fails in this worktree because Jest maps `marked` to a missing worktree-local `node_modules/marked/lib/marked.umd.js`; unrelated chat suites fail to load. No files outside task scope were changed.
- Skill discovery was available but this lane had no skill-loading tool; no skill was loaded.

## Review round 1

- Frame monitor: split each long animation frame into one summary line and up to three ordered script lines. The 10 s spacing applies once per frame. Empty string fields and zero layout time are omitted. Each script string starts with a 24-byte UTF-8 cap; the complete JSON console line is fitted under the Electron 256-byte limit. Path-bearing invoker, function, and source values keep only the last segment.
- Worst-case joined console lines, measured with `TextEncoder` using maximum-length strings with multibyte characters and JSON escapes: summary 152 bytes; three script lines 251, 250, 250 bytes. The test asserts every complete line is at most 256 bytes.
- Frame tests now use a typed `PerformanceObserverEntryList` fake with all three methods, removing the TS2352 entry-list casts.
- `VSCodeService.electronState()` returns an uncached empty object if the host API is absent. This branch is unreachable through `getState` and `setState` today because both return before calling it. A new public-method test covers a root A read and write followed by root B, verifying a fresh host read and no A keys in B's write.
- Recent sessions tests cover pending A, then empty path, then stale A completion; and empty path followed by a successful A load.
- Consumer check: `libs/frontend/chat/src/lib/services/vitals/chat-vitals.store.ts:102-116` loads only for a nonblank path, and reads recent state inside `untracked`, so the empty state cannot retrigger the effect. `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-board.component.ts:443-450` loads inside `untracked` when board visibility, emptiness, or path changes; recent state cannot retrigger it. `libs/frontend/chat/src/lib/services/vitals/workspace-vitals.store.ts:302-310` only derives a count and does not call `load`. No consumer retries because the store becomes `{ confirmed: false, loading: false, error: null }`.
- Verification: `npm run verify -- -t lint,typecheck -p @ptah-extension/core,@ptah-extension/chat 2>&1 | Select-Object -Last 40` passed, 4/4 Nx tasks. `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns="recent-sessions.store|chat-vitals.store" 2>&1 | Select-Object -Last 40` passed, 1/1 Nx task. `npm run verify -- -t test -p @ptah-extension/core -- --testPathPatterns="renderer-frame-monitor|vscode.service" 2>&1 | Select-Object -Last 40` passed twice, 1/1 Nx task on each run; the second run included the strengthened byte-limit test.

## Coordinator change after review round 1

- The Electron console forwarder reads only the message text of a console event. An object
  argument arrives as `[object Object]`. The frame lines and the slow-read warning therefore
  carry their metrics as JSON text in the message string (`long frame {...}`,
  `long frame script {...}`, `slow sync state read {...}`).
- Review round 2 (`code-logic-review-round2.md`): APPROVE, 9/10, three nits, no change.
- Coordinator verification: `npm run verify -- -t lint,typecheck -p @ptah-extension/core,@ptah-extension/chat`
  passed (4/4 tasks). Scoped test runs for core (`renderer-frame-monitor|vscode.service`) and
  chat (`recent-sessions.store|chat-vitals.store`) ended with exit code 0.
- Not run: the full chat test target. In a worktree, `jest.preset.js` maps `marked` to a
  worktree-local `node_modules` path that does not exist. CI runs that target.

## Limits of this fix

- The fix reduces the sync `get-state` reads to one per workspace root. One read can still
  block the renderer if the main event loop is starved at that moment. The main-loop
  starvation at startup is a separate task.
