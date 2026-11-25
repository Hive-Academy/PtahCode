# TASK_2026_2326_5d16 — Make lane routing decisions correct and predictable

Child session "Decision model routing" of parent session f7784134-2245-437c-a953-fce13a88a558
(parent task TASK_2026_2325_899d). Worktree: this folder's worktree, branch
`fix/route-decide-predictability`.

## User complaint (verbatim)

"these are completely off recommendations ? i think we need a new task in a child session to check
what is going on with our decision model and how to elevate and fix it and make more predictable"

## Evidence from the parent session (2026-11-24)

1. `ptah_route_decide` at gate-0.1 and pre-flight TIMED OUT earlier the same day; orchestrator fell
   back to static rule tables.
2. A later gate-0.1 call (FEATURE/Full; impl-backend, impl-frontend implement/logic 12000;
   code-review review/review 15000; tests tests/test 10000; prefer = [antigravity, kimi code,
   codex, Ollama Code]) returned: kimi for both implement phases (opus, xhigh, score 75, R3),
   Ollama Code for review (opus, xhigh, 69, R2, kimi excluded by reviewer-family), codex
   lane-default for tests (sonnet/medium, score 50, "no profile", source model, conf 0.61, R4).
   - Every row: "preference did not change the choice".
   - antigravity (first preference, installed, limit "unknown (reader failed)") in neither roster
     nor `excluded`.
   - grok, subagent:tests, child-session, claude "pruned" for tests with no reason; reasons end
     with "models unknown".
   - kimi rated confirmed-room; 45 min earlier `ptah_agent_list` showed kimi AT LIMIT (Monthly
     total and Monthly code 100 %, reset 2026-11-25 00:00 UTC). At call time: 0 %, reset
     2026-12-25.
   - `preferenceSource` refuses a semicolon ("must not contain a semicolon or a newline") with no
     hint in the tool schema.
3. Brief rule: router output must be explainable.

## Reproduction in this session (2026-11-24 ~15:35 UTC)

Call: gate-0.1, BUGFIX/Partial, phases rca-a/rca-b (research 14000), impl (implement/logic 12000),
code-review (review/review 15000); prefer = [antigravity, codex, kimi code, Ollama Code].

- All of rca-a, rca-b, impl -> kimi code (k3.1-pro[1m]); research: opus/high score 64 R5;
  impl: opus/xhigh score 75 R3. code-review -> Ollama Code glm-5.3:cloud opus/xhigh 69 R2.
- Every row "preference did not change the choice".
- `excluded` lists only copilot/cursor/opencode/pi (disabled/not-installed) and kimi
  (reviewer-family). antigravity, codex, grok, claude, all subagents and child-session are
  absent from both roster and `excluded`.
- reasons end with "models unknown". usage.requests = 0 (no model call).
- Tool schema: `pins`, `preferenceSource`, `preferences` descriptions say
  "Required when stage is ." (empty stage name).
- `ptah_agent_list` at 15:32: kimi Monthly total/code 1 %, reset 2026-12-25; 5-hour 22 %.
  antigravity "unknown (reader failed)", "service unavailable". codex Weekly 13 %.

## Gate 0.1

- Preference source: user instruction in this request (Claude weekly limit at 80 %, prefer CLI
  lanes over in-process Claude subagents). Mode: `enabled`. Approval mode: `lane-review`, but the
  request says "Gate 1 and Gate 2 go to the user" -> Approval: `user` for document gates.
- Child-session contract: AskUserQuestion is unavailable; the user may type in the tab. Gate
  notices go to the parent with `ptah_agent_report` and to this tab; work continues per the
  decision ladder when no answer arrives (recorded in decisions.md).
- Spawnable lanes (15:32): codex (cli, confirmed room), antigravity (cli, unknown/reader failed),
  grok (cli, no usage source), claude (cli, limits not tracked), Ollama Code
  (pc-f3384f72-a556-4ab4-b2b1-7e1e028f22cb, ollama-cloud, confirmed room), kimi code
  (pc-7594dcab-a859-41a0-8e8b-e8df5dba7d25, kimi-code, confirmed room).
