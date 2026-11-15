## Verdict: APPROVE

# Phase 6 re-review - General workflow, after fix round 1

Scope: `git diff origin/main` plus the untracked files (`packs/software.md` in both skill trees, `scripts/orchestration-skill/**`). Coordinator decision for F3: option (b). The builder equals `origin/main`, and `packs/*.md` are the single source of truth.

All three blocking findings are resolved. No new blocking or major defect was found. Six minor findings remain. You can fix them in this PR or in a follow-up task.

## Per-finding status

| Finding | Status | Evidence |
| --- | --- | --- |
| F1 Blocking - pack lookup captures `RESEARCH` | Resolved | `git diff origin/main -- libs/backend` is empty. `orchestration-namespace.builder.ts` equals main. `RESEARCH` uses `STRATEGY_PHASE_SEQUENCE` again. |
| F2 Blocking - stale `content-manifest.json` | Resolved (uncommitted) | `node scripts/generate-content-manifest.js --check` exits 0: "up to date ... 227 files". `content-manifest.json:62-65` lists the four packs, `software.md` included. |
| F3 Blocking - acceptance criterion 9 | Resolved | Pack routing is removed from TypeScript. `scripts/orchestration-skill/pack-parser.ts:12` reads any `packs/*.md`. `validatePacks` (`scripts/validate-orchestration-skill.ts:444-459`) calls it for each file. The fixture `fixtures/extra-phase.md` adds the `docs` phase, and `pack-parser.spec.ts:8-11` passes with no `.ts` change. CI runs the spec through `npm run test:scripts` (`.github/workflows/ci.yml:120`) and the validator through `npm run validate-skill` (`ci.yml:100`). |
| F4 Major - code flow drifts from packs | Resolved | No pack table exists in code now. The pack files are the only source. Remainder: the shared spec uses invented flows (see N4). |
| F5 Major - no tests for builder code | Resolved (not applicable) | The builder has no change against main, so there is no new code to test. The existing builder spec covers main behavior. A direct `getNextPhase` spec is not necessary now. This is acceptable. |
| F6 Major - `SkeletonStep` and `PackDefinitionV1` unused | Resolved | `PackDefinitionV1.stepMap: Readonly<Record<SkeletonStep, readonly PhaseKind[]>>` (`phase-contract.types.ts:41`). The parser returns `PackDefinitionV1` and requires each `SKELETON_STEPS` key (`pack-parser.ts:42-43`). The typing is correct. |
| F7 Major - examples do not prove acceptance | Resolved, with minor gaps | `software-task.md:11-14` now maps `plan` to `task-description.md` and `architecture` to `implementation-plan.md`, and includes both `document-review` rows. `research-task.md:11` marks `plan` optional and skipped. `pack-parser.spec.ts:18-26` reads both examples. See N3 and N5 for the gaps. |
| F8 Minor - docs table disagrees with software pack | Resolved | `agent-orchestration.md` step table equals `packs/software.md:7-11`. The routing sentence now says that strategy routing stays in code. |
| F9 Minor - title style, validator checks | Resolved | `packs/software.md:1` is `# Pack: software`. The parser checks the title against the file stem (`pack-parser.ts:14`) and each phase against `PHASE_KINDS` (`:39`, `:50`). |
| F10 Minor - `packs/software.md` untracked | Open (coordinator step) | `git status` still shows `?? .claude/skills/orchestration/packs/software.md`, `?? plugins/ptah-core/skills/orchestration/packs/software.md` and `?? scripts/orchestration-skill/`. Commit them together with `content-manifest.json`, the builder revert and the other modified files. |

## New findings

### N1. Minor - the parser silently skips bullet lines that do not match

- Evidence: `pack-parser.ts:46-48` and `:32-34` use `continue` for a bullet that does not match the regex. A line such as `- Review` or `` - `review` `` in `## Phase flow` is dropped with no error. The pack passes the validator with one phase less.
- Note: the skip is necessary for `packs/software.md:27-29` (`- FEATURE: ...` lines below the flat list).
- Fix: stop the flat list at the first blank line, or reject any `- ` line in `## Phase flow` that does not match, except the upper-case task-type lines. Add a fixture for it.

### N2. Minor - `workTypes` is empty for three of four packs

- Evidence: `pack-parser.ts:57` takes `workTypes` from upper-case words in `## Discipline`. Only `packs/software.md:4` names task types. `research`, `content` and `operations` give `[]`.
- Fix: name the task type in each pack discipline (`RESEARCH`, `DOCUMENTATION`, `DEVOPS`), or require at least one work type in the parser.

### N3. Minor - the parser has no cross-check between `stepMap` and `phaseFlow`

- Evidence: the parser does not check that each kind in `## Skeleton mapping` is in `## Phase flow`, or the reverse. Also, the flat software flow (`packs/software.md:14-23`) does not mark `research` and `design` as `(optional)`, but `packs/research.md:14` does mark `plan`. `PackDefinitionV1` has no optional flag, so the parser discards this information.
- Fix: check that the union of `stepMap` values equals the set of `phaseFlow` kinds. Use `(optional)` the same way in all packs.

### N4. Minor - the shared spec uses flows that no pack has

- Evidence: `phase-contract.types.spec.ts:20` gives research the flow `plan, research, docs, completion`. The real pack is `plan, research, completion`. Line 30 gives software `workTypes: ['FEATURE', 'BUGFIX']` with no `REFACTORING`, and a short flow. This was part of F4.
- Fix: use the real flows, or name the objects as synthetic test data.

### N5. Minor - the example tests are weak and depend on a task folder

- Evidence: `pack-parser.spec.ts:23` and `:25` only check that each example contains a fixed string. They do not compare the example phase order with the parsed pack. `research → completion` would match many texts. The spec also reads `.ptah/specs/TASK_2026_977_0876/phase-6-examples/`. That folder is tracked (`.gitignore:126-127`), so CI can read it. But a permanent script test that depends on one task folder can break when that folder changes.
- Also: `software-task.md:13` lists `design (optional)` without the following `document-review` and Gate 1.7. `software-task.md:23` omits the final `research` (after-QA modernization scan) from the FEATURE flow (`packs/software.md:27`).
- Fix: move the two examples to `scripts/orchestration-skill/fixtures/`, and assert that each phase in the example order is in the parsed `phaseFlow`. Add the missing rows to the software example, or state that they are skipped.

### N6. Minor - Prettier format

- Evidence: `npx prettier --check` reports `pack-parser.ts`, `pack-parser.spec.ts` and `phase-contract.types.spec.ts` (long lines, for example spec line 21 and `pack-parser.ts:57`).
- Fix: run Prettier on these files before the commit. lint-staged can do this, but check the staged result.

### Pre-existing, not part of this fix

- `agent-orchestration.md:33` orders `tests` before `review`. The packs order `review` before `tests`. This line is older than Phase 6. Change it when you next edit this page.

## Items that pass

- Both skill trees are byte-identical: `diff -r .claude/skills/orchestration plugins/ptah-core/skills/orchestration` gives no output. `cmp` of the two `orchestrate.md` copies gives no output.
- Retired role slugs: no match in `SKILL.md`, `packs/`, `commands/orchestrate.md`, `phase-6-examples/`, `scripts/orchestration-skill/` or the docs page.
- Validator wiring: `SKILL_ROOT` is `plugins/ptah-core/skills/orchestration` (`validate-orchestration-skill.ts:148`). `validatePacks` is in `validateOrchestrationSkill` (`:1150`). The mirror check covers the `.claude` tree.
- `SKILL.md` removed the FEATURE, BUGFIX and REFACTORING rows. `packs/software.md:27-29` has the same three flows. The phase order is unchanged.
- The four real packs parse with no error.

## Checks run

| Check | Result |
| --- | --- |
| `npx jest --config scripts/jest.config.ts --runInBand --coverage=false --runTestsByPath scripts/orchestration-skill/pack-parser.spec.ts` | Pass, 3/3 |
| `node scripts/generate-content-manifest.js --check` | Pass, exit 0, 227 files |
| `npx eslint` on the parser, its spec, the shared types and spec, and the validator | 0 errors. 2 old warnings in the validator (`416:19` non-null assertion, `max-lines`) |
| `npx prettier --check` on the new and changed `.ts` files | 3 files need format (N6) |
| `diff -r` skill trees, `cmp` command copies | Identical |
| `git diff origin/main -- libs/backend` | Empty |
| Retired role slug search | No match |

Not run: `npm run verify`, `nx` and `tsc` (coordinator only). The coordinator reported validate-skill pass, role census exit 0 and degradation audit exit 0. I did not run them again.
