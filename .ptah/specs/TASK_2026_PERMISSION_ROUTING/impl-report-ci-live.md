# CI and live permission investigation

## CI cause and change

`PendingPermissionIndex.answer` now requires `SdkPermissionHandler.handleResponse` to return `true` before it records an answer (`libs/backend/worker-runtime/src/lib/pending-permissions.ts:82`). The worker-host test fakes previously returned `undefined`, so permission answers failed with `ALREADY_ANSWERED`. The coordinator has already changed both fakes to `jest.fn().mockReturnValue(true)` at `remote-sessions.spec.ts:56` and `serve-sessions.spec.ts:108`. Worker-host production code passes the real handler to the index; it does not assume the old void result. No further production edit was needed for this contract.

Files changed for this finding: `libs/backend/worker-host/src/lib/commands/remote-sessions.spec.ts` and `serve-sessions.spec.ts` (coordinator's existing uncommitted fixture edits). This lane changed only this report.

The focused Windows `serve-sessions.spec.ts` run has 17 failures and 2 passes. The failed permission cases, including the round-trip and tab-only binding cases, also stop during worker startup with `InsecureTokenFileError` at `worker-runtime/src/lib/token-store.ts:43`, where Windows file modes fail the POSIX 0600 assertion. Thus the Windows run cannot exercise those corrected fakes. The identical 17 failures on main establish that this startup failure is independent of the permission response change.

## Live finding

At level `ask`, the query builder supplies SDK `permissionMode: 'default'` and `canUseTool` (`sdk-query-options-builder.ts:843-848,1570-1572`). On both main and this branch, `Bash` is in `DANGEROUS_TOOLS`, not `SAFE_TOOLS` (`permission-tool-classifier.ts:13-36`). If the SDK invokes Ptah's callback, `SdkPermissionHandler` falls through the safe, unattended, YOLO, auto-edit, background-agent, and stored-rule branches, then calls `requestUserPermission` for Bash (`sdk-permission-handler.ts:583-735`). The unattended Bash allowlist is used only when an unattended policy exists. The branch's owner routing, route classification, and `canAlwaysAllow` logic run in or after `requestUserPermission` and cannot auto-allow the `echo` call before a card. The same classification and callback order are present on main.

The SDK may approve a simple Bash command before calling `canUseTool`: the repository explicitly documents and tests this mechanism for SDK-auto-allowed `SendMessage` in `sdk-query-options-builder.ts:1313-1316` and its spec. The live `echo` result is consistent with SDK-side approval. Source inspection alone does not prove the SDK's exact `echo` policy or rule out a pre-existing Claude permission rule. For the next live test, use `printf ptah-live-2 > ptah-live-2.txt` in a fresh session at `ask`; output redirection makes this a write command and should reach the permission callback. Clear existing Bash allow rules first if testing the default behavior.

## Decisions

- Keep worker-host production handling through `PendingPermissionIndex`; the index already checks the boolean returned by the real SDK handler. A second check in worker-host would duplicate this boundary. Reversible: yes.
- Do not modify the SDK's auto-approval behavior based on the `echo` observation alone; code and the equivalent main path do not establish a branch regression. Reversible: yes.

## Verification

| Command | Result |
| --- | --- |
| `npm run verify -- -t test -p @ptah-extension/worker-host -- --testPathPatterns=serve-sessions.spec.ts` (branch) | 2 passed, 17 failed; permission cases also blocked by Windows token-file mode check. |
| Same command in `D:\projects\ptah-extension` (main checkout) | 2 passed, 17 failed; same `InsecureTokenFileError` at token-store line 43. |
| `npm run verify -- -t test -p @ptah-extension/worker-host -- --testPathPatterns=remote-sessions.spec.ts` (branch) | Passed. The delayed `session:id-resolved` case no longer reports `ALREADY_ANSWERED`. |
| `npm run verify -- -t test -p @ptah-extension/cli-engine` (branch) | Passed. This covers the remaining project with a direct `handleResponse` reference in the six-project search. |
| `npm run verify -- -t test -p @ptah-extension/worker-host -- --testPathPatterns=serve.spec.ts` (branch) | Passed. The two failures reported in the earlier full Windows run did not reproduce in isolation. |
| Same `serve.spec.ts` command in `D:\projects\ptah-extension` (main checkout) | Passed. |
| `npm run verify -- -t lint,typecheck -p @ptah-extension/worker-host` (branch) | Passed; 2/2 tasks succeeded from cache. |

Search of `worker-host`, `remote-machines`, `cli-engine`, `platform-cli`, `messaging-gateway`, and `gateway-chat-bridge` for `handleResponse`, `resolveRequest`, `removePendingResolver`, `markDelivered`, and `handlePermissionResponse` found only the two worker-host fakes and one CLI-engine production call to `handler.handleResponse`. The CLI-engine call is fire-and-forget and ignores the consumed result by design; it has no matching fake of the new return contract in these projects. No references to the permission-prompt or Copilot/Codex bridge return changes appeared in the six projects.

## Windows-only versus branch-caused

| Finding | Classification | Evidence |
| --- | --- | --- |
| Worker-host permission answers returned `ALREADY_ANSWERED` in CI | Branch-caused test fixture | New consumed-boolean contract; two fakes changed to `true`. |
| `serve-sessions.spec.ts` token-store startup failures on Windows | Windows-only, pre-existing on main | Same 17 failures and 2 passes in main checkout; `InsecureTokenFileError` from POSIX mode check. |
| Two `serve.spec.ts` failures seen in an earlier full Windows run | Intermittent, not reproduced | Focused spec passes on branch and main. No branch cause established. |
| `echo ptah-live-1` had no card | No branch regression found | Bash callback would prompt on both code paths; likely SDK auto-approval or existing rule. |

## Unmet verification

The original full worker-host run was reported to have 19 failures; this lane reran the two relevant specs separately. The 17 `serve-sessions.spec.ts` failures reproduce on main, and the two `serve.spec.ts` failures do not reproduce on either checkout. A further full worker-host run would duplicate this isolation without resolving a remaining cause.
