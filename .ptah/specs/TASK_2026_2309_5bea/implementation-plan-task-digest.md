# Implementation Plan Addendum - TASK_2026_2309: TASK section digest

Scope: the inspector TASK section only. Electron first; renderer = `apps/ptah-extension-webview` (project-rule).
Addendum to `implementation-plan.md` (not edited here). Tags: [U] user-requested, [P] project-rule, [L] lane-proposed.

## Inputs and constraints

- Requirements used: the coordinator brief (defects 1-8, items A-E), `decisions.md` rows 19 and 21, the Gate 2 review
  `implementation-plan-task-digest-review.md`. The brief text is not in the task folder; its defects map as follows
  (from decision 19): 1 folders shown as files -> C6 directory summaries; 2 Markdown capitalization -> C1 eligibility;
  3 entries that fail to open/preview -> C5/C6 `openable` + fresh check; 4 important files hidden -> C2 classes + C6 chips;
  5 wrong count -> C6 +N rule; 6 nested files -> C3 depth-2 counts (decision D3); 7 >200 entries error -> C3 bounded walk;
  8 repeated reads / freshness -> C3 caches + C5 refresh parity.
- Corrections applied: Gate 2 round 1 (see the last section). Design handoff: `design-spec-v3.md` (TASK row :18 "Unchanged
  layout"; primitives :117,120). Missing decision-critical input: none (`branch`/`pr` dropped, decision 21).

## Codebase evidence

| Evidence | Location | Implication |
| --- | --- | --- |
| `tasks:get` / `getArtifact` / `readFolderMarkdown` / `listFolderEntries` registered via `rpcHandler.registerMethod`, Zod `parse`, `resolveRoot`, `index.ensureStarted`, `sanitize` | `libs/backend/rpc-handlers/src/lib/handlers/tasks-rpc.handlers.ts:651-722`, `register()` :314 | `tasks:getDigest` copies `registerGet` exactly |
| Param schemas | `tasks-rpc.schema.ts:70-90` | New `TasksGetDigestParamsSchema` = `{workspaceRoot, taskId: taskIdRef}` |
| Method registry map + per-method flag map | `libs/shared/src/lib/types/rpc.types.ts:2970-2984`, `:4241` | Add entries next to `tasks:readFolderMarkdown` |
| Contracts live in the domain file | `libs/shared/src/lib/types/rpc/rpc-tasks.types.ts:60-103` | `TasksGetDigestParams/Result` go here; `TaskDigest` goes in `task-spec.types.ts` |
| Replay sanitizer: `DEFAULT_ALLOWED_RPC_METHODS` is the published-scenario allowlist | `apps/ptah-electron/src/replay/scenario-sanitizer.ts:90-94,289-296,449-457` | Add `tasks:getDigest`; DTO has no raw Markdown (Verified by review) |
| FS port: `readDirectory` (whole list), `lstat`, `realpath`, `readFileBoundedNoFollow(path, maxBytes)` -> `{bytes, truncated}` | `libs/backend/platform-core/src/interfaces/file-system-provider.interface.ts:65,73,75,77` | No bounded enumeration exists; a capped read does |
| Electron `readDirectory` = `fs.readdir(withFileTypes)` (types without stat); capped read allocates `maxBytes+1` (cap+1 probe), O_NOFOLLOW, dev/ino + size/mtime identity checked after read | `libs/backend/platform-electron/src/implementations/electron-file-system-provider.ts:66-77,112-137` | Nested counts need no stat; a read whose file changed throws |
| `TasksRpcHandlers.METHODS` drives the host manifest; constructor built in spec fixtures | `tasks-rpc.handlers.ts:267-275`; `host-profile/manifest.ts:439-446`; `tasks-rpc.handlers.spec.ts:303,607,805,1348,1601,2481,3041`; `tasks-rpc.views-durability.spec.ts:210` | B1 edits all of them |
| `getDetail` throws when the listing is not `ready` (incl. `too_many`) | `task-index.service.ts:449-453`, `:579` | The digest must use its own bounded listing and never throw on size |
| Markdown name guard is lower-case only | `task-index.service.ts:519`; `task-folder-markdown-eligibility.ts` | Defect 2 root cause; both places must share one rule |
| Containment boundary: `isSingleTaskPathSegment`, per-segment `lstat` + `realpath`, `inside()`, post-read realpath recheck, `readFileBoundedNoFollow`, 1 MiB cap | `task-index.service.ts:497-556` | The security boundary that the digest reuses; the name regex is not it |
| `FileStat` has `type`, `mtime`, `size` | `libs/backend/platform-core/src/types/platform.types.ts:41-49` | Cache key (path, size, mtime) costs no content read |
| Watcher glob `.ptah/specs/**`; folder = first path segment; flush rebuilds only when `fingerprintFolder` changes | `task-index.service.ts:131`, `:739-752`, `:771-783` | See Refresh finding below |
| `fingerprintFolder` hashes name+type of every top-level entry and the bytes of top-level FILES only; throws above 128 entries (treated as changed) | `task-index.service.ts:1076-1094` | Top-level non-carrier edits DO fire `tasks:changed`; edits only inside subdirectories do NOT |
| Rebuild -> `onDidChangeIndex` -> `broadcastChanged` push | `tasks-rpc.handlers.ts:308-311`; payload `TasksChangedNotification {workspaceRoot, reason, folderNames?}` `rpc-tasks.types.ts:726-730` | The renderer refetches the digest when `folderNames` is absent or includes the task |
| `TasksChangedFeed` is the only `tasks:changed` handler | `libs/frontend/tasks-ui/src/lib/services/tasks-changed-feed.service.ts:18-33` | The reader keeps using it [P] (no second listener) |
| Contract guard: per-task filename literals live only in `task-spec.contract.ts` | `libs/backend/task-specs/src/lib/contract.guard.spec.ts:6-8`; `DOC_FILES` `task-spec.contract.ts:121` | New names (`decisions.md`, `*-review.md` pattern) are constants in the contract module [P] |
| Renderer rules to retire: `documentsOf`, `documentExcerpt`, `documentProgress`, `loadProgress` | `session-task-reader.ts:84-119`, `:412-440` | One implementation of the progress rules, in the backend |
| `orderTaskDocuments` / `HANDOFF_FILE_PATTERN` / `deriveTaskStage` | `libs/frontend/tasks-ui/src/lib/task-stage.ts:81`, `:105-125` | The board keeps them; the stage stays derived in the renderer from `status` + digest document names |

## Architecture decision

- Chosen approach [U]: a new backend `TaskDigestService` in `libs/backend/task-specs`. It owns the pure extractors, a stat-keyed
  cache and in-flight dedup, and is exposed by `tasks:getDigest` -> `TasksGetDigestResult { digest: TaskDigest | null }`.
  The section makes one call instead of `tasks:get` + N `readFolderMarkdown`.
- Progress rules [L, decided]: move `documentProgress` into the backend extractor module. That keeps one implementation:
  the board does not use it (it lives only in the chat reader), and the backend owns the bytes. The renderer copy is deleted.
- Rejected: (a) extend `tasks:get` with digest fields. It would change the board's contract and payload (violates D),
  and `getDetail` already throws on `too_many`. (b) Keep the renderer regexes and only fix grouping. That leaves N RPC
  round trips per refresh, re-reads unchanged files, and keeps defect 7.
- Assumptions: none open from round 0 (sanitizer and CLI container settled by the review's Assumption answers).
  The new `@inject(TASK_SPECS_TOKENS.TASK_DIGEST)` goes last in the `TasksRpcHandlers` constructor (:296-306).
- Effect: `tasks:get`, `getDetail`, `listFolderEntries`, `readFolderMarkdown` contracts unchanged. The Tasks board is untouched.
  The renderer reader drops `tasks:get` for the section.

## Component specifications

### 1. Shared contract (`libs/shared`)

- `TaskDigest` in `task-spec.types.ts` (all optional except the first six):
  `task: TaskSpecSummary` (with `carrierStatus` + effective `status`, C3); `truncated: boolean`;
  `truncatedReasons: ('entries'|'nested'|'depth'|'reads'|'bytes')[]`; `entryCount: number` (exact top-level total);
  `lastModified: number | null` (max mtime stat'd); `documents: TaskDigestDocument[]`; `counts: Record<TaskDocumentKind, number>`
  (over stat'd entries only; `truncated` marks them lower bounds); `directories?: {name, files, markdown, images, directories,
  symlinks, truncated: boolean}[]`; `reviews?: {file, subject, revision, round, verdict: 'APPROVED'|'REVISE'|null, serious,
  moderate, minor, extraction}[]`; `decisions?: {rows, pendingUser}`; `progress?: {done, total, source: 'batches.md'|'tasks.md'}`
  (labelled task progress, not gates); `openQuestions?: number`. No `branch` / `pr` (decision 21).
- `TaskDigestDocument = { name; kind; group; revision; latest; openable; readable: boolean | null; extraction; size; mtime }`.
  `openable` = preview/open ELIGIBILITY (regular file, eligible name, size <= 1 MiB). `readable` = VERIFIED in this digest:
  `true` content decoded, `false` read failed (binary/unreadable/rejected), `null` not read. `extraction` =
  `'none'|'ok'|'capped'|'skipped'|'failed'`. `TaskDocumentKind = 'carrier'|'handoff'|'requirements'|'design'|'plan'|'batches'|
  'decisions'|'reviews'|'reports'|'other'`.
- Contract constants in `task-spec.contract.ts` [P] (C2 owns their semantics): `DECISIONS_FILE = 'decisions.md'`,
  `TASK_HANDOFF_FILE_PATTERN = /^handoff-(\d+)\.md$/` (moved from `task-stage.ts:93`; tasks-ui imports it, behaviour unchanged),
  `REVIEW_FILE_PATTERN = /^(?:(.+?)-)?(?:re-?)?review(?:-([a-z0-9-]+?))?\.md$/i`, `VERSIONED_DOC_PATTERN = /^(.+?)-(?:v|rev)(\d+)$/i`
  (applied to a name or review subject without `.md`). Add the new literals to the guard allowlist if it asks.
- Eligibility [U]: `isReadableTaskFolderMarkdownName` becomes `/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/i` and still rejects `..`.
  `readFolderMarkdown` (:519) calls this shared function instead of its own inline regex, so there is one rule.
  Security: the name check only stops separators and traversal. The boundary is `containedTask` + `lstat` File-only +
  `realpath` `inside()` + post-read recheck + `readFileBoundedNoFollow`. Upper case adds no path power: `[A-Za-z0-9._-]` has no `/` or `\`.
  Case-insensitive filesystems only alias the same contained file.
- RPC: `TasksGetDigestParams extends TasksWorkspaceScopedParams { taskId }`, `TasksGetDigestResult { digest: TaskDigest | null }`
  in `rpc-tasks.types.ts`. In `rpc.types.ts`: the type import block (:931), the registry entry (:2970-2985) and the flag map (:4241-4242).
- Failure: none (types). Verification seam: typecheck; `rpc-allowlist.spec.ts` / `rpc-surface.spec.ts` pass (prefix `tasks:` allowed).
- Files (all B1, sole owner; the main plan edits no `libs/shared` task file): MODIFY `libs/shared/src/lib/types/task-spec.types.ts`,
  `task-spec.contract.ts`, `task-folder-markdown-eligibility.ts`, `rpc/rpc-tasks.types.ts`, `rpc.types.ts`; MODIFY
  `libs/frontend/tasks-ui/src/lib/task-stage.ts` (import the moved handoff pattern) and `libs/backend/task-specs/src/lib/contract.guard.spec.ts` if the allowlist needs it.

### 2. Digest extractors (pure, `libs/backend/task-specs/src/lib/task-digest/task-digest-rules.ts`)

Pure `(name, text) -> fragment` functions. No I/O. Each rule is exact [L unless noted]:
- Text normalisation (all rules): strip one leading U+FEFF, CRLF/CR -> LF; lines inside fenced blocks (``` or ~~~ to the
  matching fence) are invisible to every rule below. Name comparisons for tie-breaks are code-unit (`a < b`, never
  `localeCompare`); the name alphabet is ASCII, so this equals bytewise order.
- Kind classification: the FIRST matching predicate wins, tested on the exact name with `/i`:
  P1 `task.md` carrier; P2 `TASK_HANDOFF_FILE_PATTERN` or `handoff.md` handoff; P3 `/^research-report.*\.md$/` design;
  P4 `/(?:^|-)(?:report|fixes)(?:-[a-z0-9-]+)?\.md$/` reports (so `review-fix-report.md`, `test-report.md` are reports);
  P5 `REVIEW_FILE_PATTERN` reviews (BEFORE design/plan: `design-spec-v3-review.md` is a review); P6 `context.md`,
  `task-description.md` requirements; P7 `batches.md`, `tasks.md` batches; P8 `DECISIONS_FILE` decisions;
  P9 `/^implementation-plan.*\.md$/` plan; P10 `/^(?:visual-)?design-.*\.md$/` design; P11 other. Non-files are not documents.
- Groups and revisions: non-review docs: `VERSIONED_DOC_PATTERN` on the name minus `.md` -> (stem, N); unversioned -> (name, 0).
  Reviews: `REVIEW_FILE_PATTERN` -> subject (group 1, '' for `review*.md`) and qualifier (group 2); the subject is parsed by
  `VERSIONED_DOC_PATTERN` -> (stem, revision); round = N if the qualifier matches `/^(?:round-?|r|v)?(\d+)$/i`, 1 for `re-review` /
  `rereview` without a number, else 0. `group` = kind + ASCII-lowercased stem. Latest per group: max revision, then max round,
  then max mtime, then the code-unit SMALLEST name. Fixtures: `design-spec.md`/`-v2`/`-v3` -> v3; `design-spec-v2-review.md` vs
  `design-spec-v3-review.md` -> v3 review; `code-logic-review.md` vs `code-logic-review-round-2.md` -> round 2;
  `design-spec-rev1-review-stopped.md` -> design-spec rev 1, round 0; `Design-spec-v3.md` + `design-spec-v3.md` with equal
  mtime -> `Design-spec-v3.md` (code-unit order: `D` 0x44 < `d` 0x64; Gate 2 round 2, finding 4). Both share one group (the
  group key is lower-cased) but each document keeps its ORIGINAL name, which is the name used for every read and open.
- `openable` = regular file (lstat) AND `isReadableTaskFolderMarkdownName` AND size <= 1 MiB. Directories, symlinks, non-markdown: `false`.
- Frontmatter: `parseTaskFile(folder, raw)` (existing). No `branch`/`pr` extraction (decision 21).
- Review verdict: the first heading line `/^#{1,6}[ \t]+verdict\b/i`. Scope = the remainder of that heading line, else the first
  non-empty line after it, stopping at the next heading. Verdict = the first case-sensitive `\b(APPROVED|REVISE)\b` in that scope,
  else `null`. Tokens in later lines, quotes or headings never count.
- Severities, each line counted at most once: grammar A = item line `/^\s*(?:\d+\.|[-*]|\|)\s*\**\[?(Serious|Moderate|Minor)\b/i`
  (real form: `1. **Serious — ...**`); grammar B = under a heading `/^#{2,4}[ \t]+(Serious|Moderate|Minor)\b/i`, each line
  `/^(?: ?)(?:\d+\.|[-*])\s+/` (indent <= 1) up to the next heading that grammar A did not already count. Pinned by fixtures
  copied from three real reviews (`implementation-plan-review.md`, `design-spec-v3-review.md`, this round's
  `implementation-plan-task-digest-review.md`) plus heading-form, no-heading/no-verdict, fenced-example, BOM and CRLF cases.
- Decisions (`DECISIONS_FILE`): the FIRST table whose header row has a cell that trims to `#`. Rows = the contiguous `|` lines after
  it, excluding the header and separator `/^\|\s*:?-{3,}/` lines; other tables are ignored. `pendingUser` = rows with a cell
  that trims to match `/^(?:pending|awaiting)\b/i`. Fixture: this task's `decisions.md` (header :3).
- Progress (moved verbatim from `documentProgress`, `session-task-reader.ts:100-110`): task headings, then checkboxes, then
  `status:` lines. Source precedence `batches.md`, else `tasks.md`. The UI labels it task progress.
- Open questions: in `context.md`, `task-description.md` and the latest `implementation-plan` group doc, top-level items
  (`/^(?:\d+\.|[-*])\s+\S/`) under `/^#{2,3}[ \t]+open questions\b/i` until the next heading of equal or higher level, excluding items
  starting `[x]` or containing `Resolved:` / `(resolved)`. Summed.
- Capped text: a `capped` read (C3) is cut at its last LF byte before decoding (0x0A never occurs inside a UTF-8 sequence, so
  no character is split; no LF -> empty text). Rules run on the prefix; their fragment carries `extraction: 'capped'`.
- Verification seam: table-driven unit tests, one per rule, plus the fixtures named above.
- Files: CREATE `task-digest-rules.ts` + `task-digest-rules.spec.ts` (+ `__fixtures__/` markdown).

### 3. `TaskDigestService` (`libs/backend/task-specs/src/lib/task-digest/task-digest.service.ts`)

- Purpose: one bounded, cached, deduplicated digest per task folder.
- Shared guards (decision D1): extract the guards of `TaskIndexService` (`inside`, `containedTask` :497-514, the file checks and
  post-read recheck of `readFolderMarkdown` :516-556, the directory before/after identity check of `listFolderEntries` :558-588)
  into one class `ContainedTaskFolder` (`libs/backend/task-specs/src/lib/contained-task-folder.ts`), built only by the new public
  `TaskIndexService.openContainedTask(root, taskId)` (runs `containedTask` once; holds the canonical folder; exposes no path).
  VALIDATION is shared; depth limits and result states stay with each CALLER (Gate 2 round 2, finding 1):
  - `list(parts, maxDepth)`: every part matches the existing segment rule (:562) and `parts.length <= maxDepth` (caller-supplied).
    Before enumeration each prefix is `lstat` Directory (symlink/other -> `rejected`) and `realpath` inside the folder;
    `readDirectory`; after enumeration `lstat` Directory + `realpath` equal to the before value, else `rejected`. Returns
    `ready` with ALL entries `{name, type}` (no 200 rule) or a typed reason `rejected | missing | unreadable` (mapping :581-587).
  - `inspect(name)`: single-segment name check, then `lstat` -> a typed kind: `file {size, mtime}` (after `realpath` inside the
    folder), `directory`, `other` (symlink/special), or `rejected | missing | unreadable`. The `directory` kind is kept so the
    legacy entry point can still answer `directory` (:524); the digest never uses `inspect` to find directories.
  - `read(name, maxBytes)`: requires `inspect` = `file`, `readFileBoundedNoFollow(target, maxBytes)`, then the :533-537 recheck
    (folder and target realpath unchanged, folder still a Directory); states `ready | capped | binary | unreadable | rejected |
    missing | directory`.
  Legacy entry points keep their limits and typed states exactly (contracts `rpc-tasks.types.ts:93-103` unchanged):
  `listFolderEntries` calls `list(parts, 4)` (:562; renderer `MAX_FOLDER_DEPTH = 4`, `task-folder-entries.ts:61,87-94`) and adds
  its own `> 200 -> too_many` (:579); `readFolderMarkdown` maps `inspect` `directory -> directory` (:524), `other -> rejected`
  (:525), size `> 1 MiB -> too_large` (:526) and `capped -> too_large` (:544). The digest walk calls `list(parts, 2)`.
  `inside()` and the segment regex exist once.
  - Parity fixtures (`task-index.service` spec, pre-existing cases kept): `listFolderEntries` at depth 3 and depth 4 -> `ready`;
    depth 5 (overflow) -> `rejected` with zero fs calls; `readFolderMarkdown('notes.md')` where `notes.md` is a directory ->
    `directory`; the digest walk on the same tree never lists below depth 2 (reason `depth`) and reports `notes.md/` as a
    directory summary, never as a document.
  - Digest directory selection: candidates are the top-level Dirents whose `readDirectory` type is `Directory` (C3 walk below),
    never a File-only `inspect`/stat result. Each candidate passes the `list` directory guard (prefix `lstat` Directory +
    `realpath` inside) BEFORE its enumeration; a guard failure charges the list budget and marks that summary `truncated`.
- Enumeration primitive and caps (decision D2): the port has no bounded enumeration (`file-system-provider.interface.ts:65`);
  `readDirectory` returns the whole name list with Dirent types and no per-entry stat (`electron-file-system-provider.ts:66-77`).
  The digest keeps it and bounds the per-entry WORK, so `entryCount` is exact and no cap+1 probe is needed:
  - Names are sorted code-unit ascending BEFORE any cap; truncation keeps a canonical prefix of that order.
  - `TOP_STAT_CAP = 500`: at most the first 500 sorted top-level entries are `stat`'d/classified. Beyond it: `truncated`, reason `entries`.
  - Priority names are ALWAYS looked up by name, even past the cap: `task.md`, `context.md`, `task-description.md`, `batches.md`,
    `tasks.md`, `decisions.md`, `implementation-plan.md` (<= 7 extra `stat` calls, so the stat budget is 507).
  - Nested walk (Gate 2 round 2, finding 3): candidates = Dirent type `Directory` within the sorted, capped top-level prefix.
    Descent order is fixed and breadth-first: all depth-1 candidates in code-unit order of that prefix, then their depth-2
    children by (parent order, child code-unit order). Each child list is itself sorted before counting, so a cut keeps a
    canonical prefix. Counts come from Dirent types (`files`, `markdown` = eligible name, `images` =
    `/\.(png|jpe?g|gif|webp|svg|avif)$/i`, `directories`, `symlinks`); symlinks are counted, never followed; nothing below depth 2
    is listed (reason `depth` when a depth-2 directory has subdirectories).
  - Two budgets: `NESTED_LIST_CAP = 64` directory ENUMERATIONS per digest (each `list` call, depth 1 or 2) and
    `NESTED_TOTAL_CAP = 1000` counted entries; `NESTED_DIR_CAP = 200` counted entries per listed directory. Every `list` call
    charges one enumeration whatever its result: empty, `rejected`, `missing` and `unreadable` directories count. Before
    ENQUEUING a descent the walk checks both budgets: it schedules the next `list` only while `listsUsed < 64` and
    `countedEntries < 1000`; otherwise it stops enqueuing. Every summary whose own list or any child list was not run is
    emitted `truncated: true` (UI `≥`, or `not counted` when its own list never ran) with reason `nested`. No content read, no
    stat, no cache for nested entries.
  - Whole-list tradeoff (D2, explicit): `readDirectory` still loads every Dirent of each listed directory; the caps bound the
    NUMBER of enumerations and the downstream counting work, not the size of one enumeration. Worst case = 1 top-level list +
    64 nested lists.
  - Reads: carrier via `read('task.md', 1 MiB)`; `capped`/`binary`/`unreadable` carrier -> request error (as `getDetail` :441-443).
    Extraction reads `read(name, 64 KiB)`, at most `MAX_READS = 24`, in this order: `batches.md` (else `tasks.md`), `decisions.md`,
    `context.md`, `task-description.md`, the latest of each plan group, then the latest of each review group by mtime desc then
    name asc. Over-cap docs: `extraction: 'skipped'`, reason `reads`; a `capped` read adds reason `bytes`. Cold content budget:
    at most 2.5 MiB RETURNED (1 MiB carrier + 24 x 64 KiB) plus up to 25 probe bytes READ (one cap+1 byte per bounded read,
    `electron-file-system-provider.ts:112-137`), excluding metadata operations (lstat/realpath/readDirectory). Other docs are
    never read (`extraction: 'none'`). In this section `stat(name)` means the `inspect(name)` `file` result.
- Effective status: `digest.task` = `{...parsed.task, carrierStatus, status}` computed by one new `TaskIndexService` helper that
  `getDetail` (:456-460) also calls, so the merged-task overlay is identical.
- Caches (decision D4), owned by the service singleton:
  - Fragment cache: key `canonicalFolder\0name`, value `{size, mtime, fragment}`, LRU 1024. Reuse only if a FRESH `stat(name)` in this
    call returns equal size and mtime. Store only `ready`/`capped` results, and only when a second `stat(name)` after the read
    equals the first (else use the fragment for this response but do not cache). Failed reads are never cached.
  - Digest cache: key `canonicalRoot\0canonicalFolder`, LRU 32; value `{signature, digest}`. Signature = sorted
    (name, type, size, mtime) of every stat'd entry + every directory summary + `entryCount` + the overlay merged flag. The walk
    and stats run on every call (so nested counts and status are always recomputed); an equal signature returns the cached
    object and reads 0 content bytes. Transient results are NEVER stored in the digest cache (Gate 2 round 2, finding 5): a
    computation in which any document has `readable: false`, any fragment was used but not fragment-cached (stat/read race),
    or the carrier/any read failed transiently is returned but not memoized, so Retry with unchanged size/mtime re-attempts
    extraction. Pinned: failure-then-success with unchanged metadata (second call reads and returns `readable: true`), and a
    successful warm digest still reads 0 content bytes.
  - In-flight: key `normalizeWorkspaceRoot(root)\0taskId` (validated by Zod before any I/O), joined by a second call,
    deleted in `finally`, so a failure never sticks.
- Failure behaviour: invalid task id or containment failure -> `rejected` -> handler error before any read. Carrier missing ->
  `null`. Any other per-file failure -> listed with `readable: false`, fragment absent, digest still returned.
- Registration: `TASK_SPECS_TOKENS.TASK_DIGEST = Symbol.for('TaskSpecsDigest')` in `di/tokens.ts`, `registerSingleton` in
  `di/register.ts` (:45-69). The CLI gets it through the same registration (`register-thoth-libraries.ts:155-162`), no CLI binding.
  Add to `apps/ptah-electron/src/di/expected-resolvable.ts` [P] (one B1 checklist entry; the file is listed once, under C4).
- Verification seam: fake-fs spec asserting CALLS and BYTES: 500 vs 501 entries (stat count 500 + priority), carrier past the cap,
  nested 200/201 and total 1000/1001, depth-3 dir, 100 empty top-level directories (exactly 64 `readDirectory` nested calls,
  the remaining 36 summaries `truncated`/`not counted`), exhausted entry budget (no `readDirectory` scheduled after 1000 counted
  entries; assert list calls AND counted entries), a rejected (symlinked) child dir charged one list, priority probes and cache
  revalidation stats asserted as DISTINCT counts, 24 vs 25 reads, 64 KiB +/- 1 with and without a final LF, malformed UTF-8,
  missing/binary carrier, warm unchanged call = 0 read bytes, same names/size/mtime in two roots (no aliasing), overlay change
  (new status, same files), stat change during read (not cached), in-flight failure cleanup. Containment spec on
  `ContainedTaskFolder`: directory symlink, lower- and upper-case file symlinks, rejected task/child names, parent replaced
  during enumeration and during read, file replaced after stat.
- Files: CREATE `contained-task-folder.ts` + `.spec.ts`, `task-digest/task-digest.service.ts` + `.spec.ts`; MODIFY
  `task-index.service.ts`, `di/tokens.ts`, `di/register.ts`, lib `index.ts`.

### 4. RPC handler

- `registerGetDigest()` in `tasks-rpc.handlers.ts`, a copy of `registerGet` (:651-666) with a `sanitize` message 'Failed to read task digest.'.
  Called from `register()`. Schema `TasksGetDigestParamsSchema` in `tasks-rpc.schema.ts` (:70-90 pattern). Add `'tasks:getDigest'` to
  `TasksRpcHandlers.METHODS` (:267), which the host manifest reads (`manifest.ts:439-446`), so every host that uses the shared
  registration gets it; no host-specific wiring. Add the digest service as the last constructor argument and update every
  constructor fixture (`tasks-rpc.handlers.spec.ts:303,607,805,1348,1601,2481,3041`, `tasks-rpc.views-durability.spec.ts:210`).
- Spec: ready, `null`, sanitized failure, unauthorized workspace, invalid folder (`../x`) rejected with ZERO fs/digest calls.
  Add `tasks:getDigest` to `DEFAULT_ALLOWED_RPC_METHODS` in `scenario-sanitizer.ts` + a sanitization case in its spec (:1169).
- Files (B1): MODIFY `tasks-rpc.handlers.ts`, `tasks-rpc.schema.ts`, `tasks-rpc.handlers.spec.ts`, `tasks-rpc.views-durability.spec.ts`,
  `apps/ptah-electron/src/replay/scenario-sanitizer.ts` + `.spec.ts`, `apps/ptah-electron/src/di/expected-resolvable.ts`.
  `manifest.ts` needs no edit (it reads `METHODS`); the manifest/surface specs must pass.

### 5. Renderer reader (`session-task-reader.ts`)

- `read()` calls `tasks:getDigest` once. Delete `documentsOf`, `documentProgress`, `loadProgress` and their per-file reads.
  `progress` = `digest.progress`. Refresh parity with :222-252: on `TasksChangedFeed`, skip only when the workspace differs, or when
  `folderNames` is present AND the held digest's `task.folderName` is known AND not listed; otherwise refetch (unknown folder ->
  refetch). Preview cache entries of the task are dropped as today. `retry()` refetches (recomputes nested counts, decision D3).
- `previewDocument`: allowed iff the CURRENT digest lists the file with `openable: true`; `tasks:getArtifact` for `isDocFile`, else
  `readFolderMarkdown`. A non-`ready` state sets `_preview` `{status: 'error', reason: state}` (no silent return) [U].
- `openDocument` (decision D5): replaces `task.artifacts.includes(file)` (:325) with "current digest lists it `openable`", then makes a
  FRESH backend check before `opener.open`, using the contained `tasks:readFolderMarkdown` for EVERY eligible name, recognized
  documents (`isDocFile`, e.g. `implementation-plan.md`, `task.md`) included (Gate 2 round 2, finding 2). `tasks:getArtifact` is
  NOT used for Open: its result `{file, content}` has no `state` (`rpc-tasks.types.ts:79-90`, handler `tasks-rpc.handlers.ts:679-699`),
  while `readFolderMarkdown` returns the typed `state` (`rpc-tasks.types.ts:93-97`) and keeps the backend no-follow read and
  post-read containment checks (`task-index.service.ts:516-546`). Proceed only when the response is `success`, echoes the
  requested `taskId` and `file`, and has `state: 'ready'`. AFTER the await, before calling the opener, re-validate: the current
  `link()` key equals the key captured before the call (`linkKey`, `isCurrent`), the held digest task id equals the requested one,
  the current digest still lists `file` as `openable`, and the reader is not destroyed. Any failure sets a visible
  `_openError {file, reason}` (`reason` = the state, `stale` for a link/task switch, or `unavailable` for an RPC error) and makes no
  open call; nothing returns silently. A cached preview or a rendered list never authorizes an open. The opened path is the same
  contained single-segment join; the remaining check-to-open window equals today's (the editor only reads).
- Excerpt: 12 lines / 1500 chars [L] (`documentExcerpt` stays, constants raised).
- Stays: `FILE_LINK_OPENER`, preview cache + retry, link switching, `relatedOf`, one-read-in-flight, stale-lead drop.
- Verification seam: reader spec: one RPC per read, refresh matrix (absent / listed / unlisted / unknown folder), non-openable
  preview -> error, open on a stale listing whose fresh check returns `rejected` -> `_openError`, no open call. Open-check cases
  (finding 2): a recognized document (`implementation-plan.md`) opens through `tasks:readFolderMarkdown` `ready` (one opener call,
  no `tasks:getArtifact` call); a stale/rejected file (`missing` or `rejected`, or a mismatched echoed `file`) -> `_openError`,
  no opener call; a task/link switch while the check is pending -> `_openError` reason `stale` (or dropped if the reader was
  destroyed), no opener call.
- Files (B2, sole owner): MODIFY `session-task-reader.ts` + `session-task-reader.spec.ts`.

### 6. Section component (`inspector-task-section.component.ts`)

- `groupTaskDocuments` takes `TaskDigestDocument[]` and makes ONE partition of the documents with `openable: true`:
  chips = the `latest` doc of each (kind, group) for carrier, requirements, design, plan, batches (kind order, then group
  code-unit order), then the latest review per group, at most 4 review chips (mtime desc, name asc). Every chip requires
  `openable`; a chip whose `readable === false` renders disabled with the text `unreadable`. Review chips carry a verdict cue
  (APPROVED success ink, REVISE warning ink, plus the text label, never colour only).
- "+N" menu [U]: the rest of the partition with `readable !== false`. N = that list's length, so chips + menu never double count.
  Non-openable entries appear nowhere as controls.
- Nested files (decision D3): v1 shows per-directory COUNTS only, as one muted non-interactive line per directory
  (`prototype: 12 images`, `≥` prefix when `truncated`, `prototype: not counted` when its own list never ran because the
  nested budget was spent, C3). Individual nested files are not listed or openable.
- Preview: Open is rendered only when the preview `status === 'ready'`; on `error` the panel shows the reason and Retry, no Open.
- Stats row [U]: `{done}/{total} tasks · {decisions.rows} decisions · {openQuestions} open`. Omit absent parts; `· partial` when `truncated`.
- Styling (main-plan cross-ownership): B3 applies `design-spec-v3.md` to this section: TASK layout unchanged (:18), task progress on
  `ptah-meter` (:117), sections/badges on `ptah-surface-section` / `span[ptahBadge]` (:120), existing tokens only (:6). The main
  plan's Component 8 does not edit this component or its spec.
- Stays: heading/`aria-labelledby`, `aria-busy`, retry buttons, progressbar with `aria` label, related toggle (`aria-expanded/controls`),
  chip `aria-pressed/controls` -> `previewId`, menu `documentsMenuId`, `data-testid`s. Moves: progress source (renderer -> digest).
- Stays: menu Escape / outside-click dismissal with focus return to the trigger.
- Verification seam: component spec (new + parity cases): non-openable latest review (no chip), case variants, exact +N after chips,
  nested summary with `≥`, invalid/binary preview (no Open), editor error text, keyboard dismissal; `typecheck-templates`.
- Files (B3, sole owner): MODIFY `inspector-task-section.component.ts` + `inspector-task-section.component.spec.ts`.

## Integration architecture

- Data flow: section -> `SessionTaskReader.read()` -> `tasks:getDigest` -> handler (Zod, `resolveRoot`, `ensureStarted`) -> `TaskDigestService`
  -> `TaskIndexService.openContainedTask` -> `ContainedTaskFolder` (containment) -> rules -> `TaskDigest` -> signals -> template.
- Refresh (B): `tasks:changed` fires for top-level file edits and entry add/remove (`task-index.service.ts:1076-1094`), not for
  subdirectory-only edits. Directory counts lag until the next top-level change, refetch or Retry (decision D3, accepted).
- State: the backend cache lives as long as the service singleton. The renderer state is component-scoped (unchanged).
- Failure: per-file degradation (component 3). A whole-digest error -> the existing section error state with Retry.
- Observability: `logger.warn('[task-specs] digest partial', {taskId, truncatedReasons})` once per computation, no content in logs.

## Team-leader handoff

- Executors: components 1-4 backend-developer; 5-6 frontend-developer. Complexity MEDIUM (new RPC + cache; rules are pure).
- Ordering: 1 before all. 2-4 before 5-6 can run against the real RPC. 5 and 6 share the `TaskSectionData` shape: settle it in 5.
- Batches (file-disjoint): B1 = components 1-4 (shared contract, tasks-ui `task-stage.ts` import, task-specs, rpc-handlers + all
  constructor fixtures, electron sanitizer + expected-resolvable). B2 = component 5. B3 = component 6 incl. the v3 styling.
- Ownership vs `implementation-plan.md`: this addendum alone owns `inspector-task-section.component.ts` + spec (B3) and
  `session-task-reader.ts` + spec (B2); the main plan drops them (Component 8 keeps GIT/linked/actions only; it is the fallback
  owner of the section styles only if this addendum is dropped). All `libs/shared` files above are B1-only; the main plan names
  no file in `task-specs`, `rpc-handlers`, `tasks-ui` or the shared task contracts. Shared project: `@ptah-extension/chat` (both
  plans) — run its checks after both plans' chat edits settle.
- Affected projects: `@ptah-extension/shared`, `@ptah-extension/task-specs`, `@ptah-extension/rpc-handlers`, `@ptah-extension/tasks-ui`
  (shared eligibility + handoff pattern), `@ptah-extension/cli-engine` (same task-specs registration), `ptah-electron`,
  `@ptah-extension/chat`, `ptah-extension-webview`.
- Commands [P]: inner loop `npm run verify -- --related -p <projects>`, then `npm run verify -- -t lint,typecheck -p <projects>`.
  Gate `npm run verify -- -p @ptah-extension/shared,@ptah-extension/task-specs,@ptah-extension/rpc-handlers,@ptah-extension/tasks-ui,@ptah-extension/cli-engine,ptah-electron,@ptah-extension/chat,ptah-extension-webview`
  and `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. Lanes: focused jest/tsc/eslint only.
- Unit tests: the verification seams of C2-C6, plus the eligibility spec (upper case accepted; `../x.md`, `a/b.md`, `.md`
  rejected). Move the existing `documentProgress` cases from the reader spec to the rules spec.
- Files by batch: B1 = the C1-C4 file lists; B2 = C5; B3 = C6 (each list is complete and disjoint).
- D: the board should later read `counts`/`reviews` from the digest for card badges. Out of scope here.
- B1 checklist: `apps/ptah-electron/src/di/expected-resolvable.ts` is one entry (C3 needs it, C4 lists it).
- Implementer checks (carried from the Gate 2 review, `## Carry to implementation`):
  - Preserve the existing canonical path before/after checks and the opened-file identity protections of the Electron
    no-follow read. `FileStat` exposes type, mtime and size (`platform.types.ts:41-49`); the path-level check confirms the
    canonical path and directory type; the provider separately verifies the opened file's identity
    (`electron-file-system-provider.ts:124-145`). Keep the editor path-open window explicit and cover the fresh RPC
    rejection case (C5).
  - Keep nested-only freshness as accepted in decisions 21 and 23 (D3); do not widen the watcher fingerprint for this task.
    The eight defect dispositions, including counts-only nested display, are recorded in the inputs above.
  - The review was static only; no implementation, Git operation, verify command, build or test was performed by it.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | One `ContainedTaskFolder` holds every task-folder guard; index and digest both use it; depth limit and result states are caller parameters (legacy 4 + `directory` state, digest 2) | copy guards / share with fixed limit / share validation only | `task-index.service.ts:497-588`, `:524`, `:562`; `task-folder-entries.ts:61` | yes |
| D2 | Keep `readDirectory`, sort names, cap per-entry work and cap nested ENUMERATIONS at 64 (plus 1000 counted entries); no new port method. Whole-list load per enumeration is the accepted tradeoff | new `readDirectoryBounded` (opendir) / keep | Port :65 has none; an opendir prefix is not canonical and would need 3 host impls + contract suite | yes |
| D3 | Nested files: per-directory counts only in v1; counts may lag after subfolder-only edits until refetch/Retry | counts only / list nested / widen fingerprint | `decisions.md` row 21 (accepted); fingerprint is top-level (:1076-1094) | yes |
| D4 | Fragment cache keyed canonical folder + name, size/mtime revalidated per call; digest cache by canonical root + folder | name-list memo / canonical keys | review finding 4; `getDetail` overlay :456-460 | yes |
| D5 | Open = current digest `openable` + fresh `tasks:readFolderMarkdown` `ready` for every eligible name, then post-await task/file/link revalidation | trust listing / fresh check via both RPCs (needs contract normalization) / readFolderMarkdown only / new resolve RPC | `session-task-reader.ts:318-336`; `getArtifact` has no `state` (`rpc-tasks.types.ts:79-90`); `readFolderMarkdown` is contained (`task-index.service.ts:516-546`) | yes |
| D6 | No `branch`/`pr`; severity grammars pinned by three real reviews | — | `decisions.md` row 21 | yes |

## Gate 2 round 1 responses

| Finding # | Section changed | Resolution |
| --- | --- | --- |
| 1 Serious | C3 shared guards, C5 `openDocument`, D1, D5 | `ContainedTaskFolder` list/stat/read: pre-enumeration lstat Directory + realpath, symlinks rejected, post-enumeration identity recheck, per-file lstat/realpath before stat or cache reuse, post-read recheck; open needs a fresh contained RPC `ready`. Containment tests listed. |
| 2 Serious | C3 enumeration and caps, C2 capped text, D2 | `readDirectory` + code-unit sort before caps (exact `entryCount`); 500 stat cap; 7 priority names always stat'd; nested 200/1000 from Dirent types; `readFileBoundedNoFollow` (cap+1 internally) at 1 MiB carrier / 64 KiB x 24; reasons `entries/nested/depth/reads/bytes`; LF cut + fatal decode; carrier failure = request error. Call/byte assertions listed. |
| 3 Moderate | C1 constants, C2 | Ordered predicates P1-P11 (reports, then reviews before plan/design); review subject/revision/round grouping; bytewise tie-breaks; verdict scope = heading remainder or first non-empty line; non-double-counting severity grammars; first `#`-header table; handoff pattern moved to `libs/shared`. |
| 4 Moderate | C3 caches and effective status, C5 refresh | Canonical keys; success-only fragments with stat-before/after; LRU 1024 / 32; walk and overlay recomputed every call; refresh parity with :222-252. |
| 5 Moderate | C4, handoff | `METHODS` tuple, manifest via `METHODS`, `rpc.types.ts` :931 imports, all constructor fixtures, sanitizer allowlist in B1; `tasks-ui` and `cli-engine` added to verification. |
| 6 Moderate | C1 `openable`/`readable`, C5, C6, D3 | Chips and review chips require `openable`; `readable` verified vs eligibility; Open hidden on failed preview; editor uses the digest document model; nested = counts only. |
| 7 Minor | C1, C2, D6 | `branch`/`pr` deleted; lag and severity-fixture choices recorded. |
| Cross-plan | Handoff ownership | B3 owns the section + spec incl. v3 styling; B2 owns the reader + spec; shared files B1-only. |

## Gate 2 round 2 responses

| Finding # | Section changed | Resolution |
| --- | --- | --- |
| 1 Serious | C3 shared guards, D1 | `list(parts, maxDepth)` / `inspect(name)` / `read` share validation only; `listFolderEntries` keeps depth 4 + `too_many`, `readFolderMarkdown` keeps `directory`/`too_large`/`rejected` (`task-index.service.ts:524-526,544,562,579`); digest uses depth 2, selects directories from Dirent type, guards before descending. Parity fixtures: depth 3/4 ready, depth 5 rejected, Markdown-named directory -> `directory`. |
| 2 Serious | C5 `openDocument` + seam, D5 | Fresh check = `tasks:readFolderMarkdown` for every eligible name (recognized documents included; `getArtifact` has no `state`, `rpc-tasks.types.ts:79-90`). Post-await revalidation of echoed task/file, link key, held task and current `openable`; visible `_openError` with reason. Tests: recognized doc opens, stale/rejected file, task switch during the check. |
| 3 Serious | C3 nested walk, byte budget, seam, D2 | `NESTED_LIST_CAP = 64` enumerations, every list (empty/rejected/missing/unreadable) charged; budgets checked before enqueuing; unvisited summaries `truncated` (`not counted` in C6); breadth-first order from the sorted capped prefix; whole-list tradeoff stated. Cold budget = 2.5 MiB returned + up to 25 probe bytes read, metadata excluded. Fixtures assert list calls and counted entries; priority probes vs revalidation stats counted separately. |
| 4 Moderate | C2 groups and revisions | Comparator stays code-unit smallest; equal-mtime fixture now selects `Design-spec-v3.md`; original names kept for reads. |
| 5 Moderate | C3 digest cache | Results with `readable: false`, unstable (uncached) fragments or transient read failures are not memoized in the digest cache; failure-then-success fixture with unchanged metadata; warm success still 0 content bytes. |
| Ownership | C3 registration, handoff | `expected-resolvable.ts` is one B1 checklist entry (listed under C4). |
| Carry to implementation | Handoff "Implementer checks" | Three items copied. |
