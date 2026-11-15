# Batch B fix report

## Findings

1. **Temporary cwd lifetime:** `fallback-usage.runner.ts:40,134,182,188` creates the directory only for a new flight and removes it after the process `closed` promise settles. `antigravity-cli-usage.adapter.ts:97,134` supplies the production factory and injectable test factory. Caller abort ends only that caller's wait; the shared run retains its directory until close. Tests in `antigravity-cli-usage.adapter.spec.ts:122-185` cover success, timeout, abort during the run, cleanup order, creation failure, and cache hit. Existing abort before the run starts remains covered in the same spec.
2. **Percent boundary:** `antigravity-usage-json.parser.ts:70` keeps one decimal and caps positive remaining quota at 99.9. `antigravity-usage-json.parser.spec.ts:9-16` checks 0.004, 0.995, and 0.
3. **Bad row tolerance:** `antigravity-usage-json.parser.ts:15-24,48-56` parses groups and windows as unknown arrays, then validates each row with Zod. `antigravity-usage-json.parser.spec.ts:18-25` keeps a valid row beside a string fraction.
4. **Stale reset:** `antigravity-usage-json.parser.ts:72` omits reset metadata older than 24 hours while retaining the row. `antigravity-usage-json.parser.spec.ts:27-32` checks this.
5. **Stable identity:** `antigravity-usage-window.ts:1-14` builds both formats' keys and labels. The group index prevents collisions, including empty and identical slugs. `antigravity-cli-usage.adapter.ts:163-210` and `antigravity-usage-json.parser.ts:62-68` use it. `antigravity-cli-usage.adapter.spec.ts:49-58` checks format equality; `antigravity-usage-json.parser.spec.ts:34-50` checks collisions.
6. **Test gaps:** The adapter and new parser specs add the cases listed above; the existing pre-run abort test remains. Directory factory injection is in `antigravity-cli-usage.adapter.ts:97`.
7. **Cache and backoff directory work:** `fallback-usage.runner.ts:86-100,134` performs the cache/backoff check before creating a directory. `antigravity-cli-usage.adapter.spec.ts:122-133` checks a cache hit does not create one.
8. **Earlier report:** `batch-b-report.md:6,22` now states the coordinator's `ANTIGRAVITY_CHAIN_TIMEOUT_MS = 20_000` change.

## Checks

- Scoped Jest command requested: PASS, 4 suites and 102 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: PASS.
- `npx eslint` on the six changed/added TypeScript files: exit 0, 0 errors, 1 existing unused `_error` warning in `fallback-usage.runner.ts:177`.
- Did not run the real `agy` binary.

## Decisions

- Preserve no `modelScope` and no exhaustion evidence on CLI windows.
- Keep caller abort separate from shared flight cancellation so one caller cannot remove another caller's process directory.
- Wait for process close before directory removal. A process that never closes can retain its directory until it does.
- Include group ordinal in keys so slug collisions do not discard a second group; TSV assigns ordinals by first group appearance.

## Extra reads

- `antigravity-plan-usage.reader.ts` to verify the coordinator's 20 s constant; it was not edited.
- `review-batch-b.md`, `context-batch-b.md`, `batch-b-report.md`, existing adapter and runner specs, and the named plan reader spec to understand and verify the review.
- Skill discovery was available; no matching local skill covered this host-neutral reader change.
