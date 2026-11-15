# Phase 6 review - General workflow

Scope: `git diff origin/main...HEAD` (commit 015e38802 and merge 22c2c825f), plus the uncommitted changes and the untracked `packs/software.md` in both skill trees.

## Verdict: REVISE

The skeleton text and the pack files are a good start. Three items block the merge:

1. The new pack lookup changes the routing of the existing `RESEARCH` strategy.
2. `content-manifest.json` is stale. The manifest check fails.
3. Acceptance criterion 9 does not hold. The pack flows are hard-coded in TypeScript, and no test pack exists.

## Findings

### 1. Blocking - pack lookup captures the `RESEARCH` strategy and changes its phase order

- Evidence: `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:82` lowercases the name (`packName.trim().toLowerCase()`). `getNextPhase` (`:214-217`) tries `packPhaseSequence(strategy)` before `STRATEGY_PHASE_SEQUENCE[strategy]`.
- Effect: the strategy `RESEARCH` resolves to the `research` pack (`:70`). `packPhaseSequence` gives `['planning', 'complete']`. On main, `STRATEGY_PHASE_SEQUENCE.RESEARCH` (`:45`) is `['planning', 'implementation', 'complete']`. After `planning`, `getNextPhase` now returns `complete`, not `implementation`. The strategy table is silently overridden for one strategy. A future pack name equal to another strategy (for example `devops`) will do the same.
- FEATURE, BUGFIX and REFACTORING are not affected. No pack is named like them, and the `software` pack gives `['planning', 'design', 'implementation', 'qa', 'complete']`, which equals FEATURE. Step 4 routing (`PHASE_KIND_BY_PHASE`, `implementation -> batch`, final batch to `completion`) is unchanged.
- Fix: try `STRATEGY_PHASE_SEQUENCE[strategy]` first, and use the pack only when the name is not a strategy. Or match pack names case-sensitively and only with a `pack:` prefix. Add a test that pins `getNextPhase('planning', 'RESEARCH') === 'implementation'`.

### 2. Blocking - `content-manifest.json` is stale

- Evidence: `node scripts/generate-content-manifest.js --check` exits 1: "1 file(s) on disk are absent from the manifest ... `ptah-core/skills/orchestration/packs/software.md`" and a `contentHash` mismatch. `content-manifest.json:62-64` lists only `content.md`, `operations.md` and `research.md`.
- Effect: acceptance criterion 7 fails. The check output says a stale manifest makes `ContentDownloadService` prune files, so users do not get the software pack.
- Fix: commit `packs/software.md` in both trees, run `npm run manifest:generate`, commit `content-manifest.json`, then run `npm run manifest:check`.

### 3. Blocking - acceptance criterion 9 is not met

- Evidence: `PACK_PHASE_FLOWS` (`orchestration-namespace.builder.ts:61-74`) is a hard-coded record. Nothing reads `packs/*.md`. `validatePacks` (`scripts/validate-orchestration-skill.ts:443-475`) checks only the title and three section headings. No validator self-test and no test pack exist (search for `test pack`, `self-test` in the script: no match).
- Effect: a new pack file is not routable until someone edits TypeScript. The criterion says "Prove this with a test pack in the validator self-test". That proof is missing.
- Fix: either (a) generate the pack flows from `packs/*.md` (parse `## Phase flow`) and keep TypeScript generic, or (b) drop the pack routing from the builder and state that the skill text alone drives packs. In both cases add a validator self-test with a fixture pack that adds a phase, and confirm it passes with no `.ts` change.

### 4. Major - the pack flow in code drifts from `packs/*.md`

There are two sources of truth, and they do not agree:

| Pack | Code (`:61-74`) | Pack file `## Phase flow` |
| --- | --- | --- |
| software | plan, architecture, implement, tests, review, completion | plan, design, batch, implement, review, tests, completion (`packs/software.md:13-21`) |
| research | research, plan, completion | research, plan (optional), completion - but `## Skeleton mapping` puts plan before do (`packs/research.md:7-11`) |
| content | plan, docs, implement, review, completion | same |
| operations | plan, implement, tests, review, completion | plan, implement, review, tests, completion |

- The software code flow has no `batch` and uses `architecture` in place of `design`. Code orders `tests` before `review`. The skill orders `review` before `tests`.
- `PackDefinitionV1` (`libs/shared/src/lib/types/phase-contract.types.ts:34-42`) is not used by the builder. `PACK_PHASE_FLOWS` is a plain `Record<string, readonly PhaseKind[]>`. The spec (`phase-contract.types.spec.ts:16-46`) uses a third set of flows (research: plan, research, docs, completion).
- Fix: keep one source. If the code keeps a table, type it as `PackDefinitionV1[]`, align each flow with its pack file, and add a validator check that compares the `## Phase flow` list with the table. Make the research pack state one order.

### 5. Major - no tests for the new builder code

- Evidence: `orchestration-namespace.builder.spec.ts` has no case for `resolvePackPhases`, `packPhaseSequence` or a pack name in `getNextPhase` (search for `pack`: no match). The 18 tests pass, but they do not cover the change.
- Fix: add cases: each pack name resolves; unknown name returns `null`; `getNextPhase` for each pack; FEATURE, BUGFIX, REFACTORING, RESEARCH sequences equal main.

### 6. Major - `SkeletonStep` and `PackDefinitionV1` are unused

- Evidence: a search of `libs`, `apps` and `scripts` for `SkeletonStep`, `SKELETON_STEPS` and `PackDefinitionV1` finds only `phase-contract.types.ts` and its spec.
- Effect: the types do not constrain the builder or the validator. The skeleton-to-phase mapping exists only as prose.
- Fix: use `PackDefinitionV1` for the pack table (see finding 4). Add a `stepMap: Record<SkeletonStep, readonly PhaseKind[]>` field, or remove the types until a consumer exists.

### 7. Major - the examples do not prove the acceptance

- Evidence: `.ptah/specs/TASK_2026_977_0876/phase-6-examples/research-task.md` and `software-task.md` are tables written by hand. Nothing ran them through the router or the validator.
- `software-task.md`: the `plan` row has output `implementation-plan.md`. The `plan` phase writes `task-description.md`. `architecture` writes `implementation-plan.md`. The phase order `plan -> design -> batch -> implement -> review -> tests -> completion` omits `document-review` and `architecture`, which the FEATURE flow requires (`packs/software.md:24`).
- `research-task.md` skips `plan`, but the code research flow includes `plan` (`:70`).
- Fix: correct the software example to the real FEATURE flow. Add a test that drives `getNextPhase` (or the validator) with both examples, so criteria 1-3 have executable evidence.

### 8. Minor - docs table disagrees with the software pack

- Evidence: `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md:50-56` maps clarify to "Pre-flight questions (no phase file)" and plan to `plan`, `architecture`. `packs/software.md:7-11` maps clarify to the `plan` phase and plan to `plan`, `design`. Do-step `batch` is in the pack but not in the docs.
- `agent-orchestration.md:46` says a pack name can replace a strategy name. That is true in code, but finding 1 shows the side effect.
- Fix: copy the mapping from the pack file after finding 4 is fixed.

### 9. Minor - pack title style is not consistent, and the validator does not check it

- Evidence: `packs/software.md:1` is `# Pack: Software`. The other packs use lowercase names (`# Pack: research`). `validatePacks` does not compare the title with the file name and does not check that `## Phase flow` items are `PHASE_KINDS`.
- Fix: use `# Pack: software`. In `validatePacks`, require the title to equal the file stem and each flow item to be a member of `PHASE_KINDS`.

### 10. Minor - `packs/software.md` is untracked

- Evidence: `git status` shows `?? .claude/skills/orchestration/packs/software.md` and `?? plugins/ptah-core/skills/orchestration/packs/software.md`. The SKILL.md and command edits that point to it are also uncommitted.
- Fix: commit the slice 2 files together with the manifest (finding 2).

## Items that pass

- Step 4 behavior: `PHASE_KIND_BY_PHASE` is unchanged (`implementation -> batch`). No retired role is named in the changed workflow paths.
- Retired role search: the 14 role slugs (`team-leader`, `software-architect`, `senior-tester`, and the others) have no match in `SKILL.md`, `packs/`, `commands/orchestrate.md` or `phase-6-examples/`.
- FEATURE, BUGFIX and REFACTORING phase order: the three rows that `SKILL.md` removed are identical in `packs/software.md:24-26` (only a final period is added). The order is unchanged.
- Mirrors: `diff -r .claude/skills/orchestration plugins/ptah-core/skills/orchestration` gives no output. `cmp` of the two `orchestrate.md` copies gives no output. Both pairs are byte-identical.

## Checks run

| Check | Result |
| --- | --- |
| `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath .../orchestration-namespace.builder.spec.ts` | Pass, 18/18 (no pack cases) |
| `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/phase-contract.types.spec.ts` | Pass, 3/3 |
| `TS_NODE_COMPILER_OPTIONS={"rootDir":"."} npx ts-node scripts/validate-orchestration-skill.ts` | Pass, 25 files, 0 errors, 0 warnings |
| `node scripts/generate-content-manifest.js --check` | FAIL, exit 1 (finding 2) |
| `npx eslint` on the builder, the types, the spec and the validator | 0 errors, 2 warnings in `scripts/validate-orchestration-skill.ts` (`415:19` non-null assertion, `max-lines` 994) |
| `diff -r` of the skill trees, `cmp` of the command copies | Identical |
| Retired role slug search | No match |

Not run: `npx tsc --noEmit` (eslint and jest compiled the changed files with no type error), the role census, and `npm run verify` (coordinator only). Finding 1 comes from code reading. No test pins it yet.
