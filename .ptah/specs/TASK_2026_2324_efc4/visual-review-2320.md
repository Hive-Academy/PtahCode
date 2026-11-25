# Visual Review - TASK_2026_2320_lnpar (Electron, live)

## Summary

| Metric            | Value |
| ----------------- | ----- |
| Overall score     | 5/10 |
| Assessment        | NEEDS_REVISION (one visual-breaking finding; see B1) |
| Visual breaking   | 1 |
| Serious           | 5 |
| Moderate          | 8 |
| Viewports tested  | container widths 720/400/320 x 4 themes (idle composers); app viewports 1000, 1400, native 1920 (and 1365 after restart); emulated 800/629/500 only for the NG0103 probe |
| Screenshots taken | about 115 in `screenshots/` |
| Components tested | lane composer (idle, running, compact bar, queued card, loss dialog, attach/model/effort menus, slash/@ lists, image tray), main chat composer, lane prompt card, sidebar prompt card, session inspector |

## Environment

- Build: frozen worktree `D:\projects\PtahCode\.claude-worktrees\lane-parity-visual`, detached at `2aba18e6e`
  (merge of origin/main into the PR branch). Built with the `serve` steps except the launch and the native rebuild:
  `nx build-dev ptah-electron` (121 s, log `.ptah/tmp/live-build-dev.log`), `scripts/copy-wasm.js`,
  `nx copy-renderer-dev ptah-electron` (159 s, log `.ptah/tmp/live-renderer.log`). Each ran under
  `node scripts/verify.mjs --exec`, one at a time. No kill, no retry. `better-sqlite3` loaded, so no native rebuild.
- Memory: free memory stayed at 5.5-5.8 GB for about 45 min on the first wait (7 GB bar never met). The orchestrator then
  lowered the bar to 5 GB and moved the build to the frozen worktree.
- Run: `dist/apps/ptah-electron/main.mjs`, `NODE_ENV=development`, `--remote-debugging-port=9333`, driven with Playwright
  `connectOverCDP`. Profile: the user's real "Ptah Dev" profile (existing orchestrator session). Logs in
  `%APPDATA%\Ptah Dev\logs\Ptah Electron-2026-11-24.log` and `.ptah/tmp/live-electron.log` (frozen worktree).
- Widths: the main window has `minWidth: 800` (`apps/ptah-electron/src/windows/main-window.ts:52`). 400 and 320 px are
  therefore container widths, not window widths. I forced the composer host to 720/400/320 px (query container) at an
  1800 px viewport. App-level widths 1000/1400 used `Emulation.setDeviceMetricsOverride`. The "NNNpx x NNNpx" badge in a
  few screenshots is that override.
- Theme switching: `data-theme` on `<html>` (ptah-glass, ptah-glass-light, anubis, anubis-light).
- Models used: Claude lane Haiku 5.5 then Haiku 4.5 (orchestrator Haiku 5.5); Codex default `GPT-6.2-Sol` (the "smallest"
  tier was not selectable, the lane used the CLI default); agy `gemini-4-hydrogen-low` only; Grok `grok-4.7`.
- Process hygiene: Electron (pid started by me) killed with its tree. No codex/agy/grok/claude lane process trees remain.
  The two `claude.exe -r` processes and `opencode serve` are not mine. The Electron window was closed once by something other than my
  scripts at 16:03:10 (right after a native "Attach images" dialog I had opened at about 15:36 returned,
  `file:pick-images` slow handler 1,640,442 ms); I relaunched it. Source in the worktree is untouched.
- Sources of expectation: `design-spec.md` (sections 2, 6, 7, 8, 9), `prototype/README.md` and its screenshots,
  `implementation-plan.md` Live test plan, `fix-final-report.md`, `executor-notes.md`. Contrast target WCAG 2.2 AA (4.5:1 text).

## Answer to "do we need to worry about the console errors" (NG0103)

Yes, but it is a separate finding (S1 below), not a blocker for the lane work. `NG0103: Infinite change detection while trying
to refresh views` fires about every 1.3 s (long animation frames 1.3-1.4 s, `RendererFrame: long frame`) **only while the
Session inspector panel is open at wide windows** (native 1920 and 1365: 3-7 errors per 7 s; with the inspector collapsed: 0;
re-opened: errors return; emulated 500-1000 px widths: 0). It happens with every lane idle and with the orchestrator selected, so it
does not need a lane prompt. The same error is in the 12:23-12:39 log of today, before this run, so it is not caused by my scripts.
The stack is Angular-internal (no component name, minified chunk), so I could not name the component. The inspector lane rows
and `InspectorSessionStats` are the place to look. Whether `main` has the same loop was not tested.

## Findings by severity

### Visual breaking

#### B1. The lane composer floats over the transcript with a 50% transparent card; text collides

- Files: `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.ts:~240` (`ptah-agent-continue-input`
  `sticky bottom-0 z-10 bg-transparent`), the shared composer card class (`bg` is `oklch(0.213 0.008 264 / 0.5)`,
  `backdrop-filter: none`, measured).
- Viewports: 1000 and 1400 app width, all four themes; whenever the lane transcript is longer than the visible area.
- Screenshots: `52-agy-state-now.png`, `B1-lane-composer-overlap-anubis-light.png`, `B1-lane-composer-overlap-ptah-glass-light.png`,
  `B1-lane-composer-overlap-anubis.png`, `B1-lane-composer-overlap-ptah-glass.png`.
- Problem: transcript rows ("Start-Sleep -Seconds 40 ...", a `QUEUEDAGY` reply line) show through the composer card and sit
  behind the textarea placeholder, the toolbar and the status line. The placeholder, "Auto", model name and the status text
  become unreadable. Main chat does not overlap because its composer sits outside the scroller.
- Impact: any lane with a transcript longer than the viewport (every real running lane) gets a garbled composer.
- Fix: give the lane composer host an opaque or blurred surface (`bg-base-100` or `backdrop-blur` plus higher opacity), or move it out of the scroller
  like main chat. The prototype frames do not show this because their transcript is short.

### Serious

#### S1. NG0103 infinite change-detection loop while the Session inspector is open

Evidence above. Logs: `Ptah Electron-2026-11-24.log` lines `[renderer] console.error ... NG0103` (about 700 entries in the
15:39-15:43 window), `RendererFrame: long frame` 1.3-1.4 s. Screenshots `28-native-1920.png`, `31-inspector-toggled.png`.
Fix: find the effect or binding that writes a signal it reads in the inspector subtree (agents section or session stats).

#### S2. Lane composer textarea has a hard square focus ring that main chat does not have

- Measured on the focused textarea: lane `outline: solid 2px oklch(0.96...)` plus `box-shadow 0 0 0 5px`, main chat
  `outline: none` (card gets the gold focus-within border). Screenshots `62-lane-focus-state.png` (lane) and
  `63-main-focus-state.png` (main). It also appears in `09`, `11`, `12`, `20`, `35`, `38`, `57`.
- Problem: a white rectangle cuts through the rounded card and over the toolbar; the card gets no focus border. Parity with main chat is
  broken (design-spec 3: card `surface-border-strong` on focus-within). The ring is visible, so this is a consistency and polish
  defect, not a missing focus indicator.
- Fix: apply main chat's `COMPOSER_TEXTAREA_CLASS` focus treatment (`outline-none focus:outline-none`) in the lane composer textarea.

#### S3. Queued card "Queued" label fails contrast in ptah-glass-light on a lane canvas (L10)

- Measured with a pixel-sampled background (text hidden, median of the label rect): ptah-glass 13.74, **ptah-glass-light 2.71**,
  anubis 6.05, anubis-light 6.09 (label 12 px). `L10-queued-lane-*.png`, `L10-lane-running-queued-full-*.png`.
- Cause: the card is `bg-primary/5` over the lane scene image. Anubis passes (the shared fix works there).
- Fix: opaque surface under the card (see B1).
- Not measured: the main chat queued card (it needs a running main-chat turn; not run to save cost).

#### S4. Lane status line contrast in ptah-glass-light

Pixel-sampled contrast of the 11 px status line text: ptah-glass 11.14, **ptah-glass-light 3.43**, anubis 5.04, anubis-light 14.57.
Spec table (design-spec 9) promises at least 6. Same cause (translucent surface over the scene). `64-agy-slash-light.png`.

#### S5. Slash list: selected row "Built-in" badge is gold on gold

The highlighted row (`goal`) shows the "Built-in" badge in a muted yellow on the yellow selection bar; unreadable in `46-agy-slash.png`.
Ratio not computed (badge element not reachable by my probe); judged by eye, treat as Serious. Fix: badge ink on selected row.

### Moderate and minor

- M1. Model chip text is inconsistent: "Haiku 5.5" before a turn, raw id `claude-haiku-5-5` after, and `mixed-m...` after a model
  change in the same session (`23-state.png`, `33-state.png`). The model menu does not mark the current model (no check mark) because the
  chip holds the raw id (`16-lane-model-menu.png`).
- M2. The model pill is blank (icon only, no label) on Codex for the first about 12 s of a running turn and on a stopped Grok lane
  (`34-codex-lane.png`, `57-grok-always-approve-refused.png`). The label then appears: layout shift in the toolbar.
- M3. Stale status line: "Sent. It joined the running turn." stays after the Codex lane is done (`37-codex-final.png`);
  "Resume with message: Start fresh handoff" shows while Codex and agy are running (status text from a resume path).
- M4. Stopped lane model menu footer reads "Applies from your next message. The lane keeps running." (`16-lane-model-menu.png`).
- M5. Lane transcripts never echo what the user sent. After "Interrupt & send" the only user bubble is the SDK marker
  "[Request interrupted by user for tool use]" (`14-lane-settled.png`). The orchestrator later saw "INTERRUPT2" and "QUEUED1" as
  messages it "did not send". The queued messages did arrive (QUEUED1 reply seen).
- M6. Attachment tray is drawn above the card on a transparent surface, floating over transcript text (`20-lane-attach-image-ready.png`,
  `40-codex-image-and-file-ready.png`). Same root as B1.
- M7. Status text "claude lanes cannot take images. Remove the image to send." uses a lower-case provider name (`20-...png`). Codex says
  "codex lanes take no slash commands or skills." The plan text was "No slash commands in Codex lanes.".
- M8. Session inspector PLAN LIMITS lists "Claude 227d Weekly 81%" twice after a Claude lane turn (`30-native-1920-after-allow.png`).
- M9. Compact toolbar labels do not hide at 400/320 container widths in either composer (model and effort labels truncate instead). This
  matches main chat but not design-spec section 2 ("labels hide at <=400").
- Not rendered in Electron at this head: the lane header model chip and the lane-usage figure (turn-end clock, `partial` badge,
  "- tok") live only in the `card` presentation of `ptah-agent-card`
  (`agent-card.component.ts:71-90`). The canvas lane view uses `presentation="flat" [showStats]="false"`
  (`canvas-lane-view.component.ts:229-232`) and the agent monitor panel has no button in the canvas. I found no way to open it. Usage
  is only observable as token counts in the Session inspector rows and in the "Completed ... lane total N tokens" cards in the
  orchestrator transcript. The design-spec section 7 header surface could not be reviewed.

## Prototype fidelity

- Approved prototype: `.ptah/specs/TASK_2026_2320_lnpar/prototype/index.html` (Chrome render, not Electron).
- Fidelity assessment: DEVIATES.
- Matches: same card, toolbar order (attach, approval chip, model, effort, mic, stop/resume, send); compact bar "claude is working..."
  with model chip and Stop; queued card with Withdraw plus "Interrupt & send" (Claude, agy) or "Send now" (Codex); loss dialog
  ("Interrupt this turn?", focus on Interrupt & send); lane badge on the prompt card; approval chip disabled with info icon; `/` and `@`
  lists with the footer "Chosen files are sent as file references."; image blocked reason on the status line; "N limited" badge;
  `/always-approve` refused with the D18 text. Idle composers at 720/400/320 in all four themes: no overflow, no clipped control,
  all controls at least 24 px (see Viewport results).
- Deviations: B1/M6 (translucent floating composer), S2 (focus ring), S3/S4 (contrast), S5, M9, no header chip and usage figure in the
  lane view, the loss dialog copy differs from spec text ("Interrupting discards unfinished work from the current turn.").
- Before/after comparison: not applicable (prototype exists).

## Viewport results (composer host forced to width, idle stopped agy lane and main chat)

| View | 720 | 400 | 320 | Checks |
| --- | --- | --- | --- | --- |
| Lane composer, 4 themes | ok, 124 px high | ok, wraps to 2 rows, 154 px | ok, 154 px, model label truncates "gemini-4-hyd..." | no child outside host, no control under 24 px |
| Main chat composer, 4 themes | ok, 182 px | ok, 214 px | ok, 214 px, "Default (recom..." | same |
| Screenshots | `lane-idle-c{720,400,320}-<theme>.png`, `main-idle-c{...}-<theme>.png` (24 files) | | | |
| Running, compact bar, queued card | only at the 1000 px app width (container about 540 px) | not covered | not covered | |

App-level: at emulated app widths 400/320 (below the 800 px window minimum) the shell overflows (the workspaces and sessions rails keep their width;
composer container 232 px). Not a supported width. The Session inspector opens as an overlay at 1000 px and covers the composer send button
(`33-state.png`); this is shell behaviour, not changed by this PR.

## Component and interaction results

| Component | States tested | Status | Screenshot |
| --- | --- | --- | --- |
| Compact bar (Claude, Codex, agy running) | folded, expand click | pass | `08-after-allow-running.png`, `34-codex-lane.png` |
| Queued card (Claude, agy, Codex) | Enter queues, Withdraw/Interrupt & send visible | pass, see B1/S3 | `11-lane-queued.png`, `35-codex-queued-card.png`, `51-agy-running-queued.png` |
| Loss dialog | Ctrl+Enter, focus on confirm | pass | `12-lane-loss-dialog.png` |
| Lane prompt card (canvas) | Permission with lane badge, Allow/Always/Deny/Deny..., expiry timer | pass | `07-claude-lane-approval-1000.png` |
| Sidebar prompt card | same prompt shown with Allow/Deny/Show in canvas | pass | `26-l5-prompt-lane-view-and-sidebar.png` |
| Attach menu | opens above the "+" (overlaps the textarea placeholder) | moderate | `15-lane-attach-menu.png` |
| Model menu | list, pending dot after pick, footer copy | see M1, M4 | `16`, `18`, `23` |
| Effort menu (Claude) | Default/Low/Medium/High/X-High/Max | pass | `19-lane-effort-menu.png` text in log |
| `/` list (Codex, agy, Grok) | reason text / commands / empty-with-reason | pass, S5 | `38`, `46`, `56` |
| `@` list | files with footer | pass | `41-codex-at-readme.png` |
| Image paste | Codex accepts, Claude refuses with reason | pass | `40`, `20` |
| Focus | textarea ring | S2 | `62`, `63` |

Open checks from `executor-notes.md`: (1) focus lost when a gated pill swaps to the enabled one: not reproduced in the states I drove
(the effort pill element is re-created while the menu opens, so Playwright saw "detached", but I did not test real keyboard focus return;
**not verified**). (2) Attach menu `contents` host: the menu rendered at the right place with no stray layout box. (3) Inspector row plus canvas
"preferred composer": with the inspector open the lane composer stayed one (no duplicate composer in the DOM), no issue seen.

## Design system compliance

Measured, not token-compared. Colour pairs are in S3/S4/S5. The queued-card note line (`state-need`) and the "Queued" label ink
were not separately measurable (the note is not a leaf element), so only the label ratio is reported.

## Accessibility audit

- Contrast: see S3, S4, S5. Others from the spec table were not re-measured.
- Target size: no composer control under 24x24 at any tested width.
- Focus: textarea ring visible but off-brand (S2). Loss dialog puts focus on "Interrupt & send" with a visible ring.
- Prompt card buttons are reachable by mouse. Keyboard Tab order across the toolbar was not run.
- Screen reader: not run.

## Visual performance

NG0103 loop with 1.3 s long frames (S1). Toolbar layout shift when the model label arrives (M2). Typing in the composer was not
timed. The first `agent:sendMessage` took 2.7 s (slow handler warning) on every resume.

## Live tests L1-L12

| # | Lane | Result | Evidence |
| --- | --- | --- | --- |
| L1 | Claude | PASS (visual) | Same card and toolbar order as main chat; compact bar while running; approval chip disabled showing "Ask" with info reason ("Set when the lane was spawned. Native mode: default. Approval prompts can appear here."). 720/400/320 container sweep done for idle only. `07`, `08`, `09`, `lane-idle-c*`. |
| L2 | Claude | PASS with caveat | Enter while running gave the queued card (`11`); Ctrl+Enter opened the loss dialog (`12`); confirm sent. Log: `AgentMessageRouter ... mode queue-next-turn` at 15:29:35, `mode interrupt-resume` at 15:29:57, `Delivered queued message remaining 0` at 15:30:15. Status "Turn ended. Same session. Your message starts the next turn.", resume used CLI session `87119bb8-...` both times. The lane transcript shows only the SDK marker, not my text (M5). |
| L3 | Claude | PARTIAL / FAIL on image | Model change Haiku 5.5 -> 4.5: pill shows a dot until the next turn (`18`, `20`); after the turn the inspector row shows Haiku 4.5 (`30`); chip shows raw/"mixed" text (M1). **Image is refused**: "claude lanes cannot take images. Remove the image to send." with a "Can't send" badge (`20`). The plan expected the image to reach the model, so the plan and the Claude lane manifest disagree. Effort pick not exercised (menu listed). |
| L4 | Claude (B6 gate) | NOT PASSED (dormant, as expected) | The queued card offers "Interrupt & send", not "Send now"; status line reads "Send now: interrupts and restarts the turn" (`10`, `11`, `51`). The router logged `mode: interrupt-resume`, never a steer mode. `user_message_uuids` appears **0 times** in `Ptah Electron-2026-11-24.log`. No steer path exists to test; the manifest flip is not justified by this run. Nothing changed in code. |
| L5 | Claude | PASS with one gap | Prompt cards in the lane view with lane badge "Claude" and expiry timer (`07`), mirrored in the sidebar card with Allow/Deny/Show in canvas; answered in the lane view, then the sidebar card cleared (`27`, `30`). The "No longer answerable here" line was not seen (the sidebar card simply disappeared; my first answer click ran before I could capture the other surface). AskUserQuestion not triggered. Also: Claude lane asks for approval on `ptah_agent_message_ack` for every message ("Execute MCP tool ..."), which makes each parent message block on a prompt in Ask mode. |
| L6 | Codex | PASS (steer) / interrupt not run | Send now while running: card showed "Send now"; click gave "Sent. It joined the running turn."; reply "DONE STEERED" (`35`, `37`). "Interrupt & send" and model change on Codex not run. Codex spawn with `permission: ask` is refused by the backend (`UNSUPPORTED_LANE_POLICY`), so the lane ran in `danger-full-access`. |
| L7 | Codex | PASS | `/` shows "codex lanes take no slash commands or skills." (`38`); `@READ` lists README.md with the footer (`41`); pasted red image plus file ref sent; lane replied "red live" (colour of the image and first word of README.md). `40`, `44`. Image attach via the native "Attach images" dialog cannot be driven by Playwright (it opens a native dialog), so I used paste. |
| L8 | agy ACP | PARTIAL / FAIL on evidence | Model `gemini-4-hydrogen-low` only. `/` lists commands (goal, compact, schedule, browser, plan, ...) (`46`). Effort pill disabled on a stopped lane ("antigravity reports no reasoning effort levels."). `/compact` sent from the idle resume path: router `mode start-turn`, lane turn accepted (3,605 in / 705 out). **No "Delivered as a command" receipt and no compaction output anywhere in the lane panel or DOM** (`49`, `50`; DOM search false), so I cannot confirm agy ran the compaction rather than answering text. Running-turn Ctrl+Enter / effort change on agy and the after-Stop resume were not run. |
| L9 | All three | PASS for Codex and agy; Claude not shown mid-turn | Inspector row tokens: Codex "not reported" at 3 s, 17.1k at 13 s, 51.6k at turn end (moves mid-turn). agy 89.3k at 3 s then 99.2k at turn end (jump at end only). Claude's 20 s task finished in 8 s (651 tokens), no mid-turn sample. The turn-end clock icon, `partial` badge and "- tok" are not rendered in the Electron canvas (see Moderate list). |
| L10 | Visual themes | FAIL in ptah-glass-light, PASS elsewhere (lane only) | Label contrast 13.74 / 2.71 / 6.05 / 6.09 (S3). Main chat queued card not measured. |
| L11 | Refusal | PARTIAL | Image on a lane with image input off: Send disabled, draft and image stay, status names the refusal (`20`). Provider-rejected model id not run. |
| L12 | Grok | PARTIAL | Stopped lane: `/` shows empty "Commands" and "Skills" groups with "Effort levels, commands and skills appear when the lane is running." (`56`). `/always-approve on` typed on a stopped lane and on a lane after a send attempt: refused with "Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.", draft kept, no envelope (`57`, `59`). `/always-approve` is absent from the list. **Running Grok, `/context` and a skill were not run**: after the app restart the lane could not be resumed ("The lane could not be resumed."; log `spawn step timing {"cli":"grok","agentId":null,"outcome":"error","totalMs":0-1}`, no reason logged). |

## Decisions

- Viewport audit used container widths because the window minimum is 800 px. Reversible, evidence `main-window.ts:52`.
- Used the real dev profile because the logs path in the brief is that profile. The orchestrator session (Haiku 5.5) spawned the lanes, so a few paid orchestrator turns ran ("Ignored, per your instruction" replies after each lane completion).
- Relaunched Electron once after something closed the window; the earlier lane state survived in the profile but lanes could not be resumed by Grok afterwards.

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (the composer overlap and focus ring are reproduced and measured; the NG0103 source and the missing lane header surface are not traced to a line)
- Key concern: B1 - the lane composer is a translucent sticky layer over the transcript, so its text and the queued card collide with transcript text in a real lane; S1 (NG0103 loop) should be triaged before merge.
