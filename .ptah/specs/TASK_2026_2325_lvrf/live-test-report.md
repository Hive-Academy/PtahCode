# Live test report - TASK_2026_2325_lvrf

## Environment

- Worktree `.claude-worktrees/lane-live-verify`, branch feat/lane-live-verify at 7123c2270 (main, includes PR #1509) plus the one uncommitted change: Claude `messaging.steer` = `{ state: 'supported' }` in `claude-cli.adapter.ts` and `ptah-cli-registry.ts`. Source untouched by me.
- Build: `nx build-dev ptah-electron` (71 s), `copy-wasm.js`, `nx copy-renderer-dev ptah-electron`, each under `verify.mjs --exec` with `PTAH_VERIFY_MIN_FREE_GB=4` (free memory ~4.9 GB; the default 5 GB bar would have waited). No OOM, no kill, no retry.
- One setup issue (not a product bug): the first renderer build failed (`Could not resolve node_modules/prismjs/...`) because the worktree `node_modules` was a stray build-cache directory. I renamed it to `nm_cache_bak/` (untracked, can be deleted) and made `node_modules` a junction to the parent. Second renderer build passed.
- Run: `dist/apps/ptah-electron/main.mjs`, NODE_ENV=development, CDP 9333, Playwright connectOverCDP, real "Ptah Dev" profile (existing orchestrator session). Window maximized with Win32 ShowWindow to 1920x1032 (inner 1920x983). The dev build opens a docked DevTools that narrows the page to 1365; I closed the DevTools target via CDP so every check ran at 1920. No device-metrics emulation.
- Models: orchestrator Haiku 4.5 (inspector still shows `claude-fable-5-2` for the SDK session, see F9); Claude lanes Haiku 4.5; Grok lane `grok-4.7` (CLI default, no cheaper model selectable, effort default); agy and Codex lanes not run this time (existing stopped lanes used only to open the effort pill). Spend: session cost $0.66 to $0.86 (orchestrator turns ~0.2, Claude lanes under $0.05).
- Electron killed with its tree at the end (PID 5616 tree). Other claude.exe / opencode processes were not touched.
- Logs: `%APPDATA%\Ptah Dev\logs\Ptah Electron-2026-11-25.log`, copy in `.ptah/tmp/electron-main-2026-11-25.log`. Screenshots in `screenshots/`.

## Results

| # | Test | Result | Evidence |
| --- | --- | --- | --- |
| T1 | L4 Claude steer | **PASS with a defect** (L4 PASS) | See T1 below |
| T2 | Follow-up settling | **PARTIAL / FAIL on echoes** | Order and idle OK, but two queued messages were delivered as ONE merged turn with ONE echo |
| T3 | Resume after restart | **PASS** | Grok and Claude both resumed with original permission |
| T4 | Claude image on resume | **FAIL on a stopped lane**, PASS on a live-idle lane | `31-t4b-sent.png`, `30-t4-sent.png` |
| T5 | Grok `/context`, skill, live usage | **FAIL for /context and skill (sent as literal text)**, usage PASS | `33`, `34`, `35` |
| T6 | Stopped-lane efforts | **PASS** (list shown), with label defect | `36`, `37` |
| T7 | Visual re-check | **PASS** except sub-agent composer NOT RUN, plus new findings | See T7 |
| T8 | NG0103 | **PASS** (0 errors) | See T8 |

### T1 - L4 steer: PASS (with a stale-preview defect)

- First attempts showed "Interrupt & send" in the queued card (`08-t1-queued.png`, `09-t1-retype.png`; status line "Send now: interrupts and restarts the turn"). The delivery preview is computed once at turn start (`agent:previewMessage` at 11:53:22, nothing after). The steer rule needs `toolInFlight` (`claude-sdk-lane-runner.ts:454`), which turns true only after the tool starts, so the card never refreshes to steer. **Defect D1.**
- After forcing a preview refresh (switching to the orchestrator tab and back, with a tool in flight) the status line read "Send now: steers into the running turn" (`16-t1-running.png`) and the queued card offered **Send now** (`17-t1-queued-card.png`).
- Click Send now at 11:57:49. Log: `[ClaudeLane] steer pushed into the running turn for "Claude": {"messageLength":212,...}` and `[AgentMessageRouter] Message routed: {... "mode":"steer","pending":0}`. UI status: "Sent. It joined the running turn." (`18-t1-after-sendnow.png`). Mode is `steer`, not `interrupt-resume`.
- The ping -n 120 turn ended 11:59:23 (`[SdkMessageTransformer] Replay echo: {"matched":"uuid","inFlight":true,"originKind":"peer"}`). Lane reply "STEERED" in the same turn (`19-t1-end.png`, `20-t1-bottom.png`); lane returned to done. No stuck placeholder; zero "missed steer"/"unproven" log lines. The original task reply ("BETA") was not printed (the model answered only the steer); not a Ptah defect.
- `user_message_uuids` is never logged (0 matches), so I cannot show the uuid list in the log. Indirect proof: `supportsSteer()` requires `reportsMessageUuids` (set only from a result frame that carries `user_message_uuids`), and steer was offered and the echo matched by `uuid`. Suggest a debug log line for the uuid list. **Defect D2 (observability).**
- Steer right as the turn ends: ping -n 14 started 12:00:04, steer pushed 12:00:13.477 (turn ended about 12:00:17). Reply "LATE", lane done, no stuck state, no missed-steer line (`21-t1-late.png`, `22-t1-late-end.png`).
- Verdict: **L4 PASS.** The manifest flip works end to end on a resumed or second-turn lane. It is usable only once D1 is fixed (the card must refresh the preview when a tool starts), otherwise users normally see "Interrupt & send".

### T2 - follow-up settling: PARTIAL

- 11:50:59 start-turn (ping 40, "ONE"); queued "Reply with the word TWO." at 11:51:14 and "THREE" at 11:51:17 (both `queue-next-turn`, pending 1 then 1). 11:51:48 `Delivered queued message ... remaining 0`. Lane returned to idle (`07-t2-after.png`).
- The two queued messages were **merged into one turn**: one user echo with two lines ("Reply with the word TWO. / Reply with the word THREE."), one reply "TWO / THREE". The composer code says queue sends fold earlier queued text (`lane-delivery.controller.ts` send comment), so this is by design, but it contradicts "one echo per message, each turn settles in order". Also the second queue action did not show a second queued card, only one. Report as expectation mismatch, not a crash.

### T3 - resume after restart: PASS

- Spawned 12:01:03 Grok (`Lane policy ... grok`, chip: "Set at spawn from the built-in default. Native mode: --always-approve.") and 12:01:05 Claude (`YOLO mode: using bypassPermissions`). Chips "Auto" (`24-grok-lane.png`).
- Electron killed 12:02:40 and relaunched. After restart:
  - Grok: `[LaneResumeGate] resume: grok session 01a21294-... decision resume` 12:03:52, `session/resume` ACP, reply "AGAIN". Chip still `--always-approve` (`28-grok-resumed.png`). No "could not be resumed".
  - Claude: `Resume gate ... decision resume` 12:04:47, `YOLO mode: using bypassPermissions`, reply "AGAIN".
- `parent-plan` count in log: 0. `could not be resumed`: 0.
- Side note D3: after sending to a stopped lane the view jumps to the Orchestrator tab (seen for Grok, Claude and again for later resumes).

### T4 - Claude image on resume: FAIL on a stopped lane

- Stopped lane (restart-orphaned `claude ... 9m 59s`): pasted red PNG, typed the question: composer shows "**Images need a running lane.**" and the draft stays (`31-t4b-sent.png`). Expected: accepted, reply "red".
- On the lane I had already resumed one turn earlier (idle, live handle) the same paste was accepted and the lane replied "Red" (`30-t4-sent.png`). So image on resume works only after a text turn has restarted the lane. **Defect D4.**
- The user echo of the image turn shows no thumbnail (`30-t4-sent.png`, bubble 2:05 PM: text only). **Defect D5 (user's item 5).**

### T5 - Grok

- `/context` sent as a normal user message `/context` (router `start-turn`, 12:06:20). No command output rendered; the turn ended in 2 s: `Lane turn telemetry unavailable ... no-usage-event`, `Lane admission notice ... asked-handoff telemetry-unavailable`; the lane posted a Report "Ptah budget monitor asked for a handoff because usage telemetry was unavailable for 1 consecutive turns" (`33-grok-context.png`). **FAIL / Defect D6.**
- Skill `/skill-design-principles` also went as literal text; the lane replied "The lane is handing off after the handshake..." and read the file (`34-grok-skill.png`). The `/` list itself is populated (built-ins and skills, `32-grok-slash.png`), so selecting from the menu does not translate to a command or skill invocation for Grok. FAIL.
- Usage row (inspector): 43.9k at turn start, 67.0k mid-turn (3m 03s, running), 91.4k at end (In 89.1k, Out 2.3k), cost "unavailable, Grok reported incomplete cost". **Moves mid-turn and at end: PASS** (`34`, `35-grok-usage-end.png`). The `/context` turn produced no usage (telemetry unavailable).

### T6 - stopped-lane efforts: PASS

- Codex stopped lane (`36-codex-effort.png`) and agy stopped lane (`37-agy-effort.png`): effort pill enabled, list Default/Low/Medium/High/X-High(/Max), footnote "Applies from your next message, which resumes the lane." Defect D7 (label): X-High/Max are described "(Opus tier)" for Codex and agy; those are Claude strings, and agy previously reported no effort levels.

### T7 - visual re-check (1920 wide, four themes via `data-theme`)

| Finding | Result | Evidence |
| --- | --- | --- |
| B1 composer overlaps transcript | PASS: transcript card ends above composer, queued card sits above it (`42-*.png`, `57`, `59`) | |
| S2 square focus ring | PASS: textarea outline none, radius on host 14px, rounded gold ring (`43-focus.png`) | computed styles identical in 4 themes |
| S3 Queued label contrast | PASS (pixel-sampled from screenshots, ratio): Queued label 14.12 / 14.55 / 14.57 / 15.59 (glass, glass-light, anubis, anubis-light); sub text 11.53 / 7.66 / 5.78 / 5.60; Interrupt & send 10.10 / 6.34 / 4.77 / 6.87 | `42-<theme>.png` |
| S4 lane status line contrast | PASS: 13.49 / 9.67 / 13.19 / 15.11; "1 limited" badge 11.10 / 5.47 / 5.25 / 5.30 | |
| S5 Built-in badge on gold | PASS: 9.85 / 6.27 / 4.77 / 6.63 (selected row) | `44-slash-<theme>.png` |
| Header has no Stop/background buttons | PASS (header holds only the status pill) | every lane screenshot |
| Model label readable | PASS in the bar; but see D8 ("Claude default") | |
| Sub-agent (SDK) composer unified look | NOT RUN (no cheap SDK sub-agent available; would need a paid orchestrator spawn) | |

Ratios use the most common background pixel versus the farthest foreground pixel of each element box, so they are approximations on translucent glass. Anubis `Interrupt & send` 4.77 is the lowest and still above 4.5.

### T8 - NG0103: PASS

Inspector open at 1920 for the whole run (about 36 min including 3 lane turns, and the 2+ minute stretches with a running lane). `grep NG0103` on the log: **0**. Only 8 sporadic `RendererFrame: long frame` warnings (228-707 ms), none periodic (prior run: about every 1.3 s). Renderer memory about 310 MB working set at the end.

## User-reported UI and status items (each checked)

1. **Stopped vs warm/idle (item 1).** The "Claude stopped 4m 17s" screen came from an accidental Stop of mine: at 12:09:04.846 `RPC: agent:stop called` fired 1.8 s after the turn started (my click landed on the Stop button, which sits where the expand chevron is). Same state reproduced on purpose: ping -n 60 started 12:12:45, Stop clicked 12:12:52.999 (`53-stopped-state.png`). DOM at that moment: pill `Claude stopped 3m 03s`, placeholder `Resume Claude with a message…`, hint `Resume with message: Continue warm session`, footer `Stopped` (orange), transcript tail `Failed / ptah agent message ack / failed`. Backend: `Agent stopped` 12:12:53.002 (status stopped), `Agent exited ... exitCode 1` at **12:13:03.2** (10 s later). So: (a) the UI says stopped 10 s before the process exits (first Stop: stopped 12:09:04.8, assistant messages still arriving 12:09:05 and 12:09:08, exit 12:09:11.9 code 0, so a late reply was rendered after Stop); (b) the hint says "warm session" for a stopped lane (the process exited with code 1, resume starts a new spawn), while a normally finished lane ("done") says "Start fresh handoff" (`58-probe.png`). The two hints look swapped or wrong. **Defect D9.**
2. **Header timer (item 2).** It is wall clock since the lane record's first start, including idle gaps between turns: agent resumed at 12:09:50, Stop at 12:12:53 gives exactly 3m 03s although the process was idle 12:11:47 to 12:12:45. It freezes at stop (12 samples over 22 s all `3m 03s`). It does not measure run time. Minor, **D10**.
3. **Red outlined play button (item 3).** `data-testid="lane-resume-btn"`, aria-label "Resume Claude session", title "Resume session", red-tinted (`bg-error/15`). It is enabled and starts a resume with no message ("Resume CLI session ...", "Start fresh handoff"). The red error colour on a resume action reads as an error or danger; it is also shown for a lane that finished normally (`done`) (`58-probe.png`). **D11 (colour/semantics).**
4. **"1 limited" badge (item 4).** `data-testid="lane-limited-badge"`, text "1 limited", `title` equal to the approval string "Set at spawn from the built-in default. Native mode: bypassPermissions. Approval prompts do not reach Ptah from this lane." It has no aria-label, no tooltip component, no click action, and the title does not say what is limited or what the count means. For a Claude lane in bypassPermissions "limited" is misleading (the lane is unrestricted). **D12.**
5. **Image echo (item 5).** No thumbnail in the user bubble (`30-t4-sent.png`). D5.
6. **Thin red line at the top of the transcript (item 6).** It is the border of the pink "Failed" parent-lane card ("claude Failed ... Waiting for parent · just now · Cancel") that a Stop creates, cut off by the scroll edge (`53-stopped-state.png`). A user Stop is reported to the parent as "Failed" with "Waiting for parent". **D13.**
7. **"I've paused on running the ping command" (item 7).** Log 12:09:03.388 `start-turn`, no permission or denial lines for this lane, chip Auto = bypassPermissions (`Set at spawn ... Native mode: bypassPermissions`). The reply was the model's reaction to my accidental Stop 1.5 s later (see item 1), not a silent denial. No permission prompt was shown or needed.

## Status timeline (Claude lane, ping turns) against backend

| Time (UTC) | Backend (log) | Pill | Placeholder | Hint / footer | Button | Match |
| --- | --- | --- | --- | --- | --- | --- |
| 12:09:49-50 | resume spawn d91df773, `Spawning SDK agent` | running | Message Claude... | "Queued for the next turn..." after queueing | Stop generating | yes |
| 12:11:07-12:11:39 | turn 0 running, queued message pending 1 | running 1m17-1m49 | Message Claude... | "Queued for the next turn. Withdraw it until the lane starts it." | Stop generating | yes |
| 12:11:39.9 | turn 0 accepted; 12:11:40.26 `Delivered queued message remaining 0`; turn 1 accepted 12:11:43.8 | running | same | queued line still shown 12:11:39, gone by 12:11:47 | Stop | yes (1 s skew) |
| 12:11:46.8 | `Agent exited completed` | done 1m 53s | Resume Claude with a message… | "Resume with message: Start fresh handoff", 1 limited | Resume Claude session [enabled] | yes |
| 12:12:45 | `start-turn` | running | | | Stop | yes |
| 12:12:53.0 | `agent:stop`, `Agent stopped` (process still alive) | **stopped 3m 03s** | Resume Claude with a message… | "Continue warm session", footer "Stopped" | Resume session [enabled] | **MISMATCH** (process exits 12:13:03.2, exit code 1) |
| 12:09:04.8 first Stop | `agent:stop`; assistant messages 12:09:05 and 12:09:08; exit 12:09:11.9 code 0 | stopped | | | | **MISMATCH** (output after "stopped") |
| after resume of a stopped lane | `Resume gate`, new spawn | view jumps to Orchestrator tab, lane tab shows running | | | | **MISMATCH** (D3) |

Other mismatches: header timer counts idle time (D10); "Claude default" in the model pill while the lane really runs `claude-haiku-4-5-20251001` per `Lane model outcome` (D8); inspector shows `claude-fable-5-2` for the orchestrator row while its pill and the composer say Haiku 4.5 (the SDK orchestrator session keeps its original model, F9); a stale "Permission: mcp__ptah__ptah_agent_spawn ... Needs your attention." node remained in the DOM after the permission was answered.

## Findings by severity

### Serious
- **D1** Steer is not offered when a turn starts: preview refreshed only on status change, but steer needs a tool in flight. Evidence `08`, `09`, `16`, `17`, log previewMessage 11:53:22 only. Fix: refresh previews on tool start or let the planner call steer as available while a turn runs.
- **D4** Image paste refused on a stopped lane ("Images need a running lane."), accepted once restarted. `31-t4b-sent.png`.
- **D6** Grok `/context` and skills are delivered as literal user text; no output; the turn then trips the "telemetry unavailable" budget handoff. `33`, `34`, log 12:06:20-22.
- **D9** Stopped/warm/exited states disagree (pill stopped 10 s before exit, "Continue warm session" hint on a stopped lane, late assistant output after Stop). Table above.

### Moderate
- **D2** `user_message_uuids` never logged, so steer proof is indirect.
- **D3** Sending to a stopped lane jumps the view to the Orchestrator.
- **D5** Image echo has no thumbnail.
- **D8** Model pill "Claude default" for a resumed Haiku lane.
- **D12** "1 limited" badge unexplained and misleading.
- **D13** User Stop produces a red "Failed / Waiting for parent" card.
- T2 expectation: queued follow-ups merge into one turn and one echo.

### Minor
- **D7** "(Opus tier)" descriptions on Codex/agy effort levels. **D10** timer includes idle. **D11** red resume button on a normally finished lane. Dev DevTools docks and narrows the page to 1365 (dev only). Stray hover tooltip (Grok lane preview) stays open after tab clicks (`30-t4-typed.png`, `31-t4b-sent.png`).
- Playwright `scrollIntoView` can scroll the lane view container (`ptah-canvas-lane-view`, scrollHeight 2009 vs 872) and push the composer to the top (`13-state.png`); wheel scrolling did not reproduce it (`15`), so I treat it as a test artifact, not a product bug.

## Decisions

- Lowered `PTAH_VERIFY_MIN_FREE_GB` to 4 for the three lock-wrapped builds (documented per-shell tuning; free memory was 4.9 GB). Reversible.
- Renamed the stray `node_modules` cache to `nm_cache_bak` (a delete was denied) and added a junction; delete both when done.
- Used the CLI default for Grok (`grok-4.7`, only model offered) and did not spawn Codex/agy lanes (cost rule; the stopped lanes from the previous run were enough for T6).
- Contrast numbers are pixel-sampled approximations on translucent glass, not computed-style values (computed-style contrast on glass backgrounds was unreliable).

## Verdict

- **L4 PASS**: steer works end to end (log `mode:"steer"`, steer pushed, same-turn reply, no stuck or missed placeholder, late steer fine), but the queued card shows Interrupt & send until the preview refreshes (D1), so ship the manifest flip together with a preview refresh.
- Blockers found: D1, D4, D6, D9. T7 visual fixes (B1, S2, S3, S4, S5, header) all hold at full window size in all four themes; NG0103 gone.
