# Code Logic Review - TASK_2026_2309_5bea (frontend usage/accounting)

Verdict: REVISE
Score: 6.5/10
Review family: reviewer = anthropic (in-process subagent), implementer = codex
Commit reviewed: 755736ccb (base 467a1ddb6). No tests were run (read-only review).

Paths are relative to `libs/frontend/`. `rows.ts` = `chat/src/lib/components/organisms/session-inspector/inspector-agent-rows.ts`. `inspector.ts` = `chat/src/lib/components/organisms/session-inspector/session-inspector.component.ts`. `totals.ts` = `chat-ui/src/lib/molecules/session/session-usage-totals.ts`.

## Rules A-H

| Rule | Result | Evidence |
| --- | --- | --- |
| A. Nothing counted twice | PASS | `rows.ts:125` and `inspector.ts:238-241` total only the SDK snapshot plus CLI contributions. SDK subagent/background rows are never added. `sub:`/`bg:` aliases collapse by id in `orchestrator-usage.ts:19-26` and `:42-44`. |
| B. `≥` only on a detected loss | PASS, with F1 below | Gaps that set `≥`: SDK error (`totals.ts:91-94`), partial coverage (`:97`), lane with no usage (`:133`), opaque total (`:137-138`), token-class omission (`:153-154`), null or partial cost (`:161-166`), removed lane without usage (`rows.ts:135-137`), restored lane without usage (`rows.ts:67-72`). An input+output split is unmarked (`totals.ts:152`). The empty four-class allowlist (`:57`) never adds cache tokens. The orchestrator override drops the SDK partial-coverage mark (see F1). |
| C. Orchestrator figure | PARTIAL | Subtraction and `—` cases are correct (`orchestrator-usage.ts:38-54`, handled per metric). The consumer overrides the mark (`rows.ts:226-231`). With no subagents the plan says the snapshot keeps its own mark, but this forces `~`. A partial-coverage `≥` is erased (F1). |
| D. Legacy `ok` snapshot cost | PASS | `totals.ts:107-109`: legacy uses `totalCost` and `amount()` accepts 0. A null cost is treated as missing. `NOT_PRICED` only for `rate-missing` (`:80`, `:163-164`). A null CLI cost gets the generic cause (`:165`). |
| E. Gate 2 round 3 corrections | PASS | No `hasLiveSession` latch in the code. `≥` is per metric. Token-class and opaque-total rules are present. Removed-lane split is retained vs missing (`rows.ts:135-137`). Legacy SDK cost is present (`totals.ts:107-109`). `answerFromHeader` exists (`inspector.ts` diff). |
| F. No template math; same totals; stale data; in-flight SDK read | PARTIAL | The template only binds precomputed values. `compactSessionMetrics(stats, this.totals())` and `session.totals` come from one `totals` computed. A pending snapshot gives `[sdk]` only, so the total is `—` and not `≥` (`inspector.ts:239-241`). FAIL for stale data: F2. |
| G. PLAN LIMITS | PASS | `planLimitReasonLabel(statusReason, providerId)` is used in `plan-limit-tiles.ts` (diff), `lane-tiles.ts` and `stats-limit-view-model.ts` (`noSource`). `windowGroupOf` is a typed helper with no `any` and no label parsing (`stats-limit-view-model.ts:171-176`). `windowMeter` gives a 0% window `{value:0,max:100}` (`plan-limit-tiles.ts`). The view-model filter keeps all window tiles. I did not trace the tile component's own filtering. |
| H. Timer and meter | PASS | Timer shows `--:--` for unknown (`timer.component.ts` diff: `text` computed). Meter `segmentFills` returns `[]` at width <= 0. New inputs default to old behaviour (`segments=null`, `unreported='none'`, `track=undefined`, `durationMs=null`, `accuracy='exact'`). |

## Findings

### Blocking
None.

### Serious

**F1. The orchestrator override hides a detected SDK gap and mislabels the exact case.**
- File: `rows.ts:226-231`, with `orchestrator-usage.ts:54`.
- Scenario: the SDK snapshot has `coverage: 'partial'` and `tokenCount: 50000`, with no subagents.
  - `sdkContribution` sets `lowerBound: true` (`totals.ts:97-103`). The whole-session total shows `≥`.
  - `rows.ts:226-231` forces `{estimated: true, lowerBound: false}`, so the Orchestrator row shows `~50k`. The mark that rule B requires is gone.
  - With subagents, `orchestrator-usage.ts:54` sets `lowerBound: false` unconditionally, with the same loss.
  - An exact snapshot with 0 subagents is shown as `~`. The plan says the snapshot keeps its own mark in that case.
- Fix: in `subtractSubagents`, keep `snapshot.lowerBound` (`lowerBound: snapshot.lowerBound`). Delete the override in `rows.ts:226-231` and return `subtractSdkLanes(...)` as is. Make `estimated` true only when something was subtracted.

**F2. The session total reads an unfiltered snapshot, so a previous session's SDK usage can show in the new one.**
- File: `inspector.ts:238` (`this.stats()?.snapshot`).
- Evidence: `session-stats-source.ts:175-180` takes `snapshot` straight from `tab.sessionStats` with no session check. `sessionId` is `host.sessionId()` (`:281`), and `snapshot` is the unfiltered tab value (`:282`).
- The projection does filter: `rows.ts:95-98` requires `stats.sessionId === sessionId()`. The Orchestrator row is therefore filtered, but `totals` is not.
- Scenario: a tab holds session A's stats (SDK 120,000 tokens). The user starts or resumes session B in the same tab. B has one CLI lane at 5,000 tokens, and `tab.sessionStats` has not been replaced yet. `totals` returns 125,000 as exact. The two surfaces disagree.
- Fix: expose the `rows.ts:95` computed (`snapshot`) from the projection and use it in `inspector.ts:238`. A mismatched session then behaves as pending (`—`).

### Moderate

**F3. A lane that drops out of "owned by session" is lost without a mark.**
- File: `rows.ts:113-118`.
- The retention check is `present = all agents`, not `owned`. A lane that is still in `monitor.agents()` but no longer in `agentsOwnedBySession(id)` is not copied from `previous` and is not in `active`.
- It vanishes from the totals with no `≥` and no cause.
- Scenario: a lane's owner session is cleared or changed after the first read.
- Fix: retain when the lane is not in `active`, and apply the removed-lane logic at `rows.ts:130-137`.

**F4. Duplicate gap causes for restored lanes.**
- File: `rows.ts:67-72`.
- `cliTokens` and `cliContribution` already set `lowerBound` and a cause for a null value. `addGap` then appends a second cause.
- The tooltip shows "X reported no tokens" and "X: restored lane is missing token usage". Both describe the same event.
- Fix: `addGap` should only add its cause when `!amount.lowerBound`.

### Minor

**F5. The accessible cost text drops trailing zeros.**
- File: `session-usage-format.ts:58-61`.
- `toLocaleString` with `maximumSignificantDigits: 21` gives `$0.1` and `$12.5` in the tooltip and accessible name, while the visible text is `$0.10` / `$12`.
- Fix: format the spoken cost with `formatUsageCost`'s decimals.

## Not found (checked)
- Floating-point: `sumUsageValues` sums cost in BigInt decimal units. Negative, `e`-notation and `-0` inputs trace correctly (`totals.ts:236-250`).
- NaN, Infinity and negative values are rejected by `validUsage` before any sum (`totals.ts:64-66`).
- The `effect(() => { retained(); })` at `rows.ts:123` only reads a signal. There is no write loop.
- `retained` is a `linkedSignal` keyed on `sessionId`, so a session switch resets it (`rows.ts:112`).
- Canvas dock focus restore: the key is recorded on open and nulled after restore. A missing control falls back to the expand control. No bug found.
- Not covered: backend digest, `session-task-reader.*`, `inspector-task-section.*` (the second reviewer has them).
- Residual uncertainty: whether `tab.sessionStats` is cleared promptly on a session change (F2). The `inspector-agent-rows.spec.ts` fixtures were not read.
