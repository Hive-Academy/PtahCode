# Re-review of batch (a), findings 1-4

**Verdict: APPROVE** (finding 2 is an accepted known gap, recorded in context.md).

Scope: `git diff HEAD -- libs/` and the untracked `bounded-limit-lookup.ts` and its spec. This review was read-only. I ran no checks. The coordinator gate already passed, and the fix lane reported passing focused specs.

## Status of the findings

1. **Fixed.** Both frontend callers now give the classification context to `activeWindowExhaustion`.
   - `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.ts:360-375`: one `classification` object goes to `classifyWindow` and to `activeWindowExhaustion`. The two calls cannot disagree.
   - `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tiles.ts:527`: the call uses `{ ...ctx.lane, status: snapshot.status }`. This is the same context shape that `lane-state.ts:326` (`windowCtx`) uses to classify the window.
   - Each surface has a new spec that asserts "resets" and not "reset unknown".
2. **Not fixed. Accepted gap.** The coordinator recorded the decision. A synchronous last-known read needs a new port. I agree that this is out of scope for batch (a). Track it as a follow-up.
3. **Fixed.** `libs/shared/src/lib/utils/plan-limits/window-state.ts:139-156`: an estimated or expired `exhaustion` no longer returns early. The function falls through to the fresh `provider-api` 100% check. A new regression spec covers an estimated exhaustion beside a fresh 100% reading.
4. **Fixed.** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/bounded-limit-lookup.ts:13-25,77-79`: `trackLimitLookup` records the settlement explicitly. `resolvePostSpawnLimits` reads that holder and does not depend on a zero-delay promise race. The rejection callback in `trackLimitLookup` sets `result: undefined`, so the holder adds no unhandled rejection.

## New defects

No blocker or major defect.

1. **Minor (style only):** `window-state.ts:151-153` puts several object properties on one line. This is not the Prettier layout that the rest of the file uses. Lint passed, so this is optional. Fix: run the formatter on the file.

## Other checks

- Callers without `ctx` keep the old behavior. The only one left is `plan-limit-ledger.rules.ts:99` (`heldExhaustion`). This is correct: the ledger must not create a held hit from a raw reading. `plan-limit-tiles.ts:313` and `:503` fall back to `window.resetsAt`, so they show a reset time.
- The derived evidence requires `status === 'available'`, `usedSource === 'provider-api'`, a fresh reading, no passed reset, and a future or unknown reset. Aged, stale, non-provider-api and reset-passed readings do not count.
- The spawn gate is unchanged in behavior: the wait limit is 4 s, the timer is cleared and `unref`ed, a pending lookup gives "unknown (limit lookup pending)", a cached at-limit blocks unless `force`, and the background lookup continues.
