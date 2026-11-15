# Phase 6 plan: General workflow

Program: TASK_2026_977_0876. Branch: `feat/phase6-general-workflow`. No source file changes in this plan.

## 1. Scope summary

Phase 6 makes the workflow independent of software. The skeleton has five steps: clarify, plan, do, check, deliver. The software workflow (plan, design, batch, implement, test, review) becomes one pack on that skeleton. A pack format lets other work types add phases. Research, content and operations are the first example types.

Source: `task-description.md:265-273`. Acceptance there: one non-software task and one software task run on the same skeleton.

Phase 6 builds on the contract of Phases 1 and 2. That contract has `PHASE_KINDS` at `libs/shared/src/lib/types/phase-contract.types.ts:5-18` and `PhaseDefinitionV1` at `:22-43`. Today the 12 kinds are software-shaped. The flow table is at `plugins/ptah-core/skills/orchestration/SKILL.md:51-60`.

## 2. File write sets

Marker: "⚠️ PHASE 5 OVERLAP" means Phase 5 may also edit the file. Phase 5 removes agent generation. Its census names `libs/backend/agent-generation/**`, `setup-rpc.handlers.ts` and the DI guards in `apps/ptah-electron/src/di/`. Phase 6 should not need these files.

### A. Skeleton and pack contract (shared types)

| File | Change |
| --- | --- |
| `libs/shared/src/lib/types/phase-contract.types.ts:5-20` | Add skeleton step type (`clarify`, `plan`, `do`, `check`, `deliver`). Add `PackDefinitionV1`. Keep `PHASE_KINDS` and the alias rules unchanged. |
| `libs/shared/src/lib/types/phase-contract.types.spec.ts` (new or existing, verify the path) | Tests for the skeleton map and pack shape. |
| `libs/shared/src/lib/types/retired-roles.ts:17` | Read only. Phase 4 step 4 owns it. Do not edit. |
| `libs/shared/src/lib/types/task-spec.contract.ts` | Only if a task needs a `pack` field. Phase 4 step 4 edits this file (`step-4-plan.md:16`). Edit after step 4 merges. |
| `libs/shared/src/index.ts` (verify) | Export the new types. |

### B. Orchestration skill (both mirrors, byte-identical)

Trees: `plugins/ptah-core/skills/orchestration/` and `.claude/skills/orchestration/`.

| File | Change |
| --- | --- |
| `SKILL.md:41-67` | Replace the "Phase-kind flows" table with the skeleton and a pack section. The software flows move to the software pack. |
| `SKILL.md:12-38` | Pre-flight: type detection must accept non-software types. |
| `phases/*.md` (12 files) | Add a skeleton-step field to the frontmatter of each file. Do not rename kinds. |
| `packs/software.md` (new) | The software pack. It holds the type-to-flow table that leaves `SKILL.md`. |
| `packs/research.md`, `packs/content.md`, `packs/operations.md` (new) | Minimal packs. Each lists its phases on the skeleton. |
| `references/pack-format.md` (new) | The pack format: fields, rules, how a pack adds a phase. |
| `references/strategies.md`, `references/checkpoints.md` | Update links and gate wording. |
| `references/team-leader-modes.md` | ⚠️ Phase 4 step 4 renames this file (`step-4-plan.md:17`). Phase 6 starts after that rename. |
| `references/agent-catalog.md`, `lane-assignment.md`, `git-standards.md`, `fleet.md` | ⚠️ Phase 4 step 4 edits these (`step-4-plan.md:17`). Phase 6 edits links only, after step 4. |

### C. Command copies

| File | Change |
| --- | --- |
| `plugins/ptah-core/commands/orchestrate.md`, `.claude/commands/orchestrate.md` | Type detection and pack choice. ⚠️ Phase 4 step 4 edits lines 37 and 48 (`step-4-plan.md:18`). |

### D. Validator and manifests

| File | Change |
| --- | --- |
| `scripts/validate-orchestration-skill.ts:446-475` | `validatePhases` requires one file for each `PHASE_KINDS` entry. Add checks for pack files. Keep the retired-role check. ⚠️ Phase 4 step 4 edits `:117,139,169,973`. |
| `content-manifest.json`, `agent-pack-manifest.json` | Regenerate with `npm run manifest:generate`. Never hand-edit. ⚠️ PHASE 5 OVERLAP (Phase 5 removes agent packs). |

### E. Routing and runtime

| File | Change |
| --- | --- |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts` | Accept a pack name and resolve the phase list. ⚠️ Phase 4 step 4 edits it (`step-4-plan.md:26`). |
| `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:27` | Keep the second `PhaseKind` alias in sync. Read only unless the type changes. |

### F. Examples and tests

| File | Change |
| --- | --- |
| `.ptah/specs/TASK_2026_977_0876/phase-6-examples/software-task.md` (new) | Software example on the skeleton. |
| `.ptah/specs/TASK_2026_977_0876/phase-6-examples/non-software-task.md` (new) | Non-software example (research or content). |
| `scripts/validate-orchestration-skill.ts` self-test (verify the location) | Fixture for both examples. |

### G. Docs and census

| File | Change |
| --- | --- |
| `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md` | ⚠️ Phase 4 step 4 and Phase 5 also edit the docs folder. Describe skeleton and packs. |
| `tools/role-census/` baselines | Never edit. |

## 3. Slices

Slices run in order. Slice 3 may start while slice 2 runs if the write sets stay disjoint.

| Slice | Files | Work phase | Size |
| --- | --- | --- | --- |
| 1. Skeleton and pack contract | Group A | plan, implement, test | M |
| 2. Software pack extraction | Group B (SKILL.md, `packs/software.md`, `phases/*.md` frontmatter, `pack-format.md`), group C, group D | implement, review | L |
| 3. Non-software packs and examples | Group B (`packs/research.md`, `content.md`, `operations.md`), group F | implement, test | M |
| 4. Routing, docs, verification | Group E, group G, manifests | implement, test, review | S |

Notes for each slice:

1. The skeleton map must be total. Each of the 12 kinds maps to one skeleton step. `batch` and `completion` map to `do` and `deliver`. The map is a data table, not a role list.
2. This slice is the largest. It must keep both skill mirrors byte-identical. The validator runs after each edit.
3. Choose one research example and one content example. Both use only existing phase kinds where possible. A new kind needs a new phase file and a validator update.
4. Docs and routing come last. They depend on the final pack names.

Lane rule: lanes run only focused checks (`CLAUDE.md` "Two-level check"). The coordinator runs `npm run verify`. Send lanes the Electron-first rule.

## 4. Acceptance criteria

1. One non-software task example runs through clarify, plan, do, check and deliver.
2. One software task example runs through the same five steps. It uses the software pack.
3. Both examples use the same skeleton definition. No example has its own copy of the skeleton.
4. No workflow path names a role. Search the orchestration skill, packs, phase files and command copies for the 14 retired slugs. Permit only alias and legacy-read files.
5. The two orchestration skill trees are byte-identical. Compare the file lists and the bytes. The two `orchestrate.md` copies are also identical.
6. `npm run validate-skill` passes.
7. `npm run manifest:generate` followed by `npm run manifest:check` passes. The diff is intended.
8. The role census check exits 0 without `--update`. No bucket exceeds its ceiling.
9. A pack file can add a phase with no change to TypeScript code. Prove this with a test pack in the validator self-test.
10. Existing software tasks (`FEATURE`, `BUGFIX`, `REFACTORING`) route as before. Their phase order does not change.
11. Scoped checks pass for `shared` and `vscode-lm-tools`. The coordinator runs them.

## 5. Phase 5 file overlaps

| File | Likely editor | Owner and action |
| --- | --- | --- |
| `content-manifest.json`, `agent-pack-manifest.json` | Phase 5 removes agent packs. Phase 6 adds skill pack entries. | Regenerate after each merge. The later phase owns the final regeneration. Flag for coordination. |
| `apps/ptah-docs/src/content/docs/agents/*` | Phase 5 (generation docs). Phase 6 (`agent-orchestration.md`). | Disjoint files. Phase 6 owns `agent-orchestration.md` only. |
| `libs/backend/agent-generation/**` | Phase 5 only. | Phase 6 does not edit it. |
| `libs/backend/rpc-handlers/.../setup-rpc.handlers.ts` | Phase 5 only. | Phase 6 does not edit it. |
| `apps/ptah-electron/src/di/*` guards | Phase 5 only. | Phase 6 does not edit them. |
| `tools/role-census/**` baselines | Both phases lower the census. | Never edit. Report exact counts. |
| `libs/shared/src/lib/types/phase-contract.types.ts` | Phase 6. Phase 5 only if it changes a type. | Phase 6 owns it. Ask Phase 5 to avoid it. |

No source file of Phase 6 sits in the Phase 5 generation surface. The overlap is limited to generated manifests and docs.

## 6. Risks

| Risk | Handling |
| --- | --- |
| Phase 4 step 4 edits the same orchestration files (`step-4-plan.md:17-19,26`). | Start slice 2 after step 4 merges. Slice 1 does not conflict. |
| Step 4 renames `team-leader-modes.md`. Links break if both phases edit links. | Phase 6 rebases on the merged step 4 and edits links only after that. |
| Step 4 changes `scripts/validate-orchestration-skill.ts`. | Phase 6 validator changes wait for step 4. |
| The phase kinds are software-shaped (`design`, `visual-review`). | Map them to skeleton steps. Add no new kind unless the non-software example needs one. |
| A second `PhaseKind` type exists at `hard-constraints.ts:27`. | Update both together, or confirm that it derives from the shared type. |
| Skill mirrors drift. | Run a byte compare after each slice. |
| `phase-contract.types.ts` has a version constant (`:1`). A new field may need a version bump. | Decide in slice 1. Keep `PhaseDefinitionV1` readable. |
| Phase 5 status is "not started". Manifest conflicts are possible. | Regenerate manifests last. Never hand-merge them. |
| The Phase 1 contract is a dependency. Its exact spec path is not verified here. | Confirm the spec file paths in slice 1 before writing tests. |
| Bots (Phase 7) are out of scope. | Do not add identity, triggers or memory scope to the pack format. |

Open question for the user: should the non-software example be research or content? The plan assumes research first, because it needs the fewest new phase files.
