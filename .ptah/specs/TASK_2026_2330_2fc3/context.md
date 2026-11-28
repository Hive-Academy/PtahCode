# TASK_2026_2330_2fc3 — Setup runs continue in the background from a Setup-owned store

Stacked on branch `fix/setup-wizard-nav-skill-review` (TASK_2026_2329_dd5d, PR open, not merged).
Rebase onto `main` after that PR merges.

## User request (2026-11-27)

- Setup Wizard runs (project analysis, AI team builder, agent generation / project guidance,
  skill selection and skill review) show in inconsistent places. Fix the root cause.
- When the user starts a run and leaves Setup, the Setup UI goes away, but the run keeps
  working in the background, the same way normal chat sessions do.
- **Decision:** keep a separate store for Setup runs that the Setup page owns. Setup runs must
  not conflict with normal chat sessions (do not show them as normal chat rail tabs or mix them
  into chat session state).
- Each workflow must have a predictable step sequence, specially skill selection, skill
  review, and the final steps of the AI team builder and the other workflows.
- Electron first (`apps/ptah-electron`, renderer `apps/ptah-extension-webview`).

## Findings from the read-only survey (paths relative to the worktree)

Three different hosting models cause the inconsistency:

| Workflow | Run lives in | Shows in | On leave |
|---|---|---|---|
| Analysis | `WizardAnalysisRunner` root service (`libs/frontend/setup-wizard/.../wizard-analysis-runner.service.ts`), backend `MultiPhaseAnalysisService.activeRun` | Home resume banner + "Analysis found" card (both) | Backend continues; only a banner leads back |
| Agent generation / guidance | Chat tab with workflow kind (`GenerationWorkflowLauncherService`, `GenerationWorkflowStore`, `GuidanceGenerationStore`), backend `GenerationRunSupervisor` | Chat rail, session list, notification center (`OnboardingFocusRouter`) | Backend continues; links go to `analyze/skills?tab=`, which never binds the run |
| AI team builder | Plain `harness-configure` chat tab (`HarnessChatLaunchService.launchTeamBuilder`) | Chat rail | `team-builder-start.page.ts:114-120` resets state and aborts an unfinished launch |
| Skill review | Page-held request `wizard:recommend-analysis-skills` (`analyze-skills.page.ts:730`) | Nowhere | Result discarded; every visit re-runs review (`:519-540`) |

Other defects:
- `OnboardingResumeStore` (`libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts`)
  reads only the first tab per workflow (`:178`) and refreshes only when Home mounts.
- Project guidance can create a new tab per visit (`analyze-skills.page.ts:1105`).
- Setup always opens on bare `/onboarding` Home (`electron-shell.component.ts:786`).
- `?rerun=1` resets runner and drops a finished result (`analyze-workspace.page.ts:1022`).
- Leaving Setup is a route change; `OnboardingShellComponent` and its page are destroyed
  (`app.routes.ts:45`). Root stores and backend runs survive.

Not checked yet: how `CompactRailState` is derived for generation tabs; backend ownership of
`enhancedPrompts:*` runs; what happens when a generation tab closes while its run is active.

## Verification rules (repeat in every lane brief)

See CLAUDE.md "STRICT: Verification commands" and "Two-level check". Lanes run only focused
jest/tsc/eslint; the coordinator runs `npm run verify` scoped to changed projects.

## Lane limits (2026-11-28)
- Ollama Code (`pc-f3384f72-a556-4ab4-b2b1-7e1e028f22cb`, family ollama-cloud): session usage limit
  reached (HTTP 429) during Batch 11 revise round 1; resets 2026-11-28 15:00 UTC. Batch 11 round 1
  moved to codex; Batch 11 re-review moves to antigravity; Batch 9 re-review moves to antigravity.
- Kimi Code (`pc-7594dcab-a859-41a0-8e8b-e8df5dba7d25`): 5-hour limit, resets 13:43 UTC.
