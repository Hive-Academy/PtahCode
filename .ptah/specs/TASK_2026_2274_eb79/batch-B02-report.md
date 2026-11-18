# Batch B02 report - migration 0076 bots

## Changed files

- `libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.ts` (new)
- `libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.spec.ts` (new, 9 tests)
- `libs/backend/persistence-sqlite/src/lib/migrations/index.ts` (import and version-76 entry)

Number 76 was free: the last registry entry was 75 `0075_phase_grade_keys`.

## Schema

- `bots`: `id` PK (length 36), `schema_version` >0, `revision` >0, `definition_json` (NULL only for tombstone), `scope_kind` user|workspace, `workspace_root`, `name`, `enabled` 0|1, timestamps, `archived_at`, `deleted_at`, `retain_memory`, `retain_history`.
- `bots` CHECK: user scope has no root, workspace scope has a nonempty root.
- `bots` CHECK: live row has definition, name and no retention. Tombstone has no definition, `enabled`=0 and both retention values.
- `bots` CHECK: an archived live row is disabled.
- Index `idx_bots_scope_list` on (scope_kind, workspace_root, archived_at, deleted_at, name, id).
- `bot_revisions`: PK (bot_id, revision), revision >0, `schema_version`, `definition_json` NOT NULL, `created_at`. FK to `bots` with ON DELETE/UPDATE RESTRICT.
- `bot_avatar_images`: `image_id` PK (length 36), `media_type` png|jpeg|webp, `bytes` BLOB 1..2097152, scope and root (same shape check as `bots`), nullable `owner_bot_id` FK (RESTRICT), `created_at`, `expires_at`.
- `bot_avatar_images` CHECK: staged image has no owner and an expiry. Claimed image has one owner and no expiry.
- Index `idx_bot_avatar_images_staging` (scope_kind, workspace_root, expires_at) WHERE owner is NULL.
- Index `idx_bot_avatar_images_owner` (owner_bot_id) WHERE owner is not NULL.

## Checks

- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json`: first run failed with `libs/shared/src/index.ts(19,15): TS2307 ... rpc-bots.types` (the B01 lane was mid-edit). The rerun printed no error.
- `npx eslint` (three files): no errors. Only the "No cached ProjectGraph" boundary-rule warning appeared.
- `npx jest ... 0076_bots.spec.ts`: `Tests: 9 passed, 9 total`, `Test Suites: 1 passed, 1 total`.
- `npx prettier --check` on `0076_bots.ts` and `0076_bots.spec.ts`: "All matched files use Prettier code style!".
- `npx prettier --check` on `index.ts`: warns, because the Windows working copy has CRLF endings (`i/lf w/crlf`). The HEAD blob passes. I kept the existing line endings.

## Extra reads

- `libs/backend/persistence-sqlite/src/lib/migration-runner.ts` (transaction behavior, lines 230-330).
- `libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.ts` (CHECK style).
- `libs/backend/persistence-sqlite/src/lib/migrations/0075_phase_grade_keys.spec.ts` (spec pattern).

## Decisions

- Runtime and avatar live only inside `definition_json`. The plan lists no runtime or avatar columns on `bots`. Zod validates them in B04. Options: extra columns. Reversible: yes.
- The migration spec checks "no statement starting with DELETE/UPDATE/INSERT/DROP". The 0075 pattern matched `ON DELETE` here.
- Rollback test uses `BEGIN IMMEDIATE` / `ROLLBACK` around the SQL, the same pattern the runner uses.
- Added the CHECK "archived live row is disabled". It follows "Archive disables" in the plan.
- The 24 older specs that assert version 75 were not edited and not run (B02a-d own them).

## Clarifications Needed

None.

## Coordinator changes after review

- Review `batch-B02-review.md` (codex, REVISE, 2 Minor). Corrected by the coordinator: `NOT NULL`
  on both text primary keys, and `typeof(bytes) = 'blob'` in the image size check. Two rejection
  rows were added to the spec. They fail on the old schema (2 failed) and pass now (9 passed).
- Batches B02a-d done by the coordinator: 26 highest-version assertions changed from 75 to 76.
  The plan inventory listed 24. Two more (`0044_memory_lifecycle.spec.ts`,
  `0046_memory_merge_subject_index.spec.ts`) were split over two lines and were found by the gate.
- Gate: `npm run verify -- -p persistence-sqlite` gave "2 tasks: 2 succeeded" and
  "1 task: 1 succeeded".
