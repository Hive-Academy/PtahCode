# Code-Logic Review: Merge `origin/main` into `fix/live-session-resolver` (PR #1521)

Reviewed the in-progress `git merge origin/main` conflict resolutions across the 4 conflicted files plus their auto-merged siblings and callers.

> Tool fallback note: `ptah_grep` is not exposed in this lane's MCP tool list; caller and marker searches used `git grep` alongside `ptah_get_dependents`.

## Summary

| Metric | Value |
|---|---|
| Score | 85 / 100 |
| Assessment | **REVISE** |
| Blocking | 1 |
| Serious | 0 |
| Moderate | 0 |
| Minor | 0 |

## Checks

### Check 1 — Main Behavior Preserved

**PASS.** All three main commits are preserved in the merged working tree:

1. **Provider-session parent permission lookup (`0749c6db6`)**
   - `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts:27,36-45` accepts `options.providerSessions`, resolves `providerSessionId` through `resolveLiveSessionId`, and checks `options.providerSessions?.getPermissionLevel(providerSessionId)` between Codex and lifecycle fallback.
   - `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts:81-139` retains the live provider-session (Antigravity) suite, including unknown-caller spawn (`plan`) and resume (`undefined`) cases.
   - `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:190,193-199,631-632,823-828,1279-1285,1314-1318` injects `PROVIDER_SESSION_CHAT_ADAPTER` as `providerSessionChatSessions`, forwards it into `parentLanePermission` when `liveChatSessions` is absent, and consults it in `resolveNativeCallerId` and `resolveCallerLiveSessionId`.
   - `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts:798,859,1065-1087` retains the adapter-only Antigravity wiring test (`liveChatSessions = undefined`) verifying `resolveSessionId`, `getParentLevel`, and `{ providerSessions: reader }`.
   - Auto-merged `libs/backend/cli-agent-runtime/src/lib/di/register-agent-messaging.ts:236-248` and `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.ts:24-28` continue forwarding `providerSessions`.
2. **Route-record reader at agent spawn (`901b5ecd3`)**
   - `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:157,794` imports `resolveRouteDecideService` and wires `getRouteRecordReader: () => resolveRouteDecideService(this.container)` into `buildAgentNamespace`.
3. **Orphaned resumed lane keeps its stored policy (`72e4a6110`)**
   - `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts:26,48` returns `undefined` when `options.unknownParent === 'uncapped'` and no live parent level is found.
   - `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts:29-46,126-138` verifies unknown parents stay uncapped on resume while a live `plan` parent still caps resume.
   - `libs/backend/cli-agent-runtime/src/lib/di/register-agent-messaging.ts:245-248` still passes `{ unknownParent: 'uncapped', providerSessions }`, and `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:68,120-121` skips `resolveParentCeiling` when `parentLevel` is `undefined`, preserving the stored `resumePolicy`.

### Check 2 — Branch Behavior Preserved

**PASS.** All branch behaviors from `fix/live-session-resolver` are preserved:

1. **Live chat resolver used for lane parent identity and permission**
   - `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:624-625` injects `PLATFORM_TOKENS.LIVE_CHAT_SESSION_RESOLVER` as `liveChatSessions` (in Electron, registered with Claude, Codex, and provider-session sources in `apps/ptah-electron/src/di/phase-2-libraries.ts:260-273`).
   - `ptah-api-builder.service.ts:798-803` uses `this.liveChatSessions.resolve(tabIdOrSessionId)` for lane parent identity (`resolveSessionId`) and `:817-822` uses it for lane parent permission (`getParentLevel`). Covered by `ptah-api-builder.service.spec.ts:423-459,487-504`.
2. **Ambiguous / unresolved callers stay unattributed and cap spawn permission to `plan`**
   - `ptah-api-builder.service.ts:818-821` returns `'plan'` whenever `result.kind !== 'resolved'` or `result.session.permissionLevel` is absent.
   - `ptah-api-builder.service.ts:1305-1312` returns `undefined` for `ambiguous` and `unresolved` results across all recorder consumers (`git:942`, `cron:1028`, `sessionOrganization:1036`, `harness:1079`).
   - `ptah-api-builder.service.ts:798-802,811-813` retains the raw caller ID fallback for lane threading without falling through to `resolveNativeCallerId` when `liveChatSessions` is active. Covered by `ptah-api-builder.service.spec.ts:453-458`.
3. **Provisional Claude IDs excluded from recorder attribution**
   - `ptah-api-builder.service.ts:1306-1310` checks `if (!result.session.sessionIdIsProvisional)` before returning `result.session.sessionId`, returning `undefined` while provisional. Covered by `ptah-api-builder.service.spec.ts:461-485`.
4. **Resumed lanes capped by the parent ceiling**
   - `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:62-92,114-121` enforces `resolveParentCeiling` on `resumePolicy` using `CLI_LANE_BUILT_IN_PERMISSION_ORDER` (`['yolo', 'auto-edit', 'ask', 'plan']`), fed by `register-agent-messaging.ts:213-249` -> `parentLanePermission`. Covered by `cli-lane-policy-resolver.spec.ts:179-208`.

### Check 3 — Explicit `ask` Ceiling Decision & Caller Impact

**FAIL (1 Blocking test breakage outside the 4 conflicted files).**

1. **Consistent with branch prior behavior**: Yes. `git show HEAD:libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts:29-30` already returned `'plan' | 'ask' | 'auto-edit' | 'yolo'` directly and fell back to `options.unknownParent === 'uncapped' ? undefined : 'plan'`. Applying the same return rule to `options.providerSessions` (`parent-lane-permission.ts:42-48`) is consistent with `HEAD` and avoids leaving provider-session `ask` callers uncapped when Claude/Codex/live-resolver `ask` callers are capped.
2. **Fails safe (never grants more than the parent)**: Yes. In `libs/shared/src/lib/types/cli-lane-defaults.types.ts:45` and `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:68-89`, `'ask'` ranks below `'yolo'` and `'auto-edit'` and above `'plan'`, so `resolveParentCeiling` caps stronger requests/defaults/resume snapshots down to `'ask'` (or `'plan'` for adapters like Codex that do not support `'ask'`, `cli-lane-policy-resolver.spec.ts:82-89,186-190`) while preserving equal or weaker modes. Unrecognized permission strings at spawn fail closed to `'plan'` (`parent-lane-permission.ts:48`).
3. **Callers and tests outside the 4 conflicted files**:
   - Production callers (`libs/backend/cli-agent-runtime/src/lib/di/register-agent-messaging.ts:245`, `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.ts:26`, `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:823`) are type- and behavior-compatible with `'ask'`. No other `new PtahAPIBuilder(` callers exist outside `ptah-api-builder.service.spec.ts:800`.
   - **Broken test**: `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts:42` (auto-merged cleanly from `0749c6db6`, not touched or run by the merge lane) still expects `['ask', undefined]`. Running Jest confirms it fails (`Expected: undefined`, `Received: "ask"`, log at `.ptah/tmp/review-vscode-plp-jest.log`). See Defect 1.

### Check 4 — Conflict Markers & Affected Packages

**PASS.**

- `git diff --check` exited `0` with no output.
- `git grep -n -E '^(<{7}|={7}|>{7})' -- '*.ts' '*.tsx' '*.js' '*.json' '*.md'` found zero conflict markers (exit `1`).
- `git diff --name-only HEAD -- apps/ptah-electron/ libs/backend/platform-cli/ libs/backend/cli-engine/` shows zero files modified under `libs/backend/platform-cli/` or `libs/backend/cli-engine/`, and only auto-merged `apps/ptah-electron/src/di/provider-session-composition.ts` (saved-permission-level wiring and formatting from `main`) under `apps/ptah-electron/`. Neither `platform-cli` nor `cli-engine` calls `parentLanePermission`.

## Defects

1. **[Blocking]** `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts:42` (assertion at `:57`) — **Auto-merged unit test fails under the explicit `ask` ceiling decision.**
   - `0749c6db6` added `['ask', undefined]` to the Antigravity test table in `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts:38-43`. Because the branch did not modify this file, git auto-merged it without conflict, and the merge lane updated only `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts:86` and ran only `ptah-api-builder.service.spec.ts` in `vscode-lm-tools`.
   - `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.ts:26` delegates directly to `@ptah-extension/cli-agent-runtime`'s `parentLanePermission`, which now returns `'ask'`.
   - Verified with `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts`: **FAIL** (1 failed, 7 passed — `Expected: undefined`, `Received: "ask"` at line 57; log in `.ptah/tmp/review-vscode-plp-jest.log`).
   - **Required fix**: Update line 42 from `['ask', undefined]` to `['ask', 'ask']` and re-run this spec before committing the merge.

## Verdict

**REVISE.** The 4 conflicted files themselves are resolved cleanly with all main and branch behaviors preserved and no conflict markers remaining, but the explicit `ask` ceiling breaks the auto-merged sibling test at `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts:42` (verified failing in Jest). Update that expectation to `['ask', 'ask']` and re-verify before committing the merge.
