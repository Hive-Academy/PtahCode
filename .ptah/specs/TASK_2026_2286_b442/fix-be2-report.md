# Fix round BE2 — defects 2, 3, 10a

## Changes (libs/backend/auth-providers/src/lib/quota/readers/)

- `antigravity-plan-usage.reader.ts`
  - Defect 2: after a successful CLI run the store owner is read again; the result is rejected
    (`account-mismatch` -> `account-unverified`) when the post-run fingerprint differs from the
    pre-run one, for every eligible owner kind (account, cli-store, unknown), plus the existing
    explicit-account match. On rejection the reader calls the result's `discard()`.
  - Defect 3: `PROMOTED_CLI_CAUSES` (`cli-not-found`, `cli-not-signed-in`, `cli-timeout`,
    `cli-parse-failed`, `cli-model-turn`, `cli-backoff`). Snapshot `statusReason` priority is now:
    account-unverified, then a substantive direct-source failure, then an attempted CLI failure
    with a promoted cause, then the first direct-source failure (unchanged fallback). With no
    `allowCliFallback` no CLI failure is recorded, so behaviour is unchanged.
- `antigravity-cli-usage.adapter.ts`
  - `runFallbackUsage` has no validation, invalidation or cacheable hook (cache key =
    sourceId, ownerKey, executable, version, accountFingerprint; success cached 30 s). So the
    adapter keeps a module-level `rejectedGenerations` map keyed by executable+owner+fingerprint.
    A success result carries `discard()`, which bumps the generation; later reads pass
    `<fingerprint>#rejected-<n>` to the runner, so the rejected cached windows are never replayed.
- Specs
  - reader: cli-store target gains a sign-in during the run -> rejected, `statusReason`
    `account-unverified`, `discard` called; rejected account read then switch back -> CLI read
    again, fresh windows returned; `statusReason` is `cli-not-found` with absent OAuth/LS,
    `no-oauth` without opt-in, and the OAuth reason (`usage-auth-rejected`) stays on top over a
    CLI failure. Defect 10a: `setup()` now exposes a `readStore` spy; the disabled/credential-owner
    test asserts it was not called, next to the existing `cliRead` assertion.
  - adapter: a discarded result is not replayed from the runner cache (second spawn happens).

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false
  --runTestsByPath <reader spec> <adapter spec>`: 2 suites passed, 56 tests passed.
- `npx eslint` on the 4 files: 0 errors, 2 warnings (pre-existing unused `error` catch bindings in
  the reader at lines 118 and 265, not touched).

## Not done / notes

- No new cause strings for the UI; `statusReason` values are existing `UsageFailureReason` values
  (`cli-not-found`, `cli-timeout`, ... as mapped by `antigravityFailure`). Frontend should confirm
  labels exist for `cli-not-found`, `cli-not-signed-in`, `cli-timeout`, `cli-parse-failed`,
  `cli-backoff` now that they surface as the snapshot reason.
- `fallback-usage.runner.ts` not edited (no hook added there).
