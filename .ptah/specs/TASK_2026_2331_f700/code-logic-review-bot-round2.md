# Code-Logic Review: Bot Threads Round 2 Fix

Worktree: `fix/live-session-resolver` (uncommitted diff on top of `9aa72bcb9`, 7 modified files).

## Summary

| Metric | Value |
| --- | --- |
| Score | 10/10 |
| Assessment | APPROVED |
| Blocking | 0 |
| Serious | 0 |
| Moderate | 0 |
| Minor | 0 |

## Checks

### 1. Session Registry (`session-registry.service.ts`) — PASS
- **Aborted records excluded from ambiguity**: `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts:492-502` filters `!byTab.abortController.signal.aborted` (line 494) and `!record.abortController.signal.aborted` (line 496) in `findMatches(idOrTabId)`. Records aborted in place by `invalidateAccountRoute` (`session-registry.service.ts:583-599`, line 596) or other lifecycle stops are excluded from both tab and `realSessionId` matches.
- **Two live registrations remain ambiguous**: When two non-aborted records share a `realSessionId`, both pass the liveness check in `findMatches` (`session-registry.service.ts:495-500`) and return 2 matches; `createLiveChatSessionResolver` (`apps/ptah-electron/src/di/live-chat-session-resolver.ts:28-40`, line 37) still resolves `{ kind: 'ambiguous' }`.
- **No caller loses needed records**: The only production caller of `findMatches` is the Electron `LIVE_CHAT_SESSION_RESOLVER` Claude source (`apps/ptah-electron/src/di/phase-2-libraries.ts:260-265`) via `SessionLifecycleManager.findMatches` (`libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts:697-699`). `SessionRegistry.find(idOrTabId)` (`session-registry.service.ts:504-506`) is unchanged, so retirement/cleanup paths (e.g., `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:1254-1256`) still locate aborted-but-unremoved records.
- **Test coverage**: `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.spec.ts:68-93` covers two live owners remaining ambiguous, aborting one excluding it from both tab and SDK session matches, and `find('retired')` still returning the aborted record.

### 2. CLI Lane Policy Resolver (`cli-lane-policy-resolver.ts`) — PASS
- **Resumed lane cannot exceed current parent level**: `resolveParentCeiling` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:62-92`) is invoked on the non-`plan` resume path (`cli-lane-policy-resolver.ts:120-121`). Using `CLI_LANE_BUILT_IN_PERMISSION_ORDER` (`['yolo', 'auto-edit', 'ask', 'plan']`, `libs/shared/src/lib/types/cli-lane-defaults.types.ts:45`), any stored permission more permissive than `parentLevel` (or an omitted permission under a non-`yolo` parent, or an unrecognized `parentLevel` defaulting to `'plan'` at line 71) is capped to `parentLevel` or a lower supported mode. Resumed lanes already at or below `parentLevel` return `undefined` from `resolveParentCeiling` and keep their validated snapshot without escalation.
- **Plan-level and fresh-request handling unchanged**: The empty-snapshot guard (`cli-lane-policy-resolver.ts:105-113`) and `input.parentLevel === 'plan'` branch (`cli-lane-policy-resolver.ts:114-118`) are preserved verbatim. The fresh-request path (`cli-lane-policy-resolver.ts:123-150`) delegates to the extracted `resolveParentCeiling(input, requested, selectedNetwork)` (`cli-lane-policy-resolver.ts:138-139`) with identical arguments and fallback semantics.
- **Capability fallback and resumer compatibility**: When the parent's permission mode is unsupported by the adapter (e.g., Codex under an `ask` parent, or OpenCode under `auto-edit`/`ask`), `resolveParentCeiling` walks `order.slice(parentRank)` through `resolveCliLaneDefaultPair` (`cli-lane-policy-resolver.ts:73-83`), enforcing Codex read-only `network: 'deny'` when falling back to `'plan'` (`lines 74-77`), and fails closed via `validateResolvedPolicy` if no mode at or below the ceiling is supported (`lines 84-88`). Both `SystemCliLaneResumer` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/system-cli-lane-resumer.ts:47-54`) and `PtahCliLaneResumer` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/ptah-cli-lane-resumer.ts:137-146`) forward `parentLevel` and `resumePolicy` into `AgentSpawnEnvironment.resolveLanePolicy` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:217-240`, called by `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:858-865`) and receive valid manifest-checked policies.
- **Test coverage**: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts:179-208` verifies Codex `yolo` resume capped under `auto-edit` (`auto-edit`/`allow`), `ask` (`plan`/`deny` capability fallback), and `plan`, plus Ptah CLI `plan` cap.

### 3. Session Handoff & Ack Store (`session-handoff.service.ts` + `session-handoff-ack.store.ts`) — PASS
- **Failed adapter close still fails closed**: `persistRuntimeClose(arm, session.runtime)` writes `runtimeClosePending` before `adapter.closeSession(...)` (`libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:1274-1275`). If `closeSession` rejects (even after dropping the live row), `arm.runtimeCloseSucceeded` stays `undefined`, and the guard at `session-handoff.service.ts:1250-1253` throws `'Handoff predecessor runtime is unavailable after a failed close'` on retries both in-process and after restart, keeping `state: 'closePending'` (`libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts:138-205`).
- **Successful close with failed marker clear completes on retry without live row**: Immediately after `adapter.closeSession(...)` resolves, `arm.runtimeCloseSucceeded = true` is recorded on the arm before `persistRuntimeClose(arm, undefined)` (`session-handoff.service.ts:1276-1277`). If persistence fails, `stopCaller` re-arms `arm` (`session-handoff.service.ts:1304`). On retry, `acknowledgeRecord` merges `runtimeClosePending` and `runtimeCloseSucceeded` from `record` and `existingArm` only when `previousArm?.successorTabId === record.successorTabId` (`session-handoff.service.ts:512-525`). In `retireCaller`, ambiguity (`line 1247`) and tab-ownership (`lines 1254-1260`) checks still run first; then `if (arm.runtimeCloseSucceeded)` (`lines 1261-1264`) persists `{ runtimeClosePending: undefined, runtimeCloseSucceeded: true }` via `persistRuntimeClose` (`lines 1283-1296`) and returns without requiring the live session row. (A hard process exit before any post-close write succeeds still fails closed because no durable state can prove adapter success.)
- **Durable marker cleared at completion & backward-compatible loading**: Both `closeCompleted` transitions (`session-handoff.service.ts:488-493` and `550-555`) explicitly pass `runtimeCloseSucceeded: undefined` (with `runtimeClosePending` already cleared before `retireCaller` returns). In `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts:35` and `:396`, `runtimeCloseSucceeded: z.literal(true).optional()` is optional on the strict `RecordSchema`, so pre-existing stored records without the field still pass `RecordSchema.safeParse` (`line 95`) and load normally.
- **Test coverage**: `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts:207-260` verifies failed persistence after successful close, retry persisting `runtimeCloseSucceeded: true`, closer timeout, service restart, and final completion clearing both markers without re-invoking `closeSession`.

### 4. Platform-CLI, CLI-Engine, and Electron Regression Check — PASS
- No files in `libs/backend/platform-cli` or `libs/backend/cli-engine` reference the modified symbols, and no public exports or cross-library boundaries were broken.
- Electron DI wiring (`apps/ptah-electron/src/di/phase-2-libraries.ts:260-273`) remains compatible with `SessionLifecycleManager.findMatches`.
- Independent focused verification run in this review:
  - Jest (`--runInBand --coverage=false`): 7/7 suites, 179/179 tests passed (`libs/backend/cli-agent-runtime`: 5 suites / 93 tests including `cli-lane-policy-resolver.spec.ts`, `session-handoff-ack.service.spec.ts`, `session-handoff-ack.store.spec.ts`, `system-cli-lane-resumer.spec.ts`, `ptah-cli-lane-resumer.spec.ts`; `libs/backend/agent-sdk`: 1 suite / 79 tests; `apps/ptah-electron`: 1 suite / 7 tests).
  - TypeScript (`tsc --noEmit`): 0 errors across `apps/ptah-electron/tsconfig.app.json`, `libs/backend/platform-cli/tsconfig.lib.json`, and `libs/backend/cli-engine/tsconfig.lib.json`.

## Defects

None.

## Verdict

**APPROVED** — All three round-2 fixes are logically sound, preserve fail-closed invariants and backward compatibility, introduce no regressions across Electron, `platform-cli`, or `cli-engine`, and are backed by passing focused tests and typechecks.
