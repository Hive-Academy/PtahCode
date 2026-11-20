# Batch B04 Review - bots SQLite repository

**Verdict: APPROVED** (no Blocker, no Major that stops B06; two Majors are fixes for B06 or a small follow-up)

**Score: 8 / 10.** The core is sound. The transaction opens with BEGIN IMMEDIATE before every read of CAS or quota state. All SQL is bound. Claim, snapshot and revision insert commit together. Tests use a real database, a disk reopen, and two connections. Points are lost for the path-equality risk, the tombstone exposure, and a few weak test claims.

## Findings

1. **Major** - `sqlite-bot-repository.ts:36,53,59,89` - Workspace root equality is an exact, case-sensitive string compare (`workspace_root IS ?`). On Windows, `C:\Foo` and `c:\foo` name the same folder. A bot saved under one spelling disappears from `list` under the other spelling. The data is not lost, but the user sees no bots, with no diagnostic. The interface comment only says the caller must canonicalize. No test covers it.
   Fix: B06 must always pass the stored spelling (resolve through the same helper that saved it). Add a B06 test for a changed-case root. If B06 cannot guarantee this, add a normalized key column in a later migration.

2. **Major** - `sqlite-bot-repository.ts:51-55,64-71,169` - `list`, `get` and `revisions` return tombstones. A tombstone has `definition: null` and `diagnostics: []`, the same shape as no diagnostic. `revisions()` returns the retained snapshots of a deleted bot. The plan (line 119) says list/get do not expose tombstones and a get with a revision returns BOT_NOT_FOUND after delete. A consumer that only checks `definition` can show a blank row.
   Fix: Add `'deleted'` to the diagnostics of a tombstone, or add an explicit `deletedAt` field. Document in `bot-repository.ts` that B06 must filter tombstones, and add a B06 test for `bots:list` and the revision read after delete.

3. **Minor** - `sqlite-bot-repository.ts:161` and `:160` - `claim` returns `scope-denied` when the staged image is expired or does not exist. The reason is a missing or expired id, not a denied scope. The caller cannot show the right message.
   Fix: Use `not-found` for a missing or expired image. Keep `scope-denied` for a foreign owner. Update the test at spec line 183.

4. **Minor** - `sqlite-bot-repository.ts:192-193` - If `work()` fails and SQLite already rolled back the transaction (for example SQLITE_FULL), `ROLLBACK` throws "no transaction active". This hides the first error.
   Fix: Check `db.inTransaction` before `ROLLBACK`, or wrap `ROLLBACK` in its own try and rethrow the first error.

5. **Minor** - `sqlite-bot-repository.ts:87,66-69,141-144` - These paths throw raw `ZodError` or a raw SQLite constraint error, not `BotRepositoryError`. Examples: update of an invalid stored row, one bad revision row (it makes the whole `revisions()` call throw), and `stageAvatar` with a duplicate `imageId`. The last case also tells a caller that an id exists in another scope.
   Fix: Map these to `BotRepositoryError('invalid')`. Make `revisions()` skip or flag a bad row instead of throwing.

6. **Minor** - `sqlite-bot-repository.ts:124-127` - The tombstone `UPDATE` does not check `changes === 1`. The IMMEDIATE lock makes a miss impossible today. The save path does check.
   Fix: Check `changes` and fail with `conflict`.

7. **Minor** - `sqlite-bot-repository.ts:138-140` - The 20 MiB quota counts only staged images (`owner_bot_id IS NULL`). Claimed images are not bounded, so many bots or many revisions can store unbounded image data (2 MiB each). This matches the plan text ("staging storage"), but it is a storage growth path.
   Fix: Record this limit in the B06 design. Consider a per-bot image count cap in the claim step.

8. **Minor** - `sqlite-bot-repository.spec.ts:199-217` - The test name says two connections "compete", but the test does not race. It holds a lock with one connection, shows `locked`, then runs the two saves one after the other. The proof of serialization comes from BEGIN IMMEDIATE and is valid. The name overstates the test. Real interleaving is not tested.
   Fix: Rename to "blocks a second writer while a writer lock is held, then conflicts on a stale revision". Also add that busy_timeout in the test is 20 ms, not the production 5000 ms.

9. **Minor** - Missing tests: `save` of an existing id from another scope (`scope-denied` on update, line 88); stale `expectedRevision` on `delete`; a second `delete` of a tombstone; `expectedRevision` non-null on insert; changed-case Windows root (finding 1); a claim of an image already owned by the same bot (revert to an older avatar).
   Fix: Add these cases.

10. **Note** - `sqlite-bot-repository.ts:134` and `:27` - The repository checks size and media type only. It does not check image signatures. The plan assigns signature and dimension checks to B06a/B06. The 2 MiB bound and the allowlist hold at both the repository and the migration CHECK.

11. **Note** - All acceptance points were checked and hold: CAS plus snapshot in one transaction, same-expectedRevision conflict, no-op after CAS, raw rows kept for invalid and newer rows, four retention combinations with three revisions, tombstone with `definition_json` NULL, no cascade (FK RESTRICT), purge only by `owner_bot_id = id`, 24 h expiry with cleanup on upload, per-scope quota, claim rollback, no bots library import, no `any`, no `!`, `catch (error: unknown)`, no `console`, all files under 700 lines, registration in the shared helper only (CLI host unaffected).

## Checks run

```
npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts
Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total

npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json
(no output) tsc exit 0

npx eslint <six files>
(no diagnostics printed)
```

Note: the implementer report said `ptah_get_diagnostics` did not finish. I did not rely on it.

## Re-review (revision 1)

**Verdict: APPROVED** (score 9/10). No Blocker and no Major remains. Findings 1 and 7 are deferred by the coordinator to B05/B06.

### State of each finding

| # | State | Evidence |
|---|-------|----------|
| 1 | Deferred (JSDoc only) | `bot-repository.ts:51-53` states exact `workspace_root` equality and the caller duty. Canonicalization is open for B05/B06. |
| 2 | Fixed | `sqlite-bot-repository.ts:93,104` filter `deleted_at IS NULL`. `revisions()` (`:111`) returns `[]` for a tombstone. |
| 3 | Fixed | `:342-364`: missing or expired id gives `not-found`. Foreign scope or root gives `scope-denied`. Foreign owner gives `scope-denied` (`:366`). |
| 4 | Fixed | `:435` rolls back only if `db.inTransaction`. A rollback failure goes to `logger.debug` and the original error is kept. Test at spec `:523`. |
| 5 | Fixed | `parse()` maps Zod failure to `invalid`. `normalize()` (`:459`) maps SQLITE_CONSTRAINT to a generic `invalid`. `revisions()` flags a bad row with `invalid-revision` and keeps the other rows. |
| 6 | Fixed | `:261` checks `changes !== 1` and gives `conflict`. Test at spec `:543` uses RAISE(IGNORE). |
| 7 | Deferred (JSDoc only) | `bot-repository.ts:53-54` states that the quota covers staged images only. |
| 8 | Fixed | Test renamed at spec `:431`. It no longer claims a race. |
| 9 | Fixed | Spec `:460` (cross-scope, stale delete, second delete, insert with expectedRevision) and `:476` (revert to an owned avatar). Windows case root stays with finding 1. |

### New-defect checks

- **Tombstone hiding, delete and CAS:** correct. `delete()` calls `get()`, which hides the tombstone, so a second delete gives `not-found`. `save()` reads the raw row directly (`:133`), so a save on a tombstone still gives `conflict` (`:165`). An id cannot be reused. A damaged live row is still deletable, because `get()` returns it with a null definition and the row schema still parses.
- **Return type `(BotRevision | InvalidBotRevision)[]`:** consistent in the port (`bot-repository.ts:64`) and the implementation. It is exported through `export *` in `index.ts`. No other caller exists in the repository. Callers must narrow. The JSDoc does not say this (see N1).
- **Logger registration:** `@inject(TOKENS.LOGGER)` is satisfied. `register.ts` already requires `TOKENS.LOGGER` as a precondition. Both hosts call the helper: `apps/ptah-electron/src/di/phase-2-libraries.ts:523` and `libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts:108`. Other services in the library inject the same token. The registration test (spec `:414`) resolves the repository through the helper. The CLI host is not broken.
- **Rules:** no `any`, no `as any`, no non-null `!` found by grep. Files are 82, 480 and 555 lines. No bots application library is imported.

### New findings

- N1 **Note** - `bot-repository.ts:64`: add one JSDoc line that `revisions()` returns `InvalidBotRevision` members (no `definitionJson`) and that callers must narrow with `'definitionJson' in row`.
- N2 **Note** - `sqlite-bot-repository.ts:81`: the logger is typed `Pick<Logger, 'debug'>`. This is fine, but a failed rollback is logged at `debug` only. Use `warn` if the operations team needs to see it. No change is required.

### Checks run

```
npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total

npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json
tsc=0 (no diagnostics)

npx eslint <the six B04 files>
eslint=0 (no diagnostics)
```
