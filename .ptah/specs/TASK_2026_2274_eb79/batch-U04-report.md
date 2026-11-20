# Batch U04 report

Completed the five presentational Angular renderer files for skill/tool selection and bot list rows. Electron remains the priority host. No store, RPC, barrel, dependency, configuration, or git writes were made.

## Files and line counts

| File                                                            | Lines |
| --------------------------------------------------------------- | ----: |
| `libs/frontend/bots-ui/src/lib/bot-skills-picker.component.ts`  |   163 |
| `libs/frontend/bots-ui/src/lib/tool-id-chip-input.component.ts` |   142 |
| `libs/frontend/bots-ui/src/lib/bot-selection-controls.spec.ts`  |   196 |
| `libs/frontend/bots-ui/src/lib/bot-list-row.component.ts`       |   257 |
| `libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts`            |   165 |

The report was written as a skeleton before component implementation. All source files are below 700 lines after Prettier.

## Component inputs and outputs

| Component / selector                                   | Inputs                                                                                                                                                        | Outputs                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `BotSkillsPickerComponent` / `ptah-bot-skills-picker`  | `skills: readonly BotSkillRef[]`, `installedSkills: readonly InstalledSkill[]`, `readonly: boolean`                                                           | `skillsChange: BotSkillRef[]`                                        |
| `ToolIdChipInputComponent` / `ptah-tool-id-chip-input` | `ids: readonly string[]`, `knownIds: readonly string[]`, `overlapIds: readonly string[]`, `label: string`, `readonly: boolean`                                | `idsChange: string[]`                                                |
| `BotListRowComponent` / `ptah-bot-list-row`            | `bot: BotSummary \| null`, `unreadable: BotsListResult['unreadable'][number] \| null`, `avatar: AvatarState \| null`, `selected: boolean`, `lastEdit: string` | `selectedBot: string`, `avatarNeeded: string`, `avatarRetry: string` |

Selection controls default to empty arrays and writable mode. The row defaults to null records/avatar, unselected, and empty last-edit text. Supply `lastEdit` for readable rows; it is used verbatim in both visible metadata and the accessible name. Public row computed values `runtimeLabel` and `accessibleName` are also available.

Integration notes:

- Import components directly from their files; U06a owns the public barrel.
- The parent owns all selected values and applies emitted arrays; controls never mutate input arrays or inject the store.
- Skills use installed skill `name` as the bot wire `id`. This is the `skillsSh:listInstalled` contract. Multiple installed source copies with the same slug become one option. Unavailable selected slugs remain visible and removable.
- `knownIds` marks resolved tools. Unknown IDs remain visible with `(unresolved)`. Pass IDs from the opposite allow/deny list as `overlapIds`; intersecting chips have an explicit text mark, a linked warning, and deny precedence copy.
- Chips track stable IDs. Native buttons/checkboxes provide Tab, Enter and Space behavior. Chip buttons support arrows, Home/End and Delete/Backspace. Removing the last chip returns focus to the tool entry or Add skills button. The empty tool entry supports ArrowLeft to the last chip.
- `avatarNeeded` and `avatarRetry` emit the image ID. Bind them with the row bot ID: `store.loadAvatar(bot.id, imageId)` and `store.loadAvatar(bot.id, imageId, true)` respectively. `ngOnChanges` requests each rendered image ID once per row instance; no list-wide effect is introduced.
- `avatar` is the corresponding store cache entry. Cached errors show the default icon, mapped error text and a separate retry button. Browser image decode errors also fall back and expose retry. Image sources accept only PNG/JPEG/WebP base64 data URLs.
- An `unreadable` input takes precedence over `bot`; it renders ID, optional format version and diagnostics, with no buttons or avatar requests. The parent supplies the surrounding list/list-item semantics.

## Checks

All final lane commands ran in the specified worktree:

| Check                                                                                                                                                                                                                  | Final exit code | Evidence                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------: | ------------------------------------ |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`                                                                                                                                                   |               0 | Passed, no output                    |
| `npx eslint` with the five created TypeScript files                                                                                                                                                                    |               0 | Passed, no errors or warnings        |
| `npx prettier --check` with the five created TypeScript files                                                                                                                                                          |               0 | All matched files use Prettier style |
| `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-selection-controls.spec.ts libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts` |               0 | 2 suites, 18 tests passed            |
| `npx prettier --write` on every created TypeScript file                                                                                                                                                                |               0 | Completed                            |

The first Jest run had one test selector failure: it selected the shared field hint instead of the overlap status paragraph. The assertion was corrected and all final tests passed. Initial ESLint accessibility-modifier warnings were fixed before the final clean run.

Tests cover exact enabled/disabled/archived accessible names, User badge, visible name, selection output/current state, Default/main/system/ptah-cli runtime labels, unset/icon/image/error avatars, retry and once-per-image requests, unsafe URL rejection, unreadable diagnostics without actions, identity-preserving reorder, unresolved IDs, overlap association, keyboard removal/navigation/focus, searchable installed-skill checkboxes, duplicate IDs and readonly guards.

Ptah diagnostics reported no diagnostics in the three requested component files. Its sibling scan reported the five known ES2016 BigInt errors in shared capability/attention files; these were not changed. The required library TypeScript check passed.

## Decisions

- Used standalone OnPush components, signal inputs/outputs/queries and built-in control flow. No store or RPC injection, HTML injection, unsafe casts, or new library dependency.
- Reused shared field, input, native popover, checkbox, badge and status exports, with lucide-angular icons. The design spec explicitly states that shared UI has no chip-input; chips use local inline templates and approved surface styling.
- Kept a native row button with `aria-current` rather than `ptahInboxRow`, whose directive forces listbox/option semantics. The approved design requires a `ul` and button rows. Retry is a sibling button, avoiding nested interactive elements.
- The parent supplies relative last-edit text so visible text and the exact accessible name agree. Default and lane runtime identities remain diagnostic labels; explicit main runtime uses its provider/model pair.
- All bot domain error presentation uses `botErrorMessage`; unreadable diagnostic messages are rendered as escaped text alongside mapped code messages.
- Failed avatar entries remain parent-cache-owned; retry is explicit. The row neither clears cache failures nor fetches image paths.

## Skills, tools and visual handoff

Applied `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/ui-ux-designer/SKILL.md`, including existing-design-system discovery guidance. A CLI skill loader/discovery tool is not exposed in this session; local skill files were loaded through native PowerShell reads instead.

Used Ptah AST inspection and scoped diagnostics. Ptah dependents returned an incomplete graph with the new row absent; native `rg` confirmed only the new test currently imports it. Used native reads/search for the exact local contracts and UI exports. The initial AST argument was corrected from `filePath` to the tool's required `file` and the call succeeded.

Read U04 and U05/U06a consumers, wire schemas, store/avatar/error contracts, installed-skill RPC types, shared UI source, a cron presentational reference, design spec and prototype source. Inspected the approved `bots-list-dark-1280.png` image. Checked source structure against its row name/status, one-line description, scope/runtime/edit metadata, compact spacing and selected rail; checked the chip/popover/warning structure against the design spec and prototype markup. Avatar layout follows U04's additional avatar requirement.

Actual renderer screenshots and Electron visual acceptance remain assigned to R01 as explicitly requested. No build, serve, dev, e2e, Nx or workspace verification command was run. This batch makes no claim of rendered visual approval. No new HTML artifact was created.

## Existing changes not made by this lane

`git status --short` showed the untracked directory `.ptah/specs/TASK_2026_2274_fee7/` before implementation and at completion. It was not modified or reverted. The remaining untracked entries are this batch's five source files and report.

## Anything not done

Electron screenshot review (R01), consumer wiring (U05/U06a), and barrel exports (U06a) are intentionally outside this batch. No implementation acceptance item is otherwise outstanding.

## Revision 1

Read `batch-U04-review.md` in full and fixed D1-D10 within the original five-file write set. This section supersedes the earlier implementation notes where behavior changed. No store or error-helper file was edited.

### Defect fixes and regression evidence

All paths in this table are relative to `libs/frontend/bots-ui/src/lib/`.

| Defect | Fix                                                                                                                                                                                                                                                                                     | File:line                                                                                                                       | Test name                                                                                                                                                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1     | Import and use the existing exported `avatarErrorMessage(code, 'load')` directly from `bot-error-messages.ts`. A missing image no longer claims that the bot is missing.                                                                                                                | `bot-list-row.component.ts:254`                                                                                                 | `shows a cached failure with a mapped message and rejects arbitrary image URLs` (`bot-list-row.spec.ts:121`)                                                                                                                                        |
| D2     | Render one mapped diagnostic message, omit raw wire messages entirely, and use neutral `This bot could not be read.` for unmapped codes. Track diagnostics by code plus index. Compare with the helper's fallback to recognize unmapped codes without duplicating the domain-code list. | `bot-list-row.component.ts:41`, `bot-list-row.component.ts:176`                                                                 | `renders unreadable records with version and diagnostics but no actions or avatar request` (`bot-list-row.spec.ts:155`); `uses neutral text for unknown unreadable diagnostics without wire messages or retry prompts` (`bot-list-row.spec.ts:182`) |
| D3     | Keep `remove()` as a pure selection emit; checkbox toggles use it. New `removeChip()` owns focus movement only for chip removal by click or keyboard.                                                                                                                                   | `bot-skills-picker.component.ts:140`, `bot-skills-picker.component.ts:149`                                                      | `keeps focus on the popover checkbox when unchecking a selected skill` (`bot-selection-controls.spec.ts:7`); existing final-chip focus test                                                                                                         |
| D4     | Build the accessible name by joining only non-empty parts, including handling whitespace-only last-edit text.                                                                                                                                                                           | `bot-list-row.component.ts:207`                                                                                                 | `omits an empty lastEdit (%j) without trailing separators` (`bot-list-row.spec.ts:208`)                                                                                                                                                             |
| D5     | Add `catalogLoaded`, default true; show unresolved markers only after the catalog is loaded.                                                                                                                                                                                            | `tool-id-chip-input.component.ts:33`, `tool-id-chip-input.component.ts:89`                                                      | `marks unknown tools only after the catalog is loaded` (`bot-selection-controls.spec.ts:42`)                                                                                                                                                        |
| D6     | De-duplicate selected IDs for display, keeping the first occurrence and original order. Retain original parent inputs. Keyboard indexes, overlap warnings and End navigation use the displayed collection, preventing duplicate track keys and index drift.                             | `bot-skills-picker.component.ts:110`, `tool-id-chip-input.component.ts:95`                                                      | `displays duplicate ids once in first-occurrence order without changing inputs` (`bot-selection-controls.spec.ts:56`)                                                                                                                               |
| D7     | Emit the initial avatar request only for a null cache entry. Loading, ready and error entries cause no automatic request; a later null entry still receives its one request.                                                                                                            | `bot-list-row.component.ts:265`                                                                                                 | `does not request an avatar already cached as $status` (`bot-list-row.spec.ts:222`, three cases); existing once-per-image test                                                                                                                      |
| D8     | Treat a ready entry with a rejected image URL as a failure: default icon, display-failure text and retry output. The PNG/JPEG/WebP data-URL restriction remains.                                                                                                                        | `bot-list-row.component.ts:242`                                                                                                 | `shows a cached failure with a mapped message and rejects arbitrary image URLs` (`bot-list-row.spec.ts:121`)                                                                                                                                        |
| D9     | Both labelled chip containers now have `role="group"`.                                                                                                                                                                                                                                  | `bot-skills-picker.component.ts:34`, `tool-id-chip-input.component.ts:23`                                                       | `exposes labelled chip containers as groups` (`bot-selection-controls.spec.ts:97`)                                                                                                                                                                  |
| D10    | Added all requested missing boundary tests: A-to-B requests and failure reset, popover focus, empty last-edit text and duplicate selected IDs. A-to-B-to-A also verifies no repeated request for A.                                                                                     | `bot-list-row.spec.ts:242`, `bot-list-row.spec.ts:208`, `bot-selection-controls.spec.ts:7`, `bot-selection-controls.spec.ts:56` | `requests image B once after A and resets the image failure flag`; D3/D4/D6 tests above                                                                                                                                                             |

### Input/output and integration changes

- Additive input: `ToolIdChipInputComponent.catalogLoaded: boolean = true`. Consumers should pass false while the catalog is loading or unavailable, and true after it is loaded.
- All component inputs and output names/types otherwise remain unchanged.
- `BotSkillsPickerComponent.remove()` now only emits the new selection; `removeChip()` performs chip-specific focus movement before invoking it. The checkbox path stays in the open popover.
- Duplicate selection IDs display once, preserving the first occurrence; removing a displayed identity removes all references with that identity from the emitted selection. Input arrays remain untouched.
- Avatar events still carry the image ID. Automatic `avatarNeeded` is now limited to cache misses. Retry remains explicit for cached failures and invalid ready URLs.
- U05/U06 consumers should retain store request de-duplication and defer signal-writing avatar event handlers with `queueMicrotask(() => { void store.loadAvatar(bot.id, imageId); })` (retry passes true). The row emits from its lifecycle during change detection; do not write a parent/store signal synchronously in that handler. No consumer wiring was changed in this lane.

### Revision checks

| Command                                                                                                                                                                                                                                                                                                                   | Exit code | Result                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------------------------------ |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`                                                                                                                                                                                                                                                      |         0 | Passed                               |
| `npx eslint libs/frontend/bots-ui/src/lib/bot-skills-picker.component.ts libs/frontend/bots-ui/src/lib/tool-id-chip-input.component.ts libs/frontend/bots-ui/src/lib/bot-selection-controls.spec.ts libs/frontend/bots-ui/src/lib/bot-list-row.component.ts libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts`           |         0 | No errors or warnings                |
| `npx prettier --check libs/frontend/bots-ui/src/lib/bot-skills-picker.component.ts libs/frontend/bots-ui/src/lib/tool-id-chip-input.component.ts libs/frontend/bots-ui/src/lib/bot-selection-controls.spec.ts libs/frontend/bots-ui/src/lib/bot-list-row.component.ts libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts` |         0 | All matched files use Prettier style |
| `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-selection-controls.spec.ts libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts`                                                                                                    |         0 | 2 suites, 29 tests passed            |
| `npx prettier --write` on all five TypeScript files                                                                                                                                                                                                                                                                       |         0 | Completed before final checks        |

Ptah scoped diagnostics: no diagnostics in the three components; only the same five pre-existing sibling BigInt errors. Ptah dependents remained incomplete for these new files; native reads confirmed this lane's existing APIs and test consumers. No workspace-wide verification, Nx, build, serve, e2e or git writes occurred.

### Updated line counts and handoff

| File                              | Lines after Prettier |
| --------------------------------- | -------------------: |
| `bot-skills-picker.component.ts`  |                  175 |
| `tool-id-chip-input.component.ts` |                  146 |
| `bot-selection-controls.spec.ts`  |                  303 |
| `bot-list-row.component.ts`       |                  277 |
| `bot-list-row.spec.ts`            |                  288 |

No requested defect remains open. Electron screenshots remain assigned to R01; this revision changes messages, focus, accessibility and selection/request boundaries and does not claim rendered visual approval. Existing untracked `batch-U04-review.md` and `.ptah/specs/TASK_2026_2274_fee7/` were not written or reverted by this lane. The previously loaded Angular and UI design skills continue to apply; no CLI skill loader is exposed.
