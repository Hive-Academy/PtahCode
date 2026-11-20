# Batch U05

Implemented four standalone OnPush components and two focused specs. Components never call RPC directly; BotsStore remains the only draft writer. No git writes were performed.

## Files and contracts

All six TypeScript files were formatted with Prettier and are under 700 lines. Final physical line counts are listed below.

| File in libs/frontend/bots-ui/src/lib     | Lines |
| ----------------------------------------- | ----: |
| bot-identity-runtime-section.component.ts |   557 |
| bot-skills-tools-section.component.ts     |   107 |
| bot-memory-approval-section.component.ts  |   173 |
| bot-delete-dialog.component.ts            |   200 |
| bot-form-sections.spec.ts                 |   308 |
| bot-delete-dialog.spec.ts                 |   142 |

| Component / selector                                                   | Inputs                                                                                                                                                      | Outputs                                      | Store use                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BotIdentityRuntimeSectionComponent / ptah-bot-identity-runtime-section | None                                                                                                                                                        | None                                         | Reads draft, selected, workspaceRoots, validation, readonly, blockedReason, error, lanes, catalogLoading, catalogDiagnostics, avatars, avatarUpload. Writes through patchDraft; calls uploadAvatar without scope and loadAvatar, including force=true retry. |
| BotSkillsToolsSectionComponent / ptah-bot-skills-tools-section         | installedSkills: readonly InstalledSkill[] = []; knownToolIds: readonly string[] = []; catalogLoaded = false; catalogLoading = false; catalogFailed = false | None                                         | Reads draft/readonly/blockedReason; patches skills and toolRequirements. Loading or failure forces child catalogLoaded=false.                                                                                                                                |
| BotMemoryApprovalSectionComponent / ptah-bot-memory-approval-section   | None                                                                                                                                                        | None                                         | Reads draft/workspaceRoots/readonly/blockedReason; patches memoryScope and approvalRules; rootError() exposes root validation. Triggers are informational.                                                                                                   |
| BotDeleteDialogComponent / ptah-bot-delete-dialog                      | isOpen = false; name = 'bot'                                                                                                                                | confirmed: BotRemovalIntent; cancelled: void | Reads dirty/readonly/blockedReason. Emits intent without executing archive/delete. Owns transient dialog choices only.                                                                                                                                       |

BotRemovalIntent is exported from the dialog file: `{ kind: 'archive' } | { kind: 'delete'; retention: BotRetention }`.

U06b must supply installed skill/tool catalogs and provide `PROVIDER_MODELS_LOADER` from `@ptah-extension/ui` above the main-provider picker. The existing picker requires that port; these components provide no transport adapter. The parent progress report describing integration contracts was rejected with `parent-inbox-full` and was not retried.

## Checks

| Check                                                                                                                | Final exit code | Evidence                                                             |
| -------------------------------------------------------------------------------------------------------------------- | --------------: | -------------------------------------------------------------------- |
| npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json                                                   |               0 | No output/errors.                                                    |
| npx eslint (six new TypeScript files)                                                                                |               0 | No errors or warnings, including max-lines.                          |
| npx prettier --check (six new TypeScript files)                                                                      |               0 | All matched files use Prettier code style.                           |
| npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath (two new specs) |               0 | Two suites, 20 tests passed.                                         |
| npx prettier --write (every created file)                                                                            |               0 | Applied before final formatting checks; report formatted separately. |

Scoped Ptah diagnostics found no errors in the new components/specs. They also reported the five known shared ES2016/BigInt diagnostics in capability-id-codec.ts and messages/attention-identity.ts, left unchanged as instructed. No nx, verify, build, serve or e2e command ran.

Initial ESLint exited 1 for unused destructured fields and a constructor accessibility warning; corrected. Initial Jest exited 1 because the test injector lacked PROVIDER_MODELS_LOADER; corrected. An additional diagnostic-only test generic error was fixed before final checks.

Tests cover all runtime-kind transitions, system/Ptah CLI target changes without stale fields, symbolic Default without capturing changed provider catalog data, unresolved IDs/models, icon choice, failed upload preserving the avatar, upload without scope, image removal, cached image retry, conflict editing and saving locks, tool catalog loading/failure, memory defaults/root validation, inactive triggers, archive default, all four retention combinations, radio keyboard navigation/focus/checked state/labels/roving tabs, reopen defaults, cancel and blocked confirmation.

## Decisions

The four feature components inject BotsStore; the store remains the only draft writer. The delete dialog emits a confirmation intent for its composing editor.

- Runtime kind lives inside Runtime: Default / Main provider / CLI lane. Kind switches replace the whole union. Lane target switches clear model/tier/effort belonging to the previous target.
- Default stays `{ kind: 'default' }`; no current setting is copied. Main selections may be temporarily empty and schema-invalid until filled. Only Main renders the shared provider picker. Missing provider IDs are supplied as extra identities; unresolved lane IDs remain visible; model IDs stay editable.
- Memory offers Private and Workspace, matching the wire schema. The prototype's No memory option cannot be represented and is omitted. Root mismatches show the bot root; empty workspace-memory roots prompt for a selection.
- Floating ptah-field labels and designed ptah-select menus follow the approved aside/fields structure. The required shared provider picker retains its existing presentation. Sections divide rows, use muted asides and collapse to one column at narrow widths.
- Conflict fields remain editable through readonly(); selecting/saving/archive lock fields. Removal confirmation also respects blockedReason(), including conflicts. U06b owns Save, Enabled and conflict action orchestration.
- Avatar uses file upload rather than arbitrary paths. Choosing Image opens the file control; only successful store upload commits an image. Bad type/size/read failures use the store upload error path. Delayed local reads are ignored if the draft changes. Failed cached images have a force-retry action.
- Delete uses local accessible radio groups, resets to Archive and Keep/Keep on open, and keeps memory/history independent. There are no execution controls.
- Error text uses botErrorMessage/avatarErrorMessage. Identity reads editor error(), never listError().

## Skills, tools and unrelated state

Read and applied `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/ui-ux-designer/SKILL.md` with the approved task design/prototype. No separate CLI skill-loading mechanism is exposed; native file reads were used.

Ptah source-search/structure attempts supplied no useful picker paths or rejected the filePath argument; native rg/Get-Content supplied source context. Scoped Ptah diagnostics were usable. Native edits touched only the authorized new files.

At initial and final git reads, `.ptah/specs/TASK_2026_2274_fee7/` was an unrelated untracked directory. This lane did not create/modify/revert it. All other final untracked paths were this lane's six files and report.

## Unmet requirements

Electron screenshots and rendered visual inspection are deferred to R01 as requested. Source structure/copy were checked against the design sections for labels, Runtime, defaults, root validation, inactive triggers and removal plus the approved prototype's aside/fields grammar; rendered fidelity is not claimed. Provider-loader/catalog integration and editor actions remain U06b responsibilities. No src/index.ts or read-only dependency was modified.

## Revision 1

Read batch-U05-review.md in full and addressed D1–D10. This section supersedes the initial contracts/decisions concerning dialog dirty state, archived removal, local upload validation, dropped reads and editor errors.

Paths below are relative to `libs/frontend/bots-ui/src/lib/`.

| Review item | Fix and file:line                                                                                                                                                                                                                                                                                             | Regression test name                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1          | `bot-delete-dialog.component.ts:123`: removal ignores readonly(); only selecting/saving/conflict block it. An archived bot can be deleted.                                                                                                                                                                    | `allows deleting an archived bot and hides Archive`; `blocks removal while %s`                                                                                                                                                          |
| D2          | `bot-delete-dialog.component.ts:119`: added archived input; archived dialogs begin in Delete permanently and omit Archive. Radio focus offsets handle the single method option.                                                                                                                               | `allows deleting an archived bot and hides Archive`                                                                                                                                                                                     |
| D3          | `bot-identity-runtime-section.component.ts:545`: avatar context compares selected bot ID, scope and avatar rather than draft object identity. One incrementing token rejects old completions; each new pick aborts the previous reader. Dropped reads announce a status message. Destroy aborts pending work. | `uploads a successful reader result without scope after unrelated typing`; `shows a local reader error without uploading`; `aborts the older reader and ignores out-of-order completion`; `announces a dropped reader after %s changes` |
| D4          | `bot-identity-runtime-section.component.ts:567`: wrong MIME type and files over 2 MB fail locally using avatarErrorMessage('INVALID_PARAMS', 'upload'). FileReader errors also use local helper text. No invalid-file RPC/store upload occurs.                                                                | `rejects %s locally without an upload or read`; `shows a local reader error without uploading`                                                                                                                                          |
| D5          | `bot-identity-runtime-section.component.ts:431`: lane selection prefers the first available lane, then the first unavailable lane if necessary, then an empty invalid target when no lanes exist.                                                                                                             | `prefers an available lane and falls back to the first unavailable lane`; existing runtime kind-switch test covers the empty catalog                                                                                                    |
| D6          | `bot-delete-dialog.component.ts:127`: linked choice reset source includes isOpen, name and archived. Changing target while open resets method and Keep/Keep.                                                                                                                                                  | `resets choices when an open dialog targets another name`; existing reopen test                                                                                                                                                         |
| D7          | `bot-delete-dialog.component.ts:120`: added dirty input, default false. The warning reads that input and never store.dirty().                                                                                                                                                                                 | `shows the dirty warning only from its input`                                                                                                                                                                                           |
| D8          | `bot-identity-runtime-section.component.ts:276`: Effort uses ptah-select; `:346` provides Default/low/medium/high plus an unresolved stored value. Wire effort is an optional nonempty string, not an enum, so unknown values are retained. Default removes effort.                                           | `uses designed effort choices and preserves an unresolved stored effort`                                                                                                                                                                |
| D9          | `bot-identity-runtime-section.component.ts:61`: removed the section's store.error() rendering and botErrorMessage import. U06b exclusively owns editor error presentation. Avatar-local errors remain in Identity.                                                                                            | `leaves the editor error to the composing editor`                                                                                                                                                                                       |
| D10         | `bot-skills-tools-section.component.ts:85`: no code change. U06b must bind installedSkills, knownToolIds, catalogLoaded, catalogLoading and catalogFailed. The latter catalog state inputs describe the tool catalog supplied by the parent.                                                                  | Existing `passes false catalogLoaded during tool loading or failure and preserves ids`                                                                                                                                                  |

### Input/output changes

The delete dialog adds `archived = input(false)` and `dirty = input(false)`. U06b must pass the target bot's archived and dirty states, provide its name, mount the dialog closed and toggle isOpen. Existing confirmed/cancelled outputs and BotRemovalIntent are unchanged. Section inputs and outputs are unchanged. U06b continues to supply PROVIDER_MODELS_LOADER and the five skills/tools inputs above. Error ownership now belongs exclusively to the editor.

### Revision checks

| Check                                                                                                                | Exit code | Result                                                    |
| -------------------------------------------------------------------------------------------------------------------- | --------: | --------------------------------------------------------- |
| npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json                                                   |         0 | Passed after component changes.                           |
| npx eslint (six U05 TypeScript files)                                                                                |         0 | No errors or warnings.                                    |
| npx prettier --write (six U05 TypeScript files and report)                                                           |         0 | Formatted all six; unchanged sections remained unchanged. |
| npx prettier --check (six U05 TypeScript files)                                                                      |         0 | All matched files use Prettier code style.                |
| npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath (two U05 specs) |         0 | Two suites, 35 tests passed.                              |

The first revision Jest run exited 1 (34 passed, one failed): the new effort test incorrectly called a model signal's generated output as a class property. Corrected it to use value.set(); final run passed. Scoped Ptah diagnostics show no errors in revised components/specs; only the five acknowledged shared ES2016 BigInt diagnostics remain.

Final formatted line counts: identity/runtime 614; skills/tools 107; memory/approval 173; delete dialog 217; form specs 463; dialog specs 206. All are below 700 lines. Electron screenshots remain deferred to R01. No required D1–D10 work remains in U05; U06b bindings above are integration responsibilities.

The Ptah dependent lookup had no indexed entry for the new dialog and reported incomplete coverage; native source reads and lane-only checks provided verification. No git writes or edits outside the authorized six files/report were made. At revision start, carry-forward.md was already modified and batch-U05-review.md plus TASK_2026_2274_fee7/ were unrelated untracked paths; left unchanged.
