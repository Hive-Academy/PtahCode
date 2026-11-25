# Common lane brief — TASK_2026_2325_899d (read in full; it is short)

## Context
Ptah Nx monorepo (Node.js, Angular renderer, Electron is the priority host). Feature for the
onboarding skills step:
1. Repair the normal-model fallback of skill ranking.
2. A "Setup" provider/model pair in Settings "Background models", shown on the analyze page.
3. An AI judge that decides install vs build per skill, with reasons, plus "Preview draft"
   (SKILL.md) before "Create skill".

Worktree (cwd): /home/amun/ptah-extension/.claude-worktrees/skill-judge (branch feat/skill-judge).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d

Plan: TF/implementation-plan.md is 132 KB. NEVER read it in full. Read only the line ranges your
brief names, and search it (ptah_grep or rg -n) for your group name and the type names you need.
Precedence: "Coordinator amendment C1" (end of file) > "Revision 3 amendments" (line 330+) >
earlier plan text. Batch table: lines 250-291 (your row gives write files and scoped specs).
Never open TF/prototype/index.html.

Shared contracts already exist (committed in W1):
`libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` (ModelPair, SetupPairState, judge types,
wizard setup/draft RPC types), additions in `rpc-setup.types.ts`, `rpc-error-codes.types.ts`
(SETUP_MODEL_INVALID, ANALYSIS_LOAD_FAILED, SKILLS_RECOMMEND_FAILED), `rpc-auth.types.ts`
(`setup.provider`, `setup.model`, global only). Import them through `@ptah-extension/shared`.

## Scope
- Edit ONLY the write files of your group row (and the files your brief lists). Do not modify
  anything else. Other lanes edit other files in the same worktree at the same time.
- If a type error or failing test names another file, you may read it; list each extra read in
  the report. Do not edit it; report the needed change instead.

## Checks (lanes only run focused checks)
- `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
- `npx tsc --noEmit --project <project>/tsconfig.lib.json`
- `npx eslint <changed files>`
- NEVER run `npm run verify`, `nx`, build, serve, dev, e2e or package targets. Never run
  workspace-wide checks.

## Code rules
- Follow the neighboring code style. No `any`; use precise types or `unknown` with narrowing.
- Keep credentials and raw provider errors out of UI-facing contracts.
- Add or update the tests your group row and the plan name (test names in the amendments).

## Git
Never commit or push. Never run git commands that change or discard working-tree state
(restore, checkout --, stash, reset, clean). A change you did not make belongs to another lane:
report it, never revert it.

## Deliverable and report
- Write the report file named in your brief: skeleton first, then fill. Sections: files changed;
  plan items done with plan line refs; check commands with results; `## Decisions` (decision,
  options, evidence, reversible); open items and needed changes in other groups; extra reads.
- Settle open points from the plan and code. A point you cannot settle: ptah_agent_report with
  options and a recommendation, and continue with the rest.
- Before exit, call ptah_agent_report once (what you produced, paths, what you could not do).
- Reply: `WROTE: <absolute report path>` plus one headline line.
