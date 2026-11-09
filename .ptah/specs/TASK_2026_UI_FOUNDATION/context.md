# TASK_2026_UI_FOUNDATION — Phase A: shared UI design foundation

## Request
The user wants one design system for all pages so features stop getting a "poor random design"
that needs repeated fix rounds (Machines, Reviews, Settings fixed 5–6 times). Keep the glass UI
with DaisyUI. Phase A builds the foundation; Phase B (dashboard) and Phase C (Machines, then
Reviews) migrate pages onto it.

## Approvals (relayed by the session master, 2026-11-09)
- Option A ("Inbox" list-detail) for Reviews and Machines: APPROVED.
- Phase A (shared ui components on @angular/aria + Angular CDK, DaisyUI + glass look,
  @ptah-extension/ui as the design system, gallery route, lint ratchet): APPROVED.
- Electron for the gallery and screenshots: the master relayed YES. Orchestrator will confirm
  with the user directly before launching (CLAUDE.md: never serve/dev unless the user asks).
- The six design questions (report.md section 5), all recommended answers ACCEPTED:
  1. ptah-page-header title: Settings style `text-lg font-semibold tracking-tight`.
  2. ptah-stat-card: add a size input, default `text-2xl`, `text-xl` on dense pages.
  3. Reviews minimum severity: read-only "Minimum severity: Minor (fixed)".
  4. Findings-load bug: separate fix PR first (worktree review-findings-load, branch
     fix/review-findings-load).
  5. Reviews pagination: "Load more" button at the end of the list.
  6. Reviews live updates: poll only while a run is `running`; no backend change.

## Task type / depth
FEATURE, Full workflow: plan → implement in batches → verify → review → PR.

## Worktree
D:\projects\ptah-extension\.claude-worktrees\ui-design-foundation (branch feat/ui-design-foundation,
base 0f36450cf)

## Inputs (design brief, on branch docs/ux-reviews-machines, PR #1018)
Base: D:\projects\ptah-extension\.claude-worktrees\docs-ux-reviews-machines-eef70efbc36c\.ptah\specs\TASK_2026_UX_REVIEWS_MACHINES\
- DESIGN.md (section 8 = component patterns), report.md (section 3 = shared components),
  reviews-ux.md, machines-ux.md, prototype/tokens.css, prototype/reviews-a.html,
  prototype/machines-a.html
Dashboard audit: D:\projects\ptah-extension\.claude-worktrees\dashboard-glass-redesign\.ptah\specs\TASK_2026_DASHBOARD_GLASS\design-audit.md

## Facts
- @angular/aria is NOT installed; npm latest is 22.2.6 (matches Angular 22.2). @angular/cdk ~22.2.0,
  daisyui ^4.12.24, tailwindcss ^3.4.18 are installed.
- libs/frontend/ui/src/lib: motion, native, overlays, selection, surfaces. surfaces has
  surface-card/section/tile, stat-card, field + fieldControl. Adoption is near zero.
- ~100 files in 20 libs use raw DaisyUI input/select/textarea classes.
- Near-limit threshold is 90% (libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts:11).

## Lanes
- kimi code AT LIMIT (resets 2026-11-25). codex weekly 63%. Glm room.
- 2026-11-09 02:48 UTC: Glm (ptah-cli pc-355b645d…, family Glm) AT LIMIT — session 100%,
  resets 2026-11-09 06:00 UTC. Two Glm lanes (bug fix, batch 5) also hit the 3M-token
  per-lane budget. Batch 5 finish moved to codex lane 08c0ef8b. Skip Glm until the reset.
