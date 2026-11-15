# Batch c2 fix report

| Change | Files | Tests |
| --- | --- | --- |
| Parse Grok prepaid balance separately from billing; preserve the period window when balance is absent or malformed | grok-account-plan-usage.reader.ts, grok-account-plan-usage.reader.spec.ts | Four 100% period fixtures pass |
| Restore the original OpenCode Go HTTP 403 branch | opencode-go-plan-usage.reader.spec.ts | EntitlementError and other 403 fixtures pass |
| Keep Grok HTTP 402 owner evidence | lane-limit-classifier.ts, lane-limit-classifier.spec.ts | 402 and ordinary output fixtures pass |
| Correct the batch c2 decisions | batch-c2-report.md | Reviewed against code |

## Changed files and owning Nx projects

- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts` - `@ptah-extension/auth-providers`
- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts` - `@ptah-extension/auth-providers`
- `libs/backend/auth-providers/src/lib/quota/readers/opencode-go-plan-usage.reader.spec.ts` - `@ptah-extension/auth-providers`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts` - `@ptah-extension/cli-agent-runtime`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts` - `@ptah-extension/cli-agent-runtime`
- `.ptah/specs/TASK_2026_1180_d4cd/batch-c2-report.md` - task artifact, no Nx project
- `.ptah/specs/TASK_2026_1180_d4cd/batch-c2-fix-report.md` - task artifact, no Nx project

## Checks

- Focused auth-providers Jest: pass, 24 tests.
- Focused cli-agent-runtime Jest: pass, 48 tests.
- `npx tsc --noEmit --project` for both lib and spec configurations of auth-providers and cli-agent-runtime: all four pass.
- `npx eslint` on the five changed TypeScript files: pass. The Nx module boundary rule was skipped because no cached ProjectGraph was available.

## Decisions

- Absent Grok balance keeps the original 100% window without credits or explicit exhaustion. Valid zero balance adds provider-api exhaustion. Valid positive balance exposes credits and withholds the exhausted window. A present malformed balance keeps the window, omits credits and exhaustion, and marks the available reading `balance-unavailable`.
- Invalid core billing still returns the original service-unavailable reading without a balance reason.
- OpenCode Go already maps every HTTP 403 to `no-usage-source`; its reader is back to the original implementation. The entitlement spec documents this behavior.
- Grok 402 remains owner-level `error-derived` evidence.

## Open points

- With positive Grok credits and a 100% period, the lane may remain unknown because the exhausted window is withheld. The reading still exposes credits.
