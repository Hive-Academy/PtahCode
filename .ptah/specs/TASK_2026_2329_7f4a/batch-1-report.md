# Batch 1 Implementation Report — TASK_2026_2329_7f4a

## Verdict
PASS — All Batch 1 requirements implemented within the 4 scoped files in the task worktree and verified cleanly with `npm run verify`.

## Changed Files
1. `libs/backend/provider-session-contracts/src/lib/provider-session.types.ts` (+1/-0)
2. `libs/backend/acp-runtime/src/lib/acp-provider-session-runtime.ts` (+1/-0)
3. `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts` (+16/-1)
4. `libs/backend/acp-runtime/src/lib/acp-provider-session-runtime.spec.ts` (+205/-0)

## Behavior per Requirement

1. **`ProviderSession.getPermission?()` contract (`provider-session.types.ts`)**
   - Added optional `getPermission?(): ProviderSessionPolicy['permission'] | undefined;` directly after `setPermission(...)` on `interface ProviderSession`.

2. **Live permission accessor on ACP `ProviderSession` (`acp-provider-session-runtime.ts`)**
   - Exposed `getPermission: () => permission,` on the returned `ProviderSession` object, reflecting both the initial `request.policy.permission` and live updates made through `setPermission(...)`.

3. **Interactive `yolo` auto-approval & respawn mode preservation (`acp-session-runtime.ts`)**
   - In `answerPermission(target, request)`, when `config.approvals` is set and `livePermission === 'yolo'`:
     - Safely reads `toolCall = isRecord(request) ? request.toolCall : undefined` and `kind = isRecord(toolCall) ? toolCall['kind'] : undefined`.
     - When `kind !== 'switch_mode'`, evaluates `decideAcpPermission(request, { autoApprove: true, mode: livePermission })`.
     - If `!decision.refused`, returns `decision.response` immediately without emitting `approvalRequested` or calling `config.approvals`.
     - If `decision.refused` (e.g., no `allow_once` option offered), falls through to `config.approvals` so interactive chat asks the user rather than silently refusing.
     - Keeps `kind === 'switch_mode'` routed through `config.approvals` even under `yolo`.
   - In `setUpSession`, updated mode selection from `profile.modeFor?.(options)` to `profile.modeFor?.({ ...options, permission: livePermission })` so live permission changes survive respawn.
   - Left `antigravitySkipsPermissions` untouched so chat never spawns with `--dangerously-skip-permissions`.

4. **Regression tests (`acp-provider-session-runtime.spec.ts`)**
   - Added `createAcpProviderSessionRuntime: yolo auto-approval and getPermission` suite covering:
     - `session.getPermission?.()` returning initial permission and updating after `setPermission(...)`.
     - Opening chat with `policy.permission: 'yolo'` auto-approving `kind: 'other'` MCP tool (`Run mcp_ptah_lane_ptah_agent_list`) and `kind: 'execute'` bash tool via `allow_once` without calling `approvals.request` or emitting `approvalRequested`.
     - Live toggling from `ask` -> `yolo` -> `ask` via `setPermission(...)`, verifying immediate auto-approval in `yolo` and restored `approvals.request` + `approvalRequested` back in `ask`.
     - Routing `kind: 'switch_mode'` to `approvals.request` even in `yolo`.
     - Falling back to `approvals.request` in `yolo` when no `allow_once` option is offered.

## Verification
- **Command** (run in `/home/amun/ptah-extension/.claude-worktrees/fix-full-auto-yolo-providers-13f62db78c01`):
  ```bash
  npm run verify -- -p @ptah-extension/provider-session-contracts,@ptah-extension/acp-runtime
  ```
- **Exit Code**: `0`
- **Summary**:
  - `nx run @ptah-extension/provider-session-contracts:typecheck` — passed (cache match)
  - `nx run @ptah-extension/provider-session-contracts:lint` — passed (cache match)
  - `nx run @ptah-extension/acp-runtime:typecheck` — passed (10.6s)
  - `nx run @ptah-extension/acp-runtime:lint` — passed (6.4s)
  - `nx run @ptah-extension/provider-session-contracts:test` — passed (local cache)
  - `nx run @ptah-extension/acp-runtime:test` — passed (39.3s, all 17 active suites / 327 passing tests + 2 skipped)
  - Total verify lock duration: 65.8s.

## Decisions & Risks
- **Fallback behavior when `allow_once` is absent**: In `acp-approval-adapter.ts`, `acpResponseForDecision` intentionally never widens `accept` to `allow_always` (PR #1445 review), so when a request has only `allow_always`/`reject_once` and falls through to `config.approvals`, the sink is prompted (`approvalRequested` + `approvalSettled` emitted) and an `'accept'` answer maps to `{ outcome: { outcome: 'cancelled' } }` rather than `decideAcpPermission`'s silent `reject_once`. The regression test asserts this exact behavior.
- **No risk to non-`yolo` modes or spawn flags**: `ask`, `plan`, and `auto-edit` interactive approval paths remain unchanged, and `antigravitySkipsPermissions` was not modified.

## Continuation verification

The review follow-up routes requests with missing tool kind through the approval sink and cancels requests after a session abort, generation retirement, or turn interrupt. The final ACP runtime test target passed with 17 active suites and 329 passing tests. Provider-session contracts tests passed, and both projects passed lint and typecheck.

Commits `a3bc27e9c` and `3ee709f7d`.
