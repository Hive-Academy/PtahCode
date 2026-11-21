# Fix round BE1: Antigravity CLI usage adapter and parser

## Changed

- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts`
  - Added a module-level latch (`Set` keyed by the resolved executable path). A reply with
    `num_turns > 0` adds the executable. Later calls for that executable return
    `{ ok: false, cause: 'cli-model-turn' }` without calling the runner, from any reader
    instance, for the rest of the process. The existing per-owner backoff check runs first,
    so the existing `cli-backoff` behaviour inside the backoff window does not change.
  - The warn log is written only once, when the latch is set. It carries `providerId` and
    `retryAfter` and no CLI output.
  - New export: `resetAntigravityCliTurnLatchForTests()` (test-only).
  - The `num_turns` validation in `parseAntigravityCliOutput` is unchanged.
- `antigravity-usage-json.parser.ts`: rejects an envelope with `is_error: true` or a
  `status` of `error`/`failed`/`failure` (any case) before it reads any bucket. A
  `num_turns` that is present must be a non-negative integer, otherwise the result is
  `undefined`. The legacy `type: 'command'` + `windows` shape is still accepted.
- Specs: the adapter spec resets the latch in `afterEach` and adds 3 tests: the latch
  blocks a second call (the runner is not started, one warn), another executable still
  works, and a zero-turn reply sets no latch. The parser spec adds 3 tests: a failed
  status or `is_error` beside valid buckets is rejected, a negative, fractional or string
  turn count is rejected, and the legacy and live shapes still parse. No existing
  assertion was changed.

## Pre-launch version gate: not added

The readers folder has no CLI version resolution. `version: 'usage-json-v2'` in
`runFallbackUsage` is only a cache-key string, and no `--version` call exists. Following
the brief, I did not add a second process spawn, so the latch is the only layer.

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <adapter spec> <parser spec>`:
  2 suites passed, 24 tests passed (log: `.ptah/tmp/fix-be1-jest.log`).
- `npx eslint <4 files>`: no output, exit 0.

## Not done / notes

- Real envelope field names for a failure are not in any fixture. `status`, `is_error`
  and `num_turns` were chosen to match the brief's examples.
- Two concurrent first calls can both start the CLI before the latch is set. The runner's
  own in-flight handling applies. A per-call lock was not added.
- `antigravity-plan-usage.reader.ts` was not touched.
