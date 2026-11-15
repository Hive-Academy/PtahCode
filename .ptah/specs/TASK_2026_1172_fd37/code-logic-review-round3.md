Verdict: CHANGES REQUESTED
Score: 4/10

## Findings

1. **Blocker — an unset lane can exceed the user's global permission.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:78-97` resolves a missing spawn choice and missing saved row through `resolveCliLaneDefaultPair`; `libs/shared/src/lib/types/cli-lane-defaults.types.ts:28,37-46` selects built-in `yolo` first. The parent cap only applies for `plan` (`cli-lane-policy-resolver.ts:81-96`), so a global `ask` session with no lane choice reaches `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:979-997` as yolo. `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts:265-285` then omits `canUseTool` and enables `bypassPermissions` with `allowDangerouslySkipPermissions`. The new parity test explicitly locks in this case with a global `ask` handler (`ptah-cli-registry-permission-routing.spec.ts:106-109,199-215`). Thus the branch preserves an existing privilege escalation, but still violates the stated rule that a lane never exceed what the user allowed and that a genuinely unset lane level use the global level. Resolve the no-row/no-spawn level from the global permission, or apply an equivalent cap before SDK options are built; test global `ask` and `plan` with no saved row. This is the distinction between a built-in default and a user-approved yolo choice.

## D22 claim

**Parity verdict: supported, but insufficient for the user-authorization requirement.** On `main`, `libs/shared/src/lib/types/cli-lane-defaults.types.ts:28,37-46` chooses yolo first and `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:119-125` translates it to bypass mode with the skip flag. The main SDK helper reads the global level at `claude-sdk-lane-options.ts:260`, creates a callback for global `ask` at `:301-309`, but the main registry overrides the SDK mode and skip flag from the lane policy at `ptah-cli-registry.ts:983-994`; the main Claude adapter also removes the callback for yolo at `claude-cli.adapter.ts:231-236`. On the branch, the registry passes the resolved lane level at `ptah-cli-registry.ts:979-997`, and the helper directly returns bypass mode, skip flag, and no callback at `claude-sdk-lane-options.ts:265-285`. The current test asserts that exact behavior at `ptah-cli-registry-permission-routing.spec.ts:199-215`. Thus D22 is right that these commits did not newly make the no-row Ptah CLI lane more permissive. The truly unresolved policy path still uses `lanePermissionLevel ?? permissionHandler.getPermissionLevel()` at branch `claude-sdk-lane-options.ts:265`; that fallback is unreachable when the manifest supplies the built-in pair.

## Other reviewed paths

- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:38-54` binds selection on each option. `:107-123` restores the current select value before emitting, so cancel and failed save leave the displayed old value; `:125-152` keeps yolo behind confirmation; `:99-104` recomputes available network options from the effective permission. The new same-pass render spec at `cli-lane-default-cell.component.spec.ts:44-57` targets the reported reload defect. It establishes the expected DOM value, though this review did not independently run it against the pre-fix component.
- The uncommitted Electron evidence edit at `apps/ptah-electron-e2e/src/specs/permission/lane-permission-evidence.spec.ts:94-103` captures the page and Codex row before asserting the reloaded value. The matrix readiness wait at `:95` precedes both captures. It is an opt-in evidence change; no Electron run was performed.
- `ad7b43871` requests `ask` in the lane-ID test, so the callback under test exists. `b232c7cc9` accurately pins current no-row parity, but makes the authorization defect an expected result.

## Logic questions

1. **Silent failure:** the no-row spawn looks like a valid built-in policy while silently bypassing the global `ask` approval path (resolver `:82-97`; helper `:278-285`).
2. **User action:** spawn a Ptah CLI lane without a permission argument and without a saved row while the global session is `ask` (routing spec `:199-215`).
3. **Wrong input:** an absent lane row becomes built-in `yolo` rather than remaining unset (`cli-lane-defaults.types.ts:37-46`).
4. **Dependency failure:** a settings load that returns no row has the same effect; the component resets its visible choice before a save, so a failed save keeps the old value (`cli-lane-default-cell.component.ts:107-123`). No separate failure-path defect was established in the three commits.
5. **Missing requirement:** distinguish a manifest's runnable default from permission the user has granted; D22 checks historical parity, not that authorization invariant.

## Review limits and score rationale

Read the three `git show` diffs, the uncommitted `git diff`, whole changed frontend and test files, relevant resolver/runtime paths, and `git show main:<path>` for all D22 paths. No Jest or Electron check was run because the issue is established by the current test and source. Ptah workspace/diagnostics calls did not return during this review; native reads supplied the cited evidence. The 4/10 score reflects a security-level authorization gap, even though the three commits do not introduce it; the reviewed frontend fix and evidence edit appear sound, keeping this above a foundational 1-2 verdict.
