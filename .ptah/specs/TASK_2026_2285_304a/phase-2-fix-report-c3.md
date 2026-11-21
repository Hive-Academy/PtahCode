# Phase 2 bounded correction, lane C (TASK_2026_2285_304a)

Source: `phase-2-code-review-3.md` ("Serious 4 — not resolved", "New defects" 1 and 2) and decision 42.
Scope: the Undo guard of the "Claude Code tools & skills" card. No render was done.

Files changed (2):

- `libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts` (CMP)
- `libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.spec.ts` (SPEC)

`feedback/settings-save-feedback.service.ts` and its spec did not change: item (c) did not need them.

## (a) Fail closed

- CMP:577-590 `undoRefused()`: the Undo sends a write only while `lastPolicy` is `verified`. If not, it reads
  again. After the read, each state other than `verified` refuses the Undo with
  `CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED` and `keepUndo: true`. A timeout, a thrown error, an answer with no
  data and an `unverified` answer all refuse. The old rule ("a read with no answer does not refuse") is gone.
- CMP:133-135: comment of the message constant. The text of the message did not change.
- New test, SPEC:1296-1309 (3 cases: the read times out, throws, has no data):
  `after an unverified recovery read, an Undo whose verification read %s sends no write and stays offered`.
- Changed test, SPEC:1100 (2 cases): `stops when the recovery read fails too (%s) ...`. It expected a write
  after a failed read. It now expects a refusal, then a write after a verified read.

## (b) Only the newest read counts

- CMP:593-606 `refresh()`: `lastPolicy` is now written at line 599, inside the `sequence === this.readSequence`
  check. A read that a newer read or write answer replaced does not write `lastPolicy`.
- CMP:890-899 `read()`: it no longer writes `lastPolicy`.
- CMP:419-422: comment of `lastPolicy`.
- `undoRefused()` reads `lastPolicy` after its read, not the data of its own read. A replaced answer thus
  cannot authorize the Undo.
- New test, SPEC:1311-1346:
  `a verified read of the Undo that a newer unverified Retry replaced does not authorize the Undo`.
- Changed test, SPEC:1427: `Undo, then Retry: the replaced read of the Undo sends no write, a new read ends the
  loading state, and Undo stays`. It expected a write from the replaced read. It now expects a refusal, then a
  write from the Undo that is offered again.

## (c) The Undo writes only the remaining IDs

- CMP:686-687 and CMP:695-711 `toggleGroup()`: `saved` is the set of rows that saved and that no Undo restored
  yet. The Undo writes that set. Each ID leaves the set when its restore is confirmed.
- CMP:788-815 `saveItems()`: new optional parameter `confirmed(id)`. It runs at line 806 for each confirmed
  write, also if a later write throws. The call of the first write does not use it.
- The count in the messages of the Undo is the count of that run of the Undo.
- New test, SPEC:1348-1374:
  `an Undo that is offered again after a partial restore writes only the row that was not restored`.

## Checks

Run from the worktree root. Logs: `.ptah/tmp/lane-c3-{jest,tsc,eslint}.log`.

| Command | Exit code | Result |
| --- | --- | --- |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <CMP spec> <feedback service spec>` | 0 | 2 suites, 115 tests passed |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 | no errors |
| `npx eslint <CMP> <SPEC>` | 0 | 0 errors, 1 `max-lines` warning (CMP has 722 counted lines, limit 700; it had 721 before) |

ESLint skipped `@nx/enforce-module-boundaries`: no cached project graph was available.

## Not done

- No render and no screenshot: the correction changes no template.
- The `max-lines` warning of CMP stays. A split of the file is outside this correction.

## Decisions

1. One message for each refusal. `CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED` ("Could not verify this workspace's
   capability policy, so nothing was undone. Try Undo again.") is correct for a timeout, a missing answer, an
   `unverified` answer and a replaced answer. No new constant.
2. A replaced verification read refuses the Undo. It does not wait for the newer read. The user selects Undo
   again. If the newer read was verified, that second Undo writes with no new read.
3. The guard is common to the Undo of a group and the Undo of one row. Both now fail closed.
4. The fast path stays: with `lastPolicy === 'verified'`, the Undo sends no verification read. `lastPolicy` now
   comes from the newest read only, so this path is safe against the sequence of defect 1.
5. Two older tests held the old rule as correct behaviour (SPEC:1100, SPEC:1427). I changed them to the rule
   of decision 42.
