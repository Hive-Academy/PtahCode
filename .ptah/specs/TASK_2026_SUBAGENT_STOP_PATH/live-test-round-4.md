# Ptah Dev Electron live test — round 4

Date: 2026-11-07 UTC. Worktree: `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path`. HEAD `5e821c74a73ffc720e6d8c166a49b525c9f3b327`. This is a live test only; no source, commit, push, PR, test, serve, or e2e command was requested or run.

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestor | PASS | `git merge-base --is-ancestor 28f5c97ac HEAD` exited 0. |
| Production baseline | PASS | `C:\Users\abdal\.ptah\settings.json` SHA-256 was `54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238` before setup. |
| Dev ownership | PASS | Before launch, no Electron process had the Ptah Dev user-data-dir. Each run's root was identified by this worktree's `main.mjs --remote-debugging-port=9344`; unrelated Electron and production Ptah PID 26500 were left untouched. |
| Dev backup | PASS | `C:\Users\abdal\.ptah-dev\settings.json.bak-livetest4` SHA-256 `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`. |
| Rechecks | PASS | Production hash remained the baseline after every Dev settings edit, each launch, the Codex UI save, and cleanup. |

## Setup

Required build commands completed in order: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron` (20:26:56Z, exit 0); `node scripts/copy-wasm.js dist/apps/ptah-electron` (exit 0); `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron` (20:27:21Z, exit 0). Port 9344 was free. Each launch used `CLAUDE_CODE_SUBAGENT_MODEL=haiku` and `PTAH_NO_DEVTOOLS=1`, then `node apps/ptah-electron/scripts/launch.js --remote-debugging-port=9344`. Dev root PIDs were 36872, 24108, 22340, 29876, and 18008, in scenario order. Each root was stopped before the next launch.

Settings were edited through Node JSON parsing under the Dev profile only. Scenario thresholds: (1) 40000 / 100000000; (2) 2000000 / 100000000; (3) 40000 / 100000000; (4) 2000000 / 60000; (5) 40000 / 100000000. The UI showed Haiku 5.5 for Claude and OpenAI Codex `gpt-5.6-luna` for scenario 5. The fake marker was appended to `.ptah/live-test-ws/note-15.txt`; no real secret value was used or recorded.

Log references below are one-based lines in `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-07.log`, with UTC timestamps.

## Scenario 1 — handoff stop

| Criterion | Result | Evidence |
| --- | --- | --- |
| 85% notice before stop | FAIL | No `Near-budget warning queued` in this run's log interval. The stop at 20:29:23.314Z, line 19606, had `contextTokens=53849`, already past 40000. |
| Handoff stop with agent ID | PASS | SubagentStart 20:29:14.465Z, line 19464, agent `af6a9635872134488`; stop 20:29:23.314Z, line 19606, `reason=handoff`. Dispatcher used that ID at line 19600 and registry completed its hook key `e54ec2c7-be68-438c-8147-25dd6ad50252` at line 19605. No `Budget stop succeeded without an agent id` warning in this interval. Usage model `claude-haiku-5-5`, line 19501. |
| Progress record | PASS | Record saved 20:29:23.301Z, line 19599: [handoff record](../../live-test-ws/.ptah/subagent-handoffs/20261107T202923278Z-dc187d9403d12b0a-toolu_01Rm3NKeS7Cr1FGEPPXC4P1y-2a084d22.handoff.md). It identifies Ptah as stopper, the SDK agent ID, and completed Read calls through note-15. |
| Fake marker redacted | NOT PROVEN | Record contains neither the fake value nor its key; it also contains no quoted note lines. Absence therefore does not prove that a captured marker was redacted. The marker was on the last line, and the agent's later report chose the first line. |
| First post-stop parent reply attributes Ptah and names path | PASS | Handoff user turn pushed 20:29:23.316Z, line 19608; SDK interrupt sentinel skipped 20:29:23.319Z, line 19612; subsequent visible parent reply explicitly said Ptah stopped the agent, not the user, and gave the record path. [Screenshot](live-test-4/scenario1-reply.png). |
| No cache-warm or resume-now advice | PASS | The visible reply says the agent cannot be resumed and contains neither suggestion; same screenshot. |
| Stopped-agent SendMessage refusal with guidance | FAIL | Follow-up called SendMessage to agent `af6a9635872134488`, but parent replied that the call failed because the agent had no transcript in that session; it said this was not a Ptah refusal and offered no refusal guidance. This specific policy path was not exercised. |
| Follow-up chat usable | PASS | The follow-up finished with “OK, this chat still works”; same screenshot. |

### Event order for 1d

20:29:23.316Z — handoff parent user turn pushed (line 19608). 20:29:23.319Z — SDK interrupt sentinel skipped (line 19612). After these, the first completed parent reply visible in the UI attributed the stop to Ptah and named the handoff record ([screenshot](live-test-4/scenario1-reply.png)). The log does not timestamp the rendered reply itself.

## Scenario 2 — steer allowed

| Criterion | Result | Evidence |
| --- | --- | --- |
| One running agent | PASS | SubagentStart 20:31:33.305Z, line 21281, ID `ae6f700fe4770c504`; normal SubagentStop 20:32:08.109Z, line 21468. The hook reports `isBackground=false` at line 21473 despite the parent requesting `run_in_background: true`; the UI showed it running while the steer was sent. |
| Steer allowed and applied | PASS | Parent UI reported SendMessage queued while the agent was running; completed report contains per-file line counts, including 31 for note-15 and 30 for the other notes. [Screenshot](live-test-4/scenario2-steer.png). No permission-decision log for this MCP SendMessage was present, so acceptance is evidenced by the result rather than a route field. |
| Model | PASS | Usage `claude-haiku-5-5`, 20:31:38.424Z, line 21324. |

## Scenario 3 — two concurrent agents

| Criterion | Result | Evidence |
| --- | --- | --- |
| Distinct concurrent agents | PASS | Agent A `a6a6eb904c4e4768d` started 20:33:39.957Z, line 22895; B `a8742125d3a09671f` started 20:33:40.772Z, line 22906. |
| Only over-budget agent stopped | PASS | B's normal SubagentStop at 20:33:44.746Z, line 22958. A's record saved 20:34:21.251Z, line 23041, then monitor stopped A for `reason=handoff`, `contextTokens=40074`, line 23048. Dispatcher targets A's ID at line 23042; registry completes A's own hook key `f6a218d1-94ea-41be-ae81-03e5a8346897` at line 23047. [Record](../../live-test-ws/.ptah/subagent-handoffs/20261107T203421244Z-7fb7612934727a7f-toolu_01NBTE33MKQG7bCa6ey6L7mL-c50906f6.handoff.md) names A and its progress. |
| Model | PASS | Usage `claude-haiku-5-5`, 20:33:44.191Z, line 22950. [Screenshot](live-test-4/scenario3-two-agents.png). |

## Scenario 4 — safety stop

| Criterion | Result | Evidence |
| --- | --- | --- |
| Safety stop | PASS | SubagentStart 20:39:15.083Z, line 24481; record saved 20:39:24.460Z, line 24550; monitor stop 20:39:24.486Z, line 24557, `reason=safety`, `weightedUsed=63107` against 60000. |
| Ptah attribution and usable chat | PASS | Parent reply said Ptah's monitor stopped the agent, not the user, and named the record path. A subsequent prompt received `OK`. [Screenshot](live-test-4/scenario4-safety.png). |
| Model | PASS | Usage `claude-haiku-5-5`, 20:39:17.285Z, line 24503. |

## Scenario 5 — Codex provider

| Criterion | Result | Evidence |
| --- | --- | --- |
| Signed in and model selection | PASS | UI showed Codex signed in; workspace main connection saved as OpenAI Codex with `gpt-5.6-luna`. ModelDiag at 20:45:03.068Z, line 26795, shows saved model. Main usage at 20:46:35.928Z, line 26988, says `gpt-5.6-luna`. Main and child rollout files under `C:\Users\abdal\.codex\sessions\2026\11\07` (`rollout-2026-11-07T22-45-13-01a1b7c2-194b-7b82-8a2d-c8ecf8d24b49.jsonl` and `rollout-2026-11-07T22-45-24-01a1b7c2-43d1-7710-9049-93dbb2da3639.jsonl`) both contain `model=gpt-5.6-luna`. |
| Handoff stop, record, parent attribution | NOT PROVEN | No `[SubagentBudgetMonitor]` event appeared during this run. The child completed all 15 files normally; UI reported no budget stop and no handoff path. [Screenshot](live-test-4/scenario5-codex.png). |
| 85% notice and redaction | NOT PROVEN | No monitor handoff or record, so these criteria could not be observed. |

The code path supports a provider gap: `SubagentBudgetMonitor` is registered in `libs/backend/agent-sdk/src/lib/di/register.ts:672` and passed into the Claude SDK `CompactionSessionTap` in `session-query-executor.service.ts:1661`, with SDK messages forwarded at line 1938. No `SubagentBudgetMonitor` reference exists in `libs/backend/codex-runtime/src/lib`. This is an inference from code and the live absence of events, not proof that no other Codex monitor exists.

## Defect 6 — denial evidence

Scenario 1's parent said Read of the handoff record was denied; scenario 4's parent said two Reads were denied with “The user doesn't want to take this action right now.” The new diagnostic lines after scenario 1 stop are 20:29:26.080Z, line 19626, tool ID `toolu_01CbMMFuDW3wUakRkvjpXoaa`, `cause=other`; and 20:29:28.856Z, line 19631, ID `toolu_01P9Uy7P7T81vfuE8yqqojHf`, `cause=other`. After scenario 4 stop: 20:39:27.821Z, line 24577, ID `toolu_0155GueY9e17JPVV1QSQKEsc`, `cause=other`; 20:39:31.675Z, line 24583, ID `toolu_01Ew8Mejj9aeLJqeNDSfmWn2`, `cause=other`; 20:39:32.090Z, line 24586, ID `toolu_01Jt6BFe85Q5pJRrotJE2AJK`, `cause=other`.

No correlated `[SdkPermissionHandler] Permission decision`, `Permission response received`, or `Permission response handled` appeared in those post-stop intervals. Cleanup reported zero pending permissions at lines 19651–19652 and 24606–24607. Parent-turn diagnostic reported `abortSignalAborted=false`, `pendingPermissionRequests=0` at lines 19611 and 24562. The diagnostic IDs and generic `cause=other` do not establish which Read result was denied or a Ptah permission-policy decision.

## Production settings unchanged; cleanup

Production SHA-256 before, after every settings change and launch, and at end: `54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238`. It was never edited. All five owned Dev roots were stopped; no Ptah Dev profile Electron process remained. Production Ptah PID 26500 and isolated Electron processes were untouched. Dev settings were restored from `settings.json.bak-livetest4`; final and backup hashes both `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`. Screenshots are under [live-test-4](live-test-4/). A Ptah harness sync inserted one line in root `.gitignore` during launch; that line was removed during cleanup. Final `git status --short` showed only this untracked deliverable and no source diff.

## Findings

1. Claude handoff and safety stops worked with an agent ID, durable records, Ptah attribution, and usable parent chat. The 85% warning still did not precede the handoff in scenario 1.
2. Scenario 1 marker redaction is unproven because the handoff captured no quoted marker text. The stopped-agent SendMessage guidance path failed as “no transcript in this session” rather than the desired refusal.
3. Running-agent steer was applied, but the SDK stop hook reported `isBackground=false` despite the requested background mode.
4. Concurrent handling isolated the long agent's stop from the short agent's normal completion.
5. Codex with the selected Luna model completed without any budget-monitor event; the code path appears to feed the monitor only from Claude SDK messages.
6. Parent-visible Read denials still lack a correlated permission decision. The new tool-result logs classify their errors as `other`, so the denial cause remains unresolved.

## Decisions

- Marked outcomes without a monitor event, captured marker text, or policy refusal as NOT PROVEN or FAIL according to the observed result. This is reversible with a more targeted live run.
- Treated the Codex code-path conclusion as an inference because live absence of an event alone cannot prove architecture coverage. This is reversible after provider instrumentation is inspected.
