# Batch C2 fix 6

Changed: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts` and `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`.

Each flight now gets a monotonically increasing start sequence. A result from an older flight cannot replace a newer cached reading or apply its ledger evidence. The regression test settles a positive reading before an older zero-balance reading and verifies a later cache hit retains the positive credits and window usage.

Checks:

- PASS: `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts` (51 tests).
- PASS: `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`.
- PASS: `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`.
- PASS: `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`.
- PASS: `npx eslint libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts` (one existing unused-variable warning).
