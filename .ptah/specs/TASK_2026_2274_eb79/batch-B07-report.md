# Batch B07 — import, retention and upgrade fixtures

Status: lane checks pass; one confirmed production defect is recorded as TODO. Production code was not modified.

## Files and test count

- `libs/backend/bots/src/lib/bot-import-preview.service.spec.ts`: 14 passing cases, 1 TODO.
- `libs/backend/bots/src/lib/bot-retention.spec.ts`: 10 passing cases.
- `libs/backend/bots/src/lib/bot-schema-upgrades.spec.ts`: 7 passing cases.
- This report: `.ptah/specs/TASK_2026_2274_eb79/batch-B07-report.md` (skeleton written before specs).

Total: 3 suites passed, 31 tests passed, 1 TODO, 32 cases total. No production files or other specs were written. No git commands were run.

## Acceptance mapping

| Acceptance / carry-forward                                | Test names and evidence                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Preview performs no source writes; repeated previews      | `repeated preview preserves source bytes, stable tuples and fingerprints; changed content is detectable`: real temporary source file, exact bytes compared after repeated success and after an explicit source edit. `preserves malformed source bytes on reader failure`: exact malformed bytes unchanged after rejection. Preview receives only read/catalog/authorization ports.        |
| Deduplication                                             | `deduplicates an identical container identity and marks it ambiguous`: one item and SOURCE_AMBIGUOUS. Property-order variant is a confirmed defect/TODO below.                                                                                                                                                                                                                             |
| Container collisions                                      | `keeps the same item id distinct across source locations`; `namespaces proposal identities by workspace and session and rejects foreign containers`: different profile locations remain distinct; foreign workspace/session/preset identities are invalid, not silently merged.                                                                                                            |
| Stable tuples, fingerprints and source-change comparison  | `repeated preview preserves source bytes, stable tuples and fingerprints; changed content is detectable`: repeat gives identical result; rename/instructions edit keeps tuple and changes fingerprint. Fixture reader supplies SHA-256 through the source port; actual B05 adapter hashing is outside this lane. Property-order stability remains unmet (TODO).                            |
| Exact role/instructions and mode/triggers retained        | `retains exact role/instructions and inactive %s mode/triggers` (background, on-demand, scheduled): exact original strings and combined instructions, inactive mode/trigger diagnostic JSON, unresolved tool warning, symbolic runtime, empty active triggers and executionAvailable=false.                                                                                                |
| Malformed imports                                         | `rejects malformed or mismatched legacy content without mutation: %j` (five cases: absent instructions, unknown mode, malformed tools, unsupported schema field, mismatched id); malformed JSON reader failure preserves bytes.                                                                                                                                                            |
| Four retention choices, three full snapshots each         | `deletes with %j while retaining every selected revision and hiding tombstones` (keep/keep, keep/purge, purge/keep, purge/purge): three parsed complete snapshots before deletion; direct SQL compares every selected retained JSON byte or confirms all revision rows removed; conditional tombstone name and retention flags; unrelated bot and its snapshot unchanged.                  |
| Active-work refusal                                       | `refuses active work with history=%s before any deletion` (keep and purge): three snapshots preserved, current SQL row unchanged, repository delete never invoked.                                                                                                                                                                                                                         |
| Phase-1 retention limits                                  | `refuses unsupported external ownership %j without changing snapshots`: nonempty external memory, nonempty external history, unsupported participant. Supported empty participant is inspected in all four retention cases; memory removal count remains zero.                                                                                                                             |
| Upgrade failure preserves bytes/snapshots                 | `refuses unsupported schema version %s preserving exact current bytes and all three snapshots` (0 and 99); `preserves malformed historical bytes and current snapshot on failed historical upgrade`; `rolls back current bytes and snapshots when a V1-to-V2 snapshot insert fails` (real SQLite ABORT trigger); `pure upgrade preserves the V1 input and rejects invalid legacy runtime`. |
| (a) V1 storage must upgrade before V2-only bots:get reply | `upgrades a stored V1 current record before a V2-only bots:get reply and preserves explicit runtime`; `upgrades an immutable V1 historical snapshot for the V2 wire contract without rewriting history`: real V1 rows/snapshots, validate reply through BotsGetResultSchema, preserve historical bytes and explicit provider/model/effort.                                                 |
| (b) Changed-case Windows root                             | `compares Windows repository roots exactly and authorizes changed-case application input`: changed-case direct repository list/get/revisions misses; authorized application get uses open-root spelling. `canonicalizes changed-case Windows proposal and target roots before reading`: reader receives canonical spelling.                                                                |
| (c) Revision union narrowing                              | Both SQLite fixtures use `if (!('definitionJson' in row))` before accessing JSON; invalid fixture revisions throw explicitly.                                                                                                                                                                                                                                                              |
| (d) Hidden tombstones                                     | Every retention combination asserts repository get=null, revisions=[], list contains only unrelated bot; application current and historical get both refuse BOT_NOT_FOUND, even when SQL history is retained.                                                                                                                                                                              |

## Check results

All commands were scoped to the requested lane; no nx, npm run verify, build, serve, dev, e2e or package targets were run. One heavy check ran at a time.

1. `npx eslint libs/backend/bots/src/lib/bot-import-preview.service.spec.ts libs/backend/bots/src/lib/bot-retention.spec.ts libs/backend/bots/src/lib/bot-schema-upgrades.spec.ts` — PASS, exit 0, no diagnostics.
2. `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-import-preview.service.spec.ts libs/backend/bots/src/lib/bot-retention.spec.ts libs/backend/bots/src/lib/bot-schema-upgrades.spec.ts` — PASS, exit 0; 3 suites, 31 passed, 1 TODO (32 total).
3. `npx tsc --noEmit --project libs/backend/bots/tsconfig.spec.json` — PASS, exit 0, no diagnostics.

Initial verification corrected fixture-only problems: cross-project relative migration import (replaced with public MIGRATIONS registry), optional migration SQL narrowing, and assertion ordering. The property-order regression was executed and failed with two valid items instead of one ambiguous item; only that confirmed production case was converted to TODO. Prettier formatted only the three requested specs.

## Decisions

- Read B07, the retention matrix/decision 6, audit N1-N7, and B06 report/review. Apply the review's corrected in-memory read upgrade behavior; immutable V1 snapshots remain V1 on disk while replies are V2. No read-time migration writes are required.
- Synthetic preset/proposal fixtures use audited legacy agent fields, not settings-derived definitions or recovered customer data. N1-N7 negative searches are bounded historical audit findings, not claims that those features never exist. N3 settings exclusion, N4 renderer rehydration, N5 host registration and N7 RPC activation remain their owning lanes' responsibilities.
- Retention uses real in-memory node:sqlite, the public migration 76 registry entry and the concrete B04 repository, matching its existing fixture approach. No fake production tables or external memory/run purge operations were invented. Phase 1 supports explicit empty external ownership and refuses nonempty/unsupported ownership; future participant purge semantics cannot be demonstrated here.
- Source fingerprint generation in the fixture establishes pass-through/comparison behavior of the preview port. Actual source-reader adapter integration and import commit are outside the authorized write set; phase 1 has no import commit.
- Host-neutral tests import no Electron/renderer/CLI adapter and spawn no provider process. They exercise backend behavior shared by the Electron priority host and CLI; no host boot or UI checks were requested.
- CLI skill loading/catalog discovery was unavailable: no skills catalogue or skill-load tool was exposed. No skill is claimed loaded. Ptah AST inspection was available and used for application structure; native PowerShell/rg reads were used for exact plan/spec/source content, and native tools wrote files and ran the specified checks.
- Called `ptah_agent_report` exactly once with the confirmed defect. Tool returned Delivered: No, reason `parent-inbox-full`; did not retry. This deliverable carries the finding for parent review.

## Defects found

1. **Stable source identity depends on object property insertion order** — `libs/backend/bots/src/lib/bot-import-preview.service.ts:64` uses `JSON.stringify(item.source)` as the deduplication key. Two source objects with the same kind/presetId/sourceLocationId/itemId but different property insertion order produce two valid preview items instead of one ambiguous item. This violates stable tuple deduplication at the typed source-reader boundary. Reproduced by executable Jest: expected length 1, received 2. Production code left unchanged.
   - TODO: `deduplicates a stable source tuple regardless of object property order` in `bot-import-preview.service.spec.ts`, with the exact fixture reproduction in its adjacent comment.
   - Remaining requirement: semantic tuple deduplication independent of property order. Coordinator/production owner must resolve it before enabling the TODO. The current concrete adapter may construct fields consistently, but the application port does not require that insertion order.

## Coordinator fix (defect 1)

- `libs/backend/bots/src/lib/bot-import-preview.service.ts:64-67` now keys deduplication on the
  sorted entries of the flat `BotSourceRef`, so property order cannot split one source identity.
- The TODO is now the active test `deduplicates a stable source tuple regardless of object
property order`. The three specs pass: 3 suites, 32 tests.
- The report file was converted from Windows-1252 to UTF-8.
