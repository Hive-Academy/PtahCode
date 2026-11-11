# Batch (b) fixes

## Findings

| Finding | Disposition |
| --- | --- |
| 1 | Not applied: group to model mapping belongs to a later batch. |
| 2 | Applied: `cli-backoff` distinguishes a paused read, with generic formatter text. |
| 3 | Applied: OAuth, local probe, and CLI share an 11-second deadline. |
| 4 | Applied: every stage uses the smaller of its own cap and remaining time. A stage with under one second left is skipped with `usage-budget-exhausted`. |
| 5 | Existing shared candidate timer retained; added a two-candidate timeout test. |
| 6 | Applied: the active store owner is checked again after successful CLI output. |
| 7 | Applied: named uncached store read shares parsing with the cached read; Prettier ran on every changed file. |
| 8 | Applied: Zod validates row shape, label kind, percentage, and UTC reset; resets more than 24 hours old fail. |
| 9 | Not applied: source key reconciliation belongs to a later batch. |
| 10 | Applied: timeout and non-zero exit start a five-minute back-off; caller abort and missing executable do not. |
| 11 | Applied: the `unknownCause` comment is directly above the function. |
| 12 | Existing reason-only logging retained. |
| 13 | Applied: tests cover abort, back-off, shared timer, store change, both owner budgets, malformed rows, and all mapped formatter reasons. Existing parser tests cover CRLF, extra column, and invalid percentages. New owner tests use typed fixtures. A real lane model-scope test follows finding 1 in a later batch. |

## Files changed

- `libs/backend/auth-providers/src/lib/quota/provider-owner.resolver.ts`
- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts` and adjacent spec
- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts` and adjacent spec
- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-usage.fixture.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts` and adjacent spec
- `libs/shared/src/lib/types/plan-limit.types.ts`

## Verification

- `npx prettier --write` ran on every changed file.
- `npm run verify -- -p auth-providers,vscode-lm-tools,shared`: `NX 6 tasks: 6 succeeded` for lint and typecheck. Test phase: `NX 3 tasks: 2 succeeded, 1 failed`; `nx run @ptah-extension/auth-providers:test` failed. The auth-providers Jest log reported `Test Suites: 1 failed, 1 skipped, 90 passed, 91 of 92 total` and `Tests: 2 failed, 10 skipped, 2706 passed, 2718 total`. The only failed suite was `codex-account-usage.service.spec.ts`, with the two known Windows drive-letter cases: `CodexAccountUsageService > keeps live updates for two homes and owners separate` and `CodexAccountUsageService > delivers fresh evidence from the first read on a cold cache`. No other spec failed; no scoped rerun was needed.

