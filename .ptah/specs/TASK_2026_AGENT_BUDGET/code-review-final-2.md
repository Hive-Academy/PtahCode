# Second Final Code Review — TASK_2026_AGENT_BUDGET

## Summary

| Metric | Result |
| --- | --- |
| Score | 7/10 |
| Verdict | REVISE |
| Blocking | 0 |
| Serious | 1 |
| Minor | 1 |

The earlier serious logic defect and style S1–S7 are resolved in the reviewed head. A new Codex observer lifecycle gap can discard a pending terminal charge. The main stop and warning paths remain coherent; this is above the 5–6 band. A lost child decision at a stream boundary prevents an 8–9 score.

## Earlier final-review findings

| Finding | Status | Head evidence |
| --- | --- | --- |
| Logic serious: terminal-first child linkage skips usage drain | Fixed | `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:132-155` links before testing and waits for accepted usage. |
| Logic minor: root model prices an unknown child | Fixed | `libs/backend/codex-runtime/src/lib/codex-child-budget-tap.ts:109-130` uses `codex/unknown` with raw-token floor and unavailable catalog cost. |
| S1 settings export/import allowlist | Fixed | `libs/backend/agent-sdk/src/lib/types/settings-export.types.ts:63-66` lists all four new keys. |
| S2 legacy handoff settings reader | Fixed | `libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.ts:186-199` derives handoff from `agentBudget`. |
| S3 unavailable telemetry emitted as error | Fixed | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts:1457`; `copilot-sdk.adapter.ts:777` emit information segments. |
| S4 duplicated threshold rule | Fixed | `libs/shared/src/lib/utils/agent-budget-policy.ts:85-96` owns the decision, including raw floor and predictive largest-turn delta; `agent-budget-coordinator.ts:68` calls it. |
| S5 per-message repeated policy construction | Fixed | `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:596-597` builds one policy per observed message. A separate snapshot call at `:969` remains, outside the per-message path. |
| S6 hand-built telemetry identity | Fixed | `libs/shared/src/lib/types/agent-turn-usage.types.ts:52-67` provides `turnIdentity`, used by the changed adapters. |
| S7 dead TTL monitor plumbing | Fixed | `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:154-158,364-371,568-576` no longer accepts or stores TTL buckets. |

## Findings

### Serious — pending Codex child terminal is discarded when the event stream closes

**Evidence:** `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:129-176`.

If a linked child terminal arrives before its usage, the observer stores it in `draining` and starts a two-second timer (`:132-155`). If `context.events()` then completes or throws before that timer fires, `finally` clears every timer and drops every pending terminal (`:167-176`) without calling `settle`. There is no child decision or unavailable-telemetry decision, and the missing turn is silent except for a stream-error warning on the throw path. This is possible at shutdown or a broken event source. Flush pending terminals before disposing the tap on natural close/error, while keeping explicit disposal idempotent. Add a terminal-then-stream-close fixture. **Fix before the PR leaves draft.**

### Minor — unavailable child model is logged as a warning on every completed turn

**Evidence:** `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:75-89,114-120`.

The decision log uses `logger.warn` even for a complete, below-threshold child decision; a second warning is emitted once per child for missing model. The log contains IDs and counts, not prompt text or secrets, but routine successful turns inflate warning volume. Use info for the routine decision and reserve warn for degraded or actionable transitions.

## Five logic questions

1. **Silent failure:** a pending child terminal is lost on event stream completion (`codex-child-budget-observer.ts:167-176`).
2. **Unexpected action:** ending a session immediately after a child terminal can leave that child uncharged (`codex-child-budget-observer.ts:132-155,173-176`).
3. **Wrong input answer:** an absent child model now preserves reported raw tokens as `codex/unknown` and leaves cost unavailable (`codex-child-budget-tap.ts:109-130`); no new wrong-price case was established.
4. **Dependency failure:** an observer callback rejection is caught and logged; the stream monitor wait is capped at 15 seconds with a retained rejection handler and cleared timer (`stream-transformer.ts:418-461`). An event-source failure still drops pending Codex terminals as above.
5. **Unspecified case:** the required behavior for a child terminal still pending when the event source closes needs an explicit test and flush rule.

## Other requested checks

- `stream-transformer.ts:431-461,687-690` attaches a rejection handler before the race, clears the timer, and advances after 15 seconds; monitor work survives the timeout, so a late handoff can still be delivered, though its ordering against later parent messages is no longer guaranteed.
- `agent-budget-policy.ts:85-96,123-131` uses the largest observed turn for predictive warning. `lane-budget-telemetry.ts:70-87` avoids sending a warning to a lane stopped by the same completion; `lane-completion-envelope.ts:34` carries that warning for budget stops.
- `codex-child-budget-tap.ts:42-57,109-135,160-170` retains a known child model and snapshot across repeat links and charges valid raw counts without a model. `lane-budget-telemetry.ts:7-24` returns `queue-next-turn` when the handle's queue method is selected. Its returned mode describes queue acceptance, not confirmation of a future delivered turn.
- The changed production paths inspected retain public-alias imports, existing DI structure, typed boundaries, and no observed `any`, `@ts-ignore`, or `as unknown as`. The diff's `as unknown as Logger` occurs in a spec. The touched large files remain pre-existing large modules; no new god module was introduced. Logged timeout metadata consists of session, message type, tool ID, and duration (`stream-transformer.ts:424-455`), with no message content.

## Verification and decisions

Read the two final reviews, four fix/live reports, scoped diff, and the cited head paths. The supplied round-seven report records scoped verify success for changed projects, with only known `platform-core` Windows socket/lock test failures. No checks or live host were run here. Scoped `ptah_get_diagnostics` returned **unavailable after 45 seconds**, so it is not a pass. Symbol index returned zero hits; native `rg` was used after that empty Ptah result. `context.md` is absent from the task folder. No skill-loading tool was listed, so no skill was loaded.

**Decision:** Flush queued terminal charges when the event source ends; the alternative is discarding the charge. The observer already has a `settle` path and a bounded pending map, so this is reversible and local.

## Verdict

**REVISE.** Fix the serious close-before-drain defect before PR #986 leaves draft. The routine warning log is minor. Confidence: medium; this is a static review of the scoped commits, and the Codex close case lacks a fixture or live confirmation.
