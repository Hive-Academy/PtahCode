# Batch c2 report

| Change | Files | Tests |
| --- | --- | --- |
| Grok billing parses prepaid balance separately, preserves the period window for absent or malformed balances, and exposes valid credits | grok-account-plan-usage.reader.ts, grok-account-plan-usage.reader.spec.ts | Absent, zero, positive, and malformed balance fixtures pass |
| Grok HTTP 402 balance exhaustion becomes owner-level error-derived quota evidence | lane-limit-classifier.ts, lane-limit-classifier.spec.ts | 402 evidence and ordinary-text negative fixture pass |
| OpenCode Go retains its existing 403 mapping | opencode-go-plan-usage.reader.spec.ts | EntitlementError and other 403 fixtures pass |

## Changed files and owning Nx projects

- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts` - `@ptah-extension/auth-providers`
- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts` - `@ptah-extension/auth-providers`
- `libs/backend/auth-providers/src/lib/quota/readers/opencode-go-plan-usage.reader.spec.ts` - `@ptah-extension/auth-providers`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts` - `@ptah-extension/cli-agent-runtime`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts` - `@ptah-extension/cli-agent-runtime`
- `.ptah/specs/TASK_2026_1180_d4cd/batch-c2-report.md` - task artifact, no Nx project

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/opencode-go-plan-usage.reader.spec.ts` - pass, 24 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts` - pass, 48 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` - pass.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json` - pass.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` - pass.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` - pass.
- `npx eslint` on the five changed TypeScript files - pass. The Nx module boundary rule was skipped because no cached ProjectGraph was available.

## Decisions

- A Grok 100% period with zero prepaid balance remains a provider window and carries provider API exhaustion. Positive prepaid balance is exposed through the existing `credits` field; the exhausted subscription window is withheld because it is not a gate while prepaid funds remain.
- An absent prepaid balance preserves the original 100% period window without credits or explicit exhaustion. A present malformed balance preserves the window without exhaustion and marks the available reading `balance-unavailable`; malformed data cannot create AT LIMIT evidence.
- Grok 402 matching requires an HTTP or API status context and the exact balance-exhausted wording. The resulting owner evidence uses `error-derived`.
- The existing OpenCode 403 branch maps all 403 responses to `no-usage-source`. The spec pins both `EntitlementError` and another 403 body to that status.

## Open points

- A positive Grok balance at 100% avoids a false AT LIMIT but leaves no gating window, so lane state can remain unknown rather than confirmed room. The credits value remains visible on the owner reading.
