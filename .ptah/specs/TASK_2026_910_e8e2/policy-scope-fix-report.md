## Changes

- `agent-budget-policy.ts`: Added optional lane accounting. Default construction follows `main` for raw floors, immediate stops, and unavailable telemetry; CLI lanes retain D1/D2/D5.
- `agent-budget-coordinator.ts`, `lane-resume-gate.ts`: Opted CLI lane constructions into lane accounting.
- Focused specs: Corrected lane fixtures and expectations, added default policy regression cases, and updated intended chat UI copy/default.
- `lane-guards-settings.component.ts`: Corrected stale documentation comment.
- Both `agent-lanes/SKILL.md` copies: Made the new cache and grace rules explicitly CLI lane specific. Session cost summary needed no scope edit.

## Failures

| Test | Cause | Side corrected |
| --- | --- | --- |
| Shared cache discount | Reported request context triggered a warning; even without it, projecting another 71-token turn crosses 100 | Spec fixture and expected predictive warning |
| Agent SDK monitor (11) | Shared policy unintentionally applied lane accounting | Code |
| Lane resume weighted total | Claude resume requires account storage after the budget check | Spec fixture uses a CLI without that requirement |
| Coordinator warning/grace | Shared policy selection was implicit; coordinator also omits absent `stopReason` | Code and spec assertion shape |
| Coordinator unavailable rebind | Distinct prior and current missing turns form a two turn streak | Spec |
| Lane telemetry stop | Grace crossing defers stop until next turn | Spec |
| Chat handoff default | Intended default changed to true | Spec |
| Chat lane guard intro | Intended new copy describes token and duration limits | Spec and stale source comment |

## Verification

- `npm run verify -- -t test -p @ptah-extension/shared -- --testPathPatterns=agent-budget-policy | Select-Object -Last 80`: failed (19 passed, 1 failed); after correcting predictive warning, rerun passed.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=agent-budget-coordinator | Select-Object -Last 80`: failed (8 passed, 1 failed) on omitted `stopReason` property; after correcting the assertion, rerun passed.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=lane-resume-gate | Select-Object -Last 80`: passed.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=lane-budget-telemetry | Select-Object -Last 80`: passed.
- `npm run verify -- -t test -p @ptah-extension/agent-sdk -- --testPathPatterns=subagent-budget-monitor | Select-Object -Last 80`: passed.
- `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=session-budget-settings.component | Select-Object -Last 80`: passed.
- `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=lane-guards-settings.component | Select-Object -Last 80`: passed.
- Full project suites, typecheck, lint, and visual checks did not run under the stated verification scope.

## Decisions

- Default policy behavior was compared with `git show main:libs/shared/src/lib/utils/agent-budget-policy.ts`.
- No edit was needed in the session cost summary; its changed setting is the separate D3 handoff default.

## Extra reads

- Read `main` policy, focused CLI lane code/specs, chat copy/specs, and the three requested text files. Ptah code tools were available; no matching CLI skill loader was exposed, so native file reads were used.
