# B07 review - import, retention and upgrade fixtures

**Verdict: APPROVED.** **Score: 9/10.**

Review family: claude (coordinator, in-process) for the codex specs. The coordinator fix in
`bot-import-preview.service.ts:64-67` was reviewed by codex: `batch-B07-fix-review.md`
(APPROVED, 10/10).

## Findings

1. Fixed: the deduplication key depended on property order (lane defect 1). The regression test
   is now active.
2. Info: `bot-retention.spec.ts:66` uses `transaction: (fn) => fn` as the fake transaction, and
   the SQLite adapter runs on `node:sqlite`. This is acceptable for the fixtures. The rollback
   test in `bot-schema-upgrades.spec.ts` uses a real SQLite ABORT trigger.

## Checks

- The four retention choices each have three revision snapshots. Tombstones are hidden from
  `get`, `list` and `revisions`, and `get` with a revision after delete gives `BOT_NOT_FOUND`.
  Active work and unsupported ownership are refused before any deletion.
- A changed-case Windows root returns nothing from the repository. The application authorizer
  gives the stored spelling.
- Coordinator: the three specs pass (3 suites, 32 tests).
  `npm run verify -- -t lint,typecheck -p bots` (2 tasks succeeded) and
  `npm run verify -- --related -p bots` (1 task succeeded).
