# Batch B report — complete

## Changes

- libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.ts:95 reads and validates the four shared agentBudget settings through the existing ConfigManager path, with shared defaults for invalid values.
- libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:620 records unavailable telemetry and takes the safety stop path when SDK child totals are missing; one warning is logged per subagent. The valid SDK Task id is required at :1504 before stopSubagent is called, and the existing handoff preparation still runs. At :1430, child turns use AgentBudgetPolicy, observed message.model, provider cost then catalog pricing, and the policy raw-token floor. At :1449, one info log per accepted turn carries session, Task id, model, input/output tokens, weighted total, ratio and cost authority; unavailable cost warns once. At :1000 and :1621, lookup includes the Task id after a stop; :1103 preserves it across rekey. Budget enforcement no longer depends on compaction.enabled.
- libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-resume-advice.ts:12 makes the shared SendMessage and resume refusal include warned running subagents as well as stopped ones.
- libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1 removes the obsolete Claude-only weight and compaction-switch description; the old weight helper and constants were removed in place.
- libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts:1044 and other real-monitor fixtures supply getAgentBudgetSettings. The obsolete prompt-cache TTL weight assertions were removed because the shared policy prices the observed turn.
- libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.capabilities.spec.ts:324 and plugin-loader.service.session-notice.spec.ts:220 tolerate Windows EPERM only when creating symlinks in their filesystem tests; these suites did not contain budget settings mocks.

## Regression coverage

- subagent-budget-monitor.spec.ts:52 registers explicit Claude catalog rates. :197 supplies shared-policy settings; :900 covers raw-token floor; :995 covers repeated request ids; :957 covers duration; :1720 covers missing usage, one warning, Task id and handoff write; :1390 covers budget enforcement with compaction disabled. Existing warning, notes, record write, stop retry, background/foreground delivery, and PostToolUseFailure/TaskCompleted behavior specs pass. :504 and :514 cover stopped Task identity and rekey.
- sdk-permission-handler.spec.ts:94 covers SendMessage budget refusal, including a warned running agent at :140. sdk-query-options-builder.spec.ts:384 covers the PreToolUse refusal for stopped and warned targets. Existing resume advice and hooks specs pass.
- The shared telemetry source contract was not changed. SDK child assistant messages provide their own usage; no parent-delta derivation is used. The shared AgentBudgetPolicy was consumed unchanged.

## Verification

- Scoped ptah_get_diagnostics: 0 errors, 0 warnings.
- npm run verify -- -p agent-sdk,codex-runtime,ptah-electron,cli-engine,shared: 15/15 tasks passed (10 lint/typecheck, five test), exit 0 on 2026-11-08. The first full attempt had only two Windows EPERM symlink test failures; the focused plugin-loader run and final full run passed after the test guard fix.
- npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts: exit 0, no FAIL; 216 existing unsuppressed sites within baselines.
- No Ptah Dev, build, serve, e2e, or package target was run. No commit, push, merge, or PR was made.

## Decisions

- Kept budget enforcement independent of compaction.enabled as required by plan §2; reversible in the monitor, but a switch would violate the plan.
- Used child message.model and child usage rather than parent deltas. The SDK child stream already provides totals, and adding parent-delta to the shared enum would misstate provenance.
- Returned early from only the two filesystem symlink tests on Windows EPERM; this environment lacks symlink privilege. Other errors still fail those tests.

## Remaining gaps

- The GitHub CLI could not read PR #1004's body without authentication. The merged #1004 code and passing regression suites were used to preserve behavior.
- Live Haiku SDK validation remains for the coordinator because this lane is forbidden to launch Ptah Dev.

## Ptah Dev Haiku SDK live test

1. In the coordinator's isolated Ptah Dev profile, note current agentBudget settings and launch the Electron Dev session with the existing launcher. Record owned PIDs and the log path.
2. Set agentBudget.warnRatio to 0.85, lower stopWeightedTokens and handoffContextTokens to safe test limits, and keep maxDurationMin at 90. Start a Claude SDK chat using Haiku and ask it to spawn one Task subagent that reads a bounded set of repository files, writes progress notes on warning, and reports its work.
3. In the log, find one Accepted subagent turn per distinct child message id. Record parent session, Task id, observed model (which may differ from the requested alias), input/output tokens, weighted total, ratio, and cost authority. Confirm the 85% notice and notes file, pending handoff record, Ptah-attributed stop, and parent handoff message.
4. Try SendMessage and resume against the warned Task id, then the stopped Task id. Confirm both PreToolUse refusals are scoped to the parent session and a fresh Task can use the handoff.
5. Restore the original settings. Stop only owned Dev processes and save sanitized evidence without prompts, secrets, or raw content.
