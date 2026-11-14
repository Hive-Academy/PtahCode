# Code Logic Review (final, whole diff) — fix/lane-permission-routing-v2

Review family: antigravity (implementers: codex, claude)

Score: 7.5/10
Verdict: APPROVED (no blockers; 3 minor findings, 1 of them behavioural)

Method: read-only. I read the diff `main...HEAD -- libs` (28 code and spec files under `libs`) and the full touched sources. I ran no tests, nx or tsc. Verdict rests on code reading only, and I did not execute any spec.

## Five logic questions

1. **Resolver -> lane level -> canUseTool never exceeds the resolver.**
   - `cli-lane-policy-resolver.ts` `resolveCliLanePolicy`: a parent `plan` forces `permission: 'plan'` (also on the resume snapshot path). Otherwise the order is spawn, then saved row, then manifest default.
   - `ptah-cli-registry.ts:975` passes `lanePolicy.requested.permission` as `lanePermissionLevel`.
   - `claude-cli.adapter.ts:228` passes it only when `lanePolicy.cli==='claude' && permissionMode`. Both Ask and Auto-edit callbacks use `() => laneLevel`.
   - `claude-sdk-lane-options.ts` uses `lanePermissionLevel ?? permissionHandler.getPermissionLevel()`, so an unresolved level falls back to the global level.
   - `sdk-permission-handler.ts` (~L616) reads the lane resolver (`levelResolver`) and not `_permissionLevel` when one is supplied.
   - A parent-Plan cap wins over a spawn `auto-edit`, because the resolver overrides `selectedPermission` before anything else. No lane exceeds the resolver result.
2. **parentLanePermission.** `parent-lane-permission.ts`:
   - Blank or absent caller returns `undefined` (no cap).
   - The tab id resolves through `lifecycle.find`, which looks up by tab id or session id.
   - The Codex tab resolves through `resolveLiveSessionId`. An ambiguous or closed id returns `undefined`, which falls through to `plan`.
   - An unknown bound id returns `plan`. A level of `ask` or an unrecognised level returns `undefined`.
   - `register-agent-messaging.ts` (resume) and the vscode-lm-tools wrapper use the same function. The `vscode-lm-tools` wrapper delegates to `@ptah-extension/cli-agent-runtime`, so behaviour is identical on spawn and resume.
3. **Plan-lane allowlist.** `plan-lane-tool-policy.ts` is an explicit set, not a prefix match. I found no write, act or spawn tool on it. `ptah_agent_message_ack`, `ptah_task_close_out_status`, `ptah_task_check`, `ptah_json_validate` and `ptah_git_worktree_list` are intentionally absent. The drift spec asserts each name (except the reporting tool) has `toolClass === 'read'`.
4. **Formatter.** `formatLanePolicyLines` prints `requested X -> effective Y (source)`. Codex yolo prints `danger-full-access, approvals never` (D7). Plan prints `read-only`. Auto-edit prints `workspace-write`. The parent-plan cap note only shows when the lane did not itself request plan.
5. **Callers of changed exports.**
   - `parentLanePermission` is exported from cli-agent-runtime and consumed by the vscode-lm-tools wrapper (same signature plus an optional param).
   - `lanePermissionLevel` is an optional new input; the existing `buildClaudeSdkLaneOptions` callers keep their default behaviour.
   - `renderLaneCompletionContract.effectivePermission` is optional.
   - `SpawnAgentResult.effectivePolicy` and `requestedPolicy` are optional additions, so no break.

## Findings

1. **minor — Plan lane can still hang on `AskUserQuestion`.**
   `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts` (`decidePlanLaneToolCall`, the early `return undefined` for `AskUserQuestion`).
   - Evidence: `decidePlanLaneToolCall` passes `AskUserQuestion` through to the normal path. For a lane with `cliAgentResolver` nobody watches that prompt; the very problem this phase fixes for write tools.
   - Impact: a Plan lane that asks a question waits for the 10-minute `CLI_AGENT_PERMISSION_TIMEOUT_MS`.
   - Fix: for cliAgentResolver lanes in Plan, deny `AskUserQuestion` with a "BLOCKED: plan mode" style message, or document the prompt as intended.
2. **minor — "BLOCKED: plan mode" instruction is not given when Plan comes from a saved lane default, on the Ptah-CLI path.**
   `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts` ~L448.
   - Evidence: `effectivePermission` is `parentLevel === 'plan' || request.permission === 'plan'`, so it ignores a saved row of `plan`. The manager SDK path (`agent-process-manager.service.ts` ~L1085) uses the resolved `effectivePolicy.requested.permission`.
   - Impact: such a lane only learns about Plan from the deny message, which still contains "BLOCKED: plan mode". It is guidance drift, not a safety gap.
   - Fix: take the resolved policy after `registry.spawnAgent`, or resolve before building the task; at minimum add a test for the saved-plan case.
3. **minor — Plan instruction can be applied twice or inconsistently across paths.**
   `agent-process-manager.service.ts` ~L1085 (appends `LANE_PLAN_MODE_INSTRUCTION`) versus `lane-reporting-contract.ts` (also appends for `effectivePermission==='plan'`).
   - Evidence: both use the same constant, but they sit in different layers. If the manager SDK path ever receives a task that has already passed through `renderLaneCompletionContract` with plan, the text appears twice.
   - Impact: cosmetic.
   - Fix: add a single owner, or a guard that skips the append if the string is already present.

## Silent failures, casts, tests

- I found no new `any`. The only `any[]` in the formatter diff (`const blocks: any[]`) was already in the file.
- The `register-agent-messaging.ts` generic `resolve<...>` calls pass an ad-hoc structural type; that is the same casting style as before.
- Fail-closed behaviour (`plan` for an unknown bound caller) is deliberate. Any error in that chain denies rather than swallows.
- Tests added for each new branch: `parent-lane-permission.spec.ts`, `claude-sdk-lane-options.spec.ts`, `sdk-permission-handler.spec.ts` and its unattended variant, formatter spec, drift spec, and the namespace builder spec. I did not see a test for finding 2 (saved-plan, no instruction).

## Score justification

7.5: the permission chain, the cap and the allowlist hold on every trace I made, and the fail-closed paths are tested. It sits below 9 because of the unwatched `AskUserQuestion` path (1) and the incomplete instruction rule for saved Plan defaults (2), and because I did not execute any test.
