# Batch 0a census fix result

## Status
Edits done. Checks are in progress. See "Checks" below.

## Changed files (spec files only)
- libs/shared/src/lib/types/retired-roles.spec.ts
- libs/backend/lane-outcomes/src/lib/task-kind-mapping.spec.ts
- libs/backend/skill-synthesis/src/lib/skill-task-grade.store.spec.ts
- libs/backend/skill-synthesis/src/lib/skill-scorecard.service.spec.ts
- libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/retired-role-guard.spec.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-action-gating.spec.ts
- libs/frontend/skill-synthesis-ui/src/lib/services/clone-bulk-rebase.service.spec.ts
- libs/backend/persistence-sqlite/src/lib/migrations/0075_phase_grade_keys.spec.ts

## Method
- Each spec reads slugs from `ROLE_PHASE_ALIASES` (a Record, not an array).
- `retired-roles.spec.ts` pins size 14, unique slugs, phase kinds, count per kind, and lookup normalization.
- No production file and no tools/role-census file changed.

## Denied commands
- A Python edit command was denied. I used the Edit tool instead.
- A `sed` command with shell variables was denied. I used the Edit tool instead.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts` was denied (requires approval).

- `node scripts/verify.mjs --exec --task p4-census-fix -- npx jest ...` was denied (requires approval). I tried it for the shared spec. I did not try the other specs.

## Checks
No check ran. The permission layer denied the census command and the jest command.
I did not use another tool to go around the denial.
- Census: NOT RUN. No `test: <n> ok` line. The result is unknown.
- Jest for 8 specs: NOT RUN.
- ESLint: NOT RUN.
- Type check: NOT RUN.

## Risks for the coordinator
- Edits are not verified. Run the census, the 6 jest projects, and eslint.
- I expect the census `test` bucket to drop by about 56 lines. Verify this.
- `phaseKindForRole`-based specs assume the alias table order stays stable only for `Object.keys(...)[0..1]`. The values are used as opaque slugs, so order does not matter.
- The `retired-roles.spec.ts` "step values" assertion is in the `RETIRED_ROLES` loop (empty now).
