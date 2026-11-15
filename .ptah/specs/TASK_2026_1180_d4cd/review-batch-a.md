# Logic review — TASK_2026_1180_d4cd batch (a)

**Verdict: CHANGES REQUESTED**

Score: 6/10. The core logic is correct for each of the five intended behaviours, and the spawn
path is safe under failure. One user-visible regression (finding 1) is caused directly by the new
optional `ctx` parameter. One design gap (finding 2) needs a fix or an explicit decision. A score of 7
needs finding 1 fixed. A score of 5 would need a defect in the gate itself, and I found none.

## Scope and evidence

- Diff: `git diff HEAD -- libs/` (the branch base is behind `main`, so `git diff main` also shows
  unrelated changes from main. I reviewed only the 13 task files plus the untracked
  `bounded-limit-lookup.ts` and its spec).
- Callers of `activeWindowExhaustion` and `classifyWindow`: ledger rules, the dashboard tile model,
  the chat-ui tile model, `lane-state.ts`.
- Focused checks I ran (all pass):
  - shared `window-state`, `lane-state`, `evidence-precedence` specs: 84 passed.
  - vscode-lm-tools `bounded-limit-lookup`, `agent-spawn-limit-gate` specs: 35 passed.
  - auth-providers `codex-plan-usage.reader`, `plan-limit-ledger.service` specs: 91 passed.
  - `ptah_get_diagnostics` on `window-state.ts`, `agent-spawn-limit-gate.ts`,
    `bounded-limit-lookup.ts`: 0 errors.
- I did not run the dispatcher specs (`protocol-dispatcher`, `agent-tool.dispatcher`), or the
  dashboard and chat-ui specs.

## Check of the intended behaviour

1. Codex reader: correct. `reachedType` and `spendControlReached` attach only when `atLimit`
   (`codex-plan-usage.reader.ts:192-197`). `exhaustion` attaches only with a flag and `atLimit`
   (`:207-210`). A flag with no window at 100% stays on the allowance only (`:146-156`). No code
   in lane-state reads the allowance flag, so a flag alone does not make the lane AT LIMIT.
   `namesGate` (`plan-limit-ledger.rules.ts:181-183`) now sees no flag on a 7% window, so
   `readingClears` lets a newer 7% table reading clear a held table-reported hit. Note: the
   unqualified (single-quota) path now also carries `reachedType` on a 100% window. Before, the
   `qualified &&` guard removed it. This is consistent and causes no defect.
2. `activeWindowExhaustion`: the derived rule is correct for fresh, aged, stale-status,
   estimated, non-provider-api and reset-passed readings (`window-state.ts:143-156`).
   `classifyWindow` and `lane-state.ts:341` pass the context, so the AT LIMIT reason names the
   window. The ledger caller (`plan-limit-ledger.rules.ts:99`) does not pass the context. This is
   correct: a derived hit is only the reading itself, so the ledger must not hold it as an
   exhaustion. The dashboard and chat-ui callers are not consistent. See finding 1.
3. Grok uses the 12 s deadline: correct (`evidence-precedence.ts:32`). The id matches the
   `providerId: 'grok'` that `plan-owner-read.ts` uses.
4. Spawn path: correct for each named risk.
   - The pre-spawn wait is bounded by `SPAWN_GATE_WAIT_MS` (`agent-spawn-limit-gate.ts:131-133`).
   - On timeout the verdict is `unknown`, so the spawn continues. The reply appends the pending
     block (`appendPendingSpawnLimits`, `formatAttemptedLimitSuffix`).
   - A settled at-limit result blocks unless `force` (`:145-160`).
   - The lookup is not cancelled. The timer is `unref`'d and cleared in `finally`
     (`bounded-limit-lookup.ts:44-52`).
   - A rejection resolves to `undefined` through `safeLookup` (`:26-34`). The raw promise always
     has a rejection handler, so no unhandled rejection occurs. Both `lookupAgentLimits`
     functions are `async` with `try/catch`, so no synchronous throw escapes.
   - When the pre-spawn lookup is pending, the post-spawn step peeks with a zero wait and does
     not wait again. When it settled, the step reuses the result (`:61-70`). The pre-spawn
     result is not discarded.
   - For an auto-detected lane, the post-spawn lookup is bounded to 4 s.
   - `force: true` with a pending lookup gives `forced: false`. This is correct, because nothing
     was known to be at limit.
   - The refusal text (`formatSpawnRefusal`) does not tell callers to retry.
5. The gate, the formatter and `bounded-limit-lookup.ts` contain no CLI-specific branches, no
   `any`, no `as unknown as` and no `console`.

## Findings

### 1. major — A derived limit hit shows "reset unknown" when the reset is known

- `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.ts:374`
- `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tiles.ts:527`

**Defect:** `classifyWindow` now returns `limit-reached` for a fresh provider-api reading at 100%
with no `exhaustion` field. These two callers then call `activeWindowExhaustion(window, now)`
without the context. The derived branch needs `ctx?.status === 'available'`, so the call returns
`undefined`. The tile then shows "Limit reached — reset unknown", although `window.resetsAt` is
known and the derived evidence carries it. Example: a Codex weekly window at 100% with no
`rateLimitReachedType`, or a Claude `/usage` reading at 100%. The chat-ui callers at `:313` and
`:503` fall back to `window.resetsAt`, so they are correct. The two callers above have no
fallback.

**Fix:** Pass the same context that `classifyWindow` received:
`activeWindowExhaustion(window, now, { now, nearLimitPercent: NEAR_LIMIT_PERCENT,
freshnessMs: FRESHNESS_MS, status: owner.status })` in the dashboard, and the classification
context in `windowResetFacts`. As an alternative, add `?? window.resetsAt` as in `:503`. Add one
spec for each surface: a fresh 100% provider-api window with a future reset must show
"resets <time>".

### 2. major — A pending lookup ignores a known at-limit state after the 30 s cache TTL

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limit-gate.ts:131-164`
- Related: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:213-221`
  (`PLAN_USAGE_CACHE_TTL_MS = 30_000`)

**Defect:** "A cached at-limit still blocks" is true only while the owner reading is less than
30 s old. After the TTL, `getOwnerSnapshot` does a new read. For the slow providers (Codex,
Antigravity, Kimi Code, and now Grok) a cold read takes 3-12 s, which is more than the 4 s wait.
The gate then returns `unknown (limit lookup pending)` and the spawn continues, although the
ledger or the expired cache entry still holds an active, non-estimated exhaustion for that
owner. Before this change the gate waited up to 12 s and refused. Thus a lane that is AT LIMIT
and idle for more than 30 s now spawns on the first try. The lane then fails at the provider,
which is the cost the gate prevents.

**Fix (choose one, then record it under `## Decisions`):**
- (Recommended) On `LIMIT_LOOKUP_PENDING`, consult a synchronous last-known state before the
  `unknown` verdict: an active non-estimated exhaustion in the ledger, or the expired cached
  reading of the owner (stale-while-revalidate). Block on that state, and keep `force` as the
  override. The background lookup stays uncancelled.
- Accept the gap. State in the task decisions that after 30 s of idle time, a slow-provider lane
  at limit can spawn without a check, and that the reply shows "unknown (limit lookup pending)".

### 3. minor — An inactive exhaustion hides a fresh 100% reading

- `libs/shared/src/lib/utils/plan-limits/window-state.ts:140-142`

**Defect:** When `window.exhaustion` is present but estimated, or its reset has passed, the
function returns `undefined` immediately and does not check the derived 100% rule. A window with
an estimated exhaustion (from a stream) and a fresh provider-api reading at 100% then classifies
as `near-limit`, not `limit-reached`. The lane is not AT LIMIT although the provider reports a
full window.

**Fix:** Return the exhaustion only when it is active. Otherwise fall through to the derived
check:
`if (exhaustion !== undefined && isActiveLimitEvidence(exhaustion, now)) return exhaustion;`
and then run the derived branch. Add a spec: estimated exhaustion plus a fresh provider-api 100%
reading gives `limit-reached`.

### 4. minor — The zero-wait peek depends on microtask order

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/bounded-limit-lookup.ts:35-40`

**Defect:** With `waitMs <= 0`, the race between `safeLookup` and
`Promise.resolve().then(...)` gives the settled value only because the reaction job of
`lookup.then` is queued before the marker job. This is correct today (the spec at `:232` covers
it). But a change that adds one more `.then`/`await` hop to `safeLookup`, or a lookup that
adopts a thenable, makes the peek return `pending` for a lookup that already settled. The reply
then shows "pending" in place of the real limit state.

**Fix:** Record the settlement explicitly. For example, in `evaluateSpawnLimitGate` attach
`preLookup.then((v) => { settled = { value: v }; }, () => { settled = { value: undefined }; })`
and let `resolvePostSpawnLimits` read `settled` synchronously, with no race.

## Decisions

- Diff base: I reviewed `git diff HEAD` and not `git diff main`, because `main` moved ahead of the
  branch base and `git diff main` contains unrelated main changes. Evidence: `git diff main --stat`
  lists agent-sdk and other files that the task did not change. Reversible: yes.
- Ledger caller without context (`plan-limit-ledger.rules.ts:99`): I treat this as correct
  and do not report it as a finding. A derived hit is the reading itself, and a newer reading
  below 100% must replace it. Reversible: yes.
