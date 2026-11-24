# Batch D1b — task digest backend and Electron registration

## Files changed

- `libs/backend/task-specs/src/lib/contained-task-folder.ts` and `contained-task-folder.spec.ts`
- `libs/backend/task-specs/src/lib/task-digest/task-digest.service.ts` and `task-digest.service.spec.ts`
- `libs/backend/task-specs/src/lib/task-index.service.ts`, `lib/di/tokens.ts`, `lib/di/register.ts`, and `src/index.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/tasks-rpc.handlers.ts`, `tasks-rpc.schema.ts`, `tasks-rpc.handlers.spec.ts`, and `tasks-rpc.views-durability.spec.ts`. These specs contained all eight direct constructor fixtures.
- `apps/ptah-electron/src/replay/scenario-sanitizer.ts`, `scenario-sanitizer.spec.ts`, and `src/di/expected-resolvable.ts`
- This report

## Exported signatures

The library entry point adds:

```ts
export { TaskDigestService } from './lib/task-digest/task-digest.service';
```

Service signatures:

```ts
constructor(@inject(TASK_SPECS_TOKENS.TASK_INDEX_SERVICE) private readonly index: TaskIndexService)
getDigest(workspaceRoot: string, taskId: string): Promise<TaskDigest | null>
```

New methods on `TaskIndexService`:

```ts
isTaskMerged(workspaceRoot: string, taskId: string): boolean
withEffectiveTaskStatus(task: TaskSpecSummary, merged: boolean): TaskSpecSummary
openContainedTask(workspaceRoot: string, taskId: string): Promise<ContainedTaskOpen>
```

Module-level guard declarations:

```ts
type FolderFailure = { state: 'rejected' | 'missing' | 'unreadable' };
export type ContainedTaskOpen = { state: 'ready'; folder: ContainedTaskFolder } | FolderFailure;
export type ContainedTaskList = { state: 'ready'; entries: DirectoryEntry[] } | FolderFailure;
export type ContainedTaskInspect =
  | { state: 'file'; size: number; mtime: number }
  | { state: 'directory' | 'other' }
  | FolderFailure;
export type ContainedTaskRead =
  | { state: 'ready' | 'capped'; content: string }
  | { state: 'binary'; capped: boolean }
  | { state: 'rejected' | 'missing' | 'unreadable' | 'directory' };
```

`ContainedTaskFolder` has a private constructor and these visible members:

```ts
readonly cacheKey: string,
readonly fragmentCacheKey: string,
static async open(fs: IFileSystemProvider, root: string, taskId: string): Promise<ContainedTaskOpen>
static validParts(parts: readonly string[], maxDepth: number): boolean
async list(parts: readonly string[], maxDepth: number): Promise<ContainedTaskList>
async inspect(name: string): Promise<ContainedTaskInspect>
async read(name: string, maxBytes: number): Promise<ContainedTaskRead>
```

DI token, appended `TasksRpcHandlers` constructor parameter, and RPC schema:

```ts
  TASK_DIGEST: Symbol.for('TaskSpecsDigest'),

    @inject(TASK_SPECS_TOKENS.TASK_DIGEST)
    private readonly digest: TaskDigestService,

export const TasksGetDigestParamsSchema = z.object({
  workspaceRoot,
  taskId: taskIdRef,
});
```

The handler consumes the D1a method contract as written:

```ts
  'tasks:getDigest': { params: TasksGetDigestParams; result: TasksGetDigestResult };
```

## Acceptance coverage

| Acceptance | Spec cases and evidence |
| --- | --- |
| Shared validation and distinct limits | `leaves depth and size policies to the legacy entry points and rejects depth five without I/O`; `lists markdown-named directories to depth two and visits parents before their sorted children`. |
| Every list charged, budgets enforced, breadth-first order and unvisited summaries truncated | The breadth-first case above, `charges empty, rejected, missing and unreadable lists and marks unvisited parents and children truncated`; `charges a rejected depth-two child against the breadth-first list budget`; `enumerates exactly 64 empty directories before stopping`; `counts a sorted directory prefix and schedules no list after the 1000-entry limit (%d)`. |
| Retry failures and reuse stable content | `retries transient reads with identical metadata and a successful warm digest reads zero bytes`; `revalidates metadata after a read and does not memoize an unstable fragment or digest`; `deduplicates an in-flight failure, retries after it, and returns null for a missing carrier`. |
| Canonical checks and opened-file identity | `rejects invalid task and child names and refuses directory and markdown symlinks`; `discards a listing if its directory changes during enumeration`; `discards bounded bytes when the canonical %s changes during read`; `propagates the no-follow provider identity rejection without exposing bytes or paths`. The identity fixture simulates a provider rejection. The Electron provider remains the implementation that checks the opened handle and both path and handle identity before returning bytes. |
| Nested freshness and watcher scope | `refreshes nested counts and merged status using cached top-level content and omits branch and PR` exercises nested-only changes, has no nested-file stat, and checks the overlay separately. The existing `skips an unchanged child and rebuilds after a same-size edit or deletion` covers top-level watcher deduplication. `fingerprintFolder` is unchanged and still only inspects top-level entries. |
| Manifest and surface compatibility | `owns exactly the 19 tasks:* methods`; `wires every method into the RpcHandler`; the all-method workspace authorization sweep; `keeps the task digest response and sanitizes workspace paths in its text`. `manifest.ts` is unchanged. Dedicated manifest and Electron surface suite results are listed below. |

The RPC specs also cover ready and null results, sanitized errors, and path traversal or unauthorized roots rejected before index or digest work. The digest specs pin 500/501 top-level entries, priority probes versus revalidation stats, cross-workspace cache isolation, 24 extraction reads, and 64 KiB boundaries including the last complete line.

## Decisions

- Call the contained digest directly after RPC authorization. Calling `index.ensureStarted` as in `tasks:get` can start a full workspace scan and write the specs README. The digest obtains the merged flag through `TaskIndexService` without warming the index, so a cold call stays per-folder and bounded. This is reversible within the handler.
- Store opaque folder hashes in the guard. The alternative was returning canonical paths to the digest. Separate hashes retain the plan's workspace-plus-folder digest key and folder-only fragment key while keeping canonical paths private. Cache representation is reversible.
- Use D1a's case-insensitive Markdown eligibility for legacy file opens as well as the digest. Keeping the old lowercase-only name check would advertise eligible uppercase files that the legacy open RPC then rejects. Existing typed states and the legacy size and depth limits are preserved. The policy choice is reversible at the legacy entry point.
- Extract complete lines from capped UTF-8 prefixes. An alternative was to let a partial line enter the rules. The former keeps headings, verdicts, and row counts from being inferred from incomplete lines. A split trailing UTF-8 code point is omitted, and malformed interior bytes remain a binary failure. This is reversible at the read/extraction boundary.

## Extra reads

- `task-index.service.spec.ts` fixture and existing read/list/watcher cases, which were named by the plan.
- `file-system-provider.interface.ts`, `platform.types.ts`, and Electron's `electron-file-system-provider.ts` scoped port, metadata and bounded-read snippets.
- `task-frontmatter.ts` parser entry point and task-summary construction, `task-status-overlay.ts` merge interface, and `task-digest-rules.ts` selected pure extractor behavior used by the service.
- Shared `rpc-tasks.types.ts` legacy return states, `task-spec.contract.ts` filename constant declarations, and `task-folder-markdown-eligibility.ts` eligibility helper referenced by the D1a contract.
- AST export of `normalize-workspace-root.ts` to confirm the test fixture normalization helper. Check config paths for the three changed projects. Constructor fixture discovery used a literal `new TasksRpcHandlers(` search. Ptah file search located the task-index, manifest and Electron surface specs.

## Checks

Commands were run in the supplied worktree. Shell output was tailed with `pipefail` enabled.

- PASS (119 tests) — `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/{contained-task-folder.spec.ts,task-digest/task-digest.service.spec.ts,task-index.service.spec.ts}`
- PASS (281 tests) — `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/{tasks-rpc.handlers.spec.ts,tasks-rpc.views-durability.spec.ts}`. Node emitted an ES-module loading warning for the Jest config and continued.
- PASS (58 tests) — `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/replay/scenario-sanitizer.spec.ts`.
- The initial task-specs run caught an import still required by watcher/index code. The initial RPC run caught a missing fixture type property and a redundant type-import modifier. Both issues were corrected before the passing runs.
- PASS — `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`
- PASS — `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
- PASS — `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`
- `ptah_get_diagnostics` timed out after 45 seconds for the four scoped source files. The native project typechecks above completed successfully.
- PASS with zero errors and three `max-lines` warnings in `scenario-sanitizer.ts`, `tasks-rpc.handlers.ts`, and `task-index.service.ts` — `npx eslint libs/backend/task-specs/src/{index.ts,lib/{contained-task-folder{,.spec}.ts,task-index.service.ts,di/{register,tokens}.ts,task-digest/task-digest.service{,.spec}.ts}} libs/backend/rpc-handlers/src/lib/handlers/{tasks-rpc.handlers{,.spec}.ts,tasks-rpc.schema.ts,tasks-rpc.views-durability.spec.ts} apps/ptah-electron/src/{di/expected-resolvable.ts,replay/scenario-sanitizer{,.spec}.ts}`.

## Outstanding work

- The dedicated manifest and Electron surface suites are outside the lane's enumerated Jest paths. Their results still need coordinator verification. The RPC method inventory and registration tests passed.
- Independent review and coordinator verification are pending. Host skill discovery/loading was unavailable to this lane, and no CLI review lane was delegated. No full verify, Nx, application target or Git operation was run.
- The parallel lane's reported `libs/frontend/chat` work was outside this batch. This lane did not modify it. There were no TUI or VS Code compatibility edits.
