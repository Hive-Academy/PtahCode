# NG0103 loop while the Session inspector is open: investigation

Read-only investigation of finding S1 in `visual-review-2320.md`. Code read at `e5856c839` (main).
I edited no source and ran no build, `verify` or `nx`. I reproduced the mechanism with the repo's own
Angular 22.2.7 in a scratch Node + jsdom harness that sits outside the repo (described under "How to confirm").

## 1. Findings

### Root cause (confidence: high)

The loop is a **feedback cycle through the shared wall clock**. Each step writes the clock, and the write
re-runs the effect that wrote it, one change-detection pass later:

1. `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts:418-422`

   ```ts
   private readonly clockNow = inject(WallClockService).now('second');
   private readonly cacheNow = injectWallClock('second', () => {
     const cache = this.cache();
     return cache !== null && this.detailKey() !== 'orchestrator' && cache.expiresAt > this.clockNow();
   });
   ```

   The `active` callback reads the clock signal **directly**. It also reads the `cache` **input object**.
2. `libs/frontend/core/src/lib/services/wall-clock.service.ts:36-47` (`injectWallClock`, deprecated) runs
   `active` inside a bare `effect()`, with no `computed` around it:
   `effect((onCleanup) => { if (active()) onCleanup(untracked(() => clock.acquire(cadence))); })`.
   The newer helpers do wrap it in a computed: `injectClock` (`clock.service.ts:80-92`) and `injectPtahClock`
   (`libs/frontend/ui/src/lib/time/clock.token.ts:27-44`). The comment there names this exact hazard: "`active` goes
   through a computed, so a tick that does not change the boolean does not release and acquire the clock again."
3. `ClockService.acquire` (`libs/frontend/core/src/lib/services/clock.service.ts:36-41`) **writes the clock**:
   `this.current.set(Date.now())`.
4. The stats pipeline rebuilds the `cache` object whenever the clock changes. In
   `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts`, `limits` reads
   `planLimits.now()` (line 270), and that is `ClockService.now` (`plan-limits.store.ts:99`). `inputs` (275-291)
   recomputes with it and calls `cache: parseSessionStatsCache(snapshot()?.cache)` (line 283).
   `parseSessionStatsCache` (`libs/shared/src/lib/types/messages/session-stats-live.ts:65-78`) **returns a new
   object on every call**. The new object reaches the section through
   `canvas-rail-board.component.ts:290` `[stats]="stats.inputs()"`, then `canvas-inspector-dock.component.ts:198`
   `[stats]="stats()"`, then `session-inspector.component.html:209` `[cache]="rosterStats()?.cache ?? null"`.

The cycle, step by step (zoneless; `ApplicationRef.tick` calls `detectChangesInViewWhileDirty`):

1. Pass N. The `#body` template of `ptah-session-inspector` sets `[cache]` on `ptah-inspector-agents-section`.
   The value is a new object, so the signal input changes.
2. The `cacheNow` view effect reads `cache()`, so it becomes dirty. It runs in the same view refresh
   (`refreshView`: `executeTemplate`, then `runEffectsInView`). Its cleanup releases the clock. `active()` is
   true, so it calls `acquire()`, which runs `current.set(Date.now())` with a new millisecond value.
3. That write dirties every clock consumer. Among them is `limits` → `inputs` in the canvas board's stats
   source, and the board's template consumer. Those views were already checked in this pass, so Angular marks
   the tree for another traversal (`requiresRefreshOrTraversal`).
4. Pass N+1. The board template re-reads `inputs()`, which builds a new `cache` object, and the cycle goes back
   to step 1. A full pass takes much longer than 1 ms, so `Date.now()` is always new at step 2. The write is
   never a no-op, and the cycle never settles.
5. After 100 passes (`MAXIMUM_REFRESH_RERUNS$1 = 100`), Angular throws `RuntimeError(103, "Infinite change
   detection while trying to refresh views…")`. That is the exact text in the log. 100 passes at about 13 ms
   each is the observed 1.3-1.4 s long frame. The views stay dirty, so the scheduler starts the next tick at
   once and the error repeats about every 1.3 s.

Both feeds are needed. If the effect reacted only to the clock, it would re-run inside the same
`runEffectsInView` loop within the same millisecond and settle. The new `cache` object makes the
re-run happen one pass later, after the clock has moved on.

**When it fires.** It needs all of these together:

- The expanded inspector is mounted, so the AGENTS section exists. The rail presentation does not render `#body`.
- The session has a prompt-cache estimate that has not expired (`cache !== null`, `expiresAt > now`). The TTL is
  5 min or 1 h after the last request.
- The orchestrator row's detail is not expanded (`detailKey() !== 'orchestrator'`).
- A plan-limits snapshot is loaded, so `limits` reads the clock (`session-stats-source.ts:262-263` returns
  `null` before reading `now` otherwise).

Lane activity plays no part, which matches "every lane idle".

**Why "wide windows only".** Most likely the width only decides whether the dock is open. The canvas opens
it by default only when the board is at least 1200 px wide (`canvas-inspector-dock.component.ts:68`,
`dockOpenByDefault = sources.width() >= 1200`), and the expanded inspector loads only while it is open
(`@defer (when dockOpen())`, line 192). At emulated 500-1000 px the dock starts collapsed (rail only), so the
AGENTS section is not mounted. The time window also fits: errors stopped at 15:49:16 and came back at
15:58:42, right after new turns (15:49:18 `chat:continue`, 15:58:40 `agent:sendMessage`). So the cache state
may also have changed during the emulated probe. The ResizeObserver in `inspector-session-actions` cannot
cause this error (see below).

**When it arrived.** Commit `755736ccb` ("feat(chat,chat-ui,ui,task-specs): redesign the session stats
sidebar", 2026-11-23 16:49) added `clockNow`/`cacheNow`. It merged as PR #1488 (`c901004da`, 2026-11-23 21:20).
It is in `main`, not in the lane-parity work. `origin/fix/mcp-connector-parity` contains it, and the
12:23-12:39 errors came from that worktree's build.

### Ranked alternatives

| Rank | Candidate | Verdict |
| --- | --- | --- |
| 1 | `cacheNow` effect + new `cache` object (above) | Reproduced. It gives the exact error text and cadence. Each of the two fixes alone removes it. |
| 2 | `inspector-session-actions.component.ts:83-97`, a ResizeObserver that sets `headerWidth`/`moreOpen` (width-dependent) | Unlikely. ResizeObserver callbacks run outside change detection, so a layout oscillation there shows up as "ResizeObserver loop" errors. `WebviewErrorHandler` (`apps/ptah-extension-webview/src/app/app.config.ts:186`) swallows those, and the header width does not depend on the buttons. It cannot produce the in-pass "while trying to refresh views" variant. |
| - | `afterRenderEffect`s in `session-inspector.component.ts:392` and `canvas-rail-board.component.ts:641` | Ruled out by the message. An after-render loop gives the other NG0103 text ("…while refreshing application views…", max 10 runs). |
| - | `inspector-agent-rows.ts` `retained` linkedSignal / `effect(() => retained())`, and the usage rows | Ruled out. They do not write signals during render. `now` there is gated by a computed `hasRunning`. |
| - | `InspectorCacheTileComponent` (`inspector-cache-tile.component.ts:85-94`) | Safe. Its `active` is a computed boolean, so a tick or a new `cache` object does not re-acquire. |

How to tell rank 1 from rank 2 in the live app: expanding the **orchestrator** row (detail open), or waiting
for the cache to expire, stops rank 1 within one frame. Neither has any effect on rank 2. See also the
console probes in section 5.

## 2. Evidence

### Code (file:line, at `e5856c839`)

- Culprit: `inspector-agents-section.component.ts:418-422`. The output is shown by `cacheLine` at 423-432 and bound to the row at 183.
- Effect wrapper with no computed: `core/src/lib/services/wall-clock.service.ts:39-42`. The safe versions are `clock.service.ts:83-87` and `ui/src/lib/time/clock.token.ts:34-39`.
- The clock write: `core/src/lib/services/clock.service.ts:40`.
- The new object each time: `chat/src/lib/services/session-stats/session-stats-source.ts:270` (clock read) and `:283` (`parseSessionStatsCache`), with `shared/src/lib/types/messages/session-stats-live.ts:65-78`.
- Binding chain: `canvas-rail-board.component.ts:290` → `canvas-inspector-dock.component.ts:198` → `session-inspector.component.html:209` (`rosterStats`, `session-inspector.component.ts:293-298`).
- Angular 22.2.7 runtime (dev build in `lane-parity-visual/dist/.../chunk-L2M6ZHV6.js`):
  - `runEffect` sets `node.dirty = false` before it runs, so a write during the run dirties the effect again (line 2800).
  - `VIEW_EFFECT_NODE.consumerMarkedDirty` marks the view and its ancestors for traversal (6073).
  - `MAXIMUM_REFRESH_RERUNS$1 = 100` and the throw are at 12105 and 12129-12136.

### Logs (`C:\Users\<user>\AppData\Roaming\Ptah Dev\logs`)

- NG0103 per file: 11-20: 0, 11-21: 0, 11-22: 0, 11-23: 0, **11-24: 1776 lines (888 errors, each logged as a line plus a `Context:` line)**.
- Windows on 11-24:
  - 12:23:42-12:39:28, from the `.claude-worktrees/mcp-connector-parity` build (`chunk-L5NGL2D3.js:9425`).
  - 15:39:05-15:49:16 and 15:58:42-16:01:42, from the `.claude-worktrees/lane-parity-visual` build (`chunk-XIVEHXI3.js:9526`).
  - The source line in both builds is `WebviewErrorHandler`'s `console.error("Angular Error:", error)`.
- Each window starts about 1.4 s after the expanded inspector mounts. The linked-sessions effect of the
  expanded body (`session-inspector.component.ts:385-390`) sends `session:handoffChain`:

  ```
  12:23:41.334 RpcHandler: Handling method "session:handoffChain"
  12:23:42.719 [renderer] console.error: {"windowId":1,"message":"Angular Error: Error: NG0103: Infinite change detection while trying to refresh views. There may be components which each cause the other to require a refresh, causing an infinite loop.","source":"file:///D:/projects/PtahCode/.claude-worktrees/mcp-connector-parity/dist/apps/ptah-electron/renderer/chunk-L5NGL2D3.js:9425"}
  12:23:46.705 [renderer] console.warning: RendererFrame: long frame {"durationMs":2709,"entryType":"long-animation-frame","blockingMs":2627,"scriptCount":0}
  ...
  15:39:03.938 RpcHandler: Handling method "session:handoffChain"
  15:39:05.201 [renderer] console.error: ... NG0103 ... chunk-XIVEHXI3.js:9526
  15:39:07.816 RendererFrame: long frame {"durationMs":1351, ...}
  ```

- Knock-on effects in the same windows: `[event-loop] lag: {"maxMs":598.2}` (12:24:00) and `{"maxMs":1491.1}`,
  plus `[background-work] lagging — deferring background work ... "trigger":"freeze"` (16:01:45).
- `RendererFrame` logs at most one frame per 10 s (`renderer-frame-monitor.service.ts:136`), so its 100
  long-frame lines undercount the frames.

### Reproduction (scratch harness, Angular 22.2.7 from the repo's `node_modules`, zoneless, JIT, jsdom)

The harness uses the same `ClockService.acquire` / `injectWallClock` shape. One session-inspector →
`#body` `ngTemplateOutlet` → agents-section. The parent's stats `computed` reads the clock and rebuilds `cache`.
I ran each case for 4 s:

| Case | `acquire` calls | NG0103 |
| --- | --- | --- |
| lambda `active` + new `cache` object + pass of at least 1 ms (current code) | 815 | 4 (exact message) |
| lambda `active` + **stable** `cache` object | 9 | 0 |
| **computed** `active` + new `cache` object | 1 | 0 |
| lambda `active` + new `cache` + pass under 1 ms | 15 | 0 (settles in the same millisecond) |

So each of the two fixes below breaks the cycle on its own.

## 3. Memory assessment

**What the evidence shows**

- The renderer main thread is pinned. Long frames of 1.3-2.7 s follow each other, and there is
  event-loop lag of 0.6-1.5 s. Background work is deferred ("freeze"). This is a CPU problem first.
- Each error builds one `RuntimeError` with a stack and sends one `console.error`. In the main process,
  `ProcessLifecycleRecorder.forwardConsole` (`apps/ptah-electron/src/services/diagnostics/process-lifecycle-recorder.ts:199-240`)
  rate-limits renderer console lines: 20 lines per 10 s window (`CONSOLE_LINES_PER_WINDOW`, `CONSOLE_WINDOW_MS`,
  lines 30-33) and 256 bytes per line (line 41). It counts suppressed lines in an integer. So the bridge does
  **not** buffer without limit. At about 0.77 errors/s it stays under the cap and writes about 0.8 KB per
  error (line plus `Context:` duplicate). That is roughly **2-2.5 MB of log file per hour** of loop. It is disk
  growth, not heap growth. The 11-24 log is 6.3 MB.
- Renderer-side logging is bounded too. `LoggingService` history is capped (`logging.service.ts:247-249`).

**Plausible but not measured** (no heap snapshot was taken)

- Allocation churn. In every pass (about 77 per second), these are rebuilt:
  - the stats view model (`buildStatsLimitViewModel`), `inputs`, `rosterStats`;
  - the inspector's `sessionModel`/`totals` chain, which depends on `stats`;
  - the cache objects, closures for each `acquire`/`release`, and the effect cleanup closures.

  All are short-lived, so this means GC pressure and a higher heap high-water mark, not a leak. Text
  bindings change only once per second (`cacheLine` rounds to seconds), so DOM churn is small.
- With DevTools open, the console keeps each `RuntimeError` and its stack. V8 bounds its console message
  storage (about 1000 messages), so a long session can hold several MB, but the total stays bounded.
- Indirect effect: while the renderer is frozen, IPC and stream events queue up and background work is
  deferred. Bursts of backlog can raise the memory high-water mark. Nothing in the logs shows this.

**Other memory checks in the same area (no leak found)**

- The `inspector-session-actions` ResizeObserver is disconnected on destroy (`inspector-session-actions.component.ts:95`).
- The canvas dock MutationObservers are stopped on destroy and on every refocus (`canvas-inspector-dock.component.ts:323, 359-362`).
- The `HandoffChainClient` retain and release calls are balanced by the effect cleanup (`session-inspector.component.ts:385-390`).
  `entriesFor()` builds a new `computed` on each call (`handoff-chain.client.ts:99-103`). It is called only when
  `linkedSessionId` or the chains change, so it only costs extra allocations.
- `SessionInspectorStore.models` is released on tab close (`session-inspector.store.ts:183`).
  `InspectorOpenStateService.choices` is released on tab close (line 28).
- `ClockService` adds and removes its `visibilitychange` listener only when the holder count crosses 0. The cache tile
  also holds the second cadence while the cache is live, so the loop does not churn the interval.

**Conclusion:** the loop is a real CPU and responsiveness defect, and it adds about 2 MB/h to the log
file. It is **not shown** to leak memory. If memory grows over a long session, this loop raises the GC load and
the peak heap, but the cause of steady growth is probably elsewhere. To check, take two renderer heap
snapshots a few minutes apart with the loop running and with it stopped.

## 4. Proposed fix

Make both changes: the first fixes the defect, the second removes the new-object feed.

### 4.1 Gate the clock hold by a computed boolean (fixes the loop)

```diff
--- a/libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts
+++ b/libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts
@@
-import { WallClockService, injectWallClock } from '@ptah-extension/core';
+import { WallClockService, injectClock } from '@ptah-extension/core';
@@
   private readonly clockNow = inject(WallClockService).now('second');
-  private readonly cacheNow = injectWallClock('second', () => {
-    const cache = this.cache();
-    return cache !== null && this.detailKey() !== 'orchestrator' && cache.expiresAt > this.clockNow();
-  });
+  /** Boolean gate: a tick or an equal-but-new cache object never re-acquires the clock. */
+  private readonly cacheClockActive = computed(() => {
+    const cache = this.cache();
+    return cache !== null && this.detailKey() !== 'orchestrator' && cache.expiresAt > this.clockNow();
+  });
+  private readonly cacheNow = injectClock(this.cacheClockActive);
```

Also harden the deprecated helper, so every other `injectWallClock(cadence, active)` caller gets the same
guarantee as `injectClock`. This is the same pattern as `clock.service.ts:83-87`:

```diff
--- a/libs/frontend/core/src/lib/services/wall-clock.service.ts
+++ b/libs/frontend/core/src/lib/services/wall-clock.service.ts
@@
-import { DestroyRef, Injectable, Signal, effect, inject, linkedSignal, untracked } from '@angular/core';
+import { DestroyRef, Injectable, Signal, computed, effect, inject, linkedSignal, untracked } from '@angular/core';
@@
   if (active) {
+    // Through a computed: only a change of the boolean releases or re-acquires.
+    // acquire() writes the clock, so an active() that reads the clock (or any
+    // value rebuilt from it) would otherwise re-run this effect on its own write.
+    const isActive = computed(active);
     effect((onCleanup) => {
-      if (active()) onCleanup(untracked(() => clock.acquire(cadence)));
+      if (isActive()) onCleanup(untracked(() => clock.acquire(cadence)));
     });
```

### 4.2 Keep the `cache` identity across clock ticks (removes the new-object feed)

```diff
--- a/libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts
+++ b/libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts
@@
+  /** Parsed once per snapshot change; a plan-limit clock tick keeps the same object. */
+  const cache = computed(() => parseSessionStatsCache(snapshot()?.cache), {
+    equal: (a, b) =>
+      a === b ||
+      (a !== null && b !== null && a.ttl === b.ttl && a.lastRequestAt === b.lastRequestAt &&
+        a.expiresAt === b.expiresAt && a.idleCompactAt === b.idleCompactAt),
+  });
@@
-      cache: parseSessionStatsCache(snapshot()?.cache),
+      cache: cache(),
```

Optional follow-up, out of scope here: `inputs` still rebuilds the whole `SessionStatsInputs` object on
every clock tick, because `limits` reads `planLimits.now()`. That costs one inspector refresh per second,
which is expected, but a structural `equal` on `limits`, or moving `now` out of the view model, would cut it.

## 5. How to confirm

### Before the fix (live Electron dev build, inspector open, console errors repeating)

Run these in the renderer DevTools console. They are dev mode only and do not need a rebuild.

1. Count the sections: `document.querySelectorAll('ptah-inspector-agents-section').length`. Expect `1`.
   One instance is enough.
2. Inspect the gate inputs:

   ```js
   const s = ng.getComponent(document.querySelector('ptah-inspector-agents-section'));
   ({ cache: s.cache(), detail: s.detailKey(), live: s.cache() && s.cache().expiresAt > Date.now() })
   ```

   Expect a non-null `cache`, `live: true`, and `detail` other than `'orchestrator'`.
3. Discriminating test: expand the **orchestrator** row, so that `detailKey` becomes `'orchestrator'`. You
   can also run `s.detailKey.set('orchestrator')`. The errors should stop within one frame. Collapse the row,
   or run `s.detailKey.set(null)`, and they come back.
4. Proof that the clock feeds the loop, using a temporary patch that a reload undoes: run
   `const _n = Date.now; Date.now = () => Math.floor(_n() / 1000) * 1000;`. Each `acquire()` then writes the
   same value within a second, so the cycle settles and the errors stop. They may still fire once per second
   at the boundary. Reload to restore.
5. Count the identity changes:

   ```js
   let last, n = 0;
   const t = setInterval(() => { const c = s.cache(); if (c !== last) { n++; last = c; } }, 0);
   setTimeout(() => { clearInterval(t); console.log('cache identities in 2s:', n); }, 2000);
   ```

   This is a rough count, because `setInterval(0)` cannot run during a frozen frame. Expect many more
   identities than the number of clock ticks.

### After the fix

- No NG0103 while the inspector is open with a live cache, at 1920, 1365 and narrow widths.
- `RendererFrame: long frame` warnings no longer repeat while idle.
- The cache line on the orchestrator row still counts down once per second, and the cache tile still shows "Expired" at expiry.

### Specs that pin it (no harness change needed)

1. `libs/frontend/core/src/lib/services/wall-clock.service.spec.ts`: "an `active` that reads the clock does
   not re-acquire on its own write or on a tick". Host component:
   `injectWallClock('second', () => clock.now() > 0)`. Spy on `ClockService.acquire`, render, then
   `clock['current'].set(Date.now() + 1000)` (or advance fake timers by 1 s) and run
   `fixture.detectChanges()`. Expect `acquire` to have been called **once** and the release not to have run.
   This fails today: the effect re-runs, releases and acquires again.
2. `inspector-agents-section.component.spec.ts`: "a new but equal `cache` input does not re-acquire the
   clock". Freeze time (`jest.useFakeTimers().setSystemTime(t)`) so that the current code does not hang. Render
   with `cache = { ttl: '5m', lastRequestAt: t, expiresAt: t + 300_000 }` and spy on `ClockService.acquire`.
   Then run `fixture.componentRef.setInput('cache', { ...cache })` and `detectChanges()`. Expect one
   `acquire` call. Add an assertion that a clock tick (`setSystemTime(t + 1000)`, then a tick) re-renders
   `cacheLine` without another `acquire`.
3. `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.spec.ts`: "`inputs().cache` keeps
   its identity across a plan-limit clock tick". Take `const a = source.inputs()?.cache`, advance the clock,
   then `expect(source.inputs()?.cache).toBe(a)`. Then change the snapshot cache and expect a new object.

Specs 1 and 2 fail on `e5856c839` and pass with 4.1. Spec 3 fails on `e5856c839` and passes with 4.2.
