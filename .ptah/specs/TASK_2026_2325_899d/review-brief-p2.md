# P2 code-logic review brief — TASK_2026_2325_899d (frontend phase)

TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
Worktree (cwd): /home/amun/ptah-extension/.claude-worktrees/skill-judge (branch feat/skill-judge)

## Feature (short)
Onboarding skills step, frontend phase (Angular renderer, Electron first):
1. A "Setup" provider/model row in Settings "Background models" (libs/frontend/core + chat):
   one atomic `wizard:set-setup-model` per Save/Clear/Use workspace model/Undo, `commitSeq`
   order, overlapping-save-safe Undo, deep link section `'setup'`.
2. The judged skills step (libs/frontend/onboarding): AI judge install vs build per stack item
   with reasons; compact full-width layout (R22); Build rows with "Preview draft"; SKILL.md
   preview with "Create skill" only inside it (R23); used-slug warning before Create (C5, D35);
   consent/draft mutual exclusion (F29/R17/R20); dirty-draft guards (R18); one coverage rule (R19).

## How to read the change
- Your slice: the files named in your task. Diff: `git diff main...HEAD -- <paths>`.
- Intent: TF/decisions.md (R13-R23 at lines 40-105; D35-D39), TF/batches.md, and the group
  reports TF/batch-<group>-report.md. TF/implementation-plan.md is 132 KB: NEVER read it in full;
  search it (rg -n) for a group name or symbol and read only those lines (section 9 is lines
  175-206; 3.7 matrix 559-582). Precedence: "Coordinator amendment C1" > "Revision 3 amendments"
  > earlier text. Never open TF/prototype/index.html.

## What to look for (logic, not style)
Stale or racing state (out-of-order RPC results, revision/sequence checks), state that leaks
across runs or filter changes, guards that can be bypassed (consent vs draft, busy, dirty,
duplicate Create, used slug), error paths that show success or lose user edits, raw provider
errors reaching UI text, missing cleanup of listeners/timers, unjudged team-builder behavior
broken, accessibility logic errors (aria-expanded/aria-describedby wrong, focus lost), plan
requirements not met, tests that do not prove what their name says.

## Rules
- Read-only review. Do not edit source files. Never commit, push or run git commands that
  change state. Do not run npm run verify, nx, build or workspace-wide checks. You may run
  focused checks: `npx jest --config <project>/jest.config.ts --runInBand --coverage=false
  --runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>`.
- Every defect needs `file:line` evidence and a severity: Blocking / Major / Minor. Drop
  findings without a location.

## Deliverable format (write the file named in your task; skeleton first)
```
# P2 code-logic review — slice <X>
Reviewer family: <yours> (CLI lane). Implementer families of this slice: <from your task>.
## Verdict: APPROVED | REVISE   Score: n/10
## Findings
1. [Blocking|Major|Minor] file:line — problem — why it matters — suggested fix
## Checked and OK
## Not checked
```
Reply: `WROTE: <absolute path>` plus one headline line. Call ptah_agent_report once before exit.
