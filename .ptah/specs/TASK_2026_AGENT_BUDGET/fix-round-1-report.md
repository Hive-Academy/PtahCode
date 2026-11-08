# Fix round 1 report

## Review findings

| ID | Finding | Result and evidence |
| --- | --- | --- |
| Logic HIGH 1 | Late native session ID loses ledger | Fixed: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1400` rebinds the previous record atomically; `agent-budget-coordinator.ts:46` preserves counters and lifetime start. Late ID resume regression in `agent-process-manager.service.spec.ts`. |
| Logic HIGH 2 | Successful turn stopped before usage reconciliation | Fixed: ACP reconciles prompt `_meta.usage` and `usage_update` in `cli-adapters/acp/acp-session-handle.ts:375,790` (fixture `acp-session-handle.spec.ts:197`); OpenCode reconciles step and final usage in `cli-adapters/opencode-cli.adapter.ts:900`; Cursor uses run/result usage in `cli-adapters/cursor-cli.adapter.ts:480`. Missing totals produce one final unavailable record after the vendor completion boundary. |
| Logic HIGH 3 | Codex terminal precedes trailing usage | Fixed: `cli-adapters/codex/codex-lane-events.ts:39` holds terminal until trailing usage or flush, with delayed usage and no usage fixtures in `codex-lane-events.spec.ts:255`. |
| Logic MEDIUM 1 | OpenCode prices requested model | Fixed: `cli-adapters/opencode-cli.adapter.ts:922` uses the observed provider/model, or `opencode/unknown` for degraded pricing and raw token accounting. ACP (`acp-session-handle.ts:796`), Antigravity (`antigravity-cli.adapter.ts:841`), Copilot (`copilot-sdk.adapter.ts:513`) and Cursor (`cursor-cli.adapter.ts:457`) follow the same observed model rule. The Grok ACP fixture now supplies its billed model in `_meta.usage` (`grok-cli.adapter.spec.ts:441`). |
| Logic MEDIUM 2 | Antigravity duplicate results use random turn IDs | Fixed: `cli-adapters/antigravity-cli.adapter.ts:864` derives conversation/turn sequence IDs and suppresses duplicate results; successful correction after an error result remains accepted. Focused Antigravity suite passes. |
| Logic MEDIUM 3 | Invalid JSON breaks migration | Fixed: `libs/backend/platform-core/src/agent-budget-settings-migration.ts:24` warns once and preserves the file without a stamp; `agent-budget-settings-migration.spec.ts:43` tests it. Existing `file-settings-manager.ts:610` catches malformed JSON and uses defaults; `file-settings-manager.spec.ts:520` tests its reader behavior. |
| Style BLOCKING 1 | Electron lane applies two child observers | Fixed: `apps/ptah-electron/src/di/codex-lane-composition.ts:341` opens the registered runtime once; `apps/ptah-electron/src/di/codex-runtime-composition.ts:245` supplies one child budget port, and `libs/backend/codex-runtime/src/lib/codex-runtime.ts:477` attaches the observer on context open. The runtime.open monkey patch is removed. |
| Style SERIOUS 1 | Duplicated Electron/CLI child observer | Fixed: both hosts use `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:92`; `codex-child-budget-tap.ts:14` owns the 128 child cap and cleanup. Observer and tap specs cover once only charging and bounded state. |
| Style SERIOUS 2 | Repeated budget defaults | Fixed: `libs/shared/src/lib/utils/agent-budget-policy.ts:21` exports defaults derived from the advanced settings descriptors; Electron, CLI, and spawn readers use it. |
| Style SERIOUS 3 | Anonymous durable budget record | Fixed: `libs/shared/src/lib/types/agent-process.types.ts:328` names `AgentBudgetRecord`, with optional `turnCount` for old records; `agent-budget-coordinator.ts:34` retains the latest 256 turn IDs and total count. |
| Style SERIOUS 4 | Duplicated stop reason classification | Fixed: `agent-process.types.ts:337` exports the predicate; call sites use it and `libs/shared/src/lib/types/messages/schemas.ts:136` uses `LANE_STOP_REASONS`. |
| Style SERIOUS 5 | Manager grew and duplicated deadline timer | Fixed: `agent-process-manager.service.ts:857` centralizes deadline arming; coordinator owns record mapping and rebind. The manager is now 3,906 lines, down 5 from the reviewed 3,911 line baseline. |
| Style SERIOUS 6 | Random turn IDs in Antigravity and Copilot | Fixed: `cli-adapters/antigravity-cli.adapter.ts:864` and `cli-adapters/copilot-sdk.adapter.ts:512` use native identity or deterministic per run sequence. OpenCode fallback is also deterministic at `opencode-cli.adapter.ts:921`. |
| Style SERIOUS 7 | Codex decorators drop steer guard | Fixed: Electron and CLI lanes use `libs/backend/codex-runtime/src/lib/owned-codex-context.ts:16`, which forwards `expectedTurnId`; `owned-codex-context.spec.ts:23` verifies the guard argument and once only close. |

## Minor findings

| Finding | Result |
| --- | --- |
| Compact advanced settings descriptor formatting | Skipped: formatting only; avoided another shared UI edit during backend verification. |
| Migration logger type | Fixed: `agent-budget-settings-migration.ts:8` uses an interface. |
| Policy type only imports | Fixed: `agent-budget-policy.ts:2`. |
| Advanced settings group copy in template | Skipped: UI copy migration is outside this backend correction and requires webview verification. |
| Spawn warning repeats | Fixed: `agent-spawn-environment.service.ts:247` uses the bounded warning path. |
| Nested budget limit sentence | Skipped: existing typed `budgetLimit` is passed to the envelope; further text refactoring is cosmetic. |
| Inconsistent missing telemetry segment severity | Skipped: adapter segment severity is existing provider specific output; central telemetry status and stop behavior are consistent. |

## Verification

- Required final `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`: all 14 lint/typecheck tasks passed; 16 of 17 test tasks passed. Only `platform-core:test` failed, with the two documented pre existing Windows session-driver-lock failures (`control-endpoint.spec.ts` and `kernel-session-driver-lock.spec.ts`; 57 other platform-core suites and 1,046 tests passed). The immediately prior full run exposed the stale Grok fixture, which was corrected before this rerun.
- Focused Antigravity, ACP, Cursor, Codex owned context and Grok adapter specs passed after their final corrections. Scoped `ptah_get_diagnostics` reported zero errors for the changed ACP, Antigravity and Codex context files. A later diagnostic request for the Grok spec timed out while TypeScript was busy; the required typecheck passed afterward.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 with 216 unsuppressed sites; no baseline increased.
- Remaining verification gap: the child observer unit spec proves one charge per child turn and Electron lane code has a single registration path, but there is no dedicated Electron lane end to end child charge spec.

## Decisions

- Invalid JSON remains on disk for diagnosis; the existing settings reader starts with registered defaults. Reversible if settings recovery policy changes.
- Unknown observed model retains raw tokens and degraded pricing coverage rather than using a requested model alias. Reversible when providers expose a billed model.
