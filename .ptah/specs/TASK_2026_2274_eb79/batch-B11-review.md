# Review of batch B11: CLI composition and compatibility

**Verdict: APPROVED. Score: 8/10.**

## Findings on the points you asked about

- **registerHarnessServices is registered exactly once.**
  - `container.ts` no longer calls it. The only CLI call is `register-bots-composition.ts:24`.
  - `registerBotsComposition` is called once (`container.ts:941`), after `registerThothLibraries` and before `if (bootstrapMode === 'full')`.
  - So it runs on every path: RPC on, RPC off, minimal mode, and the benchmark path.
  - No other CLI file calls it. Electron calls it once in phase 4 (B10). The two hosts are consistent.
  - The HEALTH test shows one subscription and one disposal, for RPC on and off.
- **BOT_REPOSITORY** comes from `registerPersistenceSqliteServices`, which `registerThothLibraries` calls. The test resolves a `SqliteBotRepository`.
- **Handler.** It uses the lazy resolver callback and the host logger as the fourth argument. It is registered only when RPC is on. With RPC off, no handler is exposed and no method is registered.
- **strict: true in platform-cli tsconfig.spec.json is safe.** `tsconfig.lib.json` is already strict. The spec config only matches it now. The platform-cli spec passes.

## Defects

1. **Low** - `register-bots-composition.ts:24`. Harness services now register also in `minimal` mode, and outside the old try/catch. They are lazy singletons, so the cost is low. But this is a small behavior change. State it in the report.
2. **Low** - `bots-composition.spec.ts` (last test). It checks `container.ts` by reading the source text. It breaks on a harmless rename. A behavior test (resolve HARNESS_TOKENS in minimal and full mode) is better.
3. **Low** - `bots-composition.spec.ts` ("unbound application" case). It calls `container.reset()` after the handler is resolved. This is a fragile way to model the case. It proves the right outcome only because the handler resolves lazily.
4. **Info** - `container.ts` has 863 lines (lint warning, max 700). It was already over the limit.

## Checks run

- Jest, cli-engine: `bots-composition.spec.ts` and `with-engine.spec.ts`. Result: 2 suites, 63 tests passed. (The log noise about `runMigrations` is from the existing mocks.)
- Jest, platform-cli: `bots-host-compatibility.spec.ts`. Result: 1 passed.
- `tsc --noEmit` on `cli-engine/tsconfig.lib.json`: clean.
- eslint on the 4 changed files: 0 errors, 1 warning (max-lines, defect 4).
- I did not run `npm run verify` or `nx`.

## Coordinator actions

- Low 1 accepted and recorded: harness services now register in `minimal` mode too, outside the
  old try/catch. The registrations are lazy singletons, so startup cost does not change.
- Lows 2 and 3 moved to `carry-forward.md` for R01 (behavior tests in place of the source-text
  check and the `container.reset()` model).
- Coordinator fix: `libs/backend/platform-cli/tsconfig.spec.json` sets `strict: true`, like the
  library config. `npm run verify -- -t test -p platform-cli` passed.
