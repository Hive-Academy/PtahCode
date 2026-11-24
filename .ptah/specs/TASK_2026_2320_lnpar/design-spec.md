# Design Specification - TASK_2026_2320_lnpar: one composer for main chat and CLI lanes

Prototype (the visual contract once Gate 1.7 passes): `prototype/index.html`, notes in `prototype/README.md`, 44 screenshots in `prototype/screenshots/`.
Design system applied: the app's own (daisyUI themes `ptah-glass` and `ptah-glass-light` by default, `anubis` and `anubis-light`; `ptah-tokens.css`; `ptah-button.css`; `ptah-badge.css`). No new tokens, colours, fonts or components are introduced. Source of truth for the look: the main chat composer, `chat-input.component.ts:290-570` and `composer-card.ts`, plus the shared `QueuedFollowUpsComponent`.

Every value below names its source. `[main]` = copied from the main chat composer or a shared main-chat component. `[lane-proposed]` = new, needs Gate 1.7 acceptance. `[shared-fix]` = a change to a shared component that main chat also receives (user-approved, decisions.md 9).

## Changelog

Revision 1 (round 1 of the design review, 2026-11-23). Fixes the 13 findings of `design-spec-review.md` and applies the user decisions in `decisions.md` rows 7-9:
- The "Main chat" frame in the prototype is rebuilt from the real composer (no hint line, status line holds only the auth label, queued cards in the transcript, "Interrupt & send" for Claude).
- The lane-only Send options chevron is removed. Lanes use Ctrl+Enter and the Send now / Interrupt & send button on the shared queued card (parity A row = move).
- Lanes get main chat's compact bar and type-to-expand unchanged. The invented 40 px inspector variant is removed.
- The queued card is the shared card unchanged, with one label (Withdraw). `[shared-fix]`: "Queued" label `text-base-content`, note line `state-need` ink.
- Claude and ptah-cli default to "Interrupt & send"; steer is a later variant with the "no tool call becomes the next turn" caveat.
- Reason strings corrected (commands vs skills, stream-json continuation, effective approval mode, image support, ACP steer wording).
- Send uses `disabled`, as main chat does. Confirmed model and session totals get a surface. One waiting badge string. Full lane-proposed list in the README.

## 1. Principle

The lane composer is the main chat composer with a different data source. Same card, same toolbar order, same classes, same compact bar, same queued card. The design work covers only what main chat never had to show: a control the lane cannot honour, a message waiting for the next turn, the cost of "Send now", the difference between "next turn", "next spawn" and "next process start", live usage, and lane-scoped prompts.

## 2. Mounts and widths

One implementation, three hosts. The composer root is a query container (`container-type: inline-size; container-name: ptah-composer`) as in `chat-input.component.css:12-15`. Behaviour follows the composer's own width, not the viewport. [main]

| Mount | Host width in prototype | Textarea | Toolbar | Notes |
| --- | --- | --- | --- | --- |
| Canvas lane view (`canvas-lane-view.component.ts:210-218`, variant `composer`) | 720 (column) | min-h 60, grows to 8 lines [main] | Full labels | Sticky at the bottom of the lane column as today |
| Agent card panel (`agent-card.component.ts:136`, variant `panel`) | 400 | min-h 60 [main] | Labels hide at <=400 | Pill labels collapse to icons; toolbar wraps |
| Session inspector row (`inspector-agents-section.component.ts:190-193`) | 320 | min-h 60 [main] | Same controls, icon-only, wraps to two rows | Same composer as the other mounts. There is no separate compact variant: the `variant` input the template never used goes away |

Container breakpoints (exactly main chat's): below 640 px the effort label hides (icon stays); at 400 px and below every `lc-label` (model name, effort, approval) hides, the toolbar wraps, and the end group right-aligns. The long status badge ("N limited") hides at 400 px and below; its content stays in the status text.

### 2.1 Compact bar and type-to-expand (parity D "expose")

Lanes use main chat's behaviour unchanged (`ComposerCompactStore`, `composer-compact-bar.component.ts`, `composer-type-to-expand.directive.ts`). [main]

- The composer folds into a one-row bar only while the lane's turn runs AND the composer is idle (no draft text, no attachment, no menu or suggestion list open, user has not expanded it).
- The bar is main chat's: `h-10` row inside the card surface, one button (`aria-expanded="false"`, `title="Expand the composer"`) holding a primary pulse dot, the label, a model chip and a chevron-up, plus the 28 px Stop circle. Label: "{CLI} is working…" for a lane (main chat reads "Ptah is working…" - only the subject differs). The model chip shows the model the provider confirmed (section 7.1), not the pending pick.
- Clicking the bar, or pressing a printable key while it has focus, expands the composer and puts focus in the textarea (the key is typed into it). Once expanded it stays open for the rest of that turn; the turn ending clears the expansion.
- The status line under the card stays visible in both states, so the queued notice and the Send now hint are still readable while folded. Queued cards stay above the card/bar.
- In the prototype, refolding after idle (`REFOLD_DELAY_MS`) and the 220 ms fold animation are not simulated; they are the real component's behaviour.

## 3. Anatomy (top to bottom)

1. Queued messages (only when any): section 6.1.
2. Loss dialog (only when open): section 6.3.
3. Card, or the compact bar (section 2.1) while folded. Card: `COMPOSER_CARD_CLASS` + `COMPOSER_CARD_BORDER_CLASS` [main]: `relative flex flex-col w-full rounded-xl border bg-surface-1 shadow-[inset_0_1px_0_var(--surface-highlight),var(--elev-shadow)]`, border `surface-border`, `surface-border-strong` on focus-within. Inside:
   - Attachment tray (only when any), chips `rounded-md border bg-surface-2 px-1.5 py-1 text-[11px]`, remove button 20 px. [main tray look; classes approximated, tray is `ptah-attachment-tray`]
   - Textarea: `COMPOSER_TEXTAREA_CLASS` [main] with `field-sizing: content`, `role=combobox`, `aria-autocomplete=list`, label "Message {lane name}", placeholder `Message {lane name}...`, "Resume {lane} with a message…" when stopped. Min height 60 in every mount.
   - Suggestions list above the textarea (`/` and `@`).
   - Toolbar (`flex items-center gap-1 px-2 pr-2.5 pb-2`, [main]) order, left group: attach `+` (28 px), approval chip. Right group: model and effort group (`role=group`, "Model and effort", separated by `·`), mic, Stop (running) or Resume session (stopped, lane only), Send. Exactly main chat's controls; no lane-only control sits in the toolbar except Resume session.
4. Error line (`role=alert`, `text-xs`, ink `state-err`) between card and status line. Lane only.
5. Status line, under the card, in the slot main chat uses for MCP and auth: `text-[11px] text-base-content-muted px-1`, `aria-live="polite"`, full text in `title`. `[lane-proposed]` (README constraint 1): lanes put the per-mode hint here, main chat's status line is unchanged (it holds only the auth label and, when present, the MCP chip and peer send). Left: the current message (priority order: reason of the hovered or focused disabled control, then image-blocked, then last action note, then the mode hint). Right: a neutral badge "N limited" (hint only, not a button), title lists the reasons.

Not shown in lanes (Scope, main-session-only): Command Center lock, messaging-binding read-only, peer session send, workspace and branch strip, MCP chip (parity-inventory D: only if the architect finds a lane MCP source).

### Controls and their classes

| Control | Classes / source |
| --- | --- |
| Attach `+` | `h-7 w-7 rounded-md text-base-content-muted hover:bg-surface-2` [main `chat-input.component.ts:354-370`]. Menu: Attach files, Attach images [main]. Never disabled: an image on a lane without image input goes to the tray and is flagged (section 5.3). |
| Approval chip | `h-7 px-2 rounded-md text-xs`, shield icon + label [main autopilot popover trigger]. Enabled: `Ask` / `Auto`. Disabled: the lane's effective permission mode from the capability statement (`Auto` when the lane never asks; section 5.2), never `Ask` |
| Model pill, Effort pill | `h-7 px-2 rounded-full text-xs text-base-content-muted hover:bg-base-content/5`, box / gauge icon, chevron [main `model-selector.component.ts`] |
| Mic | 28 px icon button [main] |
| Stop | 28 px circle `bg-error/15 text-error` [main] |
| Resume session | Same circle as Stop, play icon, `title="Resume session"` (parity-inventory B: `agent:resumeCliSession`) |
| Send | `COMPOSER_SEND_BUTTON_CLASS` [main]: 28 px neutral inverse circle with the real `disabled` attribute and `disabled:opacity-40 disabled:cursor-not-allowed`, exactly as `chat-input.component.ts:498-500`. When Send is off, the reason is already visible on the status line (image blocked, checking, failed), so no extra focus stop is needed |

There is no Send options chevron. Send now / Interrupt & send is reached by Ctrl/Cmd+Enter in the textarea (parity A, lane-kept shortcut; `chat-input` has no key handler for it, so it is invisible in main chat) and by the button on the shared queued card.

## 4. States

Every row is reproducible with the prototype State menu.

| # | State | Visual | Copy / behaviour |
| --- | --- | --- | --- |
| 4.1 | Idle, empty | Card at rest; Send dimmed (`disabled:opacity-40`) | Status: "Enter sends · Shift+Enter adds a line · Ctrl+Enter sends now" |
| 4.2 | Focus | Card border `surface-border-strong`; textarea has no outline; buttons use `focus-visible:outline-2 outline-offset-2 outline-[oklch(var(--s))]` [main] | |
| 4.3 | Typing | Send becomes full strength | |
| 4.4 | Sending | Send shows `loading loading-spinner loading-xs`; Send disabled | |
| 4.5 | Turn running, composer in use | Stop circle appears left of Send; Send stays active (queues) | Status: "Enter queues for the next turn · " + the Send now effect (6.2) or reason |
| 4.5a | Turn running, composer idle | Folded to the compact bar (2.1) | Same status line |
| 4.6 | Queued | Section 6.1 | Note: "Queued for the next turn. Withdraw it until the lane starts it." |
| 4.7 | Stopped / failed / timed out | Status dot and badge "Stopped"; Resume session button; textarea stays enabled | Placeholder "Resume {lane} with a message…"; status shows resume path ("Resume path: saved conversation · <path>"); Send `aria-label="Resume with message"` (parity A) |
| 4.8 | Checking lane options | All gated controls `aria-disabled`; status line spinner; approval chip reads "Checking"; Send disabled | "Checking lane options…" |
| 4.9 | Capability query failed | Same controls disabled; approval chip reads "Unknown" | `Could not load lane options.` in `state-err` ink with ghost xs "Retry" (replaces "Retry message options") |
| 4.10 | Provider refused a per-turn change | Error line, draft and attachments untouched | "{CLI} refused the model change: <what and why>. Nothing was sent; your draft is kept." (Req 2.8) |
| 4.11 | Send refused at send time (status race) | Same error line, draft restored | Backend reason verbatim (Req 2.10) |
| 4.12 | Empty tray, no attachments | No tray row | |

## 5. Capability-gated controls

### 5.1 Rule

A control the lane cannot honour is never removed and never hidden. It is rendered in place and:

1. keeps focus (uses `aria-disabled="true"`, not `disabled`), no hover fill, `cursor: not-allowed`, no opacity change (opacity dropped text below 3:1 on light themes);
2. gets a dashed 1 px edge `surface-border-strong` and an info glyph in place of the chevron, so the state is not colour-only;
3. carries `title` and `aria-describedby` pointing at a visually hidden node with the backend reason;
4. shows the reason in the status line while it is hovered, focused or clicked: "**Approval is unavailable here.** The Copilot lane runs with all tools allowed." (live region);
5. adds to the "N limited" badge on the status line.

A click on a disabled control only reveals the reason; it never opens a menu. Source: Req 1.10, task-description Non-functional Accessibility. [lane-proposed] This applies to the model, effort and approval controls. Send is the exception: it keeps main chat's real `disabled` attribute because its reason is always on the status line (section 3 table).

The disabled approval chip shows the lane's **effective** permission mode so it never claims "Ask" on a lane that does not ask. The label comes from the capability statement (`effectiveApproval`).

### 5.2 Which control is on or off, and why (illustrative; real values from the capability statement, Req 4)

Derived from `research-report.md`. The reason strings below are placeholders; the backend owns the final text and no component carries provider-specific copy.

| Lane | Model | Effort | Send now (queued card) | Images | `/` commands | `/` skills | Approval chip (effective mode) | Usage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude SDK, ptah-cli | Next turn | Next turn | "Interrupt & send" until a fixture proves steer (Req 2.5); steer variant below | Yes | Yes | Yes | Ask / Auto | Live |
| Codex | Next turn | Next turn | "Send now" (steers) | Yes | Off: "No slash commands in Codex lanes." | Yes | Off, shows Auto: "The Codex lane runs with approvals off, so it never asks. Set at spawn." | Live |
| Pi | Next turn | Next turn | "Send now" (steers); no interrupt | Yes | Off | Off | Off, shows Auto: "Pi has no tool approval prompts." | Live |
| Cursor | Next turn | Next turn | "Interrupt & send"; no steer: "Cursor has no live steer channel." | Yes | Off | Yes | Off, shows Auto: "The Cursor SDK exposes no approval prompts." | At turn end: "Cursor reports usage once, when the turn ends." |
| Copilot | Next spawn | Next spawn | Off: "Copilot starts a new process for every turn." | Off: "Image input is not confirmed for the Copilot lane." | Off | Yes | Off, shows Auto: "The Copilot lane runs with all tools allowed." | Live |
| OpenCode | Next spawn | Next spawn | Off: "OpenCode resumes on the next turn." | Off: "Image input is not confirmed for the OpenCode lane." (research Q6: `--file` attaches files; images to vision models unknown) | Off | Off | Off, shows Auto: "OpenCode lanes cannot ask before running a tool." | Live |
| Grok ACP | Next turn | Next turn | "Interrupt & send"; no steer: "Grok queues a message sent during a turn for the next turn." | Only when the agent reports image input (`promptCapabilities.image`) | Off | Off | Off, shows Auto: "Approval prompts are not enabled for Grok lanes yet." | Live |
| Antigravity ACP | Next turn | Next turn | "Interrupt & send"; no steer: "Antigravity queues a message sent during a turn for the next turn." | Only when the agent reports image input | Off | Yes | Off, shows Auto: "Approval prompts are not enabled for Antigravity lanes yet." | Live |
| Antigravity stream-json | Next process start | Next process start | Off: "This transport has no verified mid-turn steer." (continuation is NDJSON on stdin in the same process, research Q8; no verified interrupt either) | Off: "Image input is not confirmed for this transport." | Off | Yes | Off, shows Auto: "This transport skips permission prompts." | Live |

Notes on the table:
- Commands and skills are separate columns. The research did not settle which lane CLIs accept typed skills or commands; which cells say Yes is illustrative (harness-sync has skill targets for Codex, Copilot, Cursor and Antigravity and no command target for Codex and Copilot, `workspace-target.ts:21-24,435`, but that is sync, not the typed `/` in a lane). The backend capability statement decides.
- Antigravity stream-json: model and effort are the same spawn-time `--model` value (effort is a model-id suffix, Q8), so both read "Next process start" and are treated the same. This conflicts with Req 2.7's "applies from the next turn without restart"; the research recommends the ACP transport. Flagged in Open Question 5.
- Claude steer variant: if the manifest later reports steer (Req 2.5 fixture passes), the Claude row reads "Send now" and carries the caveat in 6.2.

### 5.3 `/`, `@`, images

- `/`: list above the textarea, `role=listbox`, with two groups, **Commands** and **Skills**. A group the lane has none of shows one non-selectable row (`role=option aria-disabled`) with an info glyph and the reason ("No slash commands in Codex lanes."). When the lane has neither, the list is one row: "{CLI} lanes take no slash commands or skills." (Req 1.4)
- `@`: same file list as main chat. Footer line of the list says how it will be sent: "Chosen files are sent as file references." or "{CLI} takes files as text: the path is inserted into your message." After choosing, the status line repeats which happened ("Added as a file reference." / "Inserted as path text. …"). (Req 1.5)
- Image the lane cannot take: the chip stays in the tray with a warn badge "Can't send" (text, not colour only) and a remove button. Send is `disabled`; the status line shows "{CLI} lanes cannot take images. Remove the image to send." in `state-need` ink. Nothing is dropped silently. (Req 1.6) For ACP lanes the answer depends on what the agent advertises; the capability statement carries the result.

### 5.4 Model and effort: next turn, next spawn, next process start

Menu footer (inside the dropdown, `text-[11px] text-base-content-muted`):

- Per-turn lanes: "Applies from your next message. The lane keeps running."
- Spawn-per-turn lanes (Copilot, OpenCode): "{CLI} starts a new process each turn: applies when the next turn starts."
- Process-lifetime lanes (Antigravity stream-json): "{CLI} applies this when the lane next starts its process."
- Main chat keeps "Applies to this tab."

After a change, a 6 px primary dot appears on the pill and the status line says: "Model set to sonnet. Applies from your next message. The lane keeps running." / "Model set to copilot-b. Copilot starts a new process each turn: applies when the next turn starts." / "Model set to agy-b. Antigravity applies this when the lane next starts its process." The pills never show a pending value as if it were current. The dot clears when the lane card's model chip (section 7.1) shows the confirmed model (Req 2.7).

## 6. Messaging

### 6.1 Queued for next turn

Rendered by the shared `QueuedFollowUpsComponent` unchanged [main `queued-follow-ups.component.ts:41-110`]: `section.pb-3 > ul.flex.flex-col.gap-2 > li.flex.justify-end > article.max-w-[85%] min-w-0 rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-sm`; header (`text-[11px] text-base-content-muted`) = clock icon (primary, `aria-hidden`) + **Queued** + "·" + "Queued for the next turn"; message `mt-1 whitespace-pre-wrap break-words`; optional note `mt-1 text-xs`; actions right-aligned `mt-2 flex items-center justify-end gap-1`: ghost xs **Withdraw** (text goes back to the composer), primary xs **Interrupt & send** or **Send now**.

One label for both surfaces: **Withdraw** (main chat's; the lane no longer says Edit). Parent-sent items show "Sent by the parent session" in place of Withdraw (parity A: no Edit for receipts).

`[shared-fix]` (decisions.md 9): the "Queued" label changes from `text-primary` to `text-base-content`; the note line from `text-warning` to `text-state-need`. The clock icon stays primary (decorative, with a text label beside it). Main chat receives the same change; the prototype's main chat frame shows it.

Placement: main chat renders the card at the end of the transcript. Lane mounts without a transcript (agent card, inspector) render the same card directly above the composer; in the canvas it sits at the transcript tail above the composer. `[lane-proposed]` (README constraint 4).

`[lane-proposed]` when the lane has no Send now at all (Req 2.4): the card's primary button is shown `aria-disabled` labelled "Send now" with the reason under the actions ("Send now unavailable: Copilot starts a new process for every turn."). Main chat hides the button in that case.

### 6.2 Send now

The button label states what happens to the running turn.

| Lane can | Button / shortcut | Result text |
| --- | --- | --- |
| Interrupt only (default for Claude and ptah-cli until a fixture proves steer; Cursor; ACP lanes) | **Interrupt & send**. Title: "Stop the current turn and send this message now" [main] | Opens 6.3 |
| Steer (Codex, Pi; Claude after the fixture) | **Send now**. Title: "Send this message into the running turn now" [main] | Status: "Sent. It joined the running turn." Transcript shows the message as delivered in that turn (Req 2.2). |
| Steer, Claude variant | **Send now** | Copy carries the caveat (research Q1): status hint "Send now: joins the running turn at its next tool call, or starts the next turn if this one ends first"; result "Sent. It joins the running turn at its next tool call, or starts the next turn if this one ends first." |
| Neither | "Send now" `aria-disabled`, reason beneath | Send still queues (Req 2.4) |

Ctrl/Cmd+Enter in the textarea does the same as the button, for the text in the composer.

### 6.3 Interrupt warning (loss confirmation)

`role="alertdialog"` above the card: `rounded-xl border border-warning bg-base-100 p-2.5 text-xs shadow-lg`, warn icon, bold "Interrupt this turn?" and "Work this turn has not finished will be discarded. {CLI} keeps the conversation, and your message starts the next turn." (backend `lossDisclosure.text` wins when present, as today). Buttons: ghost xs "Keep current turn" (default focus order second), `btn-warning btn-xs` "Interrupt & send". The textarea is read-only while open. Tab is trapped; Escape closes and returns focus to the field. Opened from Ctrl+Enter or from the queued card's button. After confirm: "Turn ended. Same session. Your message starts the next turn." (Req 2.3). [`btn-warning` and `border-warning` are today's loss dialog; kept.]

## 7. Live usage on the lane card

Placed in the lane header row (right-aligned, `text-xs tabular-nums text-base-content-muted`): `18.2k tok`. [lane-proposed placement; the number itself exists today]

- Live lane: the figure changes as each provider event arrives, with a 900 ms fade of a primary 28% highlight (disabled under `prefers-reduced-motion`). The figure is not announced to screen readers on each tick (it is outside the `aria-live` region); the turn-end total is.
- Turn-end-only lane (Cursor): a clock icon beside the figure, tooltip "Cursor reports usage once, when the turn ends." The card figure moves once per turn, as today (Req 3.4).
- Partial or malformed event: figure stays at the last good value; a warn badge **partial** (tooltip: "The provider sent incomplete usage. Showing the last good value.") never a reset to 0 (Req 3.5).
- Restored after reload: "- tok" with tooltip "Usage is unknown until the lane reports again." (Req 3.6).

### 7.1 Confirmed model on the lane card (Req 2.7)

The lane header row carries a model chip after the status badge: `rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-base-content-muted` [main: the compact bar's model chip]. It shows the model the provider **confirmed** for the last turn. A picker change leaves the chip on the old model and puts the dot on the pill; when the next turn starts and the provider confirms, the chip updates (same 900 ms highlight), the dot clears, and the compact bar's chip follows. `[lane-proposed]` (README constraint 7). Screenshots: `dark-model-pending-confirmed-old.png`, `dark-model-confirmed-after-turn.png`.

### 7.2 Session totals (Req 3.3)

No new surface. The session-level totals are the existing Session inspector SESSION section (`InspectorSessionStatsComponent`, fed by `sessionTokens` in `session-inspector.component.ts:200-208`: input and output token figures). Treatment: the figures change in the same tick as the lane figure, with the same highlight and the same rule (not announced per tick). A lane increment is added once; the lane's durable record later replaces it without moving the total twice (backend rule, Req 3.3). The prototype shows both together: "Simulate usage event" moves the lane header figure and both session figures. Screenshot: `dark-session-total-with-lane-usage.png`.

## 8. Lane prompts (Requirement 5)

Reuse main chat's `permission-request-card` and `question-card` unchanged in structure [main]: left border 2 px (warning for permission, info for question), header row with icon, title, tool badge, expiry badge, action row `bg-base-100/20 border-t`.

The only addition is a lane label: an outline accent badge (`data-ptah-badge data-tone="accent" data-appearance="outline"`) with the lane's display name in the header, immediately after "Permission" or "Input needed". [lane-proposed]

Surfaces:

| Surface | Treatment |
| --- | --- |
| Canvas lane view | The card above the transcript tail, replacing the Allow/Deny strip at `canvas-lane-view.component.ts:158-197`; question cards filtered to this lane |
| Agent card panel | The same card, wraps to two rows below 400 px (Allow, Always in session, Deny stay in one flex-wrap row) |
| Session inspector row | No card. A neutral-to-warn badge **Waiting for you** (status, not a button) after the lane name; status dot turns warning colour. Returns to **Running** when answered. The same string is used on the canvas and card headers. `[lane-proposed]` |
| Agent monitor panel, main chat | Unchanged |

Answered once: when the prompt is answered, denied or expires anywhere, every other surface swaps the card for a one-line status ("Permission · Bash · npm run verify - Allowed by you in the lane view. No longer answerable here.") with a check icon and `role=status`. A second answer attempt shows "Already answered. Your second answer was not sent." in `state-need` ink, once. (Req 5.4)

No route: the approval chip is disabled with its reason (5.1). No card ever appears. When a prompt auto-denies for lack of a surface, the lane transcript gets a line: red x, **Denied**, "Bash · rm -rf build was denied: no window could answer in time (lane: Claude SDK lane). The lane continues without it." (Req 5.5)

## 9. Accessibility and contrast

Standard applied: WCAG 2.2 AA (project states none beyond the repo's own 4.5:1 floor for muted text in `base-content-muted.spec.ts`): 4.5:1 for text under 24 px, 3:1 for icons that carry meaning and component edges. Re-measured in Chrome (Playwright, not Electron) in this revision from computed colours, composited over the real stacked backgrounds, for four themes, at the prototype states named. Pair, ratio (ptah-glass / ptah-glass-light / anubis / anubis-light):

| Pair | Ratio |
| --- | --- |
| Status line hint (`base-content-muted` on surface-1) | 13.07 / 6.49 / 6.05 / 15.92 |
| Toolbar pill text, enabled and disabled (muted on surface-1, no opacity) | 11.84 / 5.98 / 5.71 / 14.44 |
| Textarea placeholder | 11.84 / 5.98 / 5.71 / 5.48 |
| Reason text on the status line | 13.07 / 6.49 / 6.05 / 6.04 |
| Warning copy, `state-need` ink (image blocked) | 9.77 / 5.69 / 6.61 / 5.83 |
| Error copy, `state-err` ink (refused) | 8.43 / 6.90 / 4.92 / 6.12 |
| "Queued" label, `base-content` on primary/5 (after the shared fix) | 14.39 / 14.28 / 14.32 / 15.56 |
| Queued note, `state-need` ink on primary/5 (after the shared fix) | 8.95 / 5.28 / 6.37 / 5.70 |
| Queued header muted text on primary/5 | 11.98 / 6.02 / 5.83 / 5.90 |
| Queued body text, Withdraw text | 14.39 / 14.28 / 14.32 / 15.56 |
| "Send now" / "Interrupt & send" text on `btn-primary` | 9.88 / 6.16 / 4.82 / 6.81 |
| "N limited" badge | 11.90 / 12.61 / 11.73 / 12.97 |
| Send circle icon (base-100 on base-content) | 15.71 / 15.39 / 14.86 / 15.92 |

Defects in today's shared card, fixed by the `[shared-fix]` in 6.1: `text-warning` note text on the light themes measured 2.01 (`ptah-glass-light`) and 2.46 (`anubis-light`); the `text-primary` "Queued" label measured 3.46 (`anubis`) and 1.37 (`anubis-light`). The Electron visual review must repeat the check in both Anubis themes. Edge contrast of dashed and 1 px borders (`surface-border`) is a main-chat decision and was not re-measured.

Keyboard and screen reader: tab order is textarea, attach, approval chip, model, effort, mic, stop or resume, send (folded: the bar button, then Stop). Disabled model/effort/approval controls are in the order and announce their label, the disabled state and their description (not tested with a screen reader). Verified by script: the disabled approval chip receives focus, has `aria-disabled="true"` and its `aria-describedby` resolves to the reason text. Escape closes menus, suggestions and the dialog. Suggestions use `role=listbox`; the textarea is `role=combobox` with `aria-expanded`. Targets are 28 px as in main chat. Type-to-expand and the bar button are keyboard operable (script-verified).

Motion: only the usage highlight and `animate-glow` on the permission card [main]; both respect reduced motion (the glow keyframes are today's). The compact bar's pulse dot and fold animation are main chat's.

## 10. Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Reuse main chat classes and the Tailwind/daisyUI tokens; add no tokens | New lane look vs identical | User intent; `composer-card.ts` header comment says it exists for this | yes |
| Drop the lane-only Send options chevron | Keep; add to main; drop | User, decisions.md 7; reviewer finding 2 | yes |
| Lanes get the compact bar and type-to-expand unchanged | Fold; no fold; invented 40 px variant | User, decisions.md 8; parity D "expose" | yes |
| Fix the shared queued card contrast in this task | Fork per surface; leave; fix shared | User, decisions.md 9; measured 1.37 and 2.01 | yes |
| One queued card, one label (Withdraw) | Edit vs Withdraw | Shared component says Withdraw | yes |
| Claude default is "Interrupt & send" | Steer by default | Req 2.5; research Q1 | yes (flip when the fixture passes) |
| Send keeps the real `disabled` attribute | `aria-disabled` | `chat-input.component.ts:498-500`; reason always on the status line | yes |
| Disabled model/effort/approval stay in place, focusable, with reason on status line | `disabled` + tooltip; remove; `aria-disabled` + visible reason | Req 1.10 | yes |
| Hint text moves to a status line under the card | Keep in toolbar; status line | Full toolbar leaves no room at 400 px; main chat already has the slot | yes |
| Queue cards sit above the composer in mounts without a transcript | Transcript tail only; above the composer | Card and inspector have no transcript | yes |
| Text colours use the `state-*` ink tokens on light themes | `text-warning` / `text-error` | Measured 2.01 and 2.46 | yes |
| Confirmed model shown as a chip in the lane header | New panel; header chip | Req 2.7 needs a target for the pending dot; the chip is the compact bar's existing look | yes |
| Session totals reuse the Session inspector SESSION section | New surface | Req 3.3; `session-inspector.component.ts:200` | yes |

## 11. Open Questions

1. Claude SDK and ptah-cli steer: research says queued messages fold into the running turn at a tool boundary; with no tool call the message becomes the next turn. Default is "Interrupt & send" until the Req 2.5 fixture passes; the steer variant and its copy are specified (6.2). The architect flips the manifest at batch time; no design change.
2. Accept the `[lane-proposed]` list in `prototype/README.md` (constraints 1-12) at Gate 1.7.
3. (Resolved by decisions.md 9) The shared queued card contrast fix is in scope.
4. Which lanes accept `/` commands and skills is illustrative here. The real list comes from the capability statement; no design change.
5. Antigravity stream-json cannot switch model without a new process, which conflicts with Req 2.7 for that transport. The design shows honest "Next process start" copy. The architect decides between accepting that or preferring the ACP transport (research Q8).

## 12. Parity (parity-inventory.md)

Section A, B: all `keep` / `move` rows are shown in `prototype/README.md` Parity Mapping; behaviours without a visual (idempotency key, coalescing, accepted-text map, receipts) are unchanged contracts. Changed rows (Revision 2 in parity-inventory.md): the Send now menu is a **move** to the queued card button and Ctrl+Enter (user-approved 2026-11-23); "Edit a queued message" keeps its behaviour under the label Withdraw; the full-vs-compact variant row is replaced by the compact bar. Section D (new controls): attach, approval chip, model, effort, `/`, `@`, voice, stop, compact bar / type-to-expand are all exposed; the MCP chip is not specified for lanes. Section E: the permission strip moves to the main chat card (Req 5.2, 5.7); the monitor-panel list, attention entry and Codex decline line stay. Section C (sub-agent composer): unchanged, out of scope. No removals.

## 13. Developer notes (no component tree is prescribed here)

The architect owns the structure. Design constraints that bind it: the lane composer and `chat-input` must render the same toolbar classes from one source (extend `composer-card.ts`) and the same compact bar and queued card components; model, effort, attachment and draft state must be lane-scoped so a lane change cannot leak into the tab (Risks); the query container and the 639/400 breakpoints live on the composer root; the capability statement supplies `{ok, why}` for every gated control plus the effective approval label, so no component carries provider-specific copy. The `[shared-fix]` touches `queued-follow-ups.component.ts` (two class names); `chat-input` specs must not assert those colours (confirm at implementation).
