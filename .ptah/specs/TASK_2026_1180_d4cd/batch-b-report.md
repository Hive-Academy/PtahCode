## Changes

- CLI command now requests structured JSON, uses an isolated temporary cwd for the production executor, ignores stdin via the existing Node runner, and allows 15 s without changing other fallback sources.
- Added tolerant Zod JSON group/window parser. It creates group-specific window keys and labels, rounds used percent, reads reset times, omits model scope and exhaustion evidence, and falls back to widened legacy TSV parsing.
- OAuth missing-token-file path returns `no-usage-source` with `no-oauth` immediately, before any HTTP request.
- Raised the generic usage chain default deadline to 20 s. Antigravity now uses `ANTIGRAVITY_CHAIN_TIMEOUT_MS = 20_000` in `antigravity-plan-usage.reader.ts`; the coordinator made that change.

## Tests

- Added two-group JSON coverage (4 windows), malformed JSON and 5h TSV coverage, cwd spawn-option check, and absent OAuth token/no HTTP check. Existing timeout kill coverage remains.
- Scoped Jest: 4 suites passed, 78 tests passed.

## Check results

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <four changed specs>`: PASS, 4 suites / 78 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: PASS.
- `npx eslint <changed files>`: exit 0, no errors; two pre-existing unused catch variable warnings, plus Nx project graph unavailable warnings.
- `ptah_get_diagnostics` scoped call did not return and was stopped; TypeScript check above passed.

## Decisions

- `antigravity-plan-usage.reader.ts` now defines `ANTIGRAVITY_CHAIN_TIMEOUT_MS = 20_000` (coordinator change). The separate outer lookup deadline remains 12 s.
- Kept the CLI's existing `provider-unofficial` source label. Production runs create a temporary cwd; the injected legacy test executor does not spawn and skips creating one.
- Kept `SLOW_LIMIT_LOOKUP_DEADLINE_MS = 12_000` unchanged as instructed. A successful 5-6 s CLI read can fit; cold/slow reads may be cut by that separate lane lookup deadline.

## Extra reads

- `usage-sources.md` Cause 3 and batch b notes.
- `plan-usage.service.ts`: constructor only registers the reader. Provider work starts from `getOwnerSnapshot`/`startFlight`, so the chain is not awaited in Electron main-loop startup construction.
- `evidence-precedence.ts`: Antigravity belongs to the 12 s slow lookup list.
