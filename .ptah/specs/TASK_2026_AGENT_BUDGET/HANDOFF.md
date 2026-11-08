# HANDOFF — TASK_2026_AGENT_BUDGET (shared agent budget)

Updated 2026-11-08 ~05:00 UTC by session `ptah-ptah-extension-agent-budget-986-fix-…` (successor of
`apply-session-limit`). This session owns PR #986.

## Goal
One shared `agentBudget` settings group (warnRatio 0.85, stopWeightedTokens 3,000,000,
handoffContextTokens 150,000, maxDurationMin 90) that guards Claude Agent SDK subagents,
Codex-provider subagents and CLI agent lanes (`ptah_agent_spawn`). User decisions already made:
- Full implementation in draft PR #986 (batches A–G).
- Every CLI adapter MUST report usage (input/output totals per turn). "No usage" is an adapter
  defect, never zero. maxDurationMin is an extra guard only.
- Cost order: provider-reported cost → Ptah pricing catalog → explicit unavailable, log once.
  Weighted-token weights come from the same catalog, with a raw-token floor.
- An adapter emits telemetry-unavailable only after it has reconciled every vendor usage source
  through the completed-turn boundary (Codex/ACP: named 2 s usage drain, no vendor flush exists).
- #986 stays DRAFT until batch B and the live tests are done.

## Done (branch feat/agent-budget, worktree D:\projects\ptah-extension\.claude-worktrees\agent-budget)
PR: https://github.com/Hive-Academy/PtahCode/pull/986 (draft). Pushed head `5a8411a14`, CI green
(18 pass, 4 skipped). main merged up to ff5f40803 (#995–#1003 incl. #999, #1000, #1001, #1003).
- Batches A, C, D, E, F (see batch-*-report.md).
- `c37fe7013` fix round 1; `45bc31626` fix round 2; `41ede79ae` batch G (Claude lane telemetry in
  ptah-cli-stream-loop.service.ts, lane-budget-deadline.ts, provider cached per composition);
  `5a8411a14` fix round 3 (late-ID stop at once, per-model catalog weighting for mixed-model Claude
  turns, lane-session-binding.ts + lane-budget-telemetry.ts split, ACP drain abort-aware).
- Reviews: round 3 logic REVISE 5/10, style NEEDS_REVISION 7/10 — all serious findings addressed in
  `5a8411a14` (fix-round-3-report.md). A round 4 re-review has NOT run yet.
- Manager agent-process-manager.service.ts: 3849 physical / 3673 non-blank (main 3849 / 3675).
- Side fix done for the user: PR #1000 CodeRabbit comment (commit 9cef23bb9, merged).

## Update ~09:50 UTC (newest)
- Pushed head `13f02ffcc`. Since cc5ccd58a (CI green): `248604f00` round 6 fixes (SDK stream waits
  for the monitor so the Ptah handoff reaches the parent first — the "stopped by user" root cause
  was this race; same-turn warning only in the stop envelope; predictive warning with the largest
  turn; ack timeouts as info), `13f02ffcc` 15 s bound on that wait (STREAM_MONITOR_WAIT_MS).
- Final reviews' findings are fixed in `5b2e23c64`. A re-review of 5b2e23c64..13f02ffcc has NOT run.
- RUNNING: live test round 7, lane `8f09d507-2f3b-4230-b221-957dcfad976a` (session
  01a1ba8e-5301-7ae1-a699-14aad8d69b56) → live-test-round-7.md. Checks C1/C2 SDK attribution + notes,
  A same-turn/predictive warning, B child regression. Tell the task 7 session the C results.
- Untracked on purpose: live-test-round-6/scratch-generated-ptah/ (raw handoffs; never commit).
- After round 7: short re-review (logic + style) of 5b2e23c64..HEAD, PR body (Summary + Test plan
  with live results and known gaps), mark #986 ready, report to the user.

## Update ~09:00 UTC
- Pushed head `a512e806c` (CI green 18/4). Commits since cd1c9bb99: `7b6e5bd68` round 5 report,
  `ccb7aa963` SDK notes + handoff-read, `a512e806c` Codex child real usage.
- Final reviews of the whole PR: logic code-logic-review-final.md REVISE 6/10 (1 serious: Codex
  child terminal-first skips the 2 s drain; 1 minor), style code-style-review-final.md
  NEEDS_REVISION 7/10 (7 serious S1–S7 incl. settings export allowlist missing agentBudget keys).
- RUNNING: final fix lane `230c61d0-89b5-4e07-83f4-6f9c131d30ab` (session 01a1ba56-bac7-7d92-b391-d3a8cc3ed8cc)
  → fix-round-final-report.md. Do NOT commit while it runs.
- Live test round 6 (UNCOMMITTED: live-test-round-6.md + live-test-round-6/; commit after the fix
  lane; check live-test-round-6/scratch-generated-ptah for secrets before adding, probably exclude it):
  B Codex child PASS (linked, real counters, advisory near 40000). A FAIL: warning and stop in the
  same turn (209587 → 251031 at 250000) → warning routed `unsupported`, `Codex lane is closed`;
  must fold the warning into the stop message without delivery, and widen the predictive margin
  (e.g. max of last and largest turn delta). C FAIL: same-turn jump at low limits; #1004
  REGRESSION: parent's first reply said "stopped by user" before reading the handoff; 4 new
  acknowledgment-timeout warnings. These need a follow-up fix lane AFTER 230c61d0, then live test 7.
- Told the task 7 session the round 6 results. Its pointers for the "stopped by user" regression
  (line numbers from #1004 head e8de3d6d0): (1) subagent-budget-monitor.ts `deliverHandoff` (~1833)
  must push the full handoff via `dispatcher.pushParentMessage` on EVERY forced stop, before the
  parent's next reply; (2) subagent-handoff-message.ts parent builder (~107-117) first sentence
  "Ptah's subagent budget monitor handed off subagent ..."; (3) subagent-budget-hooks.ts ~50-60
  takeNormalHandoff/takeInterruptedHandoff (SDK drops that additionalContext, so route 1 matters);
  (4) subagent-budget-hooks.ts:37 session key `data.session_id ?? capturedSessionId` — check the
  batch B re-key (parent session + task id) still finds the state; (5) PROBABLE ROOT CAUSE: the
  batch B AgentBudgetPolicy hard stop at the stop limit bypasses the #1004 path (warnNearBudget
  ~676 notes gate; forced stops only from 3 denial bursts, gate deadline, weighted limit,
  RUNAWAY_BUDGET_MULTIPLE=2 ~205/680) → no notice, no notes update, no route-1 delivery. The
  policy stop must go through the same forced-stop path (deliverHandoff route 1). See also
  .ptah/specs/TASK_2026_SUBAGENT_STOP_HANDOFF/live-test.md in main (same failure in #1004 live 1).

## Update ~08:15 UTC
- feat/agent-budget pushed head `cd1c9bb99` (batch B merged; child linkage `9007e4b11`); local
  commit `7b6e5bd68` (live test round 5 report) not pushed. CI watch on cd1c9bb99 running.
- Live test round 5: Codex lane PROVEN end to end incl. warning text in the Codex rollout; native
  Codex child LINKED; Haiku SDK subagent: per-turn accounting, warning, stop, one handoff record,
  Ptah attribution, PreToolUse denial burst counted as one, fresh Task reads handoff — PASS.
  Open: Codex child decisions `telemetry-unavailable` (+ relink per connection); SDK child notes
  stub not updated after notice / no notes in C1/C2; false "Handoff not read by the parent in time".
  SDK resume not testable (native Agent tool has no resume).
- The task 7 session handed (1) notes and (2) handoff-read to #986; it will not edit agent-sdk.
  Send it the commit when they land.
- RUNNING in .claude-worktrees/agent-budget (file-disjoint, one committer = me):
  - `c42dc15d-11c3-43d3-a988-c066d7fd030c` (session 01a1ba37-dfec-7f02-b883-b0ba328b01a8) Codex child
    telemetry, codex-runtime/cli-agent-runtime → live-test-5-fix-report.md
  - `14ecc331-c4b1-49bb-b7e4-ab8cf8e6d2f7` (session 01a1ba38-286e-72a2-8d9c-ddb358bd398e) SDK notes +
    handoff-read, agent-sdk only → live-test-5-sdk-fix-report.md
- Then: verify, commit, push, live test round 6 (B child counters + C notes), round 4 reviews of
  the whole PR, PR body, ready for review.

## Update ~07:35 UTC
- feat/agent-budget pushed head `a55115439` (steer/queue warning, thread/started linkage); local
  commit `67a6cb4cf` (live test round 4 report) not pushed yet. CI watch on a55115439 running.
- Live test round 4: CLI lane path PROVEN end to end (per-turn records, one warning before stop via
  queue-next-turn, budget stop + progress pointer, resume refused with budget-stop reason).
  Open: warning text inside the lane not proven; native Codex child still unlinked (child thread
  sends no thread/started; method order in live-test-round-4.md).
- RUNNING: fix lane `7cc7ed48-89c4-44c9-be2b-14c73b34351b` (session 01a1ba12-e2e4-7932-82b9-0f94f7b19d03):
  link unknown threadIds on the same Codex context as children; one charge per child turn; inject
  queued warning into next turn input with a debug log. Deliverable live-test-4-fix-report.md.
- RUNNING: batch B second pass lane `0afb4c55-0e5c-4a41-b987-5a790baf184f` (session
  01a1b9f4-b44a-7332-9f59-83a06bc5d5cf) in .claude-worktrees/agent-budget-sdk; may add
  `parent-delta` to agent-turn-usage.types.ts. Fix lane must not edit that file.
- Ptah Dev is FREE; the task 7 session does not plan to use it (tell it when a run ends).
- Then: commit fix, push, live test round 5 (B child + warning text via the Codex rollout JSONL),
  commit+push batch B branch, merge it into feat/agent-budget, Haiku SDK live test, round 4 reviews
  (logic + style) of the whole PR, PR body, ready for review.

## Update ~07:00 UTC
- Pushed head `5be9cd31d` (CI green). Local commits not pushed yet: `8c3f1ae35` (round 3 report).
- Commits since 5a8411a14: `c6c025903` live test 1 report; `dcf9e5c88` one-turn-jump warning + per-turn
  info logs; `c7049c6e4` live test 2 report; `5be9cd31d` predictive warning, Codex queue fallback,
  progress pointer, child linkage guess; `8c3f1ae35` live test 3 report.
- Live proven: per-turn `Accepted lane turn` records with real tokens (catalog cost authority),
  budget stop with source, fresh-lane resume gate, predictive warning at 91% before the stop.
- Still failing live: (1) Codex lane warning delivery: steer reported unsupported, fallback
  start-turn collides with the active turn; (2) native Codex child: `Codex early child event buffer
  overflow`, no linkage, no child decisions. Resume gate denies resume at the warning threshold
  (intended: near-limit resume denied).
- RUNNING: fix lane Codex `3edb042b-61be-4c66-9480-9566428fd825` (session 01a1b9f3-4100-79e3-ae1c-5797e9d5a013),
  deliverable live-test-3-fix-report.md. Then: verify, commit, push, live test round 4
  (tester session 01a1b9d3-b5bd-7530-8861-6404201c69cb; coordinate Ptah Dev with the task 7 session
  `ptah-ptah-extension-subagent-stop-handof-80bbf70000jlo2rcqszxa00`; Ptah Dev is FREE now).
- #1004 MERGED (18f779e48): batch B unblocked. RUNNING: batch B lane Codex `9f18be31-d812-4f20-9938-c3a8026d0a1d`
  (session 01a1b9f4-b44a-7332-9f59-83a06bc5d5cf) in worktree .claude-worktrees/agent-budget-sdk, branch
  feat/agent-budget-sdk (= 8c3f1ae35 + main merge 33dacf853, local only, has node_modules junction).
  Deliverable batch-B-report.md there. After it: verify, commit, push the branch, merge it into
  feat/agent-budget (after the fix lane is committed), then a Haiku SDK subagent live test.
- Dev board: limit is 20 sessions; testers close (not delete) old live-test sessions.
- Electron regenerates MCP config files in the scratch workspace during a run; testers delete
  the generated copies at cleanup and must never print tokens.

## In progress (older)
- LIVE TEST lane: Codex `078f8386-3449-47c6-becb-8a48f5454316` (CLI Session 01a1b982-7406-7491-8b12-96dd7f409d40),
  deliverable .ptah/specs/TASK_2026_AGENT_BUDGET/live-test.md. Checks: A CLI Codex lane budget
  (warning, stop reason budget, resume refused), B Codex-provider child (handoff 40000), C Claude
  lane telemetry. Port 9348, ~/.ptah-dev profile. Do NOT commit while it runs.
- AFTER it ends: message session `ptah-ptah-extension-subagent-stop-handof-80bbf70000jlo2rcqszxa00`
  that Ptah Dev is free and Dev settings restore is verified (it waits for that before its own test).

## Open problems
- Known gap: first Claude result after a resume has no restored cumulative cost base → its
  per-turn cost can be overstated (needs persisted session cost passed to PtahCliStreamLoop).
- Coordinator merge arithmetic still inline (style minor M10).
- Codex/Grok/Antigravity/OpenCode/Copilot usage not proven live; Cursor/Pi/GLM/Kimi not run.
- Pre-existing on main (ignore): platform-core session-driver-lock 2 tests; webview lint errors.
- Ptah lane deliverable check doubles the path when taskFolder + relative deliverable are given:
  use absolute deliverable paths and no taskFolder.

## Exclusions
libs/backend/agent-sdk/** until task 7 PR #1004 (draft, fix/subagent-stop-handoff) merges. Its files:
helpers/compaction/{subagent-budget-monitor, subagent-notes-gate, subagent-budget-hooks,
subagent-handoff-files, subagent-handoff-message}.ts, helpers/subagent-hook-handler.ts,
session-lifecycle/session-query-executor.service.spec.ts. The #1000 exclusions are released.

## Lane sessions to resume
- Implementation (fix round 3): Codex 01a1b955-ea30-7c62-9fce-e622b161374d
- Logic reviewer: Codex 01a1b94c-cf44-7183-942f-53d1a8480b26
- Style reviewer: OpenCode ses_e46b30deeffeSCW3w72dA29agj
(Codex sessions idle > 600 s start fresh with a handoff brief; give full instructions.)

## Next steps
1. Wait for `<agent-lane-completed>` of 078f8386. Read live-test.md; check the isolation gate rows.
   Commit live-test.md + evidence (docs scope) in the foreground; push in the background.
2. Message the task 7 session that Ptah Dev is free.
3. Round 4 re-review (logic + style) of `5a8411a14` and any fixes from the live test.
4. When #1004 merges: merge main, run batch B (agent-sdk: subagent-budget-monitor onto
   AgentBudgetPolicy, SendMessage PreToolUse gate, key parent session + task id; add `parent-delta`
   telemetry source if needed). Then live test of a Haiku SDK subagent.
5. Take #986 out of draft, update the PR body (Summary + Test plan with real results), report.
