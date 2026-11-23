# D1a lane report

Implemented the shared task digest contract and deterministic backend extraction rules.

## Files written

- Shared types and constants in `libs/shared/src/lib/types/task-spec.types.ts` and `task-spec.contract.ts`
- Shared eligibility and tests in `libs/shared/src/lib/types/task-folder-markdown-eligibility.ts` and `task-folder-markdown-eligibility.spec.ts`
- RPC contracts in `libs/shared/src/lib/types/rpc/rpc-tasks.types.ts` and `libs/shared/src/lib/types/rpc.types.ts`
- Shared handoff-pattern import in `libs/frontend/tasks-ui/src/lib/task-stage.ts`
- Backend rules and tests in `libs/backend/task-specs/src/lib/task-digest/task-digest-rules.ts` and `task-digest-rules.spec.ts`
- Backend fixtures `decisions.md`, `design-spec-v3-review.md`, `implementation-plan-review.md`, and `implementation-plan-task-digest-review.md` in that directory's `__fixtures__`
- This report

## Exported contract and rules

```ts
export type TaskDocumentKind =
  | 'carrier'
  | 'handoff'
  | 'requirements'
  | 'design'
  | 'plan'
  | 'batches'
  | 'decisions'
  | 'reviews'
  | 'reports'
  | 'other';

export type TaskDigestExtraction = 'none' | 'ok' | 'capped' | 'skipped' | 'failed';

export interface TaskDigestDocument {
  name: string;
  kind: TaskDocumentKind;
  group: string;
  revision: number;
  latest: boolean;
  openable: boolean;
  /** Null until this digest attempts a content read. */
  readable: boolean | null;
  extraction: TaskDigestExtraction;
  size: number;
  mtime: number;
}

export interface TaskDigest {
  task: TaskSpecSummary;
  truncated: boolean;
  truncatedReasons: ('entries' | 'nested' | 'depth' | 'reads' | 'bytes')[];
  /** Exact number of top-level entries. */
  entryCount: number;
  /** Newest stat'ed mtime in milliseconds, if any. */
  lastModified: number | null;
  documents: TaskDigestDocument[];
  /** Counts over stat'ed entries. These can be lower bounds when truncated. */
  counts: Record<TaskDocumentKind, number>;
  directories?: {
    name: string;
    files: number;
    markdown: number;
    images: number;
    directories: number;
    symlinks: number;
    truncated: boolean;
  }[];
  reviews?: {
    file: string;
    subject: string;
    revision: number;
    round: number;
    verdict: 'APPROVED' | 'REVISE' | null;
    serious: number;
    moderate: number;
    minor: number;
    extraction: TaskDigestExtraction;
  }[];
  decisions?: { rows: number; pendingUser: number };
  progress?: { done: number; total: number; source: 'batches.md' | 'tasks.md' };
  openQuestions?: number;
}

export const DECISIONS_FILE = 'decisions.md';

/** Numbered session handoffs, capturing the handoff number. */
export const TASK_HANDOFF_FILE_PATTERN = /^handoff-(\d+)\.md$/;

/** Captures the optional review subject and qualifier. */
export const REVIEW_FILE_PATTERN = /^(?:(.+?)-)?(?:re-?)?review(?:-([a-z0-9-]+?))?\.md$/i;

/** Captures the stem and revision of a document name without its extension. */
export const VERSIONED_DOC_PATTERN = /^(.+?)-(?:v|rev)(\d+)$/i;

export interface TasksGetDigestParams extends TasksWorkspaceScopedParams {
  taskId: string;
}
export interface TasksGetDigestResult {
  digest: TaskDigest | null;
}

// RPC method registry entry
  'tasks:getDigest': { params: TasksGetDigestParams; result: TasksGetDigestResult };

export function isReadableTaskFolderMarkdownName(name: string): boolean;

export interface TaskDigestDocumentName {
  kind: TaskDocumentKind;
  group: string;
  subject: string;
  revision: number;
  round: number;
}

type TaskProgressCounts = Pick<NonNullable<TaskDigest['progress']>, 'done' | 'total'>;

export function classifyTaskDocument(name: string): TaskDocumentKind;
export function describeTaskDocumentName(name: string): TaskDigestDocumentName;
export function selectLatestTaskDocuments(
  documents: readonly (Pick<TaskDigestDocumentName, 'group' | 'revision' | 'round'> & { name: string; mtime: number })[],
): ReadonlySet<string>;
export function isTaskDigestDocumentOpenable(name: string, size: number, isFile: boolean): boolean;
export function extractTaskReview(
  name: string,
  text: string,
  extraction: TaskDigestExtraction = 'ok',
): NonNullable<TaskDigest['reviews']>[number];
export function extractTaskDecisions(text: string): NonNullable<TaskDigest['decisions']>;
export function documentProgress(content: string, file: string = LEGACY_BATCHES_FILE): TaskProgressCounts | null;
export function extractTaskProgress(batches: string | null, legacy: string | null): NonNullable<TaskDigest['progress']> | null;
export function isTaskDigestQuestionSource(name: string, latest: boolean): boolean;
export function countTaskOpenQuestions(text: string): number;
```

D1b can pass regular-file metadata to `describeTaskDocumentName` and then to `selectLatestTaskDocuments`. The selected names match the original spellings used for filesystem access. Pass the decoded prefix and `'capped'` to `extractTaskReview` when the read is capped. For progress, pass `null` for an absent document and an empty string for a present document that yielded no text. Use the existing `parseTaskFile` for the carrier.

## Acceptance

1. The eligibility spec accepts uppercase names and extensions and rejects `../x.md`, `a/b.md` and `.md`.
2. The rules spec reproduces both existing `documentProgress` cases and adds source, status, normalization and fencing coverage. The reader spec was read only for those cases.
3. The equal-mtime test selects `Design-spec-v3.md` and checks the same winner with the input reversed. The original filenames remain the selection identities.
4. The rules spec checks verdict and severity counts from small, exact excerpts of all three requested real review files. Separate synthetic cases exercise heading-form severity, verdict boundaries, BOM, line endings and fenced examples.
5. A compile-time assignment in the rules spec rejects `branch` and `pr` as digest keys.
6. `plan-limit.types.ts` was outside this lane's writes.

## Checks

- PASS, 8 tests. `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/task-folder-markdown-eligibility.spec.ts`
- PASS, 60 tests on both runs, including the rerun with the unrelated decisions-table data row. `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/task-digest/task-digest-rules.spec.ts`
- PASS. `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`
- PASS. `npx tsc --noEmit --project libs/frontend/tasks-ui/tsconfig.lib.json`
- PASS. `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`
- PASS, exit 0. ESLint reported three warnings in `rpc.types.ts` for the existing `SkillSynthesisEnhanceNowParams` and `SkillSynthesisEnhanceNowResult` imports and the file's existing size.

  ```sh
  npx eslint libs/shared/src/lib/types/task-spec.types.ts libs/shared/src/lib/types/task-spec.contract.ts libs/shared/src/lib/types/task-folder-markdown-eligibility.ts libs/shared/src/lib/types/task-folder-markdown-eligibility.spec.ts libs/shared/src/lib/types/rpc/rpc-tasks.types.ts libs/shared/src/lib/types/rpc.types.ts libs/frontend/tasks-ui/src/lib/task-stage.ts libs/backend/task-specs/src/lib/task-digest/task-digest-rules.ts libs/backend/task-specs/src/lib/task-digest/task-digest-rules.spec.ts
  ```

- Ptah scoped diagnostics reported that its TypeScript worker was terminated after a concurrent timeout. Native scoped checks are the fallback.

## Decisions

- Used an extensionless, ASCII-case-folded stem for both versioned and unversioned group keys. Including the extension on the unversioned stem would split the plan's `design-spec.md` / `design-spec-v3.md` group. Returned names and review subjects retain their source spelling. This is reversible within the rules.
- Treated the bare `re-review` marker as a rereview with an empty subject. The literal shared regex can consume its hyphen prefix as a subject. This preserves the mandated pattern and the default round of 1 in extractor metadata. The correction is local and reversible.
- Selected the first present progress file, matching the existing reader's file-level precedence. An empty or unparseable `batches.md` returns no progress. Falling through to `tasks.md` in that case would change the existing behavior. This is reversible within the pure selector.
- Kept `counts` required. The specified `counts:` field and lower-bound semantics give consumers a complete record, including an empty result, despite the plan's introductory “first six” wording. Changing optionality later is a shared contract change.

## Extra reads

- `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.ts` and `session-task-reader.spec.ts` for the named progress helper, its source choice and the two cases.
- `libs/backend/task-specs/src/lib/task-index.service.ts` for the carrier parser import and read limit, and `libs/backend/task-specs/src/lib/task-frontmatter.ts` for the existing parser signature.
- `decisions.md` in the task folder for its first table header and separator. Fixture rows are synthetic.
- Only text-search excerpts from the three requested review files. No other plan ranges or review sections were read.
- `ptah_search_files` returned zero results for the task folder. The specified files were read by their explicit paths and line ranges. The host exposed no skill-loading mechanism. The tasks UI diff only relocates a TypeScript import and makes no Angular component or state changes.

## Remaining work

Runtime service, read guard reuse, capped-byte slicing before decode, RPC handler, DI, and reader changes belong to subsequent batches. The contract guard allowlist already accepts use of shared constants and needed no edits.
