# Ptah Dev Electron live test — round 5

Attempt 1 stopped at the former raw-hash gate before any Dev launch.
This attempt uses the coordinator's updated raw baseline and a canonical-content gate.

Date: 2026-11-07 UTC. Worktree HEAD 3564d5978e53e180065688bbb560d98872c54231. Log references are one-based lines in C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-07.log (UTC).

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestor | PASS | git merge-base --is-ancestor 28f5c97ac HEAD exited 0. |
| Production raw baseline | PASS | Initial, after each Dev settings change and launch, and final SHA-256: 2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4. |
| Production canonical baseline | PASS | Recursive key sort, JSON stringify, SHA-256: 49F717FA5A0B62554F0DAFD576EC36975D92173580F30D1B55CE7103756E915A at start and every recheck. No raw-only reserialization was observed. |
| Dev ownership | PASS | Prelaunch inspection found no Ptah Dev Electron. Own roots: 13028 (measurement), 51192 (A/B), 30200 (C). Production root PID 26500 and separate docs/Playwright Electron were untouched. |
| Dev backup | PASS | settings.json.bak-livetest5 SHA-256 3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6. |

## Setup

Required commands completed in order: build-dev (exit 0, 21:48:44Z), copy-wasm (exit 0), copy-renderer-dev (exit 0, 21:50:49Z). Each launch used CLAUDE_CODE_SUBAGENT_MODEL=haiku, PTAH_NO_DEVTOOLS=1 and remote debugging port 9345. UI showed Haiku 5.5 for each new chat. Scratch workspace contained 40 notes of about 4 KB; note-01 first line held the designated fake marker. Dev settings were changed with Node JSON only. Measurement and C used handoff 2,000,000; A/B used H=60,000; weighted stop stayed 3,000,000.

A measurement subagent read five notes and completed normally. Its usage log at line 28455 recorded model claude-haiku-5-5 and lastTurnContextTokens=42,976. A's SDK transcript at C:\Users\dev\.claude\projects\D--projects-ptah-extension--claude-worktrees-subagent-budget-stop-path--ptah-live-test-ws\5cc393c2-4084-4d37-b1ed-8c36cc771a44\subagents\agent-a0608c1d1f88e5585.jsonl gives per-step context: 23,684, 32,701, 34,673, 36,374, 37,944, 39,514, 40,100, 41,670, 43,240, 44,810, 46,380, 47,950, 48,625, 50,195, 51,765, 53,575, 55,178, 56,748, 58,343, 59,035, 60,650 (transcript lines 16–135). Typical file-read increments were 1,570–1,810, clearly below 15% of H (9,000); the first setup jump was 9,017. The agent crossed both 85% (51,000) and H.

## A — 85% notice and handoff

| Criterion | Result | Evidence |
| --- | --- | --- |
| Warning before stop | PASS | 21:53:53.689Z line 30070: “Near-budget warning queued”, contextTokens=51,765. Stop 21:54:10.908Z line 30140: reason=handoff, contextTokens=60,650, weightedUsed=212,819. |
| Delivered to SDK agent ID | PASS | SubagentStart line 29942 identifies a0608c1d1f88e5585. Its SDK transcript line 99 has hook_additional_context at 21:53:53.714Z with the Ptah budget notice. Transcript lines 101–105 put that notice into the next API request and show the agent writing progress in response. No “Near-budget warning deferred” line appeared in this run's log interval. |
| Correct stop target | PASS | Dispatcher line 30135 targeted taskId=a0608c1d1f88e5585, matching the SDK agent ID; canonical record saved line 30134. |
| Post-notice progress | PASS | Transcript line 103 at 21:53:56.857Z says the agent is writing a handoff; line 105 calls Write. Progress file has entries through note-15 after the warning. |
| Tool error | PASS | Line 30148 at 21:54:10.941Z: “Tool result error after subagent budget stop”, cause=interrupted. |
| Model | PASS | SDK transcript usage records claude-haiku-5-5 on every sampled step; Dev usage line 30155 agrees. |

The canonical record is .ptah/live-test-ws/.ptah/subagent-handoffs/20261107T215410869Z-84e3bb069d6ff4df-toolu_0199Aiy7qwfhYUMeovoEmYpg-2f812a78.handoff.md. The parent chat then started an unrequested continuation agent; I stopped that chat. This does not affect the first agent's warning and stop order, but it limits any claim that the A prompt kept exactly one agent for its entire lifetime.

## B — stopped-agent refusal

| Criterion | Result | Evidence |
| --- | --- | --- |
| Ptah refusal before SDK transcript error | PASS | Follow-up requested SendMessage to stopped agent a0608c1d1f88e5585. At 21:55:25.821Z line 30455, Permission decision has toolName=SendMessage, route=deny, decisionSource=subagent-budget. Line 30456 records Ptah tool-result error, cause=other; no SDK “no transcript” error occurred in this interval. |
| Guidance within three minutes | PASS | UI reply directed starting a new agent from the handoff record; [screenshot](live-test-5/scenario-b-refusal.png). Refusal occurred roughly 75 seconds after A stop. |
| Model | PASS | Same Claude Haiku session; usage line 30464 records claude-haiku-5-5. |

## C — running-agent steer

| Criterion | Result | Evidence |
| --- | --- | --- |
| Steer accepted while running | PASS | SubagentStart line 31934 at 21:56:34.687Z: a483bdbd5928ffe80. Parent UI reported SendMessage queued for the next tool round while it ran; [steer screenshot](live-test-5/scenario-c-steer.png). No budget deny appeared in C's log interval. |
| Result reflects steer | PASS | Normal SubagentStop line 32292 at 21:57:46.627Z. Parent reported all 40 notes read and line counts of 31 for notes 01 and 15, 30 for the others, total 1,202; [result screenshot](live-test-5/scenario-c-result.png). |
| Background / model | PASS with metadata caveat | Parent returned while child ran, and later reported its completion. Hook line 32297 nevertheless says isBackground=false. Usage lines 31996, 32044 and 32315 say claude-haiku-5-5. |

## D — fake-marker redaction

| Criterion | Result | Evidence |
| --- | --- | --- |
| Marker on note-01 first line and quoted by agent | PASS | First line was set before A. Progress file and agent-written handoff both identify note-01's first line with the designated fake marker. |
| Canonical Ptah handoff redacts captured marker | NOT PROVEN | The canonical .handoff.md has neither the marker nor a quoted note line, so absence cannot establish redaction of captured content. |
| Agent-written hook handoff protects marker | FAIL | .ptah/live-test-ws/.ptah/subagent-handoffs/toolu_0199Aiy7qwfhYUMeovoEmYpg.md contains the fake marker in plain text under Findings. This is a separate handoff surface; no real secret was used. |

## Production settings unchanged

Production settings were read for hashes only and never edited. Raw and canonical hashes stayed at their starting values after both Dev settings edits, all three launches, and cleanup.

## Cleanup

All three owned Dev Electron roots were stopped. Final process query found no Ptah Dev Electron. Dev settings were restored byte-for-byte from settings.json.bak-livetest5: backup and restored SHA-256 both 3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6, with budgets 150,000 / 3,000,000 and Haiku preserved. Final production hashes matched the gate. No source edit, commit, push, PR, test, serve, or e2e command was run. Final git status showed only this untracked report; screenshots are inside live-test-5, and scratch files remain under .ptah/live-test-ws.

## Findings

1. The round-4 warning and stopped-agent refusal regressions are fixed in this live run: warning reached the SDK agent before handoff, and SendMessage took Ptah's budget deny route.
2. The canonical handoff's omission of the fake marker is inconclusive for redaction; the agent-written handoff contains it unredacted. That surface needs a product decision or fix before claiming redaction.
3. C's effective background behavior and line-count steer worked, though the SubagentStop hook reports isBackground=false.

## Decisions

- Used H=60,000 after measuring a five-note run at 42,976 context tokens and preparing 40 notes; transcript per-step data confirmed small increments near the warning. Reversible.
- Treated the SDK transcript's hook_additional_context and the agent's next Write as delivery evidence, since the Dev log only states that the warning was queued. Reversible.

