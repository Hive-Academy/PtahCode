# Prototype - TASK_2026_2320_lnpar (lane composer = main chat composer)

## How to Open

Open `index.html` in any browser (offline; no build step):

```bash
file:///D:/projects/PtahCode/.claude-worktrees/lane-chat-parity/.ptah/specs/TASK_2026_2320_lnpar/prototype/index.html
```

Automated captures used a local static server (the browser tool takes HTTP only):

```bash
npx http-server <taskFolder>/prototype -p 4811
# http://localhost:4811/index.html?theme=ptah-glass&lane=claude&state=queued&mounts=canvas
```

Query parameters: `theme` (`ptah-glass`, `ptah-glass-light`, `anubis`, `anubis-light`), `lane` (`claude`, `codex`, `pi`,
`cursor`, `copilot`, `opencode`, `grok`, `agy`), `state` (see the State menu), `mounts` (`all`, `canvas`, `card`,
`inspector`), `tab` (`composer`, `matrix`, `prompts`).

## Rendering and review status

Revision 1 (design review round 1). The prototype was re-rendered and all screenshots re-captured (44 files, dark and light,
plus Anubis light for the shared queued card).

- Rendered in real Chrome (Playwright, headless). **This is not Electron.** Electron was not launched (not allowed in this phase);
  the visual-review phase must repeat the checks there, including both Anubis themes for the shared queued-card change.
- Scripted interaction checks passed with no page errors: Enter queues while running; the queued card reads Withdraw and
  "Interrupt & send" (Claude default) or "Send now" (steer variant, Codex, Pi); Ctrl+Enter and the card button open the loss
  dialog for interrupt-only lanes and confirm continues; type-to-expand moves a typed key into the textarea; Tab reaches the
  disabled approval control, which has `aria-describedby` with the reason, and the chip reads "Auto" on Copilot;
  `/` lists Commands and Skills groups (Claude), one disabled Commands row plus Skills (Codex), or one row (Pi);
  `@` shows the path-text note (Pi); model change shows next turn / next spawn / next process start copy; the model chip
  keeps the old model and the pill shows a dot until the next turn starts, then the chip updates and the dot clears; image on
  Copilot disables Send (`disabled`) with the reason on the status line; "Simulate usage event" moves the lane figure and the
  session totals together; no horizontal overflow at a real 400 px and 320 px viewport.
- Not done: no screen reader was run, and the prototype was not viewed in the Electron app.
- Contrast was measured in the browser (computed colours, composited over the real backgrounds) on 4 themes. See design-spec.md section 9.
- The "Main chat" frame is rebuilt from `chat-input.component.ts:290-570`, `composer-card.ts` and `queued-follow-ups.component.ts`:
  no hint line, a status line that holds only the auth label ("Claude Pro", sample), the compact bar while a turn runs and the
  composer is idle, and the queued card in the transcript with Withdraw and "Interrupt & send". The MCP chip and peer send are
  absent because they render nothing without data.

## Deviations

- Local styling: `assets/app.css`, generated with the webview's own `tailwind.config.js` and `src/styles.css`
  (`npx tailwindcss -c apps/ptah-extension-webview/tailwind.config.js -i apps/ptah-extension-webview/src/styles.css --content <prototype>/index.html`).
  Real daisyUI themes (`ptah-glass`, `ptah-glass-light`, `anubis`, `anubis-light`), real `ptah-tokens.css`, `ptah-button.css`
  (`data-ptah-button`) and `ptah-badge.css` (`data-ptah-badge`). Fonts copied to `assets/gstatic/`. The Nx glob warning in the CLI is harmless.
- CDN fallback: none.
- Not built from project components: Angular components cannot run in a static file, so the composer, compact bar, queued card, model and effort
  pills, attach menu, suggestions list, permission card and question card are re-created in plain HTML with the same
  classes copied from `chat-input.component.ts`, `model-selector.component.ts`, `permission-request-card.component.ts`,
  `question-card.component.ts` and `queued-follow-ups.component.ts`. The dropdown panels use a simplified surface
  (`bg-base-100`, border, shadow) instead of the `data-glass-surface="overlay"` effect. Icons are inline lucide paths.
- Mock data: model names, effort levels, slash commands, skills, file names, the auth label and the queued-card note text ("The session has not confirmed this message yet.") are samples. In the product they come live from
  the provider catalogue and the backend capability statement. The per-lane capability values come from `research-report.md`.
  Which lane accepts `/` commands and which accepts skills is illustrative (the research did not settle it); the real answer and every reason string are the backend's.
- Capture limitations: Electron was not launched (not allowed in this phase). The `typecheck-templates` step does not apply.

## Screens & States

- **Composer tab**: the main chat composer (reference) and the lane composer in three mounts: Canvas lane view (720),
  Agent card panel (400), Session inspector row (320), plus the Session inspector SESSION totals.
  - States (State menu): idle, focus, typing, turn running, turn running with the composer folded to its bar, running with
    2 queued, model changed and waiting for the next turn, sending, loss confirmation, provider refused a model change, image
    on a lane without image input, stopped (resume with message), loading (checking lane options), error (capability query
    failed, Retry).
  - Controls to try: attach menu, model menu, effort menu, `/` and `@` suggestions, Withdraw and Send now / Interrupt & send
    on queued cards, the compact bar (click it or type), Stop, Resume session, "Simulate usage event" (lane figure and
    session totals).
  - The Lane menu includes "Claude SDK lane (steer, after fixture)" for the later steer copy and both Antigravity transports.
- **Capability matrix tab**: what each lane enables (slash commands and skills as separate rows), with the reason text a disabled control shows.
- **Prompts & usage tab**: one lane approval and one question shown in three surfaces, answer-once behaviour, a lane that
  cannot ask, an auto-denied line, four live-usage states and the session totals.
- **Themes**: Ptah Glass dark and light (default), Anubis dark and light.
- **Viewports**: real 400 px and 320 px browser viewports; wide 1560 px; embedded widths through the mount frames.

## Interactive Features

Theme, lane, state and mount menus; every composer control above; answering a lane prompt in any surface disables it in the others.

## Project rules applied

- `[project-rule]` The lane composer card, textarea, toolbar and send button use the main chat classes. Source: `libs/frontend/chat-ui/src/lib/molecules/composer-card.ts`, `chat-input.component.ts:354-507`.
- `[project-rule]` Container-query widths 639 px and 400 px for label collapse. Source: `chat-input.component.css:1-50`.
- `[project-rule]` Muted text uses `text-base-content-muted`, never `text-base-content/NN`. Source: `DESIGN.md`, `tailwind.config.js` comment on `--bcm`.
- `[project-rule]` Status is a badge or hint, not a button ("N limited", "partial", "Waiting for you", "Running"). Source: `ui-ux-designer/PROTOTYPING.md` rule 3.
- `[project-rule]` Buttons use `btn` with `data-ptah-button`; badges use `data-ptah-badge`. Source: `button-host.ts`, `badge.directive.ts`.
- `[project-rule]` No project component is banned. Source: `PROTOTYPING.md` rule 2.

## Lane-introduced constraints

Every `[lane-proposed]` item in design-spec.md is listed here, so Gate 1.7 accepts or rejects each one explicitly.

| # | Constraint | Tag | Rationale |
| --- | --- | --- | --- |
| 1 | The per-mode hint moves from inside the toolbar to the status line under the card (the slot main chat uses for MCP and auth). Main chat's status line is unchanged. | `[lane-proposed]` | The toolbar now carries the full main control set; a truncated hint cannot share the row at 400 px. The hint stays `aria-live="polite"` with the full text in `title`. Reviewer accepted (round 0, C1). |
| 2 | Ctrl/Cmd+Enter in the lane textarea = Send now. Main chat's `chat-input` has no such key handler. | `[lane-proposed]` | Parity A row "Ctrl/Cmd+Enter = Send now" is kept. Invisible shortcut; the visible path is the queued card button, as in main chat. |
| 3 | A disabled model, effort or approval control is `aria-disabled` (focusable), with a dashed edge, an info glyph, a `title`, an `aria-describedby` reason, and the reason on the status line while hovered, focused or clicked. The disabled approval chip shows the lane's effective permission mode (for example "Auto"), not "Ask". | `[lane-proposed]` | Requirement 1.10: the reason must not rely on colour or tooltip alone; the chip must not misstate what the lane does. Main chat never disables these controls today. |
| 4 | Queued cards render directly above the composer in mounts without a transcript (agent card, inspector). When a lane has no Send now (Req 2.4) the card shows its Send now button `aria-disabled` with the reason underneath; main chat hides the button. | `[lane-proposed]` | The agent card and inspector have no transcript tail. One implementation for all mounts. The card itself is the shared component, unchanged. |
| 5 | Text that must be readable on light themes uses the `state-need` / `state-err` / `state-done` ink tokens instead of `text-warning` / `text-error` / `text-success` (new lane text only). | `[lane-proposed]` | `text-warning` measured 2.01:1 and 2.46:1 on the two light themes. The ink tokens measure 4.9:1 or better. |
| 6 | "Interrupt & send" is the label whenever Send now ends a turn (the default for Claude and ptah-cli until the Req 2.5 fixture passes); "Send now" only when the message joins the running turn. | `[lane-proposed]` | Generalises main chat's `isClaude()` switch to the capability statement. The user always sees whether the turn survives. |
| 7 | Lane header row: usage figure right-aligned, turn-end clock icon, "partial" badge, and a confirmed-model chip (the compact bar's chip look). | `[lane-proposed]` | Req 3.1, 3.4-3.6 and 2.7 need a surface; the number and the chip look already exist. |
| 8 | A lane-name outline badge on the permission and question cards. | `[lane-proposed]` | Req 5.1/5.3: a prompt must never be mistaken for another lane's. |
| 9 | A neutral "N limited" badge on the status line (hint only, not a button; hidden at 400 px and below). | `[lane-proposed]` | Several controls can be disabled at once; the count points at the reasons. |
| 10 | One waiting badge, "Waiting for you", in the canvas header, agent card header and inspector row. | `[lane-proposed]` | Req 5.1: the inspector shows that the lane waits, without a card. |
| 11 | Commands and skills are two groups in the `/` list; a group the lane lacks shows one disabled reason row. | `[lane-proposed]` | Req 1.4: a lane can take skills without slash commands. |
| 12 | Compact bar label reads "{CLI} is working…" in a lane ("Ptah is working…" in main chat). Nothing else in the bar differs. | `[lane-proposed]` | The subject must name the lane. |

### Changes to a shared component (main chat also changes)

| Change | Tag | Rationale |
| --- | --- | --- |
| In `QueuedFollowUpsComponent`, the "Queued" label changes from `text-primary` to `text-base-content`, and the note line from `text-warning` to `text-state-need`. | `[shared-fix]`, user-approved 2026-11-23 (decisions.md 9) | Contrast: 1.37:1 ("Queued" on `anubis-light`) and 2.01:1 (note on `ptah-glass-light`) before; 14.28 or better and 5.28 or better after. The main chat reference frame shows the result. |

### Removed in revision 1 (user decisions, decisions.md 7 and 8)

- The lane-only "Send options" chevron beside Send (parity A "Send now menu" is a **move** to the queued card button and Ctrl+Enter).
- The 40 px inspector textarea variant: the inspector uses the same 60 px composer and main chat's compact bar.
- The Send button's `aria-disabled` look: Send uses the real `disabled` attribute, as main chat does.

## Parity Mapping

| Capability from parity-inventory.md | Prototype location | Visual treatment |
| --- | --- | --- |
| Card shape and toolbar classes (A: card shape) | Every frame; main chat frame beside it | Same classes as `composer-card.ts` |
| Label "Message {lane}", placeholder | Textarea in every lane frame | `sr-only` label, `Message Claude SDK lane...` |
| Enter queues, Shift+Enter newline, Ctrl+Enter Send now | Composer tab, type in any frame | Status line hint names each key |
| Send / Send now menu (move) / loss confirmation | Queued card button + Ctrl+Enter; State: loss confirmation | Warning-edged dialog above the card, textarea read-only, "Keep current turn". The chevron menu is gone. |
| Backend loss text, Keep current turn | Dialog | Text names the CLI, says session is kept |
| aria-live hint, auto-grow | Status line; textarea `field-sizing: content` | `aria-live="polite"` |
| Per-mode hint, disabled reasons | Status line, `title`, `aria-describedby` | Reason text, never colour alone |
| Preview refresh, Retry message options | State: loading / capability failed | "Checking lane options…" then error + Retry |
| Resume with message, resume path | State: stopped | Placeholder "Resume … with a message…", path on status line, Resume session button |
| Queued list, restore into the composer (label Withdraw), parent receipts have no Withdraw | State: running, 2 queued | The shared dashed card; parent card shows "Sent by the parent session" with no Withdraw |
| Restore text, coalesce, recover, limit hold, idempotency, accepted text survives remount | Not visual | Behaviour only; the note "Moved back to the composer" shows restore. Unchanged contracts. |
| Error line on refused send | State: provider refused | `role="alert"` line, draft and attachments kept |
| `laneControls` Stop / Resume | Stop button; Resume session button | Same 28 px circles as main chat Stop |
| Visibility rules, terminal status line | Stopped state | Status dot, "Stopped" badge |
| Full vs compact variants | Inspector frame (320) and the compact bar | Replaced by main chat's compact bar and type-to-expand; the inspector uses the same composer |
| Model, effort, approval chip, `/`, `@`, attach, voice | Toolbar, suggestion lists, attach menu | Same order as main chat; disabled variants shown per lane |
| Compact bar / type-to-expand / stop gating (D, expose) | State: turn running (folded), running with 2 queued | Main chat's bar with the lane name; click or type expands. See design-spec.md section 2.1 |
| Lane approvals and questions, answered-once, auto-deny line, waiting badge | Prompts & usage tab | Lane label chip on the main chat cards; one string, "Waiting for you" |
| Live usage, confirmed model, session totals | Lane header; Session inspector SESSION frame | Header figure and model chip; SESSION figures move with "Simulate usage event" |
