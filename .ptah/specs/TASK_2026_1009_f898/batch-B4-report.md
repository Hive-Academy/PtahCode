# Batch B4 enforcement report

## Files changed

- `scripts/validate-orchestration-skill.ts`: recursive two-way byte mirror check, present-phase YAML and section validation, retired-name scan, marker-gated exact phase set and active-flow scan.
- `.husky/pre-commit`: trigger also covers the authored plugin skill path; no other hook change.
- `.github/workflows/ci.yml`: one `npm run validate-skill` step adjacent to role census.
- This report.

## Checks and drift proofs

- No adjacent validator test or self-test mode exists; file search found only the script, so the checks were proved with temporary manual drifts.
- Role names come from the `ROLES` string-literal array in `tools/role-census/check-role-census.ts`, read with the TypeScript parser. The validator adds no new role-name literals.
- Mirror proof: temporary plugin-only file emitted `Mirror file missing: plugin-only.tmp in .claude copy`; temporary mirror-only file emitted `Mirror file missing: mirror-only.tmp in plugin copy`; changed mirror `SKILL.md` emitted `Mirror bytes differ: SKILL.md`. Validator exit 1. All three edits were undone through file edits/deletions, not Git.
- Phase and marker proof: a temporary `phases/plan.md` in both copies contained invalid YAML fields, empty sections, and one census role name. A temporary `## Phase-kind flows` section in both `SKILL.md` files contained the same role name. The validator exited 1 with 24 errors, including `Invalid phase field: version must be 1`, `Invalid phase field: kind must equal filename plan`, `Invalid phase field: input must be a nonempty list of nonempty strings`, `Invalid phase field: toolProfile requires disallowedTools and permission allow|deny|prompt`, `Missing or empty phase section: Output contract`, `Retired role name in phase definition: <role>`, `Required phase file missing: architecture.md`, and `Retired role name in active phase flow: <role>`. The temporary phase files and marker were removed through edits. A cleanup mistake initially truncated both `SKILL.md` files; their committed bytes were restored through a read-only blob read and file write, and `git status --short plugins .claude` returned empty.

## Verification

- Final validator command `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill 2>&1 | tail -30` (PowerShell `tail` function): exit 0, 9 Markdown files, 0 errors, 0 warnings. No phase files are present yet, so the partial-directory gate is permissive.
- Role census command `npx ts-node --transpile-only tools/role-census/check-role-census.ts`: exit 0. Buckets: templates 68/68, skills 461/466, generated-agents 176/176, docs 116/116, test 938/938, source 201/201, other 120/120. No bucket rose above baseline; no `--update` was used.
- `git diff --check` on the three code/config files: exit 0.
- Final `git status --short plugins .claude`: empty; both skill folders match their committed state.

## Decisions

| Decision | Options | Evidence |
| --- | --- | --- |
| Read role names from census TypeScript syntax | Duplicate literals; edit census export | Census `ROLES` is unexported; the write set excludes census edits, and adding literals would raise the ratchet. |
| Compare raw buffers | Normalize line endings | The task explicitly requires identical bytes; the existing copies are byte-identical. |
| Gate exact files and active-flow names on the heading | Enforce immediately | B3b and B3c add partial phase sets; P1-6 places the marker in B3d2. |
| Use repository guidance directly | Apply an invocable skill | The available skill search returned no local invocable skill for this tooling task. |

## Clarifications Needed

None.
