# Context

Program: TASK_2026_977_0876 (move from generated role agents to skills by tech stack).

## User request (2026-11-15)

"why we still have choose agent, also why we didn't do any skills searching or creations similar
to what we do with ai team builder but this time they should be based on tech stack and project
frameworks and design patterns."

## Facts found

- End-to-end test on main 82fb58bdd: Setup > Analyze current project completes, then
  "Choose agents" shows "No built-in agents available", 0 selected, "Preview and generate"
  disabled. Dead end. The analysis card still offers "Only generate agents".
- Phase 3 (PR #1185) added skills by stack only to the AI team builder flow
  (libs/frontend/onboarding/src/lib/proposal/team-builder-skill-*.ts, backend
  libs/backend/rpc-handlers/src/lib/skills-sh/services/*). The Analyze flow does not use it.
- Phase 5 (PR #1333, feat/phase5-remove-agent-generation) removes backend agent generation but
  keeps choose-agents.page.ts, generate-agents.page.ts and agent-recommendation-list.component.ts.

## Goal

Replace the agent steps of the Analyze flow with a skills step: recommend skills from skills.sh
by the detected tech stack, frameworks and design patterns (from the analysis output), let the
user review and consent, install them, and offer to create a project skill when no registry
skill covers a detected framework or pattern. Reuse the team-builder skill services.

## User decisions (2026-11-15)

1. Separate PR from this branch. It merges after PR #1333.
2. Include "create a project skill" for detected frameworks or patterns that have no adequate
   registry skill, with user consent, in this same PR.
3. Separate fix (other branch): enable the bundled `ptah-core` plugin by default for new
   workspaces, so `/orchestrate` works in the first chat.

## Decision 2026-11-15 (user)

- Plan approved.
- Project-skill authoring: make an editable draft from verified analysis facts. The user
  reviews it and must click Create before `harness:create-skill` runs.
- Setup RPC handler and DI guard spec edits wait until PR #1333 merges into main.
