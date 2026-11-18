Verdict: REVISE
Review family: codex (implementer: claude)

## Defects

1. **Minor — avatar storage does not enforce its BLOB type or byte limit.** `libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.ts:55`. Requirement: implementation-plan.md:83 and :105 require a BLOB bounded to 2 MiB; :290 calls for authoritative schema constraints and tests. This is an ordinary, non-STRICT SQLite table: BLOB affinity accepts TEXT, and `length(TEXT)` counts characters. A direct parameterized insertion of `String.fromCodePoint(0x1f600).repeat(2097152)` succeeds; SQL reports `typeof(bytes)='text'`, `length(bytes)=2097152`, and `length(CAST(bytes AS BLOB))=8388608`. The declared storage guard therefore accepts the wrong type and four times the byte budget. The spec tests only Uint8Array inputs (`0076_bots.spec.ts:281`), so it misses this. Smallest correction: include `typeof(bytes) = 'blob'` in the existing CHECK and add TEXT/numeric rejection tests alongside the current BLOB boundary tests. This is a verified database invariant gap; no RPC validation bypass is claimed.

2. **Minor — bot and image primary keys accept repeated NULL identities.** `libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.ts:13` and :53. Requirement: implementation-plan.md:77 and :81-83 specify UUID primary-key identities; :105 requires an opaque UUID image key. In these ordinary rowid tables, `TEXT PRIMARY KEY` does not imply NOT NULL, and `CHECK(length(NULL)=36)` does not reject NULL. Inserting two otherwise valid bots with `id=NULL` succeeds; the same experiment succeeds twice for staged images with `image_id=NULL`. These rows lack a usable UUID identity and evade the intended primary-key identity guarantee. The spec checks a short bot id at `0076_bots.spec.ts:217`, but neither NULL key. Smallest correction: explicitly add NOT NULL to both primary-key columns and assert that NULL inserts fail. UUID syntax validation can remain in the application as planned.

## Checked and correct

- Read the complete migration and its 323-line spec, the migration runner, context, relevant plan sections and retention rules, implementer report, and migrations 0072/0075. Inspected only the registry diff, as requested: one import and one final version-76 entry (`migrations/index.ts:104`, :514).
- Confirmed with git diff and a per-file comparison that all **24 older specs** contain exactly one replacement, `toBe(75)` -> `toBe(76)`, and no other changed line. Their tests were not rerun.
- The list index has exactly the planned six columns (`0076_bots.ts:40`). User/workspace root checks, boolean checks, staged-versus-owned shape, supported MIME values, nonempty BLOBs and the inclusive 2 MiB BLOB boundary are exercised by real SQL constraint tests (`0076_bots.spec.ts:160`, :188, :271).
- Direct in-memory SQL probes accepted archive with enabled=0 and restore remaining disabled (`0076_bots.ts:37`). Probed all four retention combinations after inserting three full revision rows and one claimed image: keep-history retained all three snapshots and the image; purge-history removed owned snapshots/image before tombstoning; both memory choices persisted independently (`0076_bots.ts:25`, :31, :44, :58). Memory participants themselves are outside B02.
- RESTRICT does not block the required hard-delete path: that path updates the parent to a tombstone rather than deleting it. Claimed images can remain for kept history or be explicitly deleted for purged history. Archived records and retained-revision tombstones are accepted. No required state was found to be rejected.
- Current revision/schema and full snapshot JSON have the planned storage columns (`0076_bots.ts:14`, :43). Runtime, optional avatar and generated origin fit within definition_json without additional SQL columns (plan :87-113). Application validation, CAS, immutable-write discipline, conditional tombstone naming and cross-bot asset authorization remain repository/application obligations; B02 does not implement those services.
- Focused command passed: `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.spec.ts` — **9/9 tests**. Scoped Ptah diagnostics reported **0 errors, 0 warnings**.
- Tests execute real SQL against a prior schema with an existing skill_task_grades row and check its survival (`0076_bots.spec.ts:144`). They also verify empty-database creation, duplicates, invalid constraints, FK restrictions and transactional DDL rollback. The runner applies SQL plus bookkeeping/user_version in BEGIN IMMEDIATE and rolls back on failure (`migration-runner.ts:308`, :328).

## Five logic questions

1. **Silent failure:** the two defects above accept invalid storage values without an SQL error; the existing 9 tests remain green.
2. **Unexpected user action:** no failing normal archive/delete action was demonstrated. Direct probes verified the valid transitions; no user-facing exploit is inferred from direct SQL acceptance.
3. **Wrong input/result:** NULL keys produce unaddressable identities, and TEXT in bytes defeats its type/size guard, as reproduced above.
4. **Dependency failure:** SQL exceptions are rolled back and rethrown by the runner (`migration-runner.ts:328`). The new rollback test checks DDL rollback, not injected runner/bookkeeping failure (`0076_bots.spec.ts:308`). No Electron/better-sqlite3 execution was performed: the focused spec and probes use node:sqlite.
5. **Unspecified cases:** no further scope decision is needed for B02. Repository-level authorization, quotas, snapshot immutability and retention participants require their later planned batches; they are not established by this migration review.

## Decisions

- Reviewed retention as tombstoning, not physical deletion of bots: plan :119 and :128 explicitly select this mechanism. Physical DELETE is an alternative rejected by that evidence; changing the mechanism later requires a migration/design decision. The existing RESTRICT clauses need no correction for that path.
- Skill discovery/loading is unavailable in this CLI lane: no host skill catalogue or skill-loading tool was exposed. Ptah workspace/AST/diagnostic tools were available and used. `ptah_search_files` returned zero task/instruction hits, so native reads/search supplied those documents. No source files were edited.
