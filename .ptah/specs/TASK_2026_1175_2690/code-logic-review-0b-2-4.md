# Code logic review: batches 0b-2 and 0b-4 (commit e98220a7b)

Reviewer: CLI lane, read-only. No source file was changed. No check was run. All findings come from a read of the diff and the related source.

## Verdict: CHANGES

One major defect (D1) lets the design and visual-review phases lose the browser requirement. This happens with a version 1 user clone or with an enhancer proposal that drops the `machineCapabilities` line. A second major defect (D2) is the known risk: a disabled clone on disk still wins. The other items are minor.

---

## Confirmed defects

### D1. major: a phase file without `machineCapabilities` silently drops the browser gate for design and visual-review

- `libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts:16`: `machineCapabilities: z.array(z.enum(MACHINE_CAPABILITIES)).default([])`.
- `libs/shared/src/lib/types/phase-dispatch.schema.ts:25`: the same `.default([])`.
- `libs/backend/lane-routing/src/lib/route-decide.service.ts:331`: the gate uses `definition.machineCapabilities` directly. The legacy browser fallback at `:344` (`requiredCapabilities ??= ...`) runs only when the read or the parse throws. A successful parse returns `[]`, so the fallback does not run.
- `scripts/validate-orchestration-skill.ts:256`: the validator accepts a file that omits the field, also when `version: 2`.

Evidence of the failure paths:
1. A user clone of `orchestration` that was made before this commit has `version: 1` files with no `machineCapabilities`. `PhaseDefinitionFileReader` prefers the clone (see D2). `design.md` then parses with `machineCapabilities: []`. A request that omits `requiredCapabilities` routes design or visual-review to a candidate without a browser. This is the exact regression that the task says must not occur.
2. `SkillEnhancerService.isValidPhaseDefinition` (`libs/backend/skill-synthesis/src/lib/skill-enhancer.service.ts:942`) calls the same resolver. An LLM proposal for `phases/design.md` that removes the `machineCapabilities: [browser]` line, or keeps `version: 1`, passes the check at `:488` and `:570`. The writer then stores it, and the gate stops the browser requirement.

Suggested fix:
- In the resolver, apply the default per version. For `version: 1` with the field absent, use the legacy table (`design`, `visual-review` give `['browser']`, others give `[]`). For `version: 2`, make the field required (no `.default`).
- Apply the same rule in `phase-dispatch.schema.ts`, or derive the dispatch value from the resolver output only.
- In `validate-orchestration-skill.ts`, report an error when `version === 2` and `machineCapabilities` is absent.
- Optional: refuse an enhancer candidate that removes a capability that the current file declares (capability loss guard).
- Add specs: a version 1 `design.md` without the field must give `['browser']` at the gate. A version 2 file without the field must fail the parse.

### D2. major: a disabled or partial `orchestration` clone still wins over the ptah-core plugin

- `libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts:17-21`: the reader selects the clone when the folder `user/skills/orchestration` exists. It reads no enable state.
- The workspace skill policy has `disabledSkillIds` (`libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts:201`, `libs/backend/agent-generation/src/lib/services/content-generation.service.ts:568`). The reader ignores it.
- When the user disables the clone, the session uses the plugin skill, but the gate reads the clone. The two sources can disagree on `machineCapabilities`. Together with D1, an old clone that the user disabled can still remove the browser gate.
- Partial clone: `writeEnhancedSkill` and the new `writeSkillPhaseFile` create the clone folder when it does not exist (`user-layer-skill-phase-writer.ts:53`). A folder with only `SKILL.md`, or with only one phase file, makes every other kind throw `MISSING`. The gate then logs a warning and uses the legacy table on each call. This is safe for the browser gate but it is noisy, and the reader comment says "Reads the active user clone", which is not true here.

Suggested fix:
- Give the reader a host predicate (for example `isCloneActive(): Promise<boolean>`) that checks the effective `disabledSkillIds`. Use the plugin when the clone is disabled.
- Per file: when the clone is active but `phases/<kind>.md` does not exist, read the plugin file for that kind.
- Add a spec for a disabled clone and for a clone without a `phases/` folder.

---

## Minor defects

### D3. minor: the gate warning hides the error code

- `libs/backend/lane-routing/src/lib/route-decide.service.ts:336` logs only `errorName`. For a resolver failure this is always `PhaseDefinitionError`. The `code` (`MISSING`, `INVALID_SCHEMA`, `KIND_MISMATCH`, ...) is lost.
- Suggested fix: add `code: error instanceof PhaseDefinitionError ? error.code : undefined` to the log fields.

### D4. minor: the "reader unavailable" warning runs on every gate call in a host without a reader

- `route-decide.service.ts:340`. VS Code registers no reader (batch 0b-4 result confirms this). Each gate call logs one warning per phase kind. This is log noise, not a logic error.
- Suggested fix: log one time per service instance, or log at debug level after the first time.

### D5. minor: `writeSkillPhaseFile` creates a clone folder that has no `SKILL.md`

- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts:52-53`. When the clone folder does not exist, the writer creates it and writes only `phases/<kind>.md`. A folder with no `SKILL.md` can then shadow the plugin skill for the reader (D2), and perhaps for the skill loader.
- The enhancer reads the clone before a proposal, so this path is unlikely in normal use. The existing `writeEnhancedSkill` has the same pattern.
- Suggested fix: for a phase file, refuse the write when the clone folder or its `SKILL.md` does not exist.

### D6. minor: revert to a clone that has no `phases/` folder can fail

- `user-layer-skill-phase-writer.ts:78`: `copyFileAtomic(source, target)` runs without `mkdir(dirname(target))`. If the user deleted `phases/` after the snapshot, the copy fails. The enhancer catches the error and returns `reverted: false` with a warning (`skill-enhancer.service.ts` revert catch). There is a new snapshot left behind but no restore.
- Suggested fix: `await mkdir(join(cloneDir, 'phases'), { recursive: true })` before the copy, as the write path does.

### D7. minor: no CLI DI assertion for the two new bindings

- Electron has assertions (`container.smoke.spec.ts`, `surface-composition.spec.ts`, `expected-resolvable.ts`). The CLI bindings in `libs/backend/cli-engine/src/lib/container.ts` (reader) and `thoth/register-thoth-libraries.ts` (writer) have no spec. A later move of the writer outside the `try` block, or a removal, will not fail a test.
- Suggested fix: add a CLI container spec that resolves `LANE_ROUTING_TOKENS.PHASE_DEFINITION_READER` and `SKILL_FILE_WRITER_TOKEN`.

---

## Items checked with no defect found

- Phase files: the 12 files in `plugins/ptah-core/skills/orchestration/phases/` declare `version: 2`. `design` and `visual-review` declare `[browser]`. The other ten declare `[]`. The batch result reports 0 SHA256 mismatches with the `.claude` copies.
- Removed `requiredCapabilities()` helper: its only two callers (`candidate-tools.ts`, `hard-constraints.ts`) now get the resolved list. `constrainPhase` and `readCandidateTools` are called only from `RouteDecideService.decide` after `resolveMachineRequirements`. No other path skips the resolution.
- A caller that sends `requiredCapabilities: []` for design keeps `[]`. This is the documented decision, not a defect.
- Slug lock: both `writeSkillPhaseFile` and `revertSkillPhaseFile` run all path work, the snapshot, the write and the sidecar refresh inside `ops.withSlugLock`. The lock key is `skill/<slug>`, the same key as `writeEnhancedSkill`, so a SKILL.md write and a phase write on the same clone are serialized.
- Path traversal: `isSkillCloneFile` plus `phaseKindOfSkillCloneFile` limit `file` to the shared list. `isInsideRoot` checks the clone folder, the target, `phases/`, the history root, the history folder and the history file. `historyTs` must equal its `basename`. A slug with `/` passes but stays inside the skills root. The lock key then differs from a normalized slug. This is theoretical because the RPC schema limits the slug.
- Snapshot and restore: the write snapshots the whole folder before the write. The revert snapshots the whole folder, then restores only `file`. A missing snapshot or a missing file in it returns `restored: false` before any snapshot. This matches the port contract.
- Sidecar: both paths compute `computeSourceHash(cloneDir)` after the change and call `refreshEnhancedSidecarDir`, the same helper as `writeEnhancedSkill`.
- Reader roots: `join(resolvePtahHomeDir(), 'user', 'skills')` equals `UserLayerMirrorService.getUserLayerRoots().skills`. `read()` refuses an unknown kind.
- DI order, Electron: the reader is registered before `registerLaneRoutingServices`. The route service resolves the optional token lazily in its factory, so the order is also safe in reverse. The writer is registered synchronously after `registerSkillSynthesisServices`, and `SkillEnhancerService` is a lazy singleton with `@inject(SKILL_FILE_WRITER_TOKEN, { isOptional: true })`. No resolution occurs between the two calls.
- DI order, CLI: `registerAgentGenerationServices` (`container.ts:831`) runs before `registerThothLibraries` (`:843`). The writer factory resolves `USER_LAYER_MIRROR_SERVICE` lazily.

## Speculation (not confirmed)

- The enhancer `applyProposal` computes `phaseFile` without a check that `proposal.kind === 'skill'`. The revert path has this check. If an earlier step can cache a phase-file proposal for an agent or command kind, the writer would write under `user/skills/<slug>`. This is batch 0b-1 or 0b-3 scope and was not traced.
- `resolveMachineRequirements` runs the reads in parallel with `Promise.all`. Two phases of the same kind can both read the file and both log a warning. The result is correct.
