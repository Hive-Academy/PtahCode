# B04 — Bots repository and registration

Implemented atomic bot/revision/tombstone/avatar persistence. Only the six authorized source paths and this report were written. No git operations were run. Existing migration 0076 and shared contracts were read and left untouched; no unrelated files were edited.

## Files changed

- `libs/backend/persistence-sqlite/src/lib/bots/bot-repository.ts` — public synchronous port, raw read envelope, revision/image/result types and typed repository error (42 lines).
- `libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.ts` — shared-connection implementation (200 lines).
- `libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts` — real SQLite integration, retention, rollback and contention coverage (219 lines).
- `libs/backend/persistence-sqlite/src/lib/di/tokens.ts` — `BOT_REPOSITORY: Symbol.for('PtahBotRepository')` (86 lines).
- `libs/backend/persistence-sqlite/src/lib/di/register.ts` — singleton registration through the existing host-neutral helper (101 lines).
- `libs/backend/persistence-sqlite/src/index.ts` — port/types/error and implementation exports; existing token/helper exports retained (158 lines).

## Public API

Exported `BotRepository`:

```ts
list(scope: BotScope): StoredBot[];
get(id: string, scope: BotScope): StoredBot | null;
revisions(id: string, scope: BotScope): BotRevision[];
save(definition: BotDefinition, expectedRevision: number | null): BotWriteResult;
delete(id: string, scope: BotScope, expectedRevision: number, retention: BotRetention): BotDeleteResult;
stageAvatar(imageId: string, scope: BotScope, mediaType: BotAvatarMediaType, bytes: Uint8Array): BotAvatarImage;
readAvatar(imageId: string, scope: BotScope): BotAvatarImage | null;
```

`SqliteBotRepository` takes the shared `SqliteConnectionService` db boundary via the existing connection token. `configure({ now: () => number }): void` injects a deterministic clock before use; production defaults to Date.now. No timers.

`StoredBot` contains `raw: unknown`, `definition: BotDefinition | null`, and `diagnostics: readonly string[]`. Raw is the complete original SQL row, including `definition_json` and `schema_version`; callers can inspect unsupported snapshots without losing bytes. `BotDefinition` accepts V1 and V2, unlike the V2-only RPC get result. `BotRevision` exposes botId/revision/schemaVersion/definitionJson/createdAt. `BotAvatarImage` exposes imageId/mediaType/bytes/ownerBotId/expiresAt. `BotWriteResult` exposes changed/definition; `BotDeleteResult` reports actual revisionsRemoved/imagesRemoved. `BotRepositoryError.code` is conflict/not-found/invalid/scope-denied/quota. Schema validation and native SQLite errors propagate without swallowing or automatic retries.

## Rules implemented

- Every mutation uses one explicit BEGIN IMMEDIATE / COMMIT transaction, with rollback on failure. Writer reservation precedes CAS/quota reads; nested transactions are refused. SQL values use bound parameters. No session-store dependency or bots application import.
- Create requires expectedRevision=null and revision=1. Update checks existing revision before no-op detection; accepted changes require the next revision. Current row, complete immutable revision snapshot and avatar claim commit together. Deleted bots cannot be recreated or updated. Scope changes and createdAt changes are refused; schema downgrades are refused.
- No-op compares validated definitions structurally, ignoring only revision and updatedAt. Key order does not matter. A no-op returns the original stored definition, keeps its timestamps/revision, creates no revision and claims no asset. V1-to-V2 is a real change and creates a revision; upgrades are never implicit.
- Read validation checks SQL row shape, JSON schema and duplicate SQL/JSON metadata consistency. Invalid/newer rows remain in list as raw plus diagnostics; V1 remains parsed with upgrade-required. Tombstones remain readable with null definition. Unsupported/corrupt data is never rewritten by reads or silently omitted.
- Deletion increments the tombstone revision and records both retention choices, disables the bot and sets definition_json=NULL. History=keep preserves every revision, every owned image and the name. History=purge removes every revision and every owned image in that same transaction and clears name, independently of memory retention. No cascading deletes. Only matching bot ownership is purged.
- Memory/run data is outside this repository's ownership. It persists the memory choice and reports no fabricated memory removal counts. Application-layer retention participants must handle active-work/unsupported-ownership refusal before invoking this port; no memory/run tables exist in phase 1.
- Staging validates nonempty bytes, the 2 MiB maximum and the png/jpeg/webp allowlist. Upload expires after exactly 24 hours. Upload cleans expired unowned staging, then enforces 20 MiB total unowned bytes per scope/root. Cleanup is part of the upload transaction, so a rejected upload also rolls it back.
- Read/claim require exact scope/root. Expired staging cannot be read or claimed. Claim accepts only unowned staging or an image already owned by the same bot. Foreign-owner claims fail and roll back record creation/update. Replacing/removing an avatar keeps old bytes because immutable revisions still reference them. History purge removes all bot-owned images, including replaced images. Returned bytes are copied.
- Canonicalization and authorization of workspace roots belong to the caller; repository requires exact equality. No image decoding, secret access, filesystem authorization, network calls or execution are added.

## Decisions

1. **Synchronous raw-storage port with parsed union and diagnostics.** Options: V2-only RPC-shaped reads or lossless stored reads. Evidence: task explicitly requires V1 preservation and B06-owned upgrades; shared BotDefinitionSchema is V1/V2 while BotRecordSchema is V2-only. Selected raw envelope plus parsed union. Reversible: additive adapters can expose other application shapes without changing stored bytes.
2. **BEGIN IMMEDIATE before checking CAS/quota.** Options: deferred transaction or immediate writer reservation. Evidence: synchronous shared SQLite boundary and required two-connection contention/quota guarantees. Selected immediate transactions, no mutation retries. Reversible: transaction strategy can change behind the port.
3. **No-op ignores only revision/updatedAt.** Options: exact serialized equality, editable-field equality, structural equality with mutation metadata excluded. Evidence: full snapshots carry incrementing metadata, and no-op must not create history. Selected structural comparison after CAS; schema upgrades remain changes. Reversible: isolated comparison function.
4. **Keep all owned image bytes until history purge.** Options: current-avatar cleanup or immutable-history retention. Evidence: migration stores image ownership and plan requires historical references to survive replacements/removal and history=keep deletion. Selected ownership retention. Reversible only with an approved future history policy; no data removal introduced here.
5. **Scope is stable for an existing id.** Options: implicit cross-scope movement or refusal. Evidence: scope/root denial requirement, image ownership scoped at staging, and application-owned authorization. Selected refusal rather than silently transferring ownership. Reversible: explicit authorized move can be designed later.
6. **Clock supplied through configure.** Options: new DI clock token or existing connection-service-style configuration. Evidence: this library already uses configure for test/host options; no clock token is needed by other services. Selected configure with Date.now default. Reversible: constructor/factory injection can wrap the same function later.

## Checks

Commands were run in the supplied worktree. No nx, npm verify, host build/serve or workspace-wide checks were run.

```text
npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json
exit_code: 0 (no diagnostics)

npx eslint libs/backend/persistence-sqlite/src/lib/bots/bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts libs/backend/persistence-sqlite/src/lib/di/tokens.ts libs/backend/persistence-sqlite/src/lib/di/register.ts libs/backend/persistence-sqlite/src/index.ts
exit_code: 0 (no diagnostics; final run after spec correction)

npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts
Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        13.987 s, estimated 20 s
exit_code: 0

npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts libs/backend/persistence-sqlite/src/lib/sqlite-page-reclaimer.spec.ts libs/backend/persistence-sqlite/src/lib/backup.service.spec.ts
Test Suites: 3 passed, 3 total
Tests:       1 skipped, 94 passed, 95 total
Snapshots:   0 total
Time:        58.09 s, estimated 68 s
exit_code: 0
```

No dedicated register.spec/tokens.spec exists in this library: ptah_search_files returned no such file, then native search found helper registration assertions in sqlite-page-reclaimer.spec.ts and token registration coverage in backup.service.spec.ts. Both were run above. The first new-suite run had 11 passing storage tests and one registration-fixture failure (missing SQLITE_DB_PATH); the fixture was corrected to supply the helper's required logger/path registrations, then both final runs passed.

Coverage includes create/stale CAS, no-op, V1 preservation/explicit upgrade, invalid/future raw snapshots, all four retention combinations with three revisions each, retained original bytes and replaced images, unrelated rows/assets, claim/snapshot rollback via failing revision trigger, delete/purge rollback via failing tombstone trigger, scope/root/foreign-owner denial, quotas, expiry and cleanup, invalid byte sizes/media, singleton registration, temp-file reopen, and two connections competing for a revision (writer lock denial followed by stale-CAS denial).

ptah_get_diagnostics was called after edits twice with scoped changed files. Both returned unavailable: `TypeScript check still running after 45s. It was not cancelled`. This is not reported as a diagnostics pass; the explicit requested tsc and Jest compiler checks passed.

## Not done / boundaries

- Image format decoding/validation remains B06a/B06 by explicit scope; byte/media limits are enforced here.
- Active-work/private-memory participant orchestration and application RPC error mapping remain B06; this repository never touches shared memory, transcripts or unrelated assets.
- Electron and CLI composition roots were not modified: both use the existing host-neutral registration helper; the repository adds no Electron-only API.
- No skill-loading mechanism or applicable loaded skill catalogue was exposed to this lane. Repository patterns and task instructions were followed; no skill steps were invented.
- Ptah diagnostics service did not complete within its tool timeout. No further requirement is known to be unimplemented within B04's authorized repository scope.

## Revision 1

All nine requested items are addressed. This section supersedes the original report where tombstone read visibility, revision error behavior and propagated constraint errors were described differently.

1. **Hide tombstones (review #2).** `sqlite-bot-repository.ts:93` and `:104` filter `deleted_at IS NULL` in list/get SQL. Get returns null after deletion; `revisions()` at `:110` returns [] through that same visibility check. Retained history remains in the table. `bot-repository.ts:55` documents that a later authorized retained-history reader is outside this port. The four-combination retention test now verifies normal-reader invisibility and directly checks retained SQL snapshots (`sqlite-bot-repository.spec.ts:241`, `:246`), without exposing a tombstone through the public read API. Second delete returns not-found.
2. **Avatar claim errors (review #3).** `sqlite-bot-repository.ts:342` distinguishes missing/expired ids (not-found) from a foreign scope/root or foreign owner (scope-denied). Expiry test now expects not-found; missing-id coverage is at `sqlite-bot-repository.spec.ts:517`. Existing scope/owner tests remain passing.
3. **Preserve original errors during rollback (review #4).** `sqlite-bot-repository.ts:424` rolls back only while `db.inTransaction` is true. A rollback failure is logged through the injected Logger and cannot replace the original operation error. Added regression coverage for SQLite RAISE(ROLLBACK) and an injected rollback failure (`sqlite-bot-repository.spec.ts:523`). Constructor now explicitly injects the logger; shared helper registration already supplies that dependency for both hosts.
4. **Typed validation/constraint errors and revision diagnostics (review #5).** `sqlite-bot-repository.ts:453` maps failed schema validation to BotRepositoryError('invalid'); `:459` maps SQLite constraint codes (better-sqlite3 SQLITE_CONSTRAINT variants and node:sqlite numeric extended constraint codes) without exposing native messages. Duplicate avatar ids and invalid ids return the same generic invalid error, regardless of scope. `revisions()` at `:117` flags a malformed SQL revision row with raw data and invalid-revision diagnostics rather than throwing. Public return type is now `(BotRevision | InvalidBotRevision)[]` (`bot-repository.ts:64`); successful revision fields are unchanged, and callers must narrow using `definitionJson in row` before consuming a snapshot. InvalidBotRevision contains raw/diagnostics. Tests cover corrupt stored rows/revisions, invalid ids and cross-scope duplicate image ids (`sqlite-bot-repository.spec.ts:491`). Trigger-failure expectations now assert the mapped invalid error.
5. **Deletion CAS result (review #6).** `sqlite-bot-repository.ts:261` checks the tombstone UPDATE changed exactly one row, otherwise conflicts and rolls back selected purges. A real SQLite RAISE(IGNORE) trigger proves this path (`sqlite-bot-repository.spec.ts:543`).
6. **Accurate contention-test name (review #8).** Renamed at `sqlite-bot-repository.spec.ts:431` to “blocks a second writer while a writer lock is held, then conflicts on a stale revision.” The comment at `:445` states this test uses a 20 ms busy_timeout, while production uses 5000 ms. Disk reopen assertions remain in the test; it does not claim concurrent interleaving.
7. **Missing regressions (review #9).** `sqlite-bot-repository.spec.ts:460` tests cross-scope update denial, stale delete revision, second deletion and non-null expectedRevision on insertion. `:476` tests reverting to an older avatar already owned by the same bot and verifies both historical assets retain ownership.
8. **Formatting.** Ran `npx prettier --write` on all six authorized B04 files. `npx prettier --check` passes on the same six paths. All files remain below 700 lines (implementation 480; spec 555). Changes to token/registration/index in this round are formatting only.
9. **Port contract clarifications (reviews #1/#7).** `bot-repository.ts:52` documents exact workspace_root equality and requires callers to pass stored/open-folder spelling, including case and separators. `:53` states the 20 MiB quota applies to staged images only; immutable-history claimed images are retained outside that quota. No new scope canonicalization or claimed-image limit was introduced.

### Revision 1 decisions

- Normal readers hide deleted bots, rather than exposing a new deleted marker. Retained history is verified through SQL in tests; an authorized history-read feature remains outside scope. Evidence: plan and review requirement. Reversible through an explicit future API.
- Malformed revision rows return an explicit InvalidBotRevision union member carrying raw/diagnostics rather than silently skipping the row. Evidence: review asks to skip or flag while preserving the rest of the result. This is a public port type refinement callers must narrow; raw persisted bytes remain unchanged. Reversible with an application adapter.
- Missing/expired avatar ids return not-found; known foreign scope or owner returns scope-denied. Duplicate staging ids deliberately return only generic invalid. Evidence: numbered findings 2/4. Error messages contain no scope or raw SQLite details.

### Revision 1 checks

```text
npx prettier --write libs/backend/persistence-sqlite/src/lib/bots/bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts libs/backend/persistence-sqlite/src/lib/di/tokens.ts libs/backend/persistence-sqlite/src/lib/di/register.ts libs/backend/persistence-sqlite/src/index.ts
exit_code: 0

npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json
exit_code: 0 (no output)

npx eslint libs/backend/persistence-sqlite/src/lib/bots/bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts libs/backend/persistence-sqlite/src/lib/di/tokens.ts libs/backend/persistence-sqlite/src/lib/di/register.ts libs/backend/persistence-sqlite/src/index.ts
exit_code: 0 (no output)

npx prettier --check libs/backend/persistence-sqlite/src/lib/bots/bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts libs/backend/persistence-sqlite/src/lib/di/tokens.ts libs/backend/persistence-sqlite/src/lib/di/register.ts libs/backend/persistence-sqlite/src/index.ts
Checking formatting...
All matched files use Prettier code style!
exit_code: 0

npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
Time:        14.761 s
exit_code: 0

ptah_get_diagnostics (all six B04 files, after final edits)
Source: typescript-compiler
Errors: 0 | Warnings: 0 — No issues found.
Coverage: clean
Shown 0 of 0 (0 in requested files, 0 in sibling files omitted)
```

The first Jest/diagnostics run caught a formatting-induced placement error: Prettier moved the invalid-media argument away from its @ts-expect-error comment. The comment was moved directly to the argument, formatting was rerun, and final Jest/diagnostics checks above passed. No unresolved finding remains. No git writes, nx, npm verify, host builds, or edits outside the six B04 files and this authorized report append were performed.
