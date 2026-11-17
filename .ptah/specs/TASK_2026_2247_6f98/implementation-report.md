# P5 PR 4 implementation report

## Design and changes

The writer trigger now enters the workspace watcher's pending batch. Each writer call holds a promise that settles after the batch rebuild. The existing 300 ms debounce and 1000 ms maximum wait apply to writes and watcher events alike.

- `libs/backend/task-specs/src/lib/task-index.service.ts:103`: add writer folder and waiter collections to `WorkspaceState`; initialize them at line 235.
- `libs/backend/task-specs/src/lib/task-index.service.ts:365`: `applyFolderChange` joins the pending batch after startup, or uses the direct write rebuild when no state exists. Its promise resolves after rebuilding and rejects with the rebuild error.
- `libs/backend/task-specs/src/lib/task-index.service.ts:619`: `dispose` drains pending writer folders through a direct write rebuild and settles their waiters before disposing the rebuild queue. The only state removal in this service is `states.clear()` here; `ensureStarted` does not replace an existing state. A flush whose timer fires after removal returns without stranded waiters because disposal already took them.
- `libs/backend/task-specs/src/lib/task-index.service.ts:718`: `flush` takes the current writer folders and waiters with the pending folder snapshot. Writer folders bypass equal fingerprint echo suppression. It resolves waiters after the rebuild, rejects them on failure, and retains the existing folder retry. A mixed writer and watcher batch emits one change event with reason `write` and all changed folder names; a watcher-only batch emits `watcher`.
- `libs/backend/task-specs/src/lib/task-index.service.spec.ts:643`: add writer burst, unchanged fingerprint, rebuild failure, disposal, and no-state tests. The existing writer plus watcher echo test at line 732 now asserts the `write` reason. Existing overlap tests were timed to enter the first scan after the debounce.

## Tests

- `coalesces five writers and settles them after one rebuild`
- `rebuilds a writer folder even when its fingerprint is unchanged`
- `rejects a writer promise when its rebuild fails`
- `settles a pending writer when the watcher state is disposed`
- `runs a direct write rebuild when no watcher state exists`
- `commits and pushes once for a writer notification plus its watcher echo`

## Checks

- Focused Jest command: **69 passed, 69 total**.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.spec.json`: passed.
- `npx eslint` on both changed files: 0 errors; 2 pre-existing warnings (non-null assertion at spec line 111 and max-lines on source). Nx project graph cache warnings were also printed.
- Scoped Ptah diagnostics: 0 errors, 0 warnings.
- Final line counts: source **1017**, spec **1554**. Diff across the two code files: **154 insertions, 10 deletions**.

Skill discovery found installed skills, but this CLI exposed no skill loading mechanism; repository context and source were used directly.
