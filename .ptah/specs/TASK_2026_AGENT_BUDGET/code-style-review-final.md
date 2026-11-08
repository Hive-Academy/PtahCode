# Code Style Review — FINAL (whole PR #986)

**Task:** TASK_2026_AGENT_BUDGET
**Branch / head:** `feat/agent-budget` @ `a512e806c`
**Compared against:** `origin/main`
**Scope:** `git diff origin/main...HEAD -- . ':(exclude).ptah'` — 106 files, +3,604 / −508
**Reviewer role:** structure, boundaries, naming, type precision, duplication, dead code
**Mode:** read-only. No source file was edited, no commit/push, no dev host started.

---

## Score and verdict

**Score: 7 / 10**
**Verdict: NEEDS_REVISION — 0 blocking, 7 serious, 13 minor.**
**Draft exit:** S1–S7 must be fixed (or explicitly accepted in writing) before this PR leaves draft. None of them is an architectural blocker; all are contained, mostly mechanical changes.

The PR is structurally sound: one shared `AgentBudgetPolicy` in `@ptah-extension/shared` is genuinely reused by the CLI lane coordinator and the Codex child tap; the new files are small and single-purpose; layer and import boundaries hold; no `any`, `@ts-ignore` or `as unknown as` enters production code; the 3,851-line manager did **not** grow in code lines; logging goes through `Logger`, with content-free budget logs. The score is held down by consolidation gaps introduced *by* this feature: the settings surface was renamed but the export allowlist, the legacy compaction reader and one consumer still use the old keys; the threshold/warn arithmetic is re-derived in five places; and the seven adapter telemetry builders each hand-roll the same identity block plus a `'<provider>/unknown'` sentinel.

---

## Must fix before the PR leaves draft

| # | Finding | Files |
|---|---------|-------|
| S1 | Settings export/import allowlist still lists the removed `compaction.subagent*` keys and none of the four `agentBudget.*` keys | `libs/backend/agent-sdk/src/lib/types/settings-export.types.ts:53-65`, `settings-export.service.ts:140` |
| S2 | Removed `compaction.subagentHandoffTokens` is still a second source of truth for the handoff limit | `compaction-config-provider.ts:75-80,196-204`; `chat-subagent-context-injector.service.ts:403` |
| S3 | `telemetry-unavailable` is emitted as a `type: 'error'` segment by 2 adapters (5 others use `info`), and error segments feed failure/rate-limit classification | `antigravity-cli.adapter.ts:1457`; `copilot-sdk.adapter.ts:777`; `agent-process-manager.service.ts:3453-3472` |
| S4 | The stop/warn rule (`max(raw, weighted) >= stop`, `>= stop * warnRatio`) is re-derived in 5 places instead of living in `AgentBudgetPolicy` | `agent-budget-policy.ts:109-113`; `agent-budget-coordinator.ts:66-72`; `lane-resume-gate.ts:117-121`; `subagent-budget-monitor.ts:663,995-997` |
| S5 | The SDK monitor builds `new AgentBudgetPolicy(settings)` per assistant message and re-reads/parses config 8× per message | `subagent-budget-monitor.ts:620-623,660,758,841,968,995-997,1012-1013,1429-1436` |
| S6 | Telemetry identity (`turnId` fallback + `'<provider>/unknown'`) is hand-rolled in 8 emit sites with no shared helper | `antigravity:839-841`, `copilot:511-513`, `cursor:460,489`, `opencode:958-960`, `pi:545`, `codex-lane-events:48,79,234`, `acp-session-handle:821`, `ptah-cli-stream-loop:653-659` |
| S7 | Dead TTL plumbing left from the Claude-only weighting: `observe(..., cacheTtl)` is ignored, `cacheWriteByTtl` is written and never read, and a production caller still resolves and passes the value | `subagent-budget-monitor.ts:158,374-384,583-589`; `session-query-executor.service.ts:232,263,376-379` |

---

## Serious findings

### S1 — Settings export/import lost the new budget settings
**Evidence:** `libs/backend/agent-sdk/src/lib/types/settings-export.types.ts:53-65` still contains `compaction.subagentHandoffTokens` (`:62`) and `compaction.subagentStopWeightedTokens` (`:64`) and contains no `agentBudget.*` key. `settings-export.service.ts:140` iterates exactly this list, and `settings-import.service.ts` validates against it.
**Why serious:** this PR renames those two settings to `agentBudget.handoffContextTokens` / `agentBudget.stopWeightedTokens` and adds `warnRatio` / `maxDurationMin`, but a settings export now drops all four and keeps exporting two keys the UI no longer exposes. Backup/portability silently loses the feature's configuration — the exact class of gap the migration in `agent-budget-settings-migration.ts` exists to prevent.
**Fix:** add the four `agentBudget.*` keys, keep the two legacy keys only if import compatibility requires them (with a comment saying why). Add an export spec assertion that every `agentBudget.*` descriptor is exportable.

### S2 — The renamed handoff limit still has a legacy reader
**Evidence:** `compaction-config-provider.ts:196-204` still serves `subagentHandoffTokens` / `subagentStopWeightedTokens` from the legacy keys, and `chat-subagent-context-injector.service.ts:403` reads them as a fallback:
`handoffTokens: state?.handoffTokens ?? this.compactionConfig.getConfig().subagentHandoffTokens`.
**Why serious:** when neither live `state` nor a monitor snapshot exists (resumed/old sessions), the resume advice uses the legacy default 150,000, not the operator's `agentBudget.handoffContextTokens`. A user who lowers the handoff to 80k gets advice computed against 150k. It is a second source of truth for a limit this PR is consolidating, and it leaves the "Claude-only" shape in place.
**Fix:** read `agentBudget.handoffContextTokens` in `getConfig()` (or delete the two fields and make the injector use `snapshot?.handoffTokens`), and update the stale doc comments that still name the old keys (`subagent-budget-monitor.ts:167,189,679`; `subagent-resume-advice.ts:25`).

### S3 — Accounting unavailability is reported as an error in two adapters
**Evidence:** `antigravity-cli.adapter.ts:1457` and `copilot-sdk.adapter.ts:777` emit
`emitSegment({ type: 'error', content: '... turn telemetry unavailable: complete input/output totals missing.' })`.
Codex (`codex-lane-events.ts`), Cursor (`:487`), OpenCode, Pi and ACP report the same condition as `info` (or not at all).
**Why serious:** `type: 'error'` segments are user-visible failure bubbles and are consumed by `turnErrorTexts` / `laneFailureTexts` (`agent-process-manager.service.ts:3453-3472`, used by the rate-limit and failure classifiers). "The provider did not report usage" is a normal, expected accounting gap that the policy then handles with a deliberate `telemetry-unavailable` stop; it is not a transport error. Two adapters mint a false alarm and pollute the classifier input.
**Fix:** change both to `type: 'info'` (or reuse the message helpers the other adapters use) so all transports describe the same condition the same way.

### S4 — The budget rule is re-derived in five places
**Evidence:**
- authoritative rule: `agent-budget-policy.ts:107-115` (`Math.max(raw, weighted) >= stop`, warning at `* warnRatio`);
- `agent-budget-coordinator.ts:66-72` (`total`, `stopReason`, `warning` re-derived inside `rebindRecord`);
- `lane-resume-gate.ts:117-121` (`total = Math.max(...)`, `nearLimit = settings && total >= stop * warnRatio`);
- `subagent-budget-monitor.ts:663` (warn check) and `:995-997` (`budgetReached: state.weightedUsed >= stop` — ignores the raw floor entirely, so it can disagree with the policy's actual stop).
**Why serious:** this is the single rule the whole feature implements. Four copies will drift (one already does: `budgetReached` uses weighted only, the policy uses `max(raw, weighted)`). The monitors and the restart gate should ask the policy, not restate it.
**Fix:** expose one predicate on `AgentBudgetPolicy` (e.g. `static assess(snapshot, settings): { total, warning, stopReason }`) and call it from the coordinator, the resume gate and the monitor. Have `budgetReached` read `policySnapshot.stopped`.

### S5 — Per-message policy construction and config parsing in the SDK monitor
**Evidence:** `subagent-budget-monitor.ts:1429-1436` does `const settings = this.config.getAgentBudgetSettings(); ... new AgentBudgetPolicy(settings).evaluate(...)` inside the per-message accounting path; `:620-623` does the same in the no-usage path. `getAgentBudgetSettings()` (which allocates, reads four config keys and runs a Zod parse) is called at `:620,660,758,841,968,995,997,1012,1013` — i.e. several times per assistant message.
**Why serious:** the policy and its settings are invariant for the session; the CLI path builds them once per lane. This is a hot path (every `assistant` message of every subagent), and it is exactly the kind of per-item construction that makes a 1,931-line class expensive to reason about. It is also the reason `state.weightedUsed` had to be kept as a parallel field (`:1443`).
**Fix:** resolve the settings once when the session's budget state is created, keep one `AgentBudgetPolicy` on the session state, and read `policySnapshot` for state (`budgetReached`, `warningRatio`) instead of re-reading config.

### S6 — Eight hand-rolled telemetry identities
**Evidence:** each emit site wraps `completedTurnTelemetry` and re-invents the same three decisions: a `turnId` fallback of `` `${session ?? agentId ?? pid}:${sequence}` ``, a `'<provider>/unknown'` model sentinel, and `source`.
Sites: `antigravity-cli.adapter.ts:839-841`, `copilot-sdk.adapter.ts:511-513`, `cursor-cli.adapter.ts:460,489`, `opencode-cli.adapter.ts:958-960`, `pi-cli.adapter.ts:545`, `codex-lane-events.ts:48,79,234`, `acp-session-handle.ts:821`, `ptah-cli-stream-loop.service.ts:653-659`.
**Why serious:** eight copies will diverge (Pi already names its counter `spawnedChildrenSequence`; Cursor uses `run.id`; Antigravity uses a native `result_id`). The sentinel also silently defeats the shared helper's guard: `agent-turn-usage.types.ts:75` returns `unavailable('model-id-unavailable')` for `'unknown'`, but `'antigravity/unknown'` passes as a real model and only degrades pricing. That may be the intended fail-open, but it should be stated once, not re-decided per adapter.
**Fix:** add one shared builder next to `completedTurnTelemetry` — e.g. `turnIdentity({ provider, sessionId, sequence, modelId, source })` — and use it in all eight sites. Document the sentinel there (or return an explicit `modelIdUnavailable: true` flag instead of a fake model string).

### S7 — Dead TTL plumbing left from the Claude-only weighting
**Evidence:** `subagent-budget-monitor.ts:589` takes `_cacheTtl` and ignores it, while `session-query-executor.service.ts:376-379` still reads `this.subagentCacheTtl` and passes it on every message (`:232,263,1867` set it). `readSubagentRequestUsage` still builds `cacheWriteByTtl` (`subagent-budget-monitor.ts:374-384`) and the field is declared at `:158` — no production reader remains in the monitor (only the idle tracker, which computes its own). The JSDoc at `:583-588` still promises the parameter is used.
**Why serious:** it is exactly the checklist item "dead code left from the Claude-only weights": a parameter, a field, a setter chain and a doc block that outlived the weighting they served, plus a per-message TTL lookup in a hot path.
**Fix:** delete `_cacheTtl`, `cacheWriteByTtl`, the `setSubagentCacheTtl` chain and the stale JSDoc; or, if the TTL split is still wanted for a future price table, keep it and document the intended consumer.

---

## Minor findings

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| M1 | Blank-line churn detaches eight JSDoc blocks from their declarations (and a trailing space was left) | `agent-process-manager.service.ts:189,208,248,263,280,284,298,343` (blank after the doc, before `export`); trailing space at `:1198`; the PR adds 10 blank lines while non-blank lines are unchanged | remove the inserted blanks / run the formatter |
| M2 | File name covers only one of its two concerns | `lane-budget-deadline.ts:1-27` holds `createLaneBudget` (ledger construction) **and** `armLaneBudgetDeadline` (timer) | rename to `lane-budget-session.ts` or move `createLaneBudget` beside the coordinator |
| M3 | Barrel exports a factory and tap types that no host consumes | `codex-runtime/src/index.ts:115-118` exports `observeCodexChildBudgets`, `CodexChildBudgetTap`, `CodexChildBudgetDecision`; every use is inside `codex-runtime` (+ specs) | either wire a consumer or stop re-exporting (narrower repeat of round-3 M1) |
| M4 | The same decision shape is declared three times | `lane-budget-telemetry.ts:6-10` (`LaneBudgetDecision`), `agent-budget-coordinator.ts:87-92` (inline return of `accept`), `:53` (inline return of `rebindRecord`) | name one type in the coordinator and reuse it |
| M5 | The budget log's `ratio` disagrees with the rule it reports on | `lane-budget-telemetry.ts:38` divides `weightedTokens` only; the policy and the monitor use `max(raw, weighted)` (`agent-budget-policy.ts:109`, `subagent-budget-monitor.ts:1452`) | log `max(raw, weighted) / stop` |
| M6 | `'mixed-model'` is still a sentinel in a domain field | `ptah-cli-stream-loop.service.ts:239,661` (`MULTI_MODEL_ID`, now named + documented — an improvement over round-3 M7, but still a fake model id) | consider an explicit `multiModel: true` flag, or keep and cross-reference from the schema doc |
| M7 | `NEAR_BUDGET_RATIO` is a second copy of the 0.85 default and its default parameter is never used | `subagent-budget-monitor.ts:190,679,690`; the only caller (`:663`) always passes `budget.warnRatio` | delete the constant/default and take the ratio from settings |
| M8 | Agent-budget settings live on the compaction provider, although the PR states they are independent of compaction | `compaction-config-provider.ts:94-106` (`getAgentBudgetSettings`, doc says "independent of the SDK compaction switch") | extract a small `AgentBudgetSettingsReader` (the CLI already has `AgentSpawnEnvironment.resolveAgentBudgetSettings`) |
| M9 | The budget-settings warning reuses the lane-guard warn-once set | `agent-spawn-environment.service.ts:269-284` (`warnedLaneGuard`) | dedicated set/name, or share a named warn-once helper |
| M10 | A third 2 s drain constant and a reused entry cap; timer release still has five idioms | `codex-child-budget-observer.ts:29` (`CHILD_USAGE_DRAIN_MS`) vs `codex-app-server-lane.adapter.ts:70` and `acp-session-handle.ts:87`; `:108,127` use `CODEX_CHILD_BUDGET_MAX_ENTRIES` as a drain cap; the observer's timers never `unref` | one shared `USAGE_DRAIN_MS` in `@ptah-extension/shared`, a named drain cap, and one timer-release helper (round-3 M12 not fixed) |
| M11 | New advanced settings are formatted two properties per line while the whole table is one per line | `advanced-settings.types.ts:164-190` | match the surrounding style |
| M12 | `@ptah-extension/shared` value imports are added as separate statements beside existing type imports in five adapters | `antigravity-cli.adapter.ts:96`, `copilot-sdk.adapter.ts:40`, `cursor-cli.adapter.ts:21`, `opencode-cli.adapter.ts:63`, `pi-cli.adapter.ts:72` | merge into the existing statement |
| M13 | Two dead capabilities remain | `agent-budget-coordinator.ts:119-122` (`resumeSnapshot()` has no caller); `codex-child-budget-tap.ts:22,91,103,114,117` (`parentDelta` / `'parent-delta'` provenance is unreachable from production) | delete, or add the production caller that justifies them |

Also noted, not counted: `lane-completion-notifier.service.ts:859-861` builds `budgetLimit` with a three-level nested ternary; a small helper would read better.

---

## Adjudication of the round-3 findings

| Round-3 finding | Status at `a512e806c` | Evidence |
|---|---|---|
| M1 `ReturnType<...>` instead of a domain type | **Fixed** | `lane-budget-deadline.ts:1-27` takes `stop: () => void` |
| M2 one module, two shapes for the same object | **Fixed** | both functions take `TrackedAgent`; `lane-session-binding.ts` added |
| M3 three names for the cached workspace provider | **Fixed** | single `resolvedWorkspace` + `getWorkspace()` (`codex-lane-composition.ts:115-118`) |
| M4 dependency resolved outside the guard | **Fixed** | resolve happens inside `try` in both roots; lazy in the lane factory |
| M5 cumulative total named as a previous turn | **Fixed** | `previousResultCostUsd` (`ptah-cli-stream-loop.service.ts:276,655-656`) |
| M6 write-only `sessionModel` | **Fixed** | removed |
| M7 undeclared `'mixed-model'` sentinel | **Partly fixed** | now `MULTI_MODEL_ID` (`:239`) — see M6 above |
| M8 stop-reason JSDoc lost | **Fixed** | `AGENT_BUDGET_STOP_REASONS` + documented `LANE_STOP_REASONS` |
| M9 separator lines deleted to hit a size target | **Not fixed, changed shape** | non-blank code lines are now exactly equal (3,675), but 10 blank lines and eight detached JSDoc blocks were added — see M1 |
| M10 `rebindRecord` merge arithmetic / stale doc | **Not fixed** | `agent-budget-coordinator.ts:53-77` still re-derives the rule — folded into S4 |
| M11 `turnCount` fallback written three times | **Mostly fixed** | `turnCountOf()` (`:12`) used by the deadline and `rebindRecord` (`:65`); one constructor default remains |
| M12 fourth timer-release idiom | **Not fixed** | now five idioms — see M10 above |
| Round-3 serious (ACP drain / cumulative cost) | **Fixed** | ACP timer is abort-aware, cleared in `finally` and `.unref()` (`acp-session-handle.ts`); stream loop emits the `total_cost_usd` delta (`:653-656`) |

---

## Required-check verification

| Check | Result | Evidence |
|---|---|---|
| Public index aliases only; no deep `/src/` imports | **PASS** | the only `/lib/` matches in changed files are the libs' own barrels; all cross-lib imports use `@ptah-extension/*` |
| Nx layer / dependency direction | **PASS** | `codex-runtime` → `shared` only; `cli-agent-runtime` → `shared` + `codex-runtime`; `agent-sdk` → `shared`; composition roots live in `apps`/`cli-engine` |
| Host-neutral libs free of new `vscode`/`electron` imports | **PASS** | new codex-runtime code uses `CodexRuntimeLogger`; `agent-sdk`/`cli-agent-runtime` reuse the pre-existing `vscode-core` `Logger` import |
| tsyringe tokens / registration conventions | **PASS** | `LaneBudgetTelemetry`/`LaneBudgetGuard` are documented helper objects constructed by the manager; the Codex child budget travels through the existing registration ports; migration is invoked from the two composition roots before settings registration (`cli-engine/src/lib/container.ts:435` vs `:876`), with the same `~/.ptah` directory the file store uses |
| Type precision (`any`, `@ts-ignore`, `as unknown as`) | **PASS** | added-line scan finds only spec-file `as unknown as SdkHandle` / `SDKMessage`; no production hit. (`CliDIContainer`'s `as unknown as Logger` is pre-existing context, not added) |
| Zod at boundaries | **PASS** | `agent-turn-usage.types.ts` schemas (incl. `.strict()`), adapter-local schemas (`acp-prompt-usage`, Pi), settings schemas in three readers, migration value validation |
| `Logger`, no `console` | **PASS** | the only added `console.error` is `apps/ptah-electron/src/main.ts:104`, inside the pre-existing boot-phase pattern before the container exists; deferred warnings flush through `motionLogger.warn` |
| File size | **PASS** | all new modules ≤ 185 lines; `agent-process-manager.service.ts` 3,851 physical vs 3,849 on main (**+2 blank lines, 3,675 = 3,675 non-blank**); the monitor is +113/−92 and pre-existing large — see S5 for the structural symptom |
| Duplicated logic between the three budget paths | **MOSTLY PASS** | all three reuse `AgentBudgetPolicy`; the duplicated *rule application* is S4 |
| Duplicated adapter telemetry builders | **FAIL** | S6 |
| No dead code from the Claude-only weights | **FAIL** | S7, M13 |
| Naming (kebab-case, role suffixes) | **MOSTLY PASS** | one file-name mismatch (M2) |
| Logs cannot leak content/secrets | **PASS** | budget logs carry ids, model ids, token counts and reasons only; the Codex unlinked-method debug logs field *names* (`codex-context.ts`), not values; `redactBudgetSecrets` still guards persisted prose |

### Structural positives worth recording
- `ownedContext` (a 23-line hand-written proxy) was deleted from `apps/ptah-electron/src/di/codex-lane-composition.ts` and replaced by the shared `ownCodexContext` — a real dedupe.
- Round 3's module split is now coherent: `lane-budget-deadline.ts` (27), `lane-budget-telemetry.ts` (66), `lane-session-binding.ts` (23), `lane-restore.ts`, `lane-resume-gate.ts`; the manager no longer owns the telemetry side effects.
- `LaneBudgetTelemetry` takes `logger`/`warn`/`stop` as ports and has genuine warn → stop coverage (`lane-budget-telemetry.spec.ts:15-32`), including the once-only cost warning.
- `AgentBudgetPolicy` is immutable input → immutable transition, which is what makes the three call sites comparable at all.
- `CodexChildBudgetObserver` and the ACP usage drain both fail closed with bounded, named timers; the ACP timer is abort-aware.

---

## Verification and limits

- Static review of the full `origin/main...HEAD` diff plus the head content of every file cited; no build, no test run, no `npm run verify`, no dev host (read-only mandate).
- Behavioural questions are out of scope here and were already routed to `code-logic-reviewer`; in particular the *advisory* Codex child charge (decision logged, no sink) is a documented accepted gap (`code-logic-review-final.md:31` "accepted gaps"), not repeated as a style finding.
- The untracked `.ptah/specs/TASK_2026_AGENT_BUDGET/live-test-round-6/` directory was left untouched.

## Verdict

**NEEDS_REVISION, 7/10, no blocking issue.**
Fix S1–S7 (they are small: one allowlist, one reader, two log severities, one shared predicate, one policy instance per session, one identity helper, one dead-parameter removal) and the PR is in good shape to merge. M1–M13 are worth a cleanup pass in the same round because they are all one-liners and they are the kind of drift that hardens if left.
