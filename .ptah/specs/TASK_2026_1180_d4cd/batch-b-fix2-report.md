# Batch B second fix report

## New findings

- **N1 — bounded close wait:** `fallback-usage.runner.ts:58,188-220` restores the 500 ms `FALLBACK_CLOSE_GRACE_MS` race, clears and unrefs its timer, and releases the flight when the grace expires. Directory removal is attached to the actual `closed` promise; its failure logs only `error.name`. Windows now runs tree kill when the parent exited but stdio has not closed. `fallback-usage.runner.spec.ts:26-52` checks a handle that never closes: the first flight settles, a second starts, and removal waits for close. The Windows exit-before-close test also expects tree kill.
- **N2 — caller abort isolation:** `fallback-usage.runner.ts:146` checks only `runSignal` after directory creation. `fallback-usage.runner.spec.ts:53-76` aborts the first caller while creation is pending and verifies the joined caller succeeds, the process starts once, and the successful result is cached.
- **N3 — stable keys:** `antigravity-usage-window.ts:3-13` uses the old TSV key form for unique nonempty slugs and appends an ordinal only for empty or colliding slugs. `antigravity-cli-usage.adapter.ts:178-191` and `antigravity-usage-json.parser.ts:48-77` count valid groups in appearance order and detect collisions. `antigravity-usage-json.parser.spec.ts:34-60` checks empty slugs, colliding slugs, reordering, and skipped invalid groups. The adapter spec checks JSON/TSV identity.
- **N4 — directory creation failure:** `fallback-usage.runner.ts:136-144` catches `create()` separately, reports `cli-unavailable`, and does not cache that result (`:101`). `antigravity-cli-usage.adapter.ts:138` stops the executable candidate loop on that failure. `antigravity-cli-usage.adapter.spec.ts:142-153` checks `ENOENT`, one create call, and no spawn.
- **N5 — TSV percent:** `antigravity-cli-usage.adapter.ts:225` caps positive remaining quota at 99.9 and returns 100 only for zero remaining. `antigravity-cli-usage.adapter.spec.ts:49-54` checks 0.04% and 0% remaining.

## Checks

- Scoped Jest command: PASS, 4 suites, 106 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: PASS.
- `npx eslint` on seven changed TypeScript files: exit 0, 0 errors, 1 existing unused `_error` warning in `fallback-usage.runner.ts:207`.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; 4,389 files scanned; `libs/backend/auth-providers` remains at its baseline of 24 unsuppressed sites. No baseline changed.

## Decisions

- Keep CLI windows free of `modelScope` and exhaustion evidence.
- Preserve shared flight work when one caller aborts; only `runSignal` cancels the process.
- Release the flight after close grace, while retaining deferred directory cleanup until actual close.
- Preserve `other:cli-${slug}-${suffix}` keys for unique nonempty group slugs.
- Keep directory creation failures distinct from executable `ENOENT` failures using `cwdUnavailable` and skip other candidates.

## Extra reads

- Read `review-batch-b-2.md` New findings in full, plus the prior fix report and context. The earlier review was read in the previous turn.
- Read the existing runner, adapter, JSON parser, key helper, constants, and their specs. The named plan reader spec was run but not edited.
- No other source file was read for a type error or test failure. Skill discovery from the earlier turn found no matching local skill for this host-neutral reader.
