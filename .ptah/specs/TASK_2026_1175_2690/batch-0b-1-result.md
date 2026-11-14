# Batch 0b-1 result: learning on phase files

Status: partial. Steps 1, 2, 3, 5, 6 and 7 are done. For step 4, the one-file revert works only after
the coordinator gives the write port a host implementation (see "Not done").

## Changed files

Shared (owned):

- `libs/shared/src/lib/types/rpc/rpc-skill-clone.types.ts`
  - New: `SKILL_CLONE_MAIN_FILE`, `SkillClonePhaseFile`, `SkillCloneFile`, `skillClonePhaseFile()`,
    `SKILL_CLONE_FILES`, `isSkillCloneFile()` (exact match), `phaseKindOfSkillCloneFile()`.
  - `file?: SkillCloneFile` on the Preview, GetHistoryBody and Revert params.
  - `phaseFiles?: SkillClonePhaseFile[]` on `SkillSynthesisGetCloneResult`.
  - Reads `PHASE_KINDS` from `phase-contract.types.ts`. It does not edit that file.

Backend `skill-synthesis`:

- New `src/lib/skill-file-writer.port.ts`: `SkillFileWriterPort` (`writeEnhancedSkillFile`,
  `revertSkillFile`) and `SKILL_FILE_WRITER_TOKEN = Symbol.for('PtahSkillFileWriter')`.
- `src/index.ts`: exports the port, the token and the port types.
- `src/lib/skill-enhancer.service.ts`:
  - `EnhanceOptions.file`, new skip reasons `invalid-file` and `phase-write-unavailable`.
  - The body target comes from `file` (`<skills>/<slug>/phases/<kind>.md`).
  - `resolvePhaseDefinition` (from `@ptah-extension/lane-routing`) runs on the candidate at
    preview and again at apply. A `PhaseDefinitionError` refuses with `invalid-candidate`, and the
    old file stays. Any other error is rethrown.
  - A phase apply and a phase revert go through the optional port only (last constructor
    parameter, `isOptional`). `SKILL.md` and the agent and command kinds keep the mirror path.
  - `supportsPhaseFileWrites()`.
- New spec `src/lib/skill-enhancer.phase-file.spec.ts` (8 tests).

Backend `rpc-handlers` (owned handler and its helpers):

- `handlers/skills-synthesis-rpc.schema.ts`: `SkillCloneFileSchema` (`z.custom` with
  `isSkillCloneFile`) and a `superRefine` that refuses `file` on kinds `agent` and `command`.
- New `handlers/skill-synthesis/skill-clone-file-path.ts`: `isInsideRoot`,
  `resolveSkillCloneFilePath` (checks the joined path and the real path of an existing file),
  `listSkillClonePhaseFiles`.
- `handlers/skills-synthesis-rpc.handlers.ts`:
  - getClone returns `phaseFiles` (empty for agent and command).
  - preview and revert: path check (`INVALID_PARAMS`), then a `PERSISTENCE_UNAVAILABLE` refusal
    when the host has no write port.
  - getHistoryBody reads one phase file from the snapshot folder.
  - rebase (only when not failed) and keep mine call `resyncProviders`. This is the same
    `repropagate(kind, slug, root, { userInitiated: true })` call that enhance and revert use.
    A failure is reported (`report`) and does not fail the RPC, because the clone change is
    already committed.
- New spec `handlers/skill-synthesis/skill-clone-file-path.spec.ts` (Zod parse and path checks).
- `handlers/skills-synthesis-rpc.handlers.spec.ts`: the two old revert assertions now expect
  the fifth argument `'SKILL.md'`. The enhancer double has `supportsPhaseFileWrites`. There is a
  new `describe` with 8 cases: one-file revert, no-port refusal, 3 `INVALID_PARAMS` refusals,
  re-sync after rebase, no re-sync after a failed rebase, re-sync after keep with a failure
  that does not fail the keep.

Frontend `skill-synthesis-ui`:

- New `components/clones/clone-phase-files.component.ts`: the phase rows (OnPush, signals,
  `input()`/`output()`, `ptahButton`). Each row has Enhance, a History toggle and
  "Revert this file" for each snapshot.
- `components/clones/clone-detail-drawer.component.ts`: new `phaseFiles` input, and the outputs
  `phaseEnhance` and `phaseRevert`. The rows show only for kind `skill`, a non-empty list, and
  `!m.actions.retired` (the step 0a guard). Enhance uses the same gates as the main button
  (`actions.enhance.enabled`, `enhanceBlockedReason`, `busy`). Revert uses `actions.revert`.
- `components/clones/skill-clones-view.component.ts`: passes `phaseFiles`, and wires the
  outputs to `onEnhance(clone, file)` and `onRevertTo`. `previewFile` tracks the file of the
  open preview. A phase preview is applied through `applyProposal`, never through
  `saveCloneBody`, because `saveCloneBody` writes only `SKILL.md`. A refused apply shows the
  skip reason in the preview drawer.
- `services/skill-synthesis-rpc.service.ts`: an optional `file` on `previewEnhancement`,
  `getHistoryBody` and `revertEnhancement`. The key is sent only when it is given.
- `services/skill-clones-state.service.ts`: `SkillCloneDetail.phaseFiles?`.
- New spec `components/clones/clone-detail-drawer.phase-files.spec.ts` (6 tests).
- `components/clones/skill-clones-view.component.spec.ts`: two assertions now expect the
  trailing `undefined` file argument.

## Decisions and assumptions

- Write port, not a direct edit of the mirror: the slug lock, the folder snapshot and the
  sidecar refresh belong to `UserLayerMirrorService` in `agent-generation`, which 0b-1 does not
  own. The enhancer depends on an optional port (`SKILL_FILE_WRITER_TOKEN`). The pattern is the
  same as `SKILL_REPROPAGATION_TOKEN`.
- Without a bound port, the backend refuses a phase apply or revert before it writes anything.
  The RPC refuses with `PERSISTENCE_UNAVAILABLE` ("This app version cannot change a phase file
  yet."). The preview is refused too, so that no model call is wasted.
- Error codes: the list in `rpc-error-codes.types.ts` is fixed and not owned. I used only
  `INVALID_PARAMS` and `PERSISTENCE_UNAVAILABLE`.
- The schema file and the new path helper count as helpers of the owned handler.
- A revert with no `file` or with `SKILL.md` stays folder-wide, as before. Only a phase file
  is a one-file revert.
- The `file` parse is an exact match against `SKILL_CLONE_FILES`, with no normalization. A
  backslash, `..`, an absolute path, a different case, extra spaces or an unknown kind fail.
  The path check (joined path and real path) is a second gate.
- The drawer rows moved into a child component, so the drawer stays under the `max-lines`
  lint limit.
- The phase history list uses the folder snapshots (`history`) of the entry. A snapshot that
  does not have the file returns `body: null` from getHistoryBody.

## Checks

- `npx tsc --noEmit --project libs/backend/skill-synthesis/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/frontend/skill-synthesis-ui/tsconfig.lib.json`: pass.
- `tsconfig.spec.json` for skill-synthesis, rpc-handlers and skill-synthesis-ui: no error in a
  0b-1 file. Errors from outside 0b-1 exist:
  - BigInt target errors in `libs/shared` (`capability-id-codec.ts`, `attention-identity.ts`).
  - `rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.spec.ts:184`: missing
    `machineCapabilities` on `PhaseDefinitionV1`. This comes from the concurrent 0b-2 edit.
- Jest (through `node scripts/verify.mjs --exec`):
  - `skill-enhancer.phase-file.spec.ts`: 8/8 pass.
  - rpc-handlers `skill-clone-file-path.spec.ts`, `skills-synthesis-rpc.handlers.spec.ts` and
    `skills-synthesis-rpc.schema.spec.ts`: 312/313 on the first run. The one failure was the
    log assertion of my new keep case. I fixed it, and the new cases (`-t U-D13`) then passed
    8/8.
  - UI `clone-detail-drawer.phase-files.spec.ts` (6) and `clone-detail-drawer.component.spec.ts`:
    pass. `skill-clones-view.component.spec.ts` failed 2 cases on the first run: the view now
    passes the optional `file` argument as `undefined`. I updated the two assertions (revert,
    preview), and the file then passed 77/77.
- `npx eslint` on all changed files: 0 errors. There are `max-lines` warnings on the handler,
  the view and the enhancer, which were over the limit before this batch. The drawer is under
  the limit after the split.
- `tools/role-census/check-role-census.ts`: exit 0.
- `tools/degradation-audit/check-degradation.ts`: exit 0.
- `tools/ui-class-audit/check-ui-classes.ts`: exit 0 (0 counts over baseline).
- No visual check in Electron. A lane cannot run serve or dev.

## Not done

- The host implementation of `SkillFileWriterPort`. The coordinator or the owner must add two
  methods to `UserLayerMirrorService`
  (`libs/backend/agent-generation/src/lib/services/user-layer/user-layer-mirror.service.ts`).
  0b-1 does not own that file.
  - `writeEnhancedSkillFile({ slug, file, newBody })`: take the slug lock, snapshot the folder,
    write only `<slug>/phases/<kind>.md`, refresh the sidecar, return
    `{ slug, historyTs, currentContentHash }`.
  - `revertSkillFile({ slug, file, historyTs })`: take the slug lock, snapshot the current
    folder, copy only that file from `history/<historyTs>/`, refresh the sidecar, return
    `{ restored, revertedFrom, newHistoryTs }`. `restored: false` when the snapshot has no such
    file.
- The DI binding `SKILL_FILE_WRITER_TOKEN` → the mirror in the Electron container, and in the
  other hosts that register the enhancer. This probably also touches the expected-resolvable
  lists and the DI guard specs, which 0b-1 does not own (0b-3 owns them).
- Until both items land, the phase rows show in the drawer, but Enhance and Revert on a phase
  file return the `PERSISTENCE_UNAVAILABLE` refusal (the view shows it as a toast or a preview
  error).

## Risks for the coordinator

- 0b-2 edits `phase-contract.types.ts` concurrently. 0b-1 reads only `PHASE_KINDS` and
  `PhaseKind`. A rename there breaks `rpc-skill-clone.types.ts`.
- The `PhaseDefinitionV1.machineCapabilities` change (0b-2) breaks the rpc-handlers spec
  typecheck in `child-chat-session-host.adapter.spec.ts`. The cause is not in 0b-1.
- The enhancer check uses the real `resolvePhaseDefinition`. If 0b-2 makes the contract
  stricter, phase candidates that the model writes are refused more often
  (`invalid-candidate`). This is the intended behavior, but the prompt guidance
  (`phaseBestPracticeGuidance`) may need the new fields.
- `saveCloneBody` writes only `SKILL.md`. The view now routes a phase preview through
  `applyProposal`. A new caller of `saveCloneBody` with a phase draft would write the wrong file.
- Run the full gate for `skill-synthesis`, `rpc-handlers`, `skill-synthesis-ui` and `shared`,
  plus `typecheck-templates` for `ptah-extension-webview` (template change).
- `ptah_agent_report` to the parent failed earlier (parent-inbox-full). This file is the
  report.
