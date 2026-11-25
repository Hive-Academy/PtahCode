# D46 E2E code logic re-review — TASK_2026_2325_899d

## Verdict: REVISE  Score: 7/10

Both original findings are fixed. One new blocking issue remains under the requirement to preserve every other Electron mock RPC's behavior. Failure detection now interprets a field in any mock's response data.

## Finding status

| Original finding | Status | Evidence |
| --- | --- | --- |
| 1. Electron's fake listener returned generic data for Setup RPCs. | Fixed | `apps/ptah-electron-e2e/src/support/ui-driver.ts:131–135,165–229,265–296` initializes listener-local Setup state and provides typed reads and writes. Explicit functions and statics dispatch before either Setup default. Valid writes return the committed pair or clear receipt and advance the sequence once. |
| 2. Webview Settings accepted malformed or partial Setup writes. | Fixed | `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts:639–670,882–895` checks the fields and trims both values, rejects malformed or partial input before mutating the pair or sequence, and clears only when both trimmed strings are empty. The attempted call remains observable. |

## Dispatch and renderer checks

- **Dispatch priority and recording.** `apps/ptah-electron-e2e/src/support/ui-driver.ts:132–135,232–260,262–296,359–385` preserves the observed message and call resets, raw message recording, extracted method/params recording, resolver cache, and replacement of one override type by the other in `mockRpc`. Every dispatch branch assigns `data`. The final fallback copies the same namespace defaults. The post-dispatch interpretation of `data` is the exception described below.
- **Failed envelope.** The Electron listener sends `type: 'rpc:response'`, the original `correlationId`, `success: false`, and a string `error` (`apps/ptah-electron-e2e/src/support/ui-driver.ts:299–312`). Preload forwards that payload as a message (`apps/ptah-electron/src/preload.ts:69–71`). The renderer resolves the matching pending call and clears its timer with an unsuccessful `RpcResult`. An absent `data` or `errorCode` is accepted (`libs/frontend/core/src/lib/services/claude-rpc.service.ts:188–203,260–264`). Webview reuses its existing equivalent envelope (`libs/frontend/webview-e2e-harness/src/lib/scenarios/marketplace/marketplace.fixtures.ts:217–231`). Both exercise the generic Setup failure path. The renderer's specific invalid-model message requires `errorCode: 'SETUP_MODEL_INVALID'` (`libs/frontend/core/src/lib/services/providers-commit.service.ts:194–199`).

## New findings

1. **Blocking — Failure detection changes the behavior of unrelated Electron mock RPCs.** `apps/ptah-electron-e2e/src/support/ui-driver.ts:93,283–319` checks for a string `__uiRpcError` on every reply after dispatch, including explicit statics and resolver results for unrelated methods. For example, an existing-style `mockRpc` resolver that returns a record containing `{ __uiRpcError: 'stored diagnostic' }` previously received a success envelope containing that record. The new listener discards the data and returns a failed envelope. The same applies to an explicit Setup override. A repository search found no checked-in use of the marker outside the new listener, so this is a demonstrated change to the mock contract, with no specific checked-in spec known to hit it. **Fix:** Let the built-in Setup setter return an internal discriminated success or failure outcome. Handle that outcome only in its dispatch branch so explicit mocks and namespace defaults continue to return their payloads verbatim.

## Five logic questions

1. **Silent failure:** The shared data-field check can turn ordinary mock payload data into a transport failure. The observed call list still records the call, so a spec checking only that list could miss the change.
2. **Unexpected action:** Installing an explicit mock that supplies the marker field changes the renderer's result despite the mock still winning the dispatch branch.
3. **Wrong input result:** Missing or partial Setup input now returns a failure without modifying the prior receipt. Valid empty strings clear it after trimming.
4. **Dependency failure:** Both responders settle a rejected write through the matching correlation ID. The renderer clears its timeout and shows generic Setup save failure.
5. **Missing case:** The scoped verification does not exercise preservation of unrelated mock payloads containing arbitrary fields. Handling the failed outcome inside the built-in setter branch removes that dependency on payload shape.

## Verification

Reviewed the whitespace-insensitive Electron diff and the webview fixture diff. `git diff --check` passed for both files. Scoped `tsc --noEmit` passed for `apps/ptah-electron-e2e/tsconfig.spec.json` and `libs/frontend/webview-e2e-harness/tsconfig.lib.json`. No E2E, Playwright, builds, Nx or workspace verification ran. Skill loading was unavailable through the lane's tools.
