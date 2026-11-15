# Review: step 4 (retire `team-leader`), batches A, B, D

## Verdict: APPROVE

No blocking finding. Four minor findings and two notes follow. Batch C paths were not reviewed.

## Findings

1. **minor** - Dangling pointer, inherited, not caused by this change.
   `plugins/ptah-core/skills/orchestration/phases/batch.md:20` says "Follow the heavy-file split rule in the
   orchestration mode reference". `phase-mode-compatibility.md` has no such rule. `git show HEAD:.../team-leader-modes.md`
   has none either (grep for "heavy" or "split" gives no hit). The old template pointed at the same missing rule.
   Fix: write the rule in `batch.md`, or delete the sentence.

2. **minor** - Small durable template rules have no destination in `phases/batch.md`.
   - "Put tasks of similar difficulty together so one hard task does not stall four easy ones" (no hit for "similar difficulty").
   - `NEEDS REVIEW` payload: reject on TODO, PLACEHOLDER or STUB markers, empty bodies, mock data, logging in place
     of logic (no hit for "PLACEHOLDER" or "STUB" in the skill tree).
   - Mandatory-prose `batches.md` Markdown skeleton (headers `## Batch N: name — STATE`, `### Task N.M`) became one prose
     paragraph at `batch.md:26-28`. Fields remain, literal layout is gone.
   - The five stress-test questions (event order, dependency failure, unnamed states, user fallback) are compressed at `batch.md:20`.
   Fix: add the first two as one sentence each in `batch.md`. Say in the step result that the skeleton is a justified drop.

3. **minor** - Dead fallback branches in `orchestration-namespace.builder.ts:291-327`.
   `PHASE_KIND_BY_PHASE` now maps `implementation` to `batch`, so `phaseAction(state.phase)` is non-null for every phase
   except `complete`, and `complete` returns earlier (line ~226). The two `phaseKind: 'completion'` fallbacks for a
   rejected checkpoint and missing inputs cannot run. Only line 343 (next phase is `complete`) selects `completion`.
   That matches the stated rule "completion from workflow state", and the new spec "routes an approved final batch to
   completion" covers it. Fix: remove the two unreachable branches, or note them as defensive.

4. **minor** - Silent no-op in `libs/frontend/onboarding/src/lib/analyze/choose-agents.page.ts:424-430,453-458`.
   A stale or unknown ID makes `openPreview` and `confirmPreview` return with no message. The UI cannot normally reach this
   because the button is disabled at line 206 for an empty selection. Fix (optional): set `submitError` for the stale-ID case.

5. **note** - Spec TypeScript check, as asked.
   `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json` gives errors in only these files:
   `generate-agents.page.spec.ts` (5), `project-guidance.page.spec.ts` (1), `onboarding-ready-host.guard.spec.ts` (1),
   `onboarding-workspace.store.spec.ts` (1), `libs/shared/.../capability-id-codec.ts` (2),
   `attention-identity.ts` (5), `libs/worker-protocol/.../pairing-code.ts` (3).
   None of them is a file changed by this change (`agent-recommendation-list.component.spec.ts` and
   `choose-agents.page.spec.ts` have no error). The D report is correct. Those errors predate this change.

6. **note** - `.claude/agents/team-leader.md` and `content-manifest.json` still name `team-leader`.
   Out of scope for A, B and D (coordinator and batch C own them). Confirm they change before the PR.

## Checked and clean

- A: `diff -r plugins/ptah-core/skills/orchestration .claude/skills/orchestration` is empty. `cmp` of both
  `orchestrate.md` copies is equal.
- A: `git diff HEAD | grep "^+" | grep -c "â€"` gives 0.
- A: `references/phase-mode-compatibility.md` equals the old `team-leader-modes.md` (byte diff is empty). Only the name
  changed. All five links (`SKILL.md`, `git-standards.md`, `lane-assignment.md`, `orchestrate.md`) use the new name.
  No `team-leader-modes` reference remains in skill, command or script files.
- A: `team-leader` appears in the skill tree only at `references/agent-catalog.md:119`, as a retired alias. The
  orchestrate command says "Active phases: `batch` ... `completion`". No active-agent use.
- A: batch rules moved: validation and classification, 6 files across 2 projects, contracts first, CLI-lane default
  with subagent reason, parallel criteria, no vendor, task states, acceptance, review per phase, fix round, executor
  prompt, completion audits (`phases/batch.md:16-37`, `phases/completion.md`).
- A: `npm run validate-skill` gives 0 errors and 0 warnings. The validator removed the `team-leader` agent and
  template checks and added a `batch.md` marker check ("Recommend a capable CLI lane by default"), so the lanes-first
  rule is still checked. Required references now list the renamed file.
- B: `retired-roles.ts:53` has exactly one new row `team-leader -> batch`, step 4. The spec asserts the row and alias
  (`retired-roles.spec.ts:89-92`).
- B: legacy state `currentAgent: 'team-leader'` is stored and read back (`orchestration-namespace.builder.spec.ts:349,361`).
- B: no `any` in added lines of `libs` or `scripts`. No assertion was removed. The old `invoke-agent` assertion was replaced
  by `invoke-phase` and `phaseKind: 'batch'`, with two new specs.
- D: empty catalog state (`agent-recommendation-list.component.ts:99-110`) has `role="status"`, text, and the
  "Select recommended" and "Clear" buttons are disabled. The text says custom agents are managed separately. The
  component is standalone, OnPush, uses signals, and has no `[innerHTML]`.
- D: the preview button is disabled for an empty selection (`choose-agents.page.ts:206`). `openPreview` and
  `confirmPreview` refuse empty or stale IDs.
- D: `AGENT_ROLE_ICONS` is empty. `roleIconFor('team-leader')` returns `Bot`, and a spec covers it.
- D: docs link to `/agents/built-in-agents/`, and that page still exists. No stale built-in count was found. The alias
  sentence includes "`team-leader` maps to `batch`".

## Not checked

- Batch C paths and their broken specs (by instruction).
- No jest run. I did not run lint, the template typecheck (`typecheck-templates`), or any visual render.
  D did not render the empty state, so visual quality has no evidence.
- Whether the `phase-mode-compatibility.md` content (a rename) is the best place for the Mode 1/2/3 text.
- Manifests (`agent-pack-manifest.json`, `content-manifest.json`) and the census baselines.
