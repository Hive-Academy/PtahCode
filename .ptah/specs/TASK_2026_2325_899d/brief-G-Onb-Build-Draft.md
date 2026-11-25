# Lane brief — G-Onb-Build-Draft (W9, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FO = libs/frontend/onboarding/src/lib/
Load the `angular-frontend-patterns` skill before you write code (signals, OnPush, standalone).

## Objective
Build the Build-verdict UI of the judged skills step:
1. CREATE `FO proposal/skill-build-row.component{.ts,.spec.ts}`: one Build proposal row (R15/F32
   intro copy rule, multi-item Build shows every linked Build reason, F24 "More" reveal, R22
   compact density). Its action is "Preview draft" (R23), not "Create skill...".
2. CREATE `FO proposal/skill-draft-preview.component{.ts,.spec.ts}`: readable preview of the
   draft: proposed name, destination path, generated SKILL.md content rendered with the shared
   `serializeSkillDocument` (byte-equal to what Create writes, plan 3.5), an Edit toggle, and the
   primary "Create skill" ONLY inside this view (R23). Nothing is written before "Create skill".
   F25: after Create, close and return focus to the opener. R18 draft protection applies.
3. MODIFY `FO analyze/project-skill-draft.component{.ts,.spec.ts}`: use the shared
   serializer/normalizer from `@ptah-extension/shared` (plan 3.5); a failed `harness:create-skill`
   keeps the editor open with user edits, clears `busy`, shows an inline error (plan line 201).
4. C5 (D35): `skill-draft-preview.component` takes `usedSlugs = input<readonly string[]>([])`.
   When the proposed name is in `usedSlugs`, show an inline warning ("A skill with this name was
   created in this run.") and require an explicit confirm (or a rename in Edit) before Create.
   Do not edit the store; another lane adds the `createdSkillSlugs` signal there.

## Write files (only these 6)
C: FO proposal/skill-build-row.component.ts, .spec.ts; FO proposal/skill-draft-preview.component.ts,
.spec.ts. M: FO analyze/project-skill-draft.component.ts, .spec.ts.
Inline templates and styles (no new .html/.css files). Do not edit index.ts, the store, the review
component or any other file: report the needed wiring (exports, store calls) instead.

## Read set (line ranges only)
- TF/implementation-plan.md lines 175-206 (section 9), 452-473 (3.5), 474-558 (3.6; only the
  parts that name skill-build-row / F24), 559-582 (3.7 transition matrix, rows that name your
  files), and the "Trace: R15/F32" row (search `R15/F32`). Never read the plan in full.
- TF/decisions.md lines 40-105 (R13-R23; R15, R18, R20, R22, R23 apply).
- TF/design-spec.md section 14 (line 238 to end) and section 3.5 (lines 99-105).
- TF/prototype/README.md (115 lines). NEVER open TF/prototype/index.html.
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts (judge, Build proposal, draft RPC types)
  and the shared skill-document serializer/normalizer (search `serializeSkillDocument`,
  `normalizeDraftBody` in libs/shared/src).
- FO analyze/project-skill-draft.component.ts (current draft editor), FO proposal/
  skill-pick-card.component.ts/.html (neighbor style for a candidate row; do not edit).

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <your 3 specs>`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push.
Other lanes edit other onboarding files at the same time: a tsc error in a file you do not own is
not yours; report it.

## Acceptance
- Specs cover: R15/F32 intro copy ("No registry skill fits" iff zero linked items have Install),
  all linked reasons shown and sent to the draft RPC, "Preview draft" label, Create only in the
  preview, preview text equals `serializeSkillDocument` output, Edit toggle, failed Create keeps
  edits + inline error, focus return after Create, C5 used-slug warning + confirm.
- No `any`. Accessible names on buttons; unique ids per rendering (R19).

**Deliverable**: TF/batch-G-Onb-Build-Draft-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
