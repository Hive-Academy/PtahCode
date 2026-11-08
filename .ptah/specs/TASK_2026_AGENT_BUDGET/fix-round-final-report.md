# Final fix round report

## Findings

| Finding | Status | Evidence |
| --- | --- | --- |
| Logic serious: terminal-first Codex child linkage | Fixed | `codex-child-budget-observer.ts:122-126`; both order fixtures in `codex-child-budget-observer.spec.ts:93-123`. |
| Logic minor: root model priced as child | Fixed | `codex-context.ts:553-559` no longer seeds the child model; `codex-context.spec.ts:12-34` and `codex-child-budget-observer.spec.ts:224-238` cover unknown child model. |
| S1 settings allowlist | Fixed | `settings-export.types.ts:53-68` exports four agent budget keys and omits removed compaction keys; `settings-export.types.spec.ts:77-93`. |
| S2 handoff source of truth | Fixed | `compaction-config-provider.ts:196-204` reads the agent budget settings, including the injector fallback. |
| S3 unavailable segment severity | Fixed | `antigravity-cli.adapter.ts:1457`, `copilot-sdk.adapter.ts:777` now emit info; adapter specs. |
| S4 common stop/warn rule | Fixed | `agent-budget-policy.ts:84-101` owns assessment; coordinator, resume gate, and SDK monitor use it, including the raw floor in the SDK snapshot. |
| S5 SDK monitor configuration work | Fixed | `subagent-budget-monitor.ts:599-610` resolves settings and policy once per observation. |
| S6 telemetry identity | Fixed | `agent-turn-usage.types.ts:52-67` supplies the identity used by adapters, ACP, Codex lane and stream loop. |
| S7 dead TTL plumbing | Fixed | `subagent-budget-monitor.ts:149-158,360-380` no longer stores TTL buckets; `idle-request-tracker.ts:16-40` parses the split at its actual consumer; executor no longer passes TTL to the monitor. |
| M1 detached manager comments | Fixed | `agent-process-manager.service.ts:185-343`; nonblank lines remain 3,675. |
| M2 lane budget filename | Skipped | `lane-budget-deadline.ts:1-27`: rename would touch several imports for no behavior change. |
| M3 unused Codex exports | Fixed | `codex-runtime/src/index.ts:115-121`. |
| M4 repeated decision type | Skipped | `agent-budget-coordinator.ts:53-92`, `lane-budget-telemetry.ts:6-10`: local shapes remain clear; a shared type is a nonbehavioral cleanup. |
| M5 budget log ratio | Fixed | `lane-budget-telemetry.ts:38-39` logs the raw or weighted maximum. |
| M6 mixed model sentinel | Skipped | `ptah-cli-stream-loop.service.ts:239,661`: replacing the sentinel needs a telemetry contract change. |
| M7 near budget default | Fixed | `subagent-budget-monitor.ts` no longer declares a second 0.85 threshold. |
| M8 settings reader location | Skipped | `compaction-config-provider.ts:94-106`: extracting a reader changes the DI surface in this final fix round. |
| M9 warning set | Skipped | `agent-spawn-environment.service.ts:269-284`: existing bounded set preserves warning semantics. |
| M10 timer idiom and drain constant | Skipped | `codex-child-budget-observer.ts:29-30,139` now names a drain cap and unrefs its timer; a shared cross-adapter constant/helper remains nonbehavioral cleanup. |
| M11 settings formatting | Skipped | `advanced-settings.types.ts:164-190`: formatting only. |
| M12 shared imports | Fixed | Adapter imports consolidated beside `turnIdentity` (`antigravity-cli.adapter.ts:96`, `copilot-sdk.adapter.ts:40`, `cursor-cli.adapter.ts:21`, `opencode-cli.adapter.ts:63`, `pi-cli.adapter.ts:72`). |
| M13 dead capabilities | Fixed | Codex parent delta path removed from `codex-child-budget-tap.ts:16-123`; unused `resumeSnapshot` removed from `agent-budget-coordinator.ts:110-115`. |

## Verification

Final scoped `npm run verify -- -p shared,agent-sdk,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`: all 16 lint/typecheck tasks passed. Test phase: 17 of 18 Nx tasks succeeded; the only failing task was platform-core, with exactly the two permitted known failures `control-endpoint.spec.ts` and `kernel-session-driver-lock.spec.ts` (57 platform-core suites and 1,047 tests passed). Focused Codex observer, Codex context, and Copilot adapter specs passed. `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 with no FAIL; existing unsuppressed sites remained within baseline. `ptah_get_diagnostics` was called after edits but timed out after 45 seconds, leaving four requested files unchecked; the successful project typechecks are the compiler evidence.

## Manager size

`agent-process-manager.service.ts`: 3,843 physical lines; **3,675 nonblank lines**.

## Decisions

| Decision | Options and evidence | Reversible? |
| --- | --- | --- |
| Keep idle TTL tracking local to idle compaction | The tracker reads TTL buckets while the SDK budget monitor does not (`idle-request-tracker.ts:16-20,110-115`). Moving the parser there removes unused budget plumbing without dropping idle behavior. | Yes |

## Remaining gaps

The skipped minors above are nonbehavioral cleanups or require a telemetry/DI contract change. No live host or build was launched. Skill loading was unavailable in this lane (no skill loader was listed); repository guidance and source patterns were followed directly.
