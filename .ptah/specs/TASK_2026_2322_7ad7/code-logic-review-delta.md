# Code Logic Review (delta) - TASK_2026_2322_7ad7

## 1. Foreground source lazy prompt subscription (BLOCKING fix) - VERIFIED
- turn-state-foreground-source.ts:138-147,153-158,199: subscription retried on every read and on subscribe; governor refreshForeground (background-work-governor.ts:422-437) wraps `isForegroundBusy` in try/catch, so a resolve throw cannot reach the governor; `resolvePromptWaits` also catches itself (:114-127) and warns once (`warnedPromptSource`).
- register.ts:393-397 handler is `Lifecycle.Singleton` and the lazy provider resolves the same token (register.ts:902-905) -> same instance as chat flow. `isRegistered(..., true)` guard OK.
- Handler constructor (sdk-permission-handler.ts:313-365) touches no governor/turn registry -> no recursion. First read after startup is on a generating transition (registry onGeneratingChange -> notify), which precedes any prompt in that turn.
- MINOR: in Electron the startup attempt (addForegroundSource) fails because WEBVIEW_MANAGER is unregistered, so the one warn says "prompt-wait source unavailable" at startup even though it recovers. Misleading log, not a defect. Also a host that never registers WEBVIEW_MANAGER re-throws a tsyringe resolution error on every read (cheap, silent after first warn). Minor/observability only.

## 2. Lane prompts blocksTurn - VERIFIED
- Only one `pendingRequests.set` exists (sdk-permission-handler.ts:1758) and one `awaitResponse` caller (:1451) passing `!cliAgentId`. `cliAgentId` is fully resolved (incl. the late-attach wait loop, :1352-1368) before the call, so lane routes get blocksTurn=false; a late-unattributed lane denies earlier and never registers. Subagent (`agentID`) prompts have no cliAgentId -> blocksTurn=true (intended).
- ChangeNotifyingMap notifies after `super.set`/`delete`/`clear` (change-notifying-map.ts:16-33), so listeners see the entry; listener throws are isolated (:425-434). Lane prompts still fire a notify (harmless re-read).
- No finding.

## 3. settleCensus background success - VERIFIED
- indexing-control.service.ts:987-1010: write only when decided is a succeeded BACKGROUND outcome and `persistLastRun` returned 'written'. stale-skipped returns earlier (:964-978), failed/aborted/manual paths unchanged. `upsertRow` only touches columns present in `fields` (:1481+), so null-sha omission preserves the stored sha and `symbols_cursor` is untouched. A persist failure is warned and the complete push still goes out (acceptable; refresh would then show never-indexed, logged).
- deriveStateFromRow (:277-291): last_error cleared + last_indexed_at set -> 'indexed' (or 'stale' on sha mismatch), as intended.
- MINOR: if a manual run was paused (symbols_cursor set) in the same census and a background outcome decided, the row becomes last_indexed_at set but state stays 'paused' (cursor check precedes). Pre-existing semantics; no regression.

## 4. workspace-index-lifecycle processBatch storm-before-probes - VERIFIED
- workspace-index-lifecycle.ts:~439-453: early `requestFullRun()` only when the batch holds a TS create/delete (`isTwinTransition`) and `isStorm(kept.length)`; the same `isStorm` is used in scheduleBatch (:~494-498), so the threshold is identical. `directoryDelete` is not lost: scheduleBatch's own storm branch also returns before `requestDeleteFullRun()` (:498-501), so behaviour matches, and a full run subsumes a delete census.
- Probe failure handling: `probeQuietly` and `hasTypeScriptSourceTwin` both catch; the per-batch readdir cache is awaited by its creator, so no unhandled rejection. Ordering via `pendingBatch` preserved (early return is `undefined`, `onBatch` skips chaining).
- MINOR: a storm made only of JS paths (no TS transition) still pays JS twin probes before scheduleBatch decides (pre-existing cost, bounded by readdir cache). Because the storm is now decided on the pre-twin count, a batch whose count exceeds the threshold only before shadowed JS are dropped triggers a full run where it previously would not; conservative and harmless.

## 5. DEFAULT_SKIP_PATTERNS additions - VERIFIED
- Matching is on `path.basename` with `picomatch(..., {nocase:true})` (code-symbol-indexer.service.ts:233-236). Ran picomatch on the new patterns: `index.mjs`, `index.cts`, `a.spec.mts`, `a.module.cjs`, `x.d.mts`, `a.spec.MJS` skip; `foo.mts`, `src.mjs`, `moduleindex.mjs`, `index.mjs.map`, `my.module.mjsx`, `index.json` do not. Brace syntax works; no real sources newly skipped other than the intended index/module/spec/test/declaration variants (index.mjs skip mirrors index.js).

## Verdict
No blocking, no serious findings. Minor: 3 (misleading startup warn in Electron; paused-cursor state after background success; JS-only storm still probes).

verdict APPROVE (0 blocking, 0 serious, 0 moderate, 3 minor)
