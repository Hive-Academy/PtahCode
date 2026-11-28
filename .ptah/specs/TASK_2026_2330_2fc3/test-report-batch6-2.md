# Test report: Batch 6, Task 6.2

## Scope

The two workflow store specs now use an in-memory `SetupRunStore` fake. No source file changed.
`task-description.md` is absent. The cases came from the Task 6.2 handoff, `batches.md` Batch 6,
and `implementation-plan.md` component 2.

## Cases changed

### `generation-workflow.store.spec.ts`

The suite has 43 passing cases. The previous suite had 40 cases.

Added 9 cases:

- Retry an interrupted record through `runs.retry`.
- Attach the owner record returned by retry.
- Mark `invalid-binding` and `workspace-mismatch` records failed, with the required error copy (2 cases).
- Cover `regenerateGuidance` with no record, a failed record, and a completed record (3 cases).
- Adopt an unknown accepted record and report its placeholder.
- Report a verified lookup to its record.

Removed 6 cases:

- The `resumeBoundAgents` and `resumeCheckpoint` cases (2). Retry cases replace them.
- The chat-busy, VS Code active-tab, and cross-workspace tab cases (3).
- The regenerate-specific Setup model copy case (1). The initial-start copy case remains.

Changed cases:

- The three Stop cases now assert `runs.cancel('tab')`. They also check the record's
  `backendRunId`, and assert that the old RPC cancel path is not called. The unconfirmed case uses
  `cancel => false`.
- The blocked-owner case now asserts attachment to `other-tab`, a cleared rejection, and no cancel.
- The explicit start-failure table uses `retry` in place of `resume`.
- All cases use the `SetupRunStore` fake instead of `TabManagerService` and `QueuedFollowUpStore`.

### `guidance-generation.store.spec.ts`

The suite has 10 passing cases. The previous suite had 8 cases.

Added 2 cases:

- `applyRun` reports the verified run to its Setup record.
- `bindRecord` binds the project-guidance record and reports the loaded run.

The fake `SetupRunStore` provider now supports all existing cases.

## Check results

| Check | Result | Log |
| --- | --- | --- |
| Focused Jest, four specs | PASS: 4 suites, 160 tests, 0 failed | `.ptah/tmp/test-batch6-2-jest.log` |
| `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json` | PASS: exit 0 | `.ptah/tmp/test-batch6-2-tsc.log` |
| `npx eslint` on the two rewritten specs | PASS: exit 0 | `.ptah/tmp/test-batch6-2-eslint.log` |
| `git diff --check` on the two rewritten specs | PASS | Not logged |

The Jest total includes 43 generation workflow cases, 10 guidance generation cases, and 107 cases
from the adapter and SetupRunStore suites.

The additional Ptah diagnostic pass reported no errors in the two changed specs. It reported eight
BigInt target errors in the unmodified sibling files `capability-id-codec.ts`,
`attention-identity.ts`, and `pairing-code.ts`. The requested project `tsc` check passed.

## Source defects

No new source defect was found in the Task 6.2 paths. All focused tests passed without a source
change. The existing Task 6.1 review findings were not retested or changed by this task.

## Decisions

- **Use an in-memory fake instead of the real SetupRunStore.** The alternative was a real store
  with its persistence, RPC, runner, and tab dependencies. The handoff specifies a fake, and the
  workflow stores are the units under test. This is reversible inside the two specs.
- **Keep Setup model copy coverage on initial guidance start only.** Retry and rerun now belong to
  `SetupRunStore`, so the old direct `regenerateBoundGuidance` rejection path no longer exists.
  `generation-workflow.store.ts:198-207` keeps the initial-start copy path. This is reversible if
  the retry error contract changes.
- **Leave `batches.md` unchanged.** The current write set allows only the two specs and this
  report. The team leader owns the batch carrier state.
