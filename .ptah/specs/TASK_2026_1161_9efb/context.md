# Context: Phase 2 - Executor neutrality

Parent program: `TASK_2026_977_0876`.
This task is Phase 2 of that program. The scope and acceptance are in
`.ptah/specs/TASK_2026_977_0876/task-description.md` § 5 "Phase 2 - Executor neutrality".

## Worktree

- Path: `.claude-worktrees/feat-executor-neutrality-164817d00a43`
- Branch: `feat/executor-neutrality`, created from `main` on 2026-11-12

## Inputs from Phase 1

Phase 1 (`TASK_2026_1009_f898`) delivered (in pull request #1147, not yet merged):
- Phase contract types in `libs/shared/src/lib/types/phase-contract.types.ts`
- Phase definition resolver: `resolvePhaseDefinition` in `libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts`
- Twelve phase definitions in `plugins/ptah-core/skills/orchestration/phases/` (batch, completion, and ten phases moved from role templates)
- One synchronized copy: `plugins/` is authored, `.claude/skills/orchestration` is generated
- Validator: `npm run validate-skill` checks the `.claude` copy against `plugins`

## Phase 2 scope

From `task-description.md:129-157`:
1. **Phase delivery.** `ptah_session_start`, `ptah_agent_spawn` and SDK subagent call each accept a phase definition and a skill list. `role` stays for user-written agents.
2. **Existing worktree.** `ptah_session_start` can attach to a registered worktree of the same task (no `branch-exists` refusal).
3. **Routing.** Child session becomes a routing candidate and pin target. `DEFAULT_ROLE` removed (phase kind → phase definition, not role).
4. **Capability rule.** `NEVER_ON_A_LANE_PHASE_KINDS` becomes a required capability plus ranking preference (not a hard refusal). Router reads the capability from the effective tool list at runtime.
5. **Tool profile.** Deny lists in `subagent-tool-allowlist.ts` move to the tool profile of each phase definition. Each executor gets an adapter.
6. **One completion verdict** for all three executors (deliverable check, verdict, parent signal).
7. **Usage by phase kind.** `session_usage_turns` adds phase-kind and executor-type tracking.
8. **Outcome classification.** `lane-outcomes` `task-kind-mapping.ts` makes phase kind the primary key; role slugs stay as aliases.
9. **Small fast lookups.** Keep a low-cost path for short read-only questions.

## Acceptance

From `task-description.md:158-167`:
1. One phase of each kind runs on each executor with required capabilities, in Electron.
2. A `visual-review` phase runs in Electron on an executor with browser tools, with screenshots as evidence.
3. A phase with a tool profile starts with reduced tool list on each executor with an adapter.
4. Two sessions of one task work in one worktree without `branch-exists` refusal.
5. The usage ledger shows total per phase kind and per executor type.

## Rules

- **Electron first:** Plan and verify on `apps/ptah-electron` with the renderer in `apps/ptah-extension-webview`. Keep CLI lanes, `platform-cli` and `cli-engine` working.
- **Verification:** `npm run verify -- -p <projects>` only. No workspace-wide checks.
- **Census:** The role-name-line count can go down only. Baseline: skills 466, source 201, test 938, docs 116.
- **No silent removal.** Phase 2 removes nothing. The old paths continue until Phase 4 or 5.
- **Only you commit and push.** Inspect `git status` and the diff before each commit.
- **Read-only census at each batch end:** `npx ts-node --transpile-only tools/role-census/check-role-census.ts`.
- **Validator command:** `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill`.
- **Decisions:** Each orchestrator decision goes in `decisions.md`.

## Base state

- Phase 1 branch: `feat/phase-contract` (pull request #1147, not yet merged).
- Your branch is from `feat/phase-contract` when #1147 merges. If your work is ready before that, report and wait. Open your PR only after #1147 merged.

## Coordination

None noted yet.
