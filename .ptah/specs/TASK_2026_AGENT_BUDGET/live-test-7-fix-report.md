# Round 7 fixes

## Root causes and changes

- Native Codex child: `codex-child-budget-tap.ts:111` passed an absent model to `completedTurnTelemetry`, which rejected otherwise valid token counts as `model-id-unavailable`. It now uses `codex/unknown` for real counters, so `AgentBudgetPolicy` charges the raw-token floor and keeps cost unavailable. `codex-child-budget-observer.ts:76` previously logged decisions only for warning, stop or handoff; a completed second turn without those side effects had no decision log. It now logs every completed child decision. The observer logs missing child model once per child (`:115-120`). The tap retains per-child model and accounting state across repeat links (`codex-child-budget-tap.ts:34-51`); `codex-context.ts:413-414` accepts `thread/started.thread.model`, and `codex-event-translator.ts:155,693` carries the parent's spawn item's model when present. Existing settings and token usage model sources remain in place. No parent model is used for catalog pricing.
- Codex CLI lane: `agent-process-manager.service.ts:455` formerly requested a steer before trying the adapter's queue method, producing a misleading `unsupported` outcome. `lane-budget-telemetry.ts:8-28` now checks the live handle's queue capability before sending an unsupported steer request, and returns the actual `queue-next-turn` delivery mode.
- SDK handoff: `subagent-handoff-message.ts:119` replaces the literal SDK user interruption wording with a paraphrase that attributes the notice to Ptah's monitor.

## Specs

- `codex-child-budget-observer.spec.ts:93-117`: two child turns with a relink and missing model IDs produce two decisions with real counters, degraded price coverage, and one missing-model notice. Existing missing-model expectation now requires reported counters.
- `lane-budget-telemetry.spec.ts:15-23`: queue-capable handle delivers without calling the steer route.
- `subagent-budget-monitor.spec.ts:2219`: asserts the new handoff wording.

## Verification

- Scoped TypeScript diagnostics: no errors or warnings.
- `npm run verify -- -t test -p cli-agent-runtime -- --testPathPatterns=lane-budget-telemetry`: passed.
- `npm run verify -- -p shared,agent-sdk,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`: final rerun completed. Lint and typecheck: 16/16 passed. Tests: 17/18 tasks passed; only `platform-core:test` failed, with the two known Windows socket/lock failures in `control-endpoint.spec.ts` and `kernel-session-driver-lock.spec.ts` (full output `C:\Users\dev\.nx\d60e02896ae18ad9\cache\terminalOutputs\8636651624797266161`). All changed project tests passed.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no FAIL or baseline increase.
- `agent-process-manager.service.ts`: 3,671 nonblank lines (limit 3,675).

## Decisions

- Unknown child model: use an explicit `codex/unknown` identity for valid token counts, with unavailable cost. This follows the existing shared policy's raw-token floor; alternatives were treating the whole turn as unavailable or pricing with the parent model. Reversible.
- Decision visibility: log every completed child decision. The previous warning/stop-only logging made quiet turns indistinguishable from missing accounting. Reversible.

## Remaining gaps

- No new live Electron run was performed, per instruction. The two known Windows platform-core socket/lock test failures remain outside this change.
