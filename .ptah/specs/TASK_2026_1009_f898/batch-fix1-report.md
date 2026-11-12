# Phase contract: fix round 1

## Findings

| ID | Change (file:line) | Proof |
|---|---|---|
| 1 | `scripts/validate-orchestration-skill.ts:252-280` and `libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts:40-62`: exact case, nonempty lists, strict metadata keys, and duplicate known headings. | Resolver duplicate spec at `phase-definition-resolver.spec.ts:73`; scoped project verification and skill validation passed. |
| 2 | Resolver `phase-definition-resolver.ts:43-53,72` and validator `validate-orchestration-skill.ts:232,265`: mask fenced lines for scans and slice content from the original body. | Resolver fenced content and fenced-only specs at `phase-definition-resolver.spec.ts:63,68`. |
| 3 | Declined by task decision; reader callback and error codes remain as they were. | No change required. |
| 4 | `scripts/validate-orchestration-skill.ts:291`: active flow heading scan uses the fence mask. | Skill validation passed with the current skill copies. |
| 5 | `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:328-330`: append excluded candidate and rule details after the orchestrator explanation. | Gate spec at `route-decide.gate.spec.ts:286` checks unavailable status and both reason fragments. |
| 6 | Resolver `phase-definition-resolver.ts:61-62` and validator `validate-orchestration-skill.ts:280`: reject reviewer stance for other kinds. | Resolver spec at `phase-definition-resolver.spec.ts:78`. |
| 7 | `scripts/validate-orchestration-skill.ts:19`: import `PHASE_KINDS` from the shared source through a relative path. | `npm run validate-skill` completed under the verification lock. |
| 8 | `scripts/validate-orchestration-skill.ts:183-191`: report symbolic links by relative path during copy traversal. | Code inspection; current copies contain no link fixture. |

## Rule alignment

| Rule | Validator | Resolver |
|---|---|---|
| Kind | Shared `PHASE_KINDS` import and filename match | Shared `PHASE_KINDS` schema and requested kind match |
| Frontmatter | Exact top level and tool profile keys; nonempty required lists; nonempty trimmed strings | Strict Zod objects; matching list schemas |
| Headings | Case sensitive scan; duplicate known heading error; required sections nonempty | Case sensitive scan; duplicate known heading is `INVALID_SCHEMA`; required sections nonempty |
| Fences | Mask fenced lines for section and active flow scans; slice section content from original body | Mask fenced lines for section scan; slice section content from original body |
| Reviewer stance | Required for the three review kinds; rejected elsewhere | Required for the three review kinds; `INVALID_SCHEMA` elsewhere |

## Commands

| Command | Exit | Result |
|---|---:|---|
| `npm run verify -- -p @ptah-extension/lane-routing` | 0 | Lint, typecheck, and tests succeeded. |
| `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill` (first run) | 1 | New validator scan had strict TypeScript errors; corrected before retry. |
| Same validator command (retry) | 0 | 21 markdown files; 0 errors; 0 warnings. |
| `npx ts-node --transpile-only tools/role-census/check-role-census.ts` | 0 | Every bucket at or below baseline. |

## Other lane phase file errors

None reported by the final validator run. Phase files in both copies were left untouched.

## Decisions

- Used the relative shared kind import; it loads under the skill command.
- Preserved the existing reader callback error behavior, as directed.
- Local skill discovery was available; its only local match was unrelated to this backend and script change.

## Clarifications Needed

None.
