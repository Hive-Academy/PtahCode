# Batch (b) report

## Files changed

- `libs/backend/auth-providers/src/lib/quota/provider-owner.resolver.ts`: Added a pure owner comparison and a fresh active-store read. Both use the same normalized account key as owner resolution.
- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts`: Permits CLI usage for an account owner only when the current store account matches; returns `account-unverified` on mismatch.
- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts`: Limits the CLI to eight seconds, validates TSV fields with Zod, and backs off for 30 minutes after unrecognized output using an injected clock. It logs only a reason code. `execFile` already used an abort signal and `shell: false`.
- `libs/shared/src/lib/types/plan-limit.types.ts`: Added `account-unverified` to the status reason union.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts`: Maps typed unavailable reasons to generic short causes.
- Adjacent Antigravity and formatter specs plus `antigravity-usage.fixture.ts`: Cover matching and mismatching accounts, four model windows, the absent-server time budget, parse back-off, and reason display.

## Decisions

- A CLI account is verified against the active account in the same CLI store at read time. The fresh read bypasses the resolver cache. A language-server observation alone does not authorize CLI rows.
- Discovery returns immediately when no language server is present. Its three-second cap plus the CLI's eight-second cap fits the 12-second lookup deadline.
- The back-off is keyed to the executable runner. The production runner shares one back-off while injected test runners remain isolated.
- Skill discovery exposed a remote catalog but no installed matching skill or read mechanism; implementation followed repository patterns.

## Verification

- `npm run verify -- -p auth-providers,vscode-lm-tools,shared`: `NX 6 tasks: 6 succeeded` for lint and typecheck; `NX 3 tasks: 2 succeeded, 1 failed` for tests. The auth-providers test log showed two known Codex path failures, an unrelated OpenCode Go timeout, and compile errors in the new reader spec. The spec errors were fixed.
- `npm run verify -- -t test -p auth-providers -- --testPathPatterns=antigravity`: first focused run returned `NX 1 task: 0 succeeded, 1 failed`; the Jest mock hid the parser export. The test was corrected to load the real parser. The repeated command returned `NX 1 task: 1 succeeded` and exit code 0.

## Not done

- The broad auth-providers test task remains failing due to the known Codex failures and an unrelated OpenCode Go timeout. The broad command was not rerun after the focused fix.
