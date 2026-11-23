# D2 renderer task reader

## Files changed

- `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.ts`
- `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.spec.ts`

D3 can import the new `TaskSectionData` from `./session-task-reader`. It can use `state().data.digest` for document metadata, counts, directories, reviews, decisions, progress, timestamps, truncation and open questions. Absent optional values and explicit nulls pass through. `progress()` returns the digest's progress object or null.

## Public API

```ts
export interface TaskSectionData {
  readonly lead: { readonly taskId: string; readonly missing: boolean };
  readonly digest: TaskDigest | null;
  readonly task: TaskDigest['task'] | null;
  /** @deprecated Read document metadata from digest.documents. */
  readonly documents: readonly string[];
  /** @deprecated The digest does not provide a workflow stage. */
  readonly stage: null;
  readonly related: readonly {
    readonly taskId: string;
    readonly title: string | null;
    readonly status: TaskStatus | null;
  }[];
}

export type TaskDocumentFailure =
  | Exclude<TasksReadFolderMarkdownResult['state'], 'ready'>
  | 'unavailable'
  | 'not-openable'
  | 'stale';

export type TaskDocumentPreview =
  | { readonly file: string; readonly status: 'loading' | 'ready'; readonly content: string }
  | { readonly file: string; readonly status: 'error'; readonly content: ''; readonly reason: TaskDocumentFailure };

export interface TaskDocumentOpenError {
  readonly file: string;
  readonly reason: TaskDocumentFailure;
}

interface TaskLink {
  readonly lead: SessionTaskLinkSummary;
  readonly related: readonly SessionTaskLinkSummary[];
  readonly workspaceRoot: string | null;
}

// SessionTaskReader public surface, with inferred signal types stated explicitly.
readonly canOpen: boolean;
readonly link: Signal<TaskLink | null>;
readonly state: Signal<SectionState<TaskSectionData> | null>;
readonly progress: Signal<NonNullable<TaskDigest['progress']> | null>;
readonly preview: Signal<TaskDocumentPreview | null>;
readonly openError: Signal<TaskDocumentOpenError | null>;
bind(tabId: Signal<string>): void;
retry(): void;
closePreview(): void;
previewDocument(file: string): Promise<void>;
openDocument(file: string, origin?: Element | null): Promise<void>;

// Standalone export.
export function documentExcerpt(content: string): string;
```

| State | What D3 can render |
| --- | --- |
| `state() === null` | No resolved task link. |
| `status: 'loading'` | Digest read in flight. A same-link refresh can carry the held digest. |
| `status: 'ready'` | Digest received. |
| `status: 'unknown'` | Backend returned a successful null digest. The linked task is missing. |
| `status: 'error'` | Digest unavailable. Show the generic message and call `retry()`. If a same-link digest was already received, its file list remains usable. |

## Acceptance evidence

| Acceptance item | Reader spec evidence |
| --- | --- |
| D2 defines `TaskSectionData` and uses the backend digest | `loads the TaskSectionData and progress from exactly one digest RPC`, `keeps unknown digest values absent`, `reports no task for a successful null digest`. |
| Fresh contained Markdown read for every Open, including recognized documents | `checks a recognized document through readFolderMarkdown before every editor path open`. It checks two clicks, holds each response before the opener, and asserts the RPC sequence and exact editor path. |
| Echoed task/file, link, held task and current eligibility revalidated after await | `blocks the editor open when its fresh check returns %s` covers rejected, missing, wrong file, wrong task and generic RPC failure. `blocks the editor open if the task switches while the check is pending`, `blocks the editor open if the current digest revokes eligibility during the check`, `blocks the editor open if the held task disappears during the check`, and `drops a ready editor check after the reader is destroyed` cover changes during the await. |
| Old progress parser cases removed | Removed the two `documentProgress` cases and the old progress-RPC cases. The one-digest RPC case now asserts progress by object identity. |
| Editor path-open window explicit | The comment at the opener identifies the interval between the contained backend check and the editor's read of the path. The recognized-document and rejection cases assert that only the ready check permits that path open. |
| Observable, sanitized failure and retry | `keeps listed files usable after an observable digest failure and replaces data on retry`, `reports a rejected first read as an unavailable digest and allows a retry`. |
| Stale requests | `drops an old root response and opens only the new root task folder`, `drops a late digest after a lead switch and runs only one digest request at a time`, `drops a digest from an earlier request after switching away and back to the same link`, `drops a late preview rejection after a lead switch`. |
| Refresh and preview parity | `filters refreshes for %s`, `refreshes an unknown folder when a folder list is present`, `invalidates cached previews when the held task changes`, `shows an error for a non-openable preview without making a document RPC`, `surfaces the backend state for a non-ready Markdown preview`, `limits excerpts to 12 lines and 1500 characters`. |

## Checks

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.spec.ts` passed. One suite, 33 tests.
- `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json` passed after correcting TS2345 at the digest request. The request literal now uses `satisfies TasksGetDigestParams` and fits the RPC wrapper's record parameter. Compiler output reported NG8113 unused-import warnings in `hunk-toolbar.component.ts`, `vscode-lm-config.component.ts`, `system-prompt-drawer.component.ts` and `elevenlabs-panel.component.ts`, plus NG8107 optional-chain warnings in `peer-session-send-dialog.component.ts` and `lanes-table-detail.component.html`. Those files are outside the write set.
- `npx eslint libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.spec.ts` passed.
- `ptah_get_diagnostics` scoped to the two reader files reported unavailable after its 45-second compiler timeout. The focused `ngc` run supplied the compiler result.

## Decisions

- Exported the digest on reader-local `TaskSectionData`. Editing the existing shared inspector model was outside the write set. The old template still uses `task`, `documents`, `stage` and `progress()`. The first two project the digest, the stage is null because the digest supplies no stage, and progress passes through. D3 can remove the deprecated fields once it reads the digest directly. The change is reversible within the reader.
- Used existing `SectionState` statuses and retained the last successful digest for the same link. A fallback RPC or clearing data would respectively expand the specified one-RPC read or discard the existing file list. On the first failed read there is no backend file list to retain. State mapping and retention policy can change locally.
- Kept one digest request in flight with one queued refresh, and used the captured link object together with its normalized key to reject late results. A key-only comparison would admit an old response after switching away and back. The request guard is local to the reader.
- Checked the digest's canonical folder name against the requested task ID. The shared `TaskSpecSummary` contract identifies the ID with the folder name, so the post-check path targets the same folder as the backend read. This check is local to the reader.

## Extra reads

- `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts` for its old template's reader bindings.
- `libs/frontend/chat/src/lib/services/session-inspector/session-inspector.types.ts` for `SectionState` and the old task-section shape imported by the reader.
- `libs/shared/src/lib/types/rpc/rpc-tasks.types.ts` for the preview and fresh-open response types and workspace parameter.
- `libs/shared/src/lib/types/task-spec.types.ts` for the task summary and canonical ID contract.
- `libs/backend/rpc-handlers/src/lib/handlers/tasks-rpc.handlers.ts` for the plan-named digest null/error boundary.
- The D1 lane-report section extraction also included D1a’s Decisions and matched D1b’s brief descriptions of the RPC null and error behavior.
- `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/orchestration/SKILL.md` via the repository filesystem. Host skill discovery/loading was unavailable.

## Pending

- The coordinator owns independent phase review and project-wide verification. The assigned write set contains reader TypeScript and its focused spec. Electron visual review belongs with the template batch.
