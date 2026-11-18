# U03 signal store and RPC adapter

Implemented the renderer signal store and 24 focused specs. Library TypeScript, lint, and Jest pass. The required spec TypeScript command remains blocked by seven existing shared BigInt errors under the spec configuration's ES2016 target.

## Files

Created only:

- `libs/frontend/bots-ui/src/lib/bots.store.ts` (360 lines).
- `libs/frontend/bots-ui/src/lib/bots.store.spec.ts` (257 lines).
- `.ptah/specs/TASK_2026_2274_eb79/batch-U03-report.md` (this report; skeleton written before implementation).

No barrel, client, UI library, configuration, backend, or composition-root edits. No git writes.

## Public API

`BotsStore` is root injectable, uses `inject(BotsClient)` and `inject(ClaudeRpcService)`, and exposes only readonly/computed signals. Every writer is a method; there are no effects, RxJS subjects, or backend imports.

Exported types/constants:

- `BotDraft`: `{ definition: BotEditable; source?: BotCreateSource; enabled: boolean; revision: number }`. The wire `BotEditable` supplies the discriminated runtime and avatar unions. Source is the schema's wizard-generated source, optionally with generationId.
- `BotConflict`: `{ latest: BotRecord; mine: BotDraft }` for comparison; patching a conflicting draft updates mine.
- `BotFailure`: `{ code?: string; message: string }`.
- `BotLaneChoice`: target (system or ptah-cli), label, available, models, diagnostics.
- `AvatarState`: discriminated loading / ready (`dataUrl`) / error (`BotFailure`).
- `BotDomainCode`, `botErrorMessage(code?)`, `BOT_AVATAR_CACHE_LIMIT = 24`.

Readonly signals:

| Signals                                         | Content                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `list`, `summaries`, `archivedCount`            | Last valid list payload and its display rows/count                                               |
| `unreadable`                                    | Original id/schemaVersion/diagnostics rows, separate from actionable summaries                   |
| `unidentifiedRowNotice`                         | One aggregate notice, or null                                                                    |
| `selected`, `draft`, `dirty`                    | Saved baseline, editable draft, derived unsaved status                                           |
| `conflict`                                      | Latest saved revision and the user's current draft                                               |
| `error`, `diagnostics`                          | Actionable mapped refusal/transport state and domain diagnostics, including unavailable catalogs |
| `loading`, `saving`, `saveState`                | List loading; editor write lock; pristine/dirty/saving/saved/conflict/error                      |
| `readonly`, `validation`                        | Archived/saving edit lock; Zod editable-schema issues (field paths available)                    |
| `lanes`, `catalogDiagnostics`, `catalogLoading` | Read-only discovery results, catalog failures, loading                                           |
| `avatars`, `avatarUpload`                       | Readonly map keyed by imageId; staged upload status/resolved image                               |
| `workspaceRoots`, `requiresCreateScope`         | Explicit workspace context supplied by the page and multi-root scope requirement                 |

Methods:

- `setWorkspaceRoots(roots: readonly string[]): void`: pass **all** open roots before creation; roots are deduplicated.
- `load(params: BotsRpcMethods['bots:list']['params']): Promise<void>` and `refresh(): Promise<void>`: preserve drafts and last valid list on failures; default wire filter includes user bots and excludes archives.
- `select(id: string): Promise<void>`: host-context ID get; protects dirty same-bot reselection. The container must confirm discarding before selecting another id or starting a new draft.
- `newDraft(scope?: BotScope, source?: BotCreateSource): boolean`: returns false and exposes an actionable error if scope is omitted with multiple/no roots. With one root it resolves workspace scope explicitly. A supplied user scope works without a root.
- `patchDraft(patch: Partial<BotEditable>): void`, `discard(): void`: method-only draft updates; blocked during saving/archive. Avatar/scope patches invalidate a pending upload. Other edits can proceed during upload.
- `save(): Promise<void>`: validates and creates/updates with explicit definition scope. Invalid definitions retain their draft and expose validation issues. Fields lock during writes; create begins disabled.
- `setEnabled(enabled: boolean): Promise<void>`: immediately updates enabled/revision only on baseline/draft, retaining all other dirty values.
- `resubmitConflict(): Promise<void>`: uses latest expectedRevision while submitting the user's current full definition.
- `loadConflictLatest(): void`: discards mine and accepts latest as pristine.
- `archive()`, `restore()`: Promise<void>; consumers confirm destructive draft loss before calling. Restored enabled state comes from the server (disabled in phase 1).
- `delete(retention: BotRetention): Promise<void>`: explicit retention, clears successful selection and refreshes list.
- `loadLaneChoices(): Promise<void>`: only agent:detectClis, agent:listCliModels, ptahCli:list, and per-agent ptahCli:listModels. Never starts/configures a lane. Discovery failure and fallback-model diagnostics remain visible, including per-choice model failures.
- `uploadAvatar(params: BotsRpcMethods['bots:upload-avatar']['params']): Promise<void>`: uploads without saving the bot; stages returned imageId on draft and caches input image data for immediate display. Previous avatar survives failure.
- `loadAvatar(botId: string, imageId: string, retry = false): Promise<void>`: components consume `avatars().get(imageId)` and its dataUrl; pass retry=true to retry a failed load. Cached staging avoids an unnecessary get before creation.

List, selection, editor writes, catalog, upload, and per-image reads have independent sequence guards. Selection/discard/new draft invalidate editor/upload work. Cache eviction invalidates outstanding reads so late completions cannot resurrect evicted entries. Cache is insertion-ordered, refreshed on replacement, capped at 24 states (including loading/error entries); it does not allocate object URLs.

## Checks

Final runs, one heavy command at a time:

| Command                                                                                                                                                 | Exit | Result                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`                                                                                    | 0    | Passed                                                             |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.spec.json`                                                                                   | 1    | Seven TS2737 errors outside the write set; no U03 file diagnostics |
| `npx eslint libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts`                                               | 0    | Passed, no warnings                                                |
| `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots.store.spec.ts` | 0    | 24 passed, 1 suite                                                 |

Spec compiler blockers: `libs/shared/src/lib/types/capability-id-codec.ts:289,290`; `libs/shared/src/lib/types/messages/attention-identity.ts:20,22,24` (three errors on line 24). `tsconfig.spec.json` explicitly targets es2016, whereas these existing files use BigInt literals requiring ES2020+. No configuration edits are authorized here.

Tests cover stale list/selection/write/catalog/upload/image results, eviction of pending reads, dirty refresh retention, same-bot reselection, enabled-only rebase, compare/resubmit/discard conflict paths, cache bound, staged upload success/failure, icon-choice cancellation, image-load retry, all ten mapped refusal codes plus fallback, unreadable diagnostics/aggregate notice, multi-root explicit create scope, transport rejection, successful system/Ptah model discovery without lane starts, returned catalog diagnostics, and archive/restore readonly behavior.

Initial local fixture typing and JSDOM structuredClone failures were corrected before final runs. The store now uses immutable patch replacement without depending on structuredClone in the test runtime.

## Decisions

| Decision                                                                                           | Options                                                       | Evidence                                                                                                                                                                                                         | Reversible                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Require all roots via setWorkspaceRoots; require explicit create scope in multi-root mode          | Host first-root fallback; explicit UI choice                  | Carry-forward requirement; host create otherwise silently picks first root. Every create definition now carries resolved scope.                                                                                  | Yes, store API/consumer policy    |
| Keep list payload and draft independent                                                            | Replace editor on refresh; retain draft                       | Approved dirty-form and conflict states require retaining mine. Toggle rebases only enabled/revision.                                                                                                            | Yes                               |
| Map all BOT_* codes plus PERSISTENCE_UNAVAILABLE, INVALID_PARAMS, UNAUTHORIZED_WORKSPACE centrally | Display fixed host refusal text; distinct actionable messages | Shared RpcUserErrorCode and actual handler/domain throws, including repository scope-denied mapping. `satisfies Record<BotDomainCode, string>` enforces completeness for this union; unknown codes use fallback. | Yes                               |
| Use imageId-keyed 24-entry state cache and inline data URLs                                        | Unbounded cache; object URLs; capped map                      | Wire get returns mediaType/base64; staged uploads already have image data. Eviction also cancels stale tokens.                                                                                                   | Yes, exported capacity can change |
| Fetch latest after revision refusal, expose latest/mine, explicitly resubmit                       | Auto-overwrite; discard mine                                  | Approved design conflict flow and expectedRevision wire guard.                                                                                                                                                   | Yes                               |
| Leave legacy preview entry inert                                                                   | Add import-preview UI orchestration; defer                    | Approved plan says Preview later. Typed client already owns the transport method; this store does not add an unauthorized import workflow.                                                                       | Yes                               |
| Use existing global RPC discovery contracts for lane choices                                       | New backend API; start lanes to discover                      | Existing four typed methods provide all needed lane/model data without execution.                                                                                                                                | Yes                               |

## Tool/skill and design evidence

Applied `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md`: private writable signals, public readonly/computed state, inject(), method-only writes. CLI skill loading was not available in this tool surface; Ptah skill search returned zero matches, so native rg found the local skill and PowerShell read it. Ptah AST inspected the existing client. Native rg/PowerShell supplied targeted contract, handler, reference-store, U03/U04-U06 plan, design-state, and prototype source reads.

A Ptah diagnostics request incorrectly supplied `filePaths` rather than the server's `files` parameter. The server consequently attempted broad workspace diagnostics and returned unavailable after 45 seconds (8,668 files unchecked), explicitly stating its background check was not cancelled. This was an unintended scope expansion, provides no validation evidence, and was not retried. Required lane-only tsc/eslint commands are the fallback evidence above. No nx, verify, build, serve, dev, package, or e2e commands were run.

Compared store behavior with design-spec.md's dirty/saving/archive/conflict/error states and approved prototype controls. This batch implements state only; it creates no component/template or rendered artifact, and no visual quality is claimed. Renderer/Electron integration and screenshot review remain with the component/integration lanes.

## Other changes observed

At initial inspection, other lanes had modified `libs/frontend/ui/src/lib/foundation/list-detail.component.ts` and its spec, and had untracked `batch-U02-report.md`, `.ptah/specs/TASK_2026_2274_fee7/`, and `apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.spec.ts`. Later status showed only the unrelated fee7 directory alongside the three U03 files. I did not modify or revert any of those changes.

## Outstanding

- Required spec TypeScript check is not green until its ES2016/BigInt baseline incompatibility is resolved by the configuration owner.
- No store split needed: both implementation/spec remain under 700 lines.
- Parent notification of the spec compiler blocker was attempted once with ptah_agent_report; the server returned `parent-inbox-full` / not delivered. It was not retried. This report records the blocker for the coordinator.

## Revision 1

Read `batch-U03-review.md` in full and addressed D1-D11. This section supersedes the initial implementation's API/cache/selection details and check status where they differ. Only the existing store, its spec, and this report were changed. No extraction was needed: store 429 lines, spec 412 lines, both below 700.

In the table, implementation paths are relative to `libs/frontend/bots-ui/src/lib/`; all named cases are in `bots.store.spec.ts`.

| Defect | Fix                                                                                                                                                                                                                                                                                                                              | File:line                                                   | Regression spec name                                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1     | Stale successful writes/deletes refresh the current list while skipping editor updates; stale failures do neither.                                                                                                                                                                                                               | `bots.store.ts:263`, `bots.store.ts:282`                    | `D1 refreshes list after stale successful writes without replacing the new draft`; `D1 refreshes list after stale successful deletes without clearing the new draft` |
| D2     | Cache eviction selects only ready/error entries. Loading entries retain their tokens and may temporarily exceed 24 entries; completion reduces the cache back to its limits.                                                                                                                                                     | `bots.store.ts:404`                                         | `D2 lets 30 concurrent avatar loads all settle without evicting pending entries`                                                                                     |
| D3     | A successful upload completing during an active write is explicitly refused for staging, with an upload retry action after saving. It cannot mutate the draft or saveState, and the refusal remains visible after the save completes.                                                                                            | `bots.store.ts:380`                                         | `D3 refuses upload staging during save with a retry action and preserves saving state`                                                                               |
| D4     | Added readonly listError; list success/failure never writes editor error. Unknown list failures use list-specific retry text, with no claim that edits remain; known refusal codes retain their distinct actionable mapping.                                                                                                     | `bots.store.ts:131`, `bots.store.ts:166`                    | `D4 keeps editor failures across list success and separates refresh failure after save`                                                                              |
| D5     | patchDraft returns without a draft or while readonly, retains conflict state and updates comparison mine, otherwise derives dirty/pristine after applying the patch.                                                                                                                                                             | `bots.store.ts:203`                                         | `D5 ignores absent and no-op drafts, returns to pristine, and keeps conflict state`                                                                                  |
| D6     | Added readonly selecting and a separate selection-request sequence. Previous selection/draft remain until a successful get; failed gets preserve edits. Editor inputs are readonly while selecting.                                                                                                                              | `bots.store.ts:134`, `bots.store.ts:172`                    | `D6 preserves selection and dirty draft until selection succeeds, including failures`                                                                                |
| D7     | Missing model-map keys default to []; distinct diagnostic text identifies each failed discovery source. Current-token finally always clears catalogLoading, including unexpected processing failures.                                                                                                                            | `bots.store.ts:328`, `bots.store.ts:345`                    | `D7 tolerates missing model keys and gives unique diagnostics for failed sources`; `D7 clears catalog loading after unexpected processing errors`                    |
| D8     | setEnabled returns without RPC while a conflict is pending, leaving conflict.latest authoritative for explicit resubmission.                                                                                                                                                                                                     | `bots.store.ts:239`                                         | `D8 blocks enabled toggles while conflict comparison awaits resolution`                                                                                              |
| D9     | Canonical deep equality ignores object key order recursively, treats omitted/undefined optional keys equivalently, and preserves array order.                                                                                                                                                                                    | `bots.store.ts:62`                                          | `D9 compares nested objects independently of key order while preserving array order`                                                                                 |
| D10    | Upload RPC scope is always taken from the current draft; optional legacy caller scope is ignored. Scope changes invalidate uploads and remove the tracked staged image from the draft.                                                                                                                                           | `bots.store.ts:370`, `bots.store.ts:212`                    | `D10 derives upload scope from the draft and removes staged images on scope change`                                                                                  |
| D11    | Added a 12 MiB UTF-16 image-data budget alongside the entry cap; readonly avatarCacheBytes exposes retained cache payload size. Avatar refusal text depends on operation/code: storage errors have no size advice, invalid uploads have format/size advice, missing images request replacement without claiming the bot is gone. | `bots.store.ts:51`, `bots.store.ts:55`, `bots.store.ts:404` | `D11 evicts settled images by byte budget before reaching the entry limit`; `D11 distinguishes storage, invalid upload, and missing image failures`                  |

### Revision 1 public API changes

- Added readonly `listError: Signal<BotFailure | null>`, `selecting: Signal<boolean>`, and computed `avatarCacheBytes: Signal<number>`.
- Added `BOT_AVATAR_CACHE_BYTES = 12 * 1024 * 1024`. Budget counts `dataUrl.length * 2` for ready cached entries, a conservative UTF-16 payload estimate. It does not represent total process memory or the separate single staged upload view. Loading entries carry no image payload.
- `uploadAvatar` now accepts the mediaType/dataBase64 fields with optional scope for caller compatibility. Scope is derived from draft.definition.scope regardless of that optional argument. Callers should omit scope.
- List containers should render `listError`; editor feedback should continue to render `error`. Selection loading can use `selecting`; `readonly` includes selection loading.
- The previous cache test was corrected to verify pending reads remain until settling; late pending completions now become ready rather than being discarded by entry-cap eviction.

### Revision 1 checks

Commands were run sequentially, without git writes, Nx, verify, app startup, build, or workspace-wide checks.

| Command                                                                                                                                                 | Exit code | Result                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`                                                                                    | 0         | Passed                                                                                                                                                 |
| `npx eslint libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts`                                               | 0         | Clean, no warnings                                                                                                                                     |
| `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots.store.spec.ts` | 0         | 38 tests passed, 1 suite; 14 new regression cases                                                                                                      |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.spec.json --target es2022`                                                                   | 0         | Supplemental strict spec compilation, with CLI-only target override to bypass the acknowledged shared ES2016/BigInt incompatibility; no config changes |

The supplemental compiler run initially caught a malformed test fixture's null clis type; it was replaced with a typed getter throwing a processing error. The final run passes. The original ES2016 spec-target errors were not rerun or changed.

### Revision 1 decisions

| Decision                                                                            | Options                                                                   | Evidence                                                                                                                                                                                                                                         | Reversible                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Refuse upload staging if completion overlaps a write and expose a retry action      | Queue successful staging until write end; refuse with actionable feedback | D3 explicitly permits either approach. Refusal avoids attaching an asset to a possibly replaced/archived/deleted draft and keeps saveState owned by the write.                                                                                   | Yes, can replace with queued staging later                      |
| Block enabled toggles during conflicts                                              | Block; update conflict.latest after toggles                               | D8 permits either. Blocking preserves comparison revision and prevents an extra mutation during conflict resolution.                                                                                                                             | Yes                                                             |
| Keep pending avatar reads; bound only settled payload/entries when possible         | Evict pending reads; temporary loading overflow                           | D2's 30-request regression demonstrates every request completes once with no lingering loading entries. Payload budget remains enforced as results settle.                                                                                       | Yes                                                             |
| Use a conservative 12 MiB UTF-16 cached-image budget plus 24-entry cap              | Entry cap only; alternative byte capacity; estimate decoded bytes only    | D11 identifies retained encoded string memory. dataUrl.length * 2 accounts for the actual cached representation conservatively, including the URL prefix. Three valid-size 1.5 MiB decoded image fixtures exercise eviction below the entry cap. | Yes, exported capacity can change                               |
| Separate pending selection request identity from editor identity                    | Clear editor immediately; retain until get succeeds                       | D6 requires preserving edits on failed selection. Only successful selection invalidates/replaces editor state; newDraft/discard cancel pending selection tokens.                                                                                 | Yes                                                             |
| Retain optional upload scope parameter for source compatibility, but never trust it | Remove parameter immediately; ignore it in favor of draft scope           | D10 requires draft-derived scope; existing callers may already include scope. Regression intentionally supplies a conflicting caller scope and verifies the draft root is sent.                                                                  | Yes, optional parameter can be removed after consumer migration |

All eleven requested defects have implementation changes and named regression coverage. No remaining revision requirement is deferred. The untracked review file and unrelated `.ptah/specs/TASK_2026_2274_fee7/` directory were observed and left untouched. The previously loaded Angular signal-store skill remains applicable; this revision changes no rendered UI and makes no visual-quality claim.

## Revision 2

Read the full `## Re-review 1` section of `batch-U03-review.md`. Fixed N1-N5 within the existing store/spec write set; no new files or git writes. This section supersedes earlier cache-cap and conflict-resubmission descriptions. Store: 441 lines. Spec: 492 lines. Both remain under 700 lines.

Implementation and spec paths in the table are relative to `libs/frontend/bots-ui/src/lib/`.

| Defect | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | File:line                                                                                   | Regression spec name                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1     | Raised the settled-entry cap to 64; loading entries do not count toward it. Eviction always excludes the entry currently being written. The unchanged 12 MiB image-data budget remains the primary memory limit. The amended D2 case retains all 30 small images and proves repeat row lookups make no new RPC calls. A second case starts 70 reads, retains early settled results while others load, and checks the final 64 settled entries include the newest result. | `bots.store.ts:49`, `bots.store.ts:414`, `bots.store.spec.ts:206`, `bots.store.spec.ts:220` | `D2/N1 keeps all 30 small concurrent avatars ready without row reloads`; `N1 counts only settled entries and protects the newest completion under entry pressure` |
| N2     | Resubmission checks that a draft exists and the editor is writable before rebasing/clearing the conflict. After clearing, it sets a consistent dirty/pristine state before save; validation may then produce error state without leaving an orphan conflict state. A blocked resubmit preserves both conflict data and state.                                                                                                                                            | `bots.store.ts:250`, `bots.store.spec.ts:237`, `bots.store.spec.ts:250`                     | `N2 retains conflict and saveState when resubmit is blocked by selection`; `N2 leaves a consistent error state if conflict resubmission fails validation`         |
| N3     | Exposed readonly computed blockedReason with selecting/saving/conflict/archived/null values and a public type alias. The regression observes every reason and its return to null.                                                                                                                                                                                                                                                                                        | `bots.store.ts:50`, `bots.store.ts:153`, `bots.store.spec.ts:258`                           | `N3 exposes selecting, saving, conflict and archived reasons for action controls`                                                                                 |
| N4     | Upload records stagedImageId before inserting the ready entry. Eviction excludes stagedImageId under both entry and byte pressure; unsaved drafts continue resolving the image from the store without a bot-ID get.                                                                                                                                                                                                                                                      | `bots.store.ts:396`, `bots.store.ts:420`, `bots.store.spec.ts:272`                          | `N4 pins the staged image against entry and byte eviction without an unsaved-bot reload`                                                                          |
| N5     | Upload deletes the image's pending get token before pinning/caching the staged data. Both late successful reads with different data and late failed reads are ignored.                                                                                                                                                                                                                                                                                                   | `bots.store.ts:395`, `bots.store.spec.ts:287`                                               | `N5 ignores a late get success=%s after upload stages the same image id` (success=true and success=false)                                                         |

### Revision 2 API changes

- Added exported `BotBlockedReason = 'selecting' | 'saving' | 'conflict' | 'archived' | null` and public readonly computed `blockedReason`.
- Reason precedence is selecting, saving, conflict, archived, then null. Consumers can disable ordinary save/enabled controls and explain the returned reason. Conflict comparison, editing mine, and explicit resubmission remain available during a conflict; consumers should keep those recovery actions available. Existing `readonly` continues to express the form edit lock (selection, saving, archive), so conflict alone does not lock form editing.
- `BOT_AVATAR_CACHE_LIMIT` is now 64 and counts ready/error entries only. Pending entries remain outside the settled cap, and protected current/staged IDs are never evicted. `BOT_AVATAR_CACHE_BYTES` remains 12 MiB; `avatarCacheBytes` still reports cached ready-image payload using the conservative UTF-16 estimate.
- No existing method signature changed. The store remains the source of resolved staged/avatar image data; components need no RPC or object-URL handling.

### Revision 2 checks

Final runs were sequential and scoped to this lane:

| Command                                                                                                                                                 | Exit code | Result                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`                                                                                    | 0         | Passed                                                              |
| `npx eslint libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts`                                               | 0         | Clean, no warnings                                                  |
| `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots.store.spec.ts` | 0         | 45 passed, 1 suite; amended concurrency case and 7 additional cases |

No Nx, verify, build, serve, e2e, workspace-wide checks, or spec-target configuration edits were performed. The acknowledged ES2016 spec-target baseline was left untouched.

### Revision 2 decisions and remaining work

- Count settled entries, rather than total map entries, so pending reads cannot force eviction of their own early completions. The 64-entry cap and retained byte budget follow the review request; both capacities remain reversible constants.
- Pin the staged image before cache insertion and invalidate older per-image reads at the same point. This preserves the staged preview under cache pressure and prevents stale completion from replacing it.
- Keep conflict-specific recovery actions available while exposing blockedReason for normal action controls. Guard resubmission before changing comparison state, preserving the pending conflict if selection/saving/archive blocks the action.
- N1-N5 are complete with named regression coverage. No requested final-round fix is deferred. The existing untracked review file and unrelated `.ptah/specs/TASK_2026_2274_fee7/` directory were observed and left untouched.

## Split after formatting

Performed the requested behavior-preserving split after the coordinator formatted/staged the approved implementation. No public store method signatures or signal names changed, and the spec was left unchanged (including its imports).

### Files and formatted line counts

| File                                                  | Lines | Change                                                                                                                                                                       |
| ----------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/frontend/bots-ui/src/lib/bots.store.ts`         | 682   | Delegates cache state/transitions to a private store-owned BotAvatarCache; re-exports the original moved symbols                                                             |
| `libs/frontend/bots-ui/src/lib/bot-avatar-cache.ts`   | 85    | New plain class owning the signal map, readonly entries/byte signals, settled-entry cap, byte budget, protected IDs, per-image tokens, staging, load completion and eviction |
| `libs/frontend/bots-ui/src/lib/bot-error-messages.ts` | 55    | New module containing the unchanged domain-code messages, BotDomainCode/BotFailure types, botErrorMessage, avatar text selection, and extracted list-failure text selection  |
| `libs/frontend/bots-ui/src/lib/bots.store.spec.ts`    | 1072  | Existing coordinator-formatted spec, unchanged; no import updates needed                                                                                                     |

All three changed/new production TypeScript files are below 700 physical lines after Prettier. ESLint emits no max-lines warning. The existing spec is above 700 physical lines but is explicitly exempt from max-lines in eslint.config.mjs; this correction forbids editing its test bodies, and they were preserved exactly.

The cache preserves the same 64 settled-entry cap, 12 MiB UTF-16 image-data budget, newest/staged-image protection, pending-read behavior, token cancellation on staging, and token checks before applying a completed get. The store still performs RPC, upload/save orchestration, scope handling and editor transitions. Error strings and fallback selection are unchanged.

Original imports from bots.store.ts remain valid through re-exports: AvatarState, BOT_AVATAR_CACHE_LIMIT, BOT_AVATAR_CACHE_BYTES, BotDomainCode, BotFailure, and botErrorMessage. All other original exports remain declared in the store. The helper modules have no backend imports or dependency on the store, and no injection registration is required for the privately owned plain cache class.

### Split check results

| Command                                                                                                                                                                                                         | Exit code | Result                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `npx prettier --write libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bot-avatar-cache.ts libs/frontend/bots-ui/src/lib/bot-error-messages.ts`                                        | 0         | Mandatory formatting applied to every changed/new TypeScript file |
| `npx prettier --check libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bot-avatar-cache.ts libs/frontend/bots-ui/src/lib/bot-error-messages.ts`                                        | 0         | All matched files use Prettier code style                         |
| `npx eslint libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bot-avatar-cache.ts libs/frontend/bots-ui/src/lib/bot-error-messages.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts` | 0         | Clean, no warnings, including no max-lines warning                |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`                                                                                                                                            | 0         | Passed                                                            |
| `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots.store.spec.ts`                                                         | 0         | Unchanged suite: 45 passed, 1 suite                               |

This report was also passed through prettier --write and included in the final prettier --check with the three TypeScript files. No Nx, verify, app startup, builds, workspace-wide checks, or git writes were performed. The already-staged report/review/store/spec and carry-forward.md changes were observed and left staged; no staging operations or edits to carry-forward.md/review/spec were made. The unrelated untracked fee7 directory was left untouched.
