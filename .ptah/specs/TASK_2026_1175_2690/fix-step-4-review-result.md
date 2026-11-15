# Step 4 review fixes

## Files changed

- `plugins/ptah-core/skills/orchestration/phases/batch.md:20,33`: replaced the missing heavy-file rule pointer and added difficulty grouping and acceptance rejection rules.
- `.claude/skills/orchestration/phases/batch.md:20,33`: mirrored the same edits byte for byte.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:292-310`: removed two unreachable completion fallbacks. The reachable completion route remains at line 329, with its existing spec.
- `.ptah/specs/TASK_2026_1175_2690/fix-step-4-review-result.md`: this report.

## Checks

- `npm run validate-skill`: exit 0; 21 files, 0 errors, 0 warnings.
- `diff -r plugins/ptah-core/skills/orchestration .claude/skills/orchestration`: PowerShell resolved `diff` to `Compare-Object`, so its exit 0 did not prove tree equality. Equivalent `git diff --no-index --exit-code -- plugins/ptah-core/skills/orchestration .claude/skills/orchestration`: exit 0, no differences.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.spec.ts`: exit 0; 18 tests passed.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: exit 0.
- `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts`: exit 0; cached Nx ProjectGraph warning, so module boundary rule was skipped.
- `git diff --check` on the three edited source files: exit 0.
- Scoped `ptah_get_diagnostics`: unavailable after 45 seconds; the completed `tsc` check above supplies type check evidence.

## Extra files read

- `.ptah/specs/TASK_2026_1175_2690/review-step-4-abd.md` (findings 1-3).
- `.ptah/specs/TASK_2026_1175_2690/step-3-lane-rules.md`.
- `plugins/ptah-core/skills/orchestration/SKILL.md` and `libs/backend/vscode-lm-tools/src/lib/code-execution/types.ts`.
- Native CLI skill invocation was unavailable; the matching local `SKILL.md` was read directly.

## Decisions

- `OrchestrationPhase` has five values: planning, design, implementation, qa and complete. `getNextAction` returns before these branches when phase is complete. `PHASE_KIND_BY_PHASE` maps all four remaining values, so both removed fallbacks could not execute.
- Kept the existing `batches.md` prose contract. The old mandatory Markdown skeleton is a justified drop: its fields remain specified, and restoring the layout would lengthen the lean phase file without adding a required field.
- No changes were made to batch C paths or the completion spec.

## Not done

- No commit, push, broad check, build or process termination.

## Needs another batch

- None for findings 1-3.
