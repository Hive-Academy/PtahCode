# P1 code-logic review brief — TASK_2026_2325_899d (backend phase)

TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
Worktree (cwd): /home/amun/ptah-extension/.claude-worktrees/skill-judge (branch feat/skill-judge)

## Feature (short)
Onboarding skills step, backend phase:
1. Repair the normal-model fallback of skill ranking (now `SkillJudgeService`: Decision stage
   via lane-routing `SkillRankingCallerService`, then Normal stage on the Setup pair).
2. A "Setup" provider/model pair stored atomically (`setMany`), resolved strictly
   (`resolveSetup`), used by analysis, generation, guidance, judge and draft generation.
3. AI judge install vs build per stack item with reasons; `wizard:generate-skill-draft` makes a
   SKILL.md preview that is byte-identical to the file `createSkillPlugin` writes.

## How to read the change
- Your slice: the projects named in your task. Diff: `git diff main...HEAD -- <paths>` and
  `git log --oneline main..HEAD`. Ignore the merge commit beac0b1b8 content that came from
  origin/main (only check its conflict resolutions in lane-routing and agent-sdk).
- Intent: TF/decisions.md (D1-D30 binding), TF/batches.md, and the per-group reports
  TF/batch-<group>-report.md. TF/implementation-plan.md is 132 KB: NEVER read it in full; search
  it (rg -n) for a group name or symbol and read only those lines. Precedence: "Coordinator
  amendment C1" (end of file) > "Revision 3 amendments" (line 330+) > earlier text. Never open
  TF/prototype/index.html.

## What to look for (logic, not style)
Silent failures, swallowed errors, error paths that return success, races and stale state,
timeouts and deadlines (one clock, no negative budgets, timers cleared), abort propagation, pair
attribution (`pairConfigured` / `pairAttempted` / `pairUsed` only where the plan allows),
unvalidated input at RPC and SDK boundaries, raw provider errors or secrets reaching UI-facing
results or logs, atomicity of settings writes, incomplete or stubbed logic, plan requirements
not met, tests that do not prove what their name says.
Write-path trace: for each persisted settings change, trace the write to its runtime reader
(key, scope, value format, side effects) and confirm the behavior is intended.

## Rules
- Read-only review. Do not edit source files. Never commit, push or run git commands that
  change state. Do not run npm run verify, nx, build or workspace-wide checks. You may run
  focused checks: `npx jest --config <project>/jest.config.ts --runInBand --coverage=false
  --runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>`.
- Every defect needs `file:line` evidence and a severity: Blocking / Major / Minor. Drop
  findings without a location.

## Deliverable format (write the file named in your task; skeleton first)
```
# P1 code-logic review — slice <X>
Reviewer family: claude (CLI lane). Implementer families of this slice: <from batches.md>.
## Verdict: APPROVED | REVISE   Score: n/10
## Findings
1. [Blocking|Major|Minor] file:line — problem — why it matters — suggested fix
## Write-path trace
## Checked and OK
## Not checked
```
Reply: `WROTE: <absolute path>` plus one headline line. Call ptah_agent_report once before exit.
