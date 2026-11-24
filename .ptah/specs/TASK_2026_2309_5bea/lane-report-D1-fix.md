# D1 task digest repair

Source paths below are relative to the worktree. Digest files are in
`libs/backend/task-specs/src/lib/task-digest/`. RPC files are in
`libs/backend/rpc-handlers/src/lib/handlers/`.

## 1. Progress regex performance

- `task-digest-rules.ts:219` restricts progress-marker spacing to spaces and tabs and prevents batch headings from spanning ECMAScript line separators. The audit replaced cross-line-capable spacing in review, decision and open-question rules at lines 191, 210 and 254. Fence matching at line 23 now consumes only the delimiter, and report-name matching at lines 24–25 checks candidate tags within the trailing filename run without matching the whole suffix on every candidate.
- Regression cases in `task-digest-rules.spec.ts:211` and `:231` check split checkbox/status markers and measure 65,536 newlines and 65,536 spaces separately for each of progress, decisions, open questions and review. The case “scans a long fence followed by an embedded Unicode line separator in under 200 ms” at line 243 covers overlapping fence matches.

## 2. Review severity counts

- `task-digest-rules.ts:157` tracks severity section depth, counts child headings as findings and suppresses their detail bullets. Explicit nested severity sections support Markdown closing hashes, end at peer or ancestor headings and restore the enclosing severity. Table rows outside summary sections contribute only when the first cell is an exact severity tag, including a bold or bracketed tag.
- The case “counts heading findings and exact table tags without counting summary rows or finding details” at `task-digest-rules.spec.ts:105` uses `__fixtures__/standard-review.md`. Its hand count is two serious headings, one moderate heading and one minor table finding following a heading-based finding. “Counts each finding once across item and heading grammars” at line 133 also covers returning to the enclosing severity.
- The three real fixture pins still match their hand counts. `design-spec-v3-review.md` has serious item 1 and moderate item 8. `implementation-plan-review.md` has serious item 1 and moderate item 7. `implementation-plan-task-digest-review.md` has serious item 1, moderate item 3 and minor item 7.

## 3. Truncation for unavailable sources

- `task-digest.service.ts:273` adds `reads` for failed inspection or reads of the selected progress source, decisions and reviews, and keeps the same reason for read-limit skips. Capped prefixes continue to add `bytes` at line 300. The existing set deduplicates reasons. Progress and decisions have first priority in the read order, so the current read limit can skip reviews while both priority sources fit within the budget.
- Regression cases “marks an unreadable or capped %s even when %s cannot be extracted,” “marks listed progress and review documents that could not be inspected” and “marks reviews skipped by the read limit even when no source reaches the byte cap” start at `task-digest.service.spec.ts:288`, `:310` and `:330`. The first also verifies that absent sources leave the digest unmarked.

## 4. Invalid carrier handling

- `task-digest.service.ts:173` rejects invalid carriers with an internal `INVALID_TASK_CARRIER` code before any fragment can be cached. The existing missing-folder and missing-carrier paths return `null` at lines 190, 194 and 236. `tasks-rpc.handlers.ts:686` maps the code to the fixed message “Invalid task carrier.” through the existing sanitizer.
- The cases “returns null for an absent task folder or carrier and retries an invalid carrier without memoizing it” at `task-digest.service.spec.ts:268` and “reports an invalid carrier as a sanitized failure and an absent carrier as null” at `tasks-rpc.handlers.spec.ts:407` verify both outcomes. The service test checks that a second invalid read reaches the filesystem and that a repaired carrier loads.
- The renderer receives the existing failed RPC response with the fixed message. The code stays internal because `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts:117` has no invalid-carrier or generic read-failure code, and `libs/backend/vscode-core/src/messaging/rpc-handler.ts:248` serializes a code only for `RpcUserError`. A dedicated wire `errorCode` would require a change to that union. Its `TASK_NOT_FOUND` code describes a different condition.

## Checks

- Task digest rules and service Jest specs passed, 94 tests. All eight whitespace-only runs and the long-fence run met the 200 ms threshold.
- Tasks RPC handler and views durability Jest specs passed, 282 tests.
- `npx tsc --noEmit --project` passed for both `task-specs` and `rpc-handlers` library configs.
- ESLint passed for all six changed TypeScript files with zero errors and the existing `max-lines` warning in `tasks-rpc.handlers.ts:1096`.
- `git diff --check` passed for the changed backend paths.
- Ptah dependency analysis returned an index still building. A scoped `rg` search identified the digest RPC caller and task-specs registration and export.

## Independent review

Ptah review lanes could not start or return a verdict. Direct, read-only Codex sessions supplied independent same-family review. The primary reviewer found two regressions in the initial revision. Explicit nested severity headings now have their own scope, and exact table severity tags count after heading-based findings. The reviewer found no further issues with truncation or sanitized RPC failures. Follow-up findings covered exact severity labels in summary tables and Markdown closing hashes in severity headings. The final re-review approved the corrections for all four review-counting findings.

The implementation read the input review’s Findings section. The first direct reviewer opened the full input review while reviewing defects 1–4. The follow-up reviewers received the concrete findings without a task-report reference.
