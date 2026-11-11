# cli-agent-runtime main-green followups

## McpInstallService (six failures in the narrowed run)

- **Verdict: test fixture.** `mcp-install.service.spec.ts:84-87` created a temporary directory and constructed `McpIntentStore` before the directory had a workspace marker. `mcp-intent-store.ts:238-240,421-425` keys records using `resolveHarnessWorkspaceRoot`; `workspace-root.ts:59-83` chooses a marked ancestor. On this Windows machine, `C:\Users\dev\AppData\Local\Temp` already has `.ptah`, so the first record was keyed to `Temp`. The store then created `tmp/.ptah`, and later reads resolved to `tmp`. This produced the force-uninstall and five scoped-intent failures, while the service's intended behavior was correct. The test fixture originated in `e4dc3c03c1`; scoped tests were added in `e08435c34` and `557eff874`. The resolver came from `e107e6f893`.
- **Fix:** create `tmp/.ptah` in `beforeEach`, before the first intent store operation. This fixes canonical root identity on Windows and Linux without changing assertions.
- **Changed:** `libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.spec.ts`.

## Claude Agent SDK pin (one failure)

- **Verdict: installed dependency state.** `ptah-cli-registry-auto-compact-argv.spec.ts:83,451-452` requires SDK `0.3.318`; `package.json:79` and `package-lock.json:22,1175-1177` already pin and resolve `0.3.318`. The shared `node_modules/@anthropic-ai/claude-agent-sdk/package.json` is still `0.3.278`. Dependency pin in `c477857813`; test constant updated in `73021b68b6`. The assertion is correct.
- **Fix needed outside scope:** refresh the shared dependency junction's backing installation from the existing lockfile after the owning lane authorizes dependency maintenance. No package manifest or lockfile edit is needed; do not change the test pin to `0.3.278`.
- **Changed:** none for this failure.

## Verification

- Narrowed command initially passed `--testPathPatterns` through to lint/typecheck (verify runner forwards it to all targets); those two failures are invocation errors, not project errors. Narrowed Jest result before the fix: 1 suite failed, 6 tests failed, 54 passed (60 total).
- Full required `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -p cli-agent-runtime`: lint **pass** (1/1), typecheck **pass** (1/1); Jest **fail** (161 suites passed, 1 suite failed; 3,365 tests passed, 1 failed, 1 skipped; 3,367 total). The sole failure is the installed SDK pin mismatch (`0.3.278` received, `0.3.318` expected). The MCP service spec passes in the full run.

## Decisions

- Corrected the test workspace fixture because the six failures share a changing canonical root; left production root resolution intact.
- Kept the SDK version assertion and current manifest/lockfile pins. Did not run npm install or edit outside this lane's scope.
- No matching CLI skill invocation mechanism was available in this session; checked the tool list and local skill directories.

## Not done

- Refreshing the shared SDK installation is prohibited by the lane's no-install instruction and out of scope.

