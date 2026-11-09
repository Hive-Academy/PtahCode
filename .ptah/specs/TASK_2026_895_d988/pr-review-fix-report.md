# PR #1015 review fixes

## Changes

1. `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:333` accepts every schema-valid subagent tier alias as a model pin and rescoring input. `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:129` covers sonnet over a light R4 phase and haiku over the legacy R5 policy.
2. `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:275,284,344` puts a scored subagent tier alias in the chosen roster row and reason suffix while retaining policy effort. `libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts:312` asserts sonnet tier, low effort, provenance and reason.
3. `.claude/skills/orchestration/SKILL.md:140,229` and `plugins/ptah-core/skills/orchestration/SKILL.md:140,229` load lane assignment whenever routing is available and retain the frontmatter model when no chosen row exists.
4. Both `references/lane-assignment.md:20` copies describe the initial phase call and post-Mode 1 batch call with the same pins and preferences. Both `references/team-leader-modes.md:102` copies identify the latter as post-decomposition routing.

## Verification

- Scoped Ptah TypeScript diagnostics: 0 errors, 0 warnings in the four changed code files.
- `git diff --check`: clean. Both skill trees' edited files match after CRLF normalization.
- Required `npm run verify -- -p @ptah-extension/lane-routing,@ptah-extension/vscode-lm-tools | tail -40`: exit 0. Header names exactly 2 projects. Nx lint/typecheck: 4/4 tasks succeeded; Nx test: 2/2 tasks succeeded. No EPERM failures appeared in the filtered output.

## Decisions

- The chosen row's `tier` and reason suffix use a valid scored subagent alias. The policy rule ID and effort remain from the phase policy, so the R4 reason still identifies the policy that selected low effort.
- Non-tier subagent pins retain their prior behavior; `unavailableEntry` is unchanged.
