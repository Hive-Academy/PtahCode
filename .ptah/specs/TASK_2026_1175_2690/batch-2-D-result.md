# Batch D result

## Files

- Deleted four source templates: `code-logic-reviewer`, `code-style-reviewer`, `senior-tester`, and `visual-reviewer` under `libs/backend/agent-generation/templates/agents`.
- Updated `template-sharing.guard.spec.ts` for seven templates. Removed four role grants and the retired inline hygiene row. Kept the `software-architect` reference block. Only that remaining template carries the inline hygiene block. Generic review hygiene is in `phases/review.md` from batch A.
- Kept `ui-ux-designer` as the template nondelegation case. It has its own no-delegation grant rule. The retired visual role's browser evidence rule is in `phases/visual-review.md`.
- Updated `content-manifest.json` with `npm run manifest:generate`. That generator does not write `agent-pack-manifest.json`; removed its three remaining step 2 entries by hand. `visual-reviewer` had no entry there.
- Added a harness-sync regression in `rival-targets.agent-model.spec.ts`: an unchanged wizard-origin `code-logic-reviewer` does not sync; a custom same-name agent with no origin entry syncs.

## Checks

- Agent-generation targeted Jest: 3 suites, 180 tests passed. This includes recommendation and allowlist parity tests that failed in batch C.
- Harness-sync targeted Jest: 2 suites, 16 tests passed.
- Agent-generation library TypeScript check: passed.
- Harness-sync spec TypeScript check: passed.
- ESLint on changed specs: exit 0; two existing non-null assertion warnings and missing cached Nx ProjectGraph warning.
- Prettier on changed files: passed, no further changes.
- `npm run validate-skill`: passed, 0 errors and 0 warnings.
- `npm run manifest:check`: passed, 230 files.
- `git diff --check`: passed.
- Role census command: failed with `git ls-files failed: undefined` from its Git subprocess. The coordinator must rerun the official census before merge. No baseline was changed.

## Open risk

The official role census remains an open gate in this CLI lane. Other batch changes in the shared worktree were kept.
