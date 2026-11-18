# B06 logic review

**Verdict: REVISE**
**Score: 6/10** (sound policy and mapping; one Major design defect in `find`, one Major list-robustness defect).

## Scope examined
bot-application.service.ts, bot-import-preview.service.ts, bot-schema-upgrades.ts, register-bots-services.ts, index.ts, both specs, the `rpc-bots.schemas.ts` `unreadable` change. Read the repository (`sqlite-bot-repository.ts` save/claim/readAvatar) to trace avatar claim and CAS.

## Findings

1. **Major** — `bot-application.service.ts:457-470` (`find`). Every read (`get`, `getAvatar`) and every mutation upgrades a current V1 row with a write: it saves revision+1 and a new history row.
   - Conflicts with plan "Failure behaviour": a read RPC must not write, and an archived bot must stay read-only. The upgrade also ignores `archivedAt` (an archived V1 bot gets a write).
   - Spurious conflict: `list` does not upgrade, so a client sees revision N. `update/setEnabled/archive/restore/delete` call `current()` → `find` first, which bumps to N+1, so `current()` at line 481 throws `BOT_REVISION_CONFLICT` for a correct `expectedRevision` on the first mutation of any V1 bot. No test covers this.
   - Concurrent reads: the second `get` loses the CAS and the read RPC fails with `BOT_REVISION_CONFLICT`. The plan says "Defaults apply to creation, never malformed stored rows", and B01 only requires a V2 reply, not a stored upgrade.
   - Fix: make `find` return `upgradeBotDefinition(...)` in memory only (revision unchanged). Write V2 only on the next real mutation, which already saves V2 with CAS. Change the test at spec:382-422 to assert `revision: 1` and no repository write.

2. **Major** — `bot-application.service.ts:87-94` (`list`). The unreadable branch parses `row.raw` with `parse(z.object({ id: BotIdSchema ... }))`. When the raw row has no valid UUID id, `parse` throws `INVALID_PARAMS` and the whole list fails. This breaks "list keeps good rows". Fix: use `safeParse`. For an unreadable id, skip the item or give a fixed placeholder diagnostic. Add a test with a row that has a bad id.

3. **Major** — `bot-application.service.ts:84-85` with `bot-schema-upgrades.ts:30`. The V1→V2 `BotDefinitionSchemaV2.parse` can throw a `ZodError`, not a `BotDomainError`. `list` rethrows it (one bad V1 row breaks the list) and `find` (line 448) leaks it to the RPC layer with schema text. Fix: use `safeParse` and throw `BotDomainError('BOT_SCHEMA_UNSUPPORTED', ...)`.

4. **Minor** — `bot-application.service.ts:342-355` (`delete`). `participant.inspect` is not wrapped. A throwing participant leaks a raw error. The active-work check and the repository delete are separate steps: work can start between them (unavoidable in Phase 1, but note it). Fix: wrap in try/catch → `BOT_RETENTION_UNAVAILABLE`.

5. **Minor** — `bot-import-preview.service.ts:55-63`. Any reader failure, including a `BotDomainError` such as an authorization failure, is remapped to `BOT_SOURCE_INVALID`. Fix: rethrow `BotDomainError` unchanged.

6. **Minor** — `bot-application.service.ts:302-334` (`archive`/`restore`). They save when the state does not change (archive of an archived bot, restore of an active bot). The repository treats equal content as a no-op, but `archivedAt ?? now` and `updatedAt` differ, so a revision is created each time. Fix: return the current record when nothing changes.

7. **Minor** — `bot-application.service.ts:525-529`. When the catalog fails and the bot has skills, an update throws `INVALID_PARAMS`, which looks like client error. An outage is a dependency failure. Consider a dedicated code or `CATALOG_UNAVAILABLE` text. Also an update of an unrelated field fails if one saved skill was later uninstalled (line 544): confirm intent.

8. **Note** — `bot-application.service.ts:70-126`. `list` does not check `record.scope`/`record.id` against the storage scope as `find` does (lines 449-456). A mismatched row would be listed. Add the same check.

9. **Note** — spec:382 test name "upgrades a V1 current row with CAS" asserts the behaviour of finding 1. It must change with the fix.

## Checked and sound
- Avatar: `getAvatar` finds the bot in authorized scopes, reads with `current.scope`, and checks `ownerBotId === current.id` (lines 403-408). The repository `claim` refuses another owner and another scope (`sqlite-bot-repository.ts:342-367`), inside the save transaction. No cross-bot read or claim path found.
- CAS race: authorization/catalog awaits occur before the synchronous `save`; the CAS on `expectedRevision` covers the window. No automatic retry. Repository errors map to typed codes; unknown errors map to `PERSISTENCE_UNAVAILABLE`.
- Symbolic default runtime kept on create; client cannot set id/revision/origin/timestamps (strict schemas; origin comes only from the `wizard-generated` hint).
- Memory: user scope refuses workspace memory; workspace memory must equal the bot root.
- Diagnostics for broken rows use fixed messages (lines 100-109); no raw text leaks.
- `registerBotsServices` is lazy; no resolution at registration. Barrel exports only existing files; no self-barrel import. Preview does not write.
- Files under 700 lines (633, 180, 41, 45); no `any`/`!` found.

## Checks run
- jest bot-application.service.spec.ts: 20 passed.
- jest rpc-bots.schemas.spec.ts: 44 passed.
- tsc --noEmit libs/backend/bots/tsconfig.lib.json: no output (pass).
- eslint libs/backend/bots/src: no output (pass).

## Re-review (round 1)

**Final verdict: REVISE (narrow)** — **Score: 8/10.** All nine first-round findings are fixed in code. One acceptance point lost its test (see (b)). No source defect remains.

### State of the first-round findings
| # | State | Evidence |
|---|---|---|
| 1 Major, reads write | Fixed | `find` (`bot-application.service.ts:450-458`) only calls `readStoredBot`; no `save` on any read path. Archived V1 reads are not written. The first mutation saves V2 at `expectedRevision+1` (`:586-609`), so the list revision N is accepted. Test at spec `:341` (`it.each([null, 5])`) covers active and archived V1: revision 1, zero writes, then a real update succeeds. |
| 2 Major, list bad id | Fixed | `StorageMetadataSchema.safeParse` (`bot-schema-upgrades.ts:58-70`, `:82`). Rows with no usable SQL id are counted (`:79-107` of the service), not thrown. |
| 3 Major, ZodError | Fixed | `upgradeBotDefinition` uses `safeParse` for V1→V2 (`bot-schema-upgrades.ts:32-50`). Create and save also go through it. Test at spec `:672`. |
| 4 Minor, participant throw | Fixed | `:334-348`; fixed message, `BOT_RETENTION_UNAVAILABLE`. Race comment at `:361`. |
| 5 Minor, preview remap | Fixed | `BotDomainError` rethrown unchanged in `bot-import-preview.service.ts:53`. |
| 6 Minor, redundant archive/restore | Fixed | `:296-297`, `:315-316`; revision still checked first by `current()`. |
| 7 Minor, catalog outage | Fixed | `:500-553`. Only new skills need installation proof. Outage with new skills gives `PERSISTENCE_UNAVAILABLE`; without them `CATALOG_UNAVAILABLE`. |
| 8 Note, list mismatch | Fixed | `readStoredBot` checks SQL id, requested id and scope for list and find. |
| 9 Note, test name | Fixed | Test renamed and rewritten. |

### (a) Nil-UUID aggregate diagnostic
Safe for calls. `z.uuid()` accepts the nil UUID (I ran it: `true`), so `bots:get`, `update`, `delete` and `get-avatar` pass validation and then reach `repository.get(nilId, scope)`. No bot has that id (`newId` is `randomUUID`), so `find` returns `BOT_NOT_FOUND` at `bot-application.service.ts:457`. No write and no leak. The message holds only a count.
- Residual risk: the renderer sees an item with an `id` that is not a bot, and a UI could show actions for it. This is a contract smell, not a defect now.
- Better option (not required to merge): a separate field in `BotsListResultSchema`, for example `unidentifiedRowCount: number`, at `rpc-bots.schemas.ts` (`BotsListResultSchema`, about `:187-197`) and at `bot-application.service.ts:97-107`. Until then, B08/U03 must treat `00000000-0000-0000-0000-000000000000` as a non-actionable notice. Record that in carry-forward.md.

### (b) Removed tests
- **Registration (needed).** The B06 acceptance line "Do not resolve repository/application during registration" and the typed-fake registration have no test now (`register-bots-services.ts:20-51` is checked only by tsc). Add `libs/backend/bots/src/lib/register-bots-services.spec.ts` (coordinator approval for one file): a container with throwing/unbound tokens; call `registerBotsServices`; assert no resolution; then resolve `BOTS_TOKENS.APPLICATION` twice and assert one instance (`instanceCachingFactory`) and that the unbound-repository failure appears only at resolve time.
- **Create-scope default (useful).** `create` lines `:210-226` (omitted scope from the authorized workspace) are now untested. Put it in the same new file or a small `bot-application.create-scope.spec.ts`. Also assert that an explicit scope is not overridden.
- **Duplicate race mapping (not needed).** `failSave` stays in the fake (spec `:36,57`). Map `conflict → BOT_REVISION_CONFLICT` is exercised by the CAS conflict path only through the service check at `:464`; the repository-error mapping at `:616-621` has no direct assertion for `conflict`. Low value; add one `it.each` over the five codes in the new spec if cheap.

### New findings
1. **Minor** — `register-bots-services.ts:20-51` / missing spec: acceptance is unproven (see (b)). This is the only reason for REVISE.
2. **Note** — `bot-application.service.ts:334-348`: `ownership` from a participant is not shape-checked. An object without `supported` is treated as unsupported (safe, refuses). No change needed.
3. **Note** — `bot-application.service.ts:592`: the no-op check compares `JSON.stringify` of two spreads. It works because `record` is built from `{...current, ...}`, which keeps key order. If a later change reorders keys it silently stops detecting no-ops; the repository still treats equal content as a no-op, so there is no data risk.

Checked with no defect: reads never write; V1 first mutation with the list revision succeeds; archived bots are untouched by reads and by `archive`/`setEnabled`/`update` (`BOT_ARCHIVED`); catalog outage paths; retention inspect errors; spec is 699 lines, service 634.

### Checks run
- jest `bot-application.service.spec.ts`: 1 suite, 24 passed, 0 failed.
- `tsc --noEmit -p libs/backend/bots/tsconfig.lib.json`: no output (pass).
- `eslint libs/backend/bots/src`: no output (pass).
- `z.uuid()` accepts nil UUID: `true` (node check).

## Re-review (round 2, final)

**Final verdict: APPROVED** — **Score: 9/10.** Re-review items (a) and (b) are resolved. I found no defect in the changed lines.

### (a) Separate count field — resolved
- `rpc-bots.schemas.ts` adds a required `unidentifiedRowCount: z.number().int().nonnegative()` to `BotsListResultSchema`. The nil-UUID item is gone from `bot-application.service.ts:97-109`; the service now logs a debug count and returns the count. No sentinel id remains.
- Tests: service spec `:560` asserts `unidentifiedRowCount` is 1 beside real-id unreadable rows. Shared spec `:330-416` includes the field in all fixtures, accepts 0 and positive values, and rejects negative, fractional and absent values.
- Consumers: only `rpc-bots.types.ts` (inferred type) and the bots lib use the schema now. B08 and U03 must send and read the count.

### (b) Registration and moved tests — resolved (`register-bots-services.spec.ts`)
- **No resolution during registration** (`:67-81`): throwing factories on all four ports are counted by one `jest.fn`; the test asserts `registerBotsServices` does not throw, `resolve` was called zero times, and the token is registered. This is real proof, not only absence of errors.
- **Singleton** (`:83-94`): two resolves return the same instance (`toBe`); repository `save` is not called.
- **Resolve-time failure** (`:96-108`): repository unbound; registration does not throw, resolving `APPLICATION` throws.
- **Create scope** (`:110-157`): omitted scope uses the authorizer spelling (`c:\project` → `C:\Project`); explicit user scope and explicit other workspace keep their own scope; the `save` arguments are asserted.
- **Error mapping** (`:159-200`): `it.each` over conflict, scope-denied, not-found, invalid and quota; each asserts the code, the fixed message and exactly one `save` call (no retry). Unknown failure maps to `PERSISTENCE_UNAVAILABLE`.

### New findings
1. **Note** — `register-bots-services.spec.ts:1`: the file starts with a UTF-8 BOM. eslint passes. Remove it to match the other files (cosmetic).
2. **Note** — `register-bots-services.spec.ts:96-108`: the failure test asserts only `toThrow()`. A message or type check would not add value because the DI message must not reach the RPC layer (B08 maps it).

### Checks run
- jest bot-application.service.spec.ts + register-bots-services.spec.ts: 2 suites, 34 passed, 0 failed.
- jest rpc-bots.schemas.spec.ts: 1 suite, 49 passed.
- `tsc --noEmit -p libs/backend/bots/tsconfig.lib.json`: no output (pass).
- eslint on `libs/backend/bots/src` and both shared bots schema files: no output (pass).
- Line counts: service 628, service spec 694, register spec 215 (all under 700).
